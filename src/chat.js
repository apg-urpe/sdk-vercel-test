/**
 * Chat Interactivo con el Agente de Agendamiento
 */

import "dotenv/config";
import * as readline from "readline";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { supabase } from "./lib/supabase.js";
import { getCalendars, getEvents, createEvent, updateEvent, deleteEvent } from "./lib/nylas.js";

const EMPRESA_ID = 4; // Fijo para esta sesión
const TIMEZONE = "America/Bogota"; // TODO: Hacer configurable
const ASESOR_TEST_ID = 154; // Luis Villegas - para testing

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  compatibility: "compatible",
});

// Cache de asesores para evitar consultas repetidas
let asesoresCache = null;

// Historial de conversación para memoria
const conversationHistory = [];

async function getAsesores() {
  if (asesoresCache) return asesoresCache;
  
  // Filtrar solo Luis Villegas (id=154) para testing
  const { data } = await supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id, timezone, duracion_cita_minutos, disponibilidad")
    .eq("id", ASESOR_TEST_ID)
    .eq("is_active", true);

  asesoresCache = data || [];
  console.log(`  📋 Asesor de prueba: ${asesoresCache[0]?.nombre} ${asesoresCache[0]?.apellido} (${asesoresCache[0]?.email})`);
  return asesoresCache;
}

// Cache de calendarios por grant_id
const calendariosCache = new Map();

// Obtener hora actual en timezone Colombia
function getAhoraEnColombia() {
  // Crear fecha actual y formatear en Colombia para obtener los componentes
  const ahora = new Date();
  const options = { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(ahora);
  
  const get = (type) => parts.find(p => p.type === type)?.value || '0';
  const year = parseInt(get('year'));
  const month = parseInt(get('month')) - 1;
  const day = parseInt(get('day'));
  const hour = parseInt(get('hour'));
  const minute = parseInt(get('minute'));
  const second = parseInt(get('second'));
  
  return new Date(year, month, day, hour, minute, second);
}

// Calcular slots disponibles basado en horarios y eventos ocupados
function calcularSlots(fecha, eventos, disponibilidad, duracionMinutos) {
  const slots = [];
  const diaSemana = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const dia = diaSemana[fecha.getDay()];
  
  const horariosNormales = disponibilidad?.horarios_normales?.[dia] || [];
  if (horariosNormales.length === 0) return slots;
  
  const ahoraColombia = getAhoraEnColombia();

  // Convertir eventos a rangos ocupados (Unix timestamps)
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

    // Generar slots
    while (slotStart.getTime() + duracionMinutos * 60000 <= finBloque.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + duracionMinutos * 60000);
      const startUnix = Math.floor(slotStart.getTime() / 1000);
      const endUnix = Math.floor(slotEnd.getTime() / 1000);

      // Verificar si está ocupado
      const estaOcupado = ocupados.some(o => 
        (startUnix >= o.start && startUnix < o.end) || 
        (endUnix > o.start && endUnix <= o.end) ||
        (startUnix <= o.start && endUnix >= o.end)
      );

      // Solo agregar si es futuro (comparando con hora Colombia) y no está ocupado
      if (!estaOcupado && slotStart.getTime() > ahoraColombia.getTime()) {
        const horaLocal = slotStart.toLocaleTimeString("es-CO", { 
          timeZone: TIMEZONE, 
          hour: "2-digit", 
          minute: "2-digit",
          hour12: true 
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

async function getCalendarioPrimario(grantId) {
  if (calendariosCache.has(grantId)) {
    return calendariosCache.get(grantId);
  }
  const calendarios = await getCalendars(grantId);
  const cal = calendarios?.find(c => c.is_primary) || calendarios?.[0];
  if (cal) calendariosCache.set(grantId, cal);
  return cal;
}

// Función para agrupar slots en bloques continuos
function agruparEnBloques(slots, duracionMinutos) {
  if (!slots.length) return [];
  
  const bloques = [];
  let bloqueActual = { inicio: slots[0].inicio, fin: slots[0].fin, horaInicio: slots[0].hora };
  
  for (let i = 1; i < slots.length; i++) {
    const slotAnteriorFin = new Date(bloqueActual.fin).getTime();
    const slotActualInicio = new Date(slots[i].inicio).getTime();
    
    // Si el slot actual empieza donde termina el anterior, extender el bloque
    if (slotActualInicio <= slotAnteriorFin + 60000) { // 1 min de tolerancia
      bloqueActual.fin = slots[i].fin;
    } else {
      // Cerrar bloque actual y empezar uno nuevo
      bloqueActual.horaFin = new Date(bloqueActual.fin).toLocaleTimeString("es-CO", { 
        timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: true 
      });
      const duracionMs = new Date(bloqueActual.fin).getTime() - new Date(bloqueActual.inicio).getTime();
      bloqueActual.duracionMin = Math.round(duracionMs / 60000);
      bloques.push(bloqueActual);
      
      bloqueActual = { inicio: slots[i].inicio, fin: slots[i].fin, horaInicio: slots[i].hora };
    }
  }
  
  // Cerrar último bloque
  bloqueActual.horaFin = new Date(bloqueActual.fin).toLocaleTimeString("es-CO", { 
    timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: true 
  });
  const duracionMs = new Date(bloqueActual.fin).getTime() - new Date(bloqueActual.inicio).getTime();
  bloqueActual.duracionMin = Math.round(duracionMs / 60000);
  bloques.push(bloqueActual);
  
  return bloques;
}

// Clasificar hora en período del día
function getPeriodoDia(hora) {
  const h = new Date(hora).getHours();
  if (h < 12) return "Mañana";
  if (h < 18) return "Tarde";
  return "Noche";
}

const tools = {
  verificarDisponibilidad: {
    description: "Verifica disponibilidad consolidada para una o más fechas. Retorna bloques de tiempo disponibles.",
    parameters: z.object({
      fecha: z.string(),
    }),
    execute: async ({ fecha }) => {
      // Parsear fecha
      let fechaParsed;
      let horaPreferida = null;
      const ahora = getAhoraEnColombia();
      const fechaLower = fecha.toLowerCase().trim();
      
      // Manejar "mañana" / "tomorrow"
      if (fechaLower.includes("mañana") || fechaLower.includes("manana") || fechaLower.includes("tomorrow")) {
        fechaParsed = new Date(ahora);
        fechaParsed.setDate(fechaParsed.getDate() + 1);
      }
      // Manejar "hoy" / "today"
      else if (fechaLower.includes("hoy") || fechaLower.includes("today")) {
        fechaParsed = new Date(ahora);
        const horaMatch = fecha.match(/(\d{1,2})[:\s]?(\d{2})?\s*(am|pm|a\.?\s?m|p\.?\s?m)?/i);
        if (horaMatch) {
          let h = parseInt(horaMatch[1]);
          const m = parseInt(horaMatch[2] || "0");
          const ampm = horaMatch[3]?.toLowerCase();
          if (ampm && (ampm.includes("p") && h < 12)) h += 12;
          if (ampm && (ampm.includes("a") && h === 12)) h = 0;
          horaPreferida = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
        }
      }
      // Manejar número solo (minutos desde ahora)
      else if (/^\d+$/.test(fecha.trim())) {
        const minutos = parseInt(fecha.trim());
        fechaParsed = new Date(ahora.getTime() + minutos * 60000);
        horaPreferida = `${fechaParsed.getHours().toString().padStart(2, "0")}:${fechaParsed.getMinutes().toString().padStart(2, "0")}`;
      }
      // Formato ISO o YYYY-MM-DD
      else if (fecha.includes("T") || fecha.includes(" ") || /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
        const parts = fecha.includes("T") ? fecha.split("T") : fecha.split(" ");
        fechaParsed = new Date(parts[0]);
        if (parts[1]) horaPreferida = parts[1].substring(0, 5);
      }
      // Intentar parsear como fecha normal
      else {
        fechaParsed = new Date(fecha);
        if (isNaN(fechaParsed.getTime())) fechaParsed = new Date(ahora);
      }
      
      const fechaStr = fechaParsed.toLocaleDateString("es-CO", { 
        timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" 
      });
      console.log(`  📅 Buscando disponibilidad para ${fechaStr}...`);
      
      const asesores = await getAsesores();
      if (!asesores.length) return { error: "No hay asesores disponibles" };

      const fechaBase = new Date(fechaParsed);
      fechaBase.setHours(0, 0, 0, 0);
      const fechaFin = new Date(fechaBase);
      fechaFin.setHours(23, 59, 59, 999);
      const startUnix = Math.floor(fechaBase.getTime() / 1000);
      const endUnix = Math.floor(fechaFin.getTime() / 1000);

      // Recolectar TODOS los slots de todos los asesores
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

      // Ordenar por hora
      todosLosSlots.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

      // Obtener horas únicas disponibles
      const horasUnicas = [...new Set(todosLosSlots.map(s => s.hora))];
      
      // Agrupar en bloques
      const bloques = agruparEnBloques(todosLosSlots, duracionCita);
      
      // Agrupar por período del día
      const porPeriodo = {};
      bloques.forEach(bloque => {
        const periodo = getPeriodoDia(bloque.inicio);
        if (!porPeriodo[periodo]) porPeriodo[periodo] = [];
        porPeriodo[periodo].push(bloque);
      });

      // Agrupar slots por período del día
      const slotsPorPeriodo = {};
      todosLosSlots.forEach(slot => {
        const periodo = getPeriodoDia(slot.inicio);
        if (!slotsPorPeriodo[periodo]) slotsPorPeriodo[periodo] = [];
        // Solo agregar si no existe ya esa hora
        if (!slotsPorPeriodo[periodo].find(s => s.hora === slot.hora)) {
          slotsPorPeriodo[periodo].push(slot);
        }
      });

      // Construir texto de disponibilidad
      const ahoraColombia = getAhoraEnColombia();
      let availabilityText = `⏰ Hora local actual: ${ahoraColombia.toLocaleString("es-CO", { timeZone: TIMEZONE })}\n`;
      availabilityText += `🌍 Zona horaria: ${TIMEZONE}\n`;
      availabilityText += `🕐 Duración de cita: ${duracionCita}min\n`;
      availabilityText += `📅 Fecha consultada: ${fechaStr}\n`;
      availabilityText += `---\n`;

      if (horasUnicas.length === 0) {
        availabilityText += `❌ No hay disponibilidad para esta fecha.\n`;
      } else {
        availabilityText += `✅ Disponibilidad encontrada\n\n`;
        availabilityText += `### ${fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1)}\n`;
        
        for (const [periodo, slotsP] of Object.entries(slotsPorPeriodo)) {
          availabilityText += `  ${periodo}:\n`;
          // Mostrar cada slot individual
          const horasDelPeriodo = slotsP.map(s => s.hora);
          availabilityText += `  • Horarios: ${horasDelPeriodo.join(", ")}\n`;
        }
        
        availabilityText += `\n---\n`;
        availabilityText += `### Horarios específicos para agendar\n`;
        horasUnicas.forEach(hora => {
          availabilityText += `• ${hora}\n`;
        });
        
        availabilityText += `\n### Resumen\n`;
        availabilityText += `• Total de horarios disponibles: ${horasUnicas.length}\n`;
        availabilityText += `• Duración de cada cita: ${duracionCita} minutos\n`;
      }

      console.log(`  ✅ ${horasUnicas.length} horarios disponibles`);

      return { 
        availabilityText,
        fecha: fechaBase.toISOString().split("T")[0],
        horasDisponibles: horasUnicas.slice(0, 10),
        bloques: bloques.slice(0, 5),
        hayDisponibilidad: horasUnicas.length > 0,
      };
    },
  },

  crearEvento: {
    description: "Crea una cita en el calendario. Requiere titulo, fecha/hora de inicio en formato ISO o Unix timestamp, y email del participante.",
    parameters: z.object({
      titulo: z.string(),
      fechaHoraInicio: z.string(),
      emailParticipante: z.string(),
    }),
    execute: async ({ titulo, fechaHoraInicio, emailParticipante }) => {
      console.log(`  📝 Creando evento: ${titulo} para ${emailParticipante}`);
      
      const asesores = await getAsesores();
      const asesor = asesores[0]; // Usar el primer (único) asesor de prueba
      
      if (!asesor) return { error: "Asesor no encontrado" };

      const cal = await getCalendarioPrimario(asesor.grant_id);
      if (!cal) return { error: "Calendario no encontrado" };

      // Parsear fecha/hora
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

      console.log(`  ✅ Evento creado: ${evento.id}`);
      const inicioLocal = new Date(startTime * 1000).toLocaleString("es-CO", { timeZone: TIMEZONE });
      return {
        success: true,
        eventoId: evento.id,
        asesor: `${asesor.nombre} ${asesor.apellido}`,
        participante: emailParticipante,
        inicio: inicioLocal,
        duracion: `${duracionMin} minutos`,
      };
    },
  },

  reagendarEvento: {
    description: "Reagenda un evento existente a una nueva fecha/hora",
    parameters: z.object({
      eventoId: z.string(),
      nuevaFechaHora: z.string(),
    }),
    execute: async ({ eventoId, nuevaFechaHora }) => {
      console.log(`  🔄 Reagendando evento: ${eventoId}`);
      
      const asesores = await getAsesores();
      const asesor = asesores[0];
      
      if (!asesor) return { error: "Asesor no encontrado" };

      const cal = await getCalendarioPrimario(asesor.grant_id);
      if (!cal) return { error: "Calendario no encontrado" };

      // Parsear nueva fecha/hora
      const fecha = new Date(nuevaFechaHora);
      const nuevoStartTime = Math.floor(fecha.getTime() / 1000);
      const duracionMin = asesor.duracion_cita_minutos || 60;
      const nuevoEndTime = nuevoStartTime + (duracionMin * 60);

      const evento = await updateEvent(asesor.grant_id, cal.id, eventoId, {
        when: { start_time: nuevoStartTime, end_time: nuevoEndTime },
      });

      console.log(`  ✅ Evento reagendado`);
      const inicioLocal = new Date(nuevoStartTime * 1000).toLocaleString("es-CO", { timeZone: TIMEZONE });
      return {
        success: true,
        eventoId: evento.id,
        nuevoInicio: inicioLocal,
      };
    },
  },

  eliminarEvento: {
    description: "Elimina/cancela una cita existente del calendario",
    parameters: z.object({
      eventoId: z.string(),
    }),
    execute: async ({ eventoId }) => {
      console.log(`  🗑️ Eliminando evento: ${eventoId}`);
      
      const asesores = await getAsesores();
      const asesor = asesores[0];
      
      if (!asesor) return { error: "Asesor no encontrado" };

      const cal = await getCalendarioPrimario(asesor.grant_id);
      if (!cal) return { error: "Calendario no encontrado" };

      await deleteEvent(asesor.grant_id, cal.id, eventoId);

      console.log(`  ✅ Evento eliminado`);
      return {
        success: true,
        mensaje: `Evento ${eventoId} eliminado correctamente`,
      };
    },
  },
};

async function chat(mensaje) {
  const start = Date.now();
  
  // Agregar mensaje del usuario al historial
  conversationHistory.push({ role: "user", content: mensaje });
  
  // Limitar historial a últimos 20 mensajes para no exceder contexto
  const recentHistory = conversationHistory.slice(-20);
  
  const result = await generateText({
    model: openrouter("google/gemini-2.5-flash"),
    system: `Eres un asistente de agendamiento amable y eficiente.

CONTEXTO:
- Empresa ID: ${EMPRESA_ID}
- Timezone: ${TIMEZONE}
- Fecha y hora actual: ${new Date().toLocaleString("es-CO", { timeZone: TIMEZONE })}

INSTRUCCIONES:
1. Cuando consultes disponibilidad, recibirás un texto con bloques de tiempo disponibles (availabilityText).
2. Presenta la disponibilidad de forma CONSOLIDADA, NO menciones asesores individuales.
3. Ofrece los horarios más próximos primero.
4. Usa formato 12h (ej: 1:00 PM, 3:30 PM).
5. Recuerda qué disponibilidades ya ofreciste - no repitas horarios que el usuario rechazó.
6. Si no hay disponibilidad para la fecha solicitada, sugiere la fecha más cercana con disponibilidad.
7. Responde siempre en español y de forma concisa.

EJEMPLO DE RESPUESTA:
"Para mañana tengo disponibilidad en la tarde:
• 1:00 PM
• 1:30 PM  
• 2:00 PM
• 2:30 PM

Cada cita dura 30 minutos. ¿Cuál horario te funciona mejor?"`,
    messages: recentHistory,
    tools,
    maxSteps: 3,
  });

  // Agregar respuesta del agente al historial
  conversationHistory.push({ role: "assistant", content: result.text });

  const elapsed = Date.now() - start;
  return { respuesta: result.text, tiempoMs: elapsed };
}

// Interfaz de línea de comandos
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║  🗓️  Agente de Agendamiento - Chat Interactivo             ║");
console.log("║  Empresa ID: 4                                             ║");
console.log("║  Escribe 'salir' para terminar                             ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");

// Precargar asesores
console.log("⏳ Cargando asesores...");
await getAsesores();
console.log("✅ Listo!\n");

function preguntar() {
  rl.question("Tú: ", async (input) => {
    const mensaje = input.trim();
    
    if (!mensaje) {
      preguntar();
      return;
    }
    
    if (mensaje.toLowerCase() === "salir") {
      console.log("\n👋 ¡Hasta luego!");
      rl.close();
      process.exit(0);
    }

    try {
      const { respuesta, tiempoMs } = await chat(mensaje);
      console.log(`\n🤖 Agente: ${respuesta}`);
      console.log(`   (${tiempoMs}ms)\n`);
    } catch (err) {
      console.log(`\n❌ Error: ${err.message}\n`);
    }

    preguntar();
  });
}

preguntar();
