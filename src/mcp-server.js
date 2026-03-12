/**
 * MCP Server - Agente de Agendamiento
 * 
 * Expone las tools de agendamiento como un servidor MCP
 * Compatible con Claude Desktop, Cursor, y otros clientes MCP
 * 
 * Variables de entorno requeridas (en Railway):
 * - NYLAS_API_KEY
 * - NYLAS_API_URL
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_KEY
 * 
 * Parámetros que vienen del cliente MCP:
 * - contacto_id
 * - time_zone_contacto
 * - etc.
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

// Cache
const calendariosCache = new Map();

// Funciones auxiliares
function getAhoraEnTimezone(timezone) {
  const ahora = new Date();
  const options = { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
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

async function getAsesorByContactoId(contactoId) {
  // Buscar el asesor asignado al contacto
  const { data: contacto } = await supabase
    .from("wp_contactos")
    .select("asesor_id")
    .eq("id", contactoId)
    .single();
  
  if (!contacto?.asesor_id) return null;
  
  const { data: asesor } = await supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id, timezone, duracion_cita_minutos, disponibilidad")
    .eq("id", contacto.asesor_id)
    .eq("is_active", true)
    .single();
  
  return asesor;
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

function getPeriodoDia(hora) {
  const h = new Date(hora).getHours();
  if (h < 12) return "Mañana";
  if (h < 18) return "Tarde";
  return "Noche";
}

function calcularSlots(fecha, eventos, disponibilidad, duracionMinutos, timezone) {
  const slots = [];
  const diaSemana = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const dia = diaSemana[fecha.getDay()];
  
  const horariosNormales = disponibilidad?.horarios_normales?.[dia] || [];
  if (horariosNormales.length === 0) return slots;
  
  const ahoraTz = getAhoraEnTimezone(timezone);
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
          timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: true 
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

// ============================================
// TOOL 1: Disponibilidad_Agenda
// ============================================
async function disponibilidadAgenda(contactoId, timeZoneContacto) {
  const timezone = timeZoneContacto || "America/Bogota";
  
  const asesor = await getAsesorByContactoId(contactoId);
  if (!asesor) return { error: "No se encontró asesor asignado al contacto" };
  if (!asesor.grant_id || asesor.grant_id === "Solicitud enviada") {
    return { error: "El asesor no tiene calendario configurado" };
  }

  const cal = await getCalendarioPrimario(asesor.grant_id);
  if (!cal) return { error: "Calendario no encontrado" };

  // Buscar disponibilidad para hoy y los próximos 7 días
  const ahora = getAhoraEnTimezone(timezone);
  const disponibilidadDias = [];

  for (let i = 0; i < 7; i++) {
    const fecha = new Date(ahora);
    fecha.setDate(fecha.getDate() + i);
    fecha.setHours(0, 0, 0, 0);
    
    const fechaFin = new Date(fecha);
    fechaFin.setHours(23, 59, 59, 999);
    
    const startUnix = Math.floor(fecha.getTime() / 1000);
    const endUnix = Math.floor(fechaFin.getTime() / 1000);

    try {
      const eventos = await getEvents(asesor.grant_id, cal.id, startUnix, endUnix);
      const slots = calcularSlots(fecha, eventos, asesor.disponibilidad, asesor.duracion_cita_minutos || 30, timezone);
      
      if (slots.length > 0) {
        const fechaStr = fecha.toLocaleDateString("es-CO", { 
          timeZone: timezone, weekday: "long", day: "numeric", month: "long" 
        });
        
        const slotsPorPeriodo = {};
        slots.forEach(slot => {
          const periodo = getPeriodoDia(slot.inicio);
          if (!slotsPorPeriodo[periodo]) slotsPorPeriodo[periodo] = [];
          if (!slotsPorPeriodo[periodo].find(s => s.hora === slot.hora)) {
            slotsPorPeriodo[periodo].push(slot);
          }
        });

        disponibilidadDias.push({
          fecha: fecha.toISOString().split("T")[0],
          fechaTexto: fechaStr,
          slots: slots.map(s => ({ hora: s.hora, inicio: s.inicio })),
          porPeriodo: slotsPorPeriodo,
        });
      }
    } catch {}
  }

  const ahoraStr = ahora.toLocaleString("es-CO", { timeZone: timezone });
  
  return {
    contacto_id: contactoId,
    time_zone: timezone,
    hora_actual: ahoraStr,
    asesor: `${asesor.nombre} ${asesor.apellido}`,
    duracion_cita_minutos: asesor.duracion_cita_minutos || 30,
    disponibilidad: disponibilidadDias,
    hay_disponibilidad: disponibilidadDias.length > 0,
  };
}

// ============================================
// TOOL 2: Crear_Evento_Calendario
// ============================================
async function crearEventoCalendario(params) {
  const { start, attendeeEmail, summary, description, contacto_id, "Virtual-presencial": modalidad, time_zone_contacto } = params;
  const timezone = time_zone_contacto || "America/Bogota";

  const asesor = await getAsesorByContactoId(contacto_id);
  if (!asesor) return { error: "No se encontró asesor asignado al contacto" };
  if (!asesor.grant_id || asesor.grant_id === "Solicitud enviada") {
    return { error: "El asesor no tiene calendario configurado" };
  }

  const cal = await getCalendarioPrimario(asesor.grant_id);
  if (!cal) return { error: "Calendario no encontrado" };

  // Parsear fecha de inicio
  const fechaInicio = new Date(start);
  const startTime = Math.floor(fechaInicio.getTime() / 1000);
  const duracionMin = asesor.duracion_cita_minutos || 60;
  const endTime = startTime + (duracionMin * 60);

  // Crear evento
  const evento = await createEvent(asesor.grant_id, cal.id, {
    title: summary,
    description: description || "",
    when: { start_time: startTime, end_time: endTime },
    participants: [{ email: attendeeEmail }],
    location: modalidad === "Virtual" ? "Reunión Virtual" : "Presencial",
  });

  const inicioLocal = fechaInicio.toLocaleString("es-CO", { timeZone: timezone });

  return {
    success: true,
    event_id: evento.id,
    contacto_id,
    asesor: `${asesor.nombre} ${asesor.apellido}`,
    participante: attendeeEmail,
    inicio: inicioLocal,
    duracion_minutos: duracionMin,
    modalidad: modalidad || "No especificada",
    summary,
  };
}

// ============================================
// TOOL 3: Reagendar_Evento
// ============================================
async function reagendarEvento(params) {
  const { event_id, start, attendeeEmail, summary, description, contacto_id, "Virtual-presencial": modalidad, time_zone_contacto, Duracion_minutos } = params;
  const timezone = time_zone_contacto || "America/Bogota";

  const asesor = await getAsesorByContactoId(contacto_id);
  if (!asesor) return { error: "No se encontró asesor asignado al contacto" };
  if (!asesor.grant_id || asesor.grant_id === "Solicitud enviada") {
    return { error: "El asesor no tiene calendario configurado" };
  }

  const cal = await getCalendarioPrimario(asesor.grant_id);
  if (!cal) return { error: "Calendario no encontrado" };

  // Parsear nueva fecha
  const fechaInicio = new Date(start);
  const startTime = Math.floor(fechaInicio.getTime() / 1000);
  const duracionMin = Duracion_minutos ? parseInt(Duracion_minutos) : (asesor.duracion_cita_minutos || 60);
  const endTime = startTime + (duracionMin * 60);

  // Actualizar evento
  const updateData = {
    when: { start_time: startTime, end_time: endTime },
  };
  
  if (summary) updateData.title = summary;
  if (description) updateData.description = description;
  if (attendeeEmail) updateData.participants = [{ email: attendeeEmail }];
  if (modalidad) updateData.location = modalidad === "Virtual" ? "Reunión Virtual" : "Presencial";

  const evento = await updateEvent(asesor.grant_id, cal.id, event_id, updateData);

  const inicioLocal = fechaInicio.toLocaleString("es-CO", { timeZone: timezone });

  return {
    success: true,
    event_id: evento.id,
    contacto_id,
    nuevo_inicio: inicioLocal,
    duracion_minutos: duracionMin,
    mensaje: "Evento reagendado correctamente",
  };
}

// ============================================
// TOOL 4: Eliminar_Evento (adicional)
// ============================================
async function eliminarEvento(eventId, contactoId) {
  const asesor = await getAsesorByContactoId(contactoId);
  if (!asesor) return { error: "No se encontró asesor asignado al contacto" };
  if (!asesor.grant_id || asesor.grant_id === "Solicitud enviada") {
    return { error: "El asesor no tiene calendario configurado" };
  }

  const cal = await getCalendarioPrimario(asesor.grant_id);
  if (!cal) return { error: "Calendario no encontrado" };

  await deleteEvent(asesor.grant_id, cal.id, eventId);

  return {
    success: true,
    event_id: eventId,
    mensaje: "Evento eliminado correctamente",
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
        name: "Disponibilidad_Agenda",
        description: "Verifica la disponibilidad de horarios del asesor asignado al contacto para los próximos 7 días.",
        inputSchema: {
          type: "object",
          properties: {
            contacto_id: {
              type: "string",
              description: "ID del contacto en el sistema",
            },
            time_zone_contacto: {
              type: "string",
              description: "Zona horaria del contacto (ej: 'America/Bogota')",
            },
          },
          required: ["contacto_id", "time_zone_contacto"],
        },
      },
      {
        name: "Crear_Evento_Calendario",
        description: "Crea una cita en el calendario del asesor asignado al contacto.",
        inputSchema: {
          type: "object",
          properties: {
            start: {
              type: "string",
              description: "Fecha y hora de inicio en formato ISO (ej: '2024-12-20T14:30:00')",
            },
            attendeeEmail: {
              type: "string",
              description: "Email del participante/cliente",
            },
            summary: {
              type: "string",
              description: "Título de la cita (ej: '🗓️ | Juan Perez | Empresa ABC | Virtual')",
            },
            description: {
              type: "string",
              description: "Descripción detallada de la cita",
            },
            contacto_id: {
              type: "string",
              description: "ID del contacto en el sistema",
            },
            "Virtual-presencial": {
              type: "string",
              description: "Modalidad de la cita: 'Virtual' o 'Presencial'",
            },
            time_zone_contacto: {
              type: "string",
              description: "Zona horaria del contacto",
            },
          },
          required: ["start", "attendeeEmail", "summary", "contacto_id", "time_zone_contacto"],
        },
      },
      {
        name: "Reagendar_Evento",
        description: "Reagenda una cita existente a una nueva fecha/hora.",
        inputSchema: {
          type: "object",
          properties: {
            event_id: {
              type: "string",
              description: "ID del evento a reagendar",
            },
            start: {
              type: "string",
              description: "Nueva fecha y hora de inicio en formato ISO",
            },
            attendeeEmail: {
              type: "string",
              description: "Email del participante (opcional)",
            },
            summary: {
              type: "string",
              description: "Nuevo título de la cita (opcional)",
            },
            description: {
              type: "string",
              description: "Nueva descripción (opcional)",
            },
            contacto_id: {
              type: "string",
              description: "ID del contacto en el sistema",
            },
            "Virtual-presencial": {
              type: "string",
              description: "Modalidad de la cita: 'Virtual' o 'Presencial' (opcional)",
            },
            time_zone_contacto: {
              type: "string",
              description: "Zona horaria del contacto",
            },
            Duracion_minutos: {
              type: "string",
              description: "Duración de la cita en minutos (opcional)",
            },
          },
          required: ["event_id", "start", "contacto_id"],
        },
      },
      {
        name: "Eliminar_Evento",
        description: "Elimina/cancela una cita existente del calendario.",
        inputSchema: {
          type: "object",
          properties: {
            event_id: {
              type: "string",
              description: "ID del evento a eliminar",
            },
            contacto_id: {
              type: "string",
              description: "ID del contacto en el sistema",
            },
          },
          required: ["event_id", "contacto_id"],
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
      case "Disponibilidad_Agenda":
        result = await disponibilidadAgenda(args.contacto_id, args.time_zone_contacto);
        break;
      case "Crear_Evento_Calendario":
        result = await crearEventoCalendario(args);
        break;
      case "Reagendar_Evento":
        result = await reagendarEvento(args);
        break;
      case "Eliminar_Evento":
        result = await eliminarEvento(args.event_id, args.contacto_id);
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
