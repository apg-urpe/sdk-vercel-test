/**
 * MCP Server - Agente de Agendamiento
 * 
 * Expone las tools de agendamiento como un servidor MCP
 * Compatible con Claude Desktop, Cursor, y otros clientes MCP
 */

import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { supabase } from "./lib/supabase.js";
import { getCalendars, getEvents, createEvent, updateEvent, deleteEvent } from "./lib/nylas.js";

// Configuración
const EMPRESA_ID = process.env.EMPRESA_ID || 4;
const TIMEZONE = process.env.TIMEZONE || "America/Bogota";
const ASESOR_ID = process.env.ASESOR_ID ? parseInt(process.env.ASESOR_ID) : null;

// Cache
let asesoresCache = null;
const calendariosCache = new Map();

// Funciones auxiliares
function getAhoraEnTimezone() {
  const ahora = new Date();
  const options = { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(ahora);
  
  const get = (type) => parts.find(p => p.type === type)?.value || '0';
  return new Date(
    parseInt(get('year')), 
    parseInt(get('month')) - 1, 
    parseInt(get('day')), 
    parseInt(get('hour')), 
    parseInt(get('minute')), 
    parseInt(get('second'))
  );
}

async function getAsesores() {
  if (asesoresCache) return asesoresCache;
  
  let query = supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id, timezone, duracion_cita_minutos, disponibilidad")
    .eq("is_active", true)
    .eq("acepta_citas", true)
    .not("grant_id", "is", null);
  
  if (ASESOR_ID) {
    query = query.eq("id", ASESOR_ID);
  } else {
    query = query.eq("empresa_id", EMPRESA_ID);
  }

  const { data } = await query;
  asesoresCache = data || [];
  return asesoresCache;
}

async function getCalendarioPrimario(grantId) {
  if (calendariosCache.has(grantId)) {
    return calendariosCache.get(grantId);
  }
  const calendarios = await getCalendars(grantId);
  const cal = calendarios?.find(c => c.is_primary) || calendarios?.[0];
  if (cal) calendariosCache.set(grantId, cal);
  return cal;
}

function parseFecha(fecha) {
  const ahora = getAhoraEnTimezone();
  const fechaLower = fecha.toLowerCase().trim();
  
  if (fechaLower.includes("mañana") || fechaLower.includes("manana") || fechaLower.includes("tomorrow")) {
    const manana = new Date(ahora);
    manana.setDate(manana.getDate() + 1);
    return manana;
  }
  if (fechaLower.includes("hoy") || fechaLower.includes("today")) {
    return new Date(ahora);
  }
  if (/^\d+$/.test(fecha.trim())) {
    return new Date(ahora.getTime() + parseInt(fecha.trim()) * 60000);
  }
  if (fecha.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
    return new Date(fecha);
  }
  const parsed = new Date(fecha);
  return isNaN(parsed.getTime()) ? new Date(ahora) : parsed;
}

function getPeriodoDia(hora) {
  const h = new Date(hora).getHours();
  if (h < 12) return "Mañana";
  if (h < 18) return "Tarde";
  return "Noche";
}

function calcularSlots(fecha, eventos, disponibilidad, duracionMinutos) {
  const slots = [];
  const diaSemana = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const dia = diaSemana[fecha.getDay()];
  
  const horariosNormales = disponibilidad?.horarios_normales?.[dia] || [];
  if (horariosNormales.length === 0) return slots;
  
  const ahoraTz = getAhoraEnTimezone();
  const ocupados = (eventos || []).map(e => ({
    start: e.when?.start_time || 0,
    end: e.when?.end_time || 0,
  }));

  for (const horario of horariosNormales) {
    const [inicioH, inicioM] = horario.inicio.split(":").map(Number);
    const [finH, finM] = horario.fin.split(":").map(Number);
    
    let slotStart = new Date(fecha);
    slotStart.setHours(inicioH, inicioM, 0, 0);
    
    const finBloque = new Date(fecha);
    finBloque.setHours(finH, finM, 0, 0);

    while (slotStart.getTime() + duracionMinutos * 60000 <= finBloque.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + duracionMinutos * 60000);
      const startUnix = Math.floor(slotStart.getTime() / 1000);
      const endUnix = Math.floor(slotEnd.getTime() / 1000);

      const estaOcupado = ocupados.some(o => 
        (startUnix >= o.start && startUnix < o.end) || 
        (endUnix > o.start && endUnix <= o.end) ||
        (startUnix <= o.start && endUnix >= o.end)
      );

      if (!estaOcupado && slotStart.getTime() > ahoraTz.getTime()) {
        const horaLocal = slotStart.toLocaleTimeString("es-CO", { 
          timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: true 
        });
        slots.push({
          inicio: slotStart.toISOString(),
          fin: slotEnd.toISOString(),
          hora: horaLocal,
          startUnix,
          endUnix,
        });
      }

      slotStart = new Date(slotStart.getTime() + duracionMinutos * 60000);
    }
  }

  return slots;
}

// Implementación de las tools
async function verificarDisponibilidad(fecha) {
  const fechaParsed = parseFecha(fecha);
  const fechaStr = fechaParsed.toLocaleDateString("es-CO", { 
    timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" 
  });
  
  const asesores = await getAsesores();
  if (!asesores.length) return { error: "No hay asesores disponibles" };

  const fechaBase = new Date(fechaParsed);
  fechaBase.setHours(0, 0, 0, 0);
  const fechaFin = new Date(fechaBase);
  fechaFin.setHours(23, 59, 59, 999);
  const startUnix = Math.floor(fechaBase.getTime() / 1000);
  const endUnix = Math.floor(fechaFin.getTime() / 1000);

  const todosLosSlots = [];
  let duracionCita = 30;

  await Promise.all(
    asesores.slice(0, 5).map(async (asesor) => {
      try {
        const cal = await getCalendarioPrimario(asesor.grant_id);
        if (!cal) return;

        const eventos = await getEvents(asesor.grant_id, cal.id, startUnix, endUnix);
        const slots = calcularSlots(fechaBase, eventos, asesor.disponibilidad, asesor.duracion_cita_minutos || 30);
        
        duracionCita = asesor.duracion_cita_minutos || 30;
        slots.forEach(slot => {
          todosLosSlots.push({ ...slot, asesorId: asesor.id, asesor: asesor.nombre });
        });
      } catch {}
    })
  );

  todosLosSlots.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  const horasUnicas = [...new Set(todosLosSlots.map(s => s.hora))];

  const slotsPorPeriodo = {};
  todosLosSlots.forEach(slot => {
    const periodo = getPeriodoDia(slot.inicio);
    if (!slotsPorPeriodo[periodo]) slotsPorPeriodo[periodo] = [];
    if (!slotsPorPeriodo[periodo].find(s => s.hora === slot.hora)) {
      slotsPorPeriodo[periodo].push(slot);
    }
  });

  const ahoraTz = getAhoraEnTimezone();
  let availabilityText = `⏰ Hora local actual: ${ahoraTz.toLocaleString("es-CO", { timeZone: TIMEZONE })}\n`;
  availabilityText += `🌍 Zona horaria: ${TIMEZONE}\n`;
  availabilityText += `🕐 Duración de cita: ${duracionCita}min\n`;
  availabilityText += `📅 Fecha consultada: ${fechaStr}\n---\n`;

  if (horasUnicas.length === 0) {
    availabilityText += `❌ No hay disponibilidad para esta fecha.\n`;
  } else {
    availabilityText += `✅ Disponibilidad encontrada\n\n### ${fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1)}\n`;
    
    for (const [periodo, slotsP] of Object.entries(slotsPorPeriodo)) {
      availabilityText += `  ${periodo}:\n`;
      const horasDelPeriodo = slotsP.map(s => s.hora);
      availabilityText += `  • Horarios: ${horasDelPeriodo.join(", ")}\n`;
    }
    
    availabilityText += `\n---\n### Horarios específicos para agendar\n`;
    horasUnicas.forEach(hora => {
      availabilityText += `• ${hora}\n`;
    });
  }

  return { 
    availabilityText,
    fecha: fechaBase.toISOString().split("T")[0],
    horasDisponibles: horasUnicas.slice(0, 10),
    hayDisponibilidad: horasUnicas.length > 0,
  };
}

async function crearEvento(titulo, fechaHoraInicio, emailParticipante) {
  const asesores = await getAsesores();
  const asesor = asesores[0];
  
  if (!asesor) return { error: "Asesor no encontrado" };

  const cal = await getCalendarioPrimario(asesor.grant_id);
  if (!cal) return { error: "Calendario no encontrado" };

  let startTime;
  if (/^\d+$/.test(fechaHoraInicio)) {
    startTime = parseInt(fechaHoraInicio);
  } else {
    const fecha = new Date(fechaHoraInicio);
    startTime = Math.floor(fecha.getTime() / 1000);
  }
  
  const duracionMin = asesor.duracion_cita_minutos || 60;
  const endTime = startTime + (duracionMin * 60);

  const evento = await createEvent(asesor.grant_id, cal.id, {
    title: titulo,
    when: { start_time: startTime, end_time: endTime },
    participants: [{ email: emailParticipante }],
  });

  const inicioLocal = new Date(startTime * 1000).toLocaleString("es-CO", { timeZone: TIMEZONE });
  return {
    success: true,
    eventoId: evento.id,
    asesor: `${asesor.nombre} ${asesor.apellido}`,
    participante: emailParticipante,
    inicio: inicioLocal,
    duracion: `${duracionMin} minutos`,
  };
}

async function reagendarEvento(eventoId, nuevaFechaHora) {
  const asesores = await getAsesores();
  const asesor = asesores[0];
  
  if (!asesor) return { error: "Asesor no encontrado" };

  const cal = await getCalendarioPrimario(asesor.grant_id);
  if (!cal) return { error: "Calendario no encontrado" };

  const fecha = new Date(nuevaFechaHora);
  const nuevoStartTime = Math.floor(fecha.getTime() / 1000);
  const duracionMin = asesor.duracion_cita_minutos || 60;
  const nuevoEndTime = nuevoStartTime + (duracionMin * 60);

  const evento = await updateEvent(asesor.grant_id, cal.id, eventoId, {
    when: { start_time: nuevoStartTime, end_time: nuevoEndTime },
  });

  const inicioLocal = new Date(nuevoStartTime * 1000).toLocaleString("es-CO", { timeZone: TIMEZONE });
  return {
    success: true,
    eventoId: evento.id,
    nuevoInicio: inicioLocal,
  };
}

async function eliminarEvento(eventoId) {
  const asesores = await getAsesores();
  const asesor = asesores[0];
  
  if (!asesor) return { error: "Asesor no encontrado" };

  const cal = await getCalendarioPrimario(asesor.grant_id);
  if (!cal) return { error: "Calendario no encontrado" };

  await deleteEvent(asesor.grant_id, cal.id, eventoId);

  return {
    success: true,
    mensaje: `Evento ${eventoId} eliminado correctamente`,
  };
}

// Crear servidor MCP
const server = new Server(
  {
    name: "scheduling-agent",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Listar tools disponibles
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "verificar_disponibilidad",
        description: "Verifica la disponibilidad de horarios para agendar citas. Acepta fechas como 'hoy', 'mañana', o formato YYYY-MM-DD.",
        inputSchema: {
          type: "object",
          properties: {
            fecha: {
              type: "string",
              description: "Fecha a consultar (ej: 'hoy', 'mañana', '2026-03-15')",
            },
          },
          required: ["fecha"],
        },
      },
      {
        name: "crear_evento",
        description: "Crea una cita en el calendario del asesor.",
        inputSchema: {
          type: "object",
          properties: {
            titulo: {
              type: "string",
              description: "Título de la cita",
            },
            fechaHoraInicio: {
              type: "string",
              description: "Fecha y hora de inicio en formato ISO (ej: '2026-03-15T14:00:00')",
            },
            emailParticipante: {
              type: "string",
              description: "Email del participante",
            },
          },
          required: ["titulo", "fechaHoraInicio", "emailParticipante"],
        },
      },
      {
        name: "reagendar_evento",
        description: "Reagenda una cita existente a una nueva fecha/hora.",
        inputSchema: {
          type: "object",
          properties: {
            eventoId: {
              type: "string",
              description: "ID del evento a reagendar",
            },
            nuevaFechaHora: {
              type: "string",
              description: "Nueva fecha y hora en formato ISO",
            },
          },
          required: ["eventoId", "nuevaFechaHora"],
        },
      },
      {
        name: "eliminar_evento",
        description: "Elimina/cancela una cita existente.",
        inputSchema: {
          type: "object",
          properties: {
            eventoId: {
              type: "string",
              description: "ID del evento a eliminar",
            },
          },
          required: ["eventoId"],
        },
      },
    ],
  };
});

// Ejecutar tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case "verificar_disponibilidad":
        result = await verificarDisponibilidad(args.fecha);
        break;
      case "crear_evento":
        result = await crearEvento(args.titulo, args.fechaHoraInicio, args.emailParticipante);
        break;
      case "reagendar_evento":
        result = await reagendarEvento(args.eventoId, args.nuevaFechaHora);
        break;
      case "eliminar_evento":
        result = await eliminarEvento(args.eventoId);
        break;
      default:
        return {
          content: [{ type: "text", text: `Tool desconocida: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Iniciar servidor
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Scheduling Agent Server running on stdio");
}

main().catch(console.error);
