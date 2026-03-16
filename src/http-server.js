/**
 * HTTP Server - API REST para Agendamiento
 * 
 * Expone las tools como endpoints HTTP para integración con n8n, Make, etc.
 * 
 * Endpoints:
 * POST /disponibilidad - Consultar disponibilidad
 * POST /crear-evento - Crear evento
 * POST /reagendar-evento - Reagendar evento
 * POST /eliminar-evento - Eliminar evento
 */

import "dotenv/config";
import http from "http";
import { supabase } from "./lib/supabase.js";
import { getCalendars, getEvents, createEvent, updateEvent, deleteEvent } from "./lib/nylas.js";

const PORT = process.env.PORT || 3000;

// Cache
const calendariosCache = new Map();

// ⚠️ MODO TEST: Solo permitir operaciones con Luis Villegas (id=154)
const ASESOR_TEST_ID = 154;

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

async function getAsesorByContactoId(contactoId, requireTestMode = false) {
  const { data: contacto } = await supabase
    .from("wp_contactos")
    .select("asesor_id")
    .eq("id", contactoId)
    .single();
  
  if (!contacto?.asesor_id) return null;
  
  if (ASESOR_TEST_ID && requireTestMode && contacto.asesor_id !== ASESOR_TEST_ID) {
    return { blocked: true, message: `⚠️ Modo test activo: Solo se permiten operaciones con el asesor de prueba (ID: ${ASESOR_TEST_ID})` };
  }
  
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

  const asesor = await getAsesorByContactoId(contacto_id, true);
  if (!asesor) return { error: "No se encontró asesor asignado al contacto" };
  if (asesor.blocked) return { error: asesor.message };
  if (!asesor.grant_id || asesor.grant_id === "Solicitud enviada") {
    return { error: "El asesor no tiene calendario configurado" };
  }

  const cal = await getCalendarioPrimario(asesor.grant_id);
  if (!cal) return { error: "Calendario no encontrado" };

  const fechaInicio = new Date(start);
  const startTime = Math.floor(fechaInicio.getTime() / 1000);
  const duracionMin = asesor.duracion_cita_minutos || 60;
  const endTime = startTime + (duracionMin * 60);

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

  const asesor = await getAsesorByContactoId(contacto_id, true);
  if (!asesor) return { error: "No se encontró asesor asignado al contacto" };
  if (asesor.blocked) return { error: asesor.message };
  if (!asesor.grant_id || asesor.grant_id === "Solicitud enviada") {
    return { error: "El asesor no tiene calendario configurado" };
  }

  const cal = await getCalendarioPrimario(asesor.grant_id);
  if (!cal) return { error: "Calendario no encontrado" };

  const fechaInicio = new Date(start);
  const startTime = Math.floor(fechaInicio.getTime() / 1000);
  const duracionMin = Duracion_minutos ? parseInt(Duracion_minutos) : (asesor.duracion_cita_minutos || 60);
  const endTime = startTime + (duracionMin * 60);

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
// TOOL 4: Eliminar_Evento
// ============================================
async function eliminarEvento(eventId, contactoId) {
  const asesor = await getAsesorByContactoId(contactoId, true);
  if (!asesor) return { error: "No se encontró asesor asignado al contacto" };
  if (asesor.blocked) return { error: asesor.message };
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

// ============================================
// HTTP Server
// ============================================
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // Health check
  if (req.url === "/" || req.url === "/health") {
    return sendJSON(res, { status: "ok", service: "scheduling-agent", timestamp: new Date().toISOString() });
  }

  // Solo POST
  if (req.method !== "POST") {
    return sendJSON(res, { error: "Method not allowed" }, 405);
  }

  try {
    const body = await parseBody(req);
    let result;

    switch (req.url) {
      case "/disponibilidad":
        result = await disponibilidadAgenda(body.contacto_id, body.time_zone_contacto);
        break;
      
      case "/crear-evento":
        result = await crearEventoCalendario(body);
        break;
      
      case "/reagendar-evento":
        result = await reagendarEvento(body);
        break;
      
      case "/eliminar-evento":
        result = await eliminarEvento(body.event_id, body.contacto_id);
        break;
      
      default:
        return sendJSON(res, { error: "Endpoint not found" }, 404);
    }

    sendJSON(res, result, result.error ? 400 : 200);
  } catch (error) {
    console.error("Error:", error);
    sendJSON(res, { error: error.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Scheduling Agent HTTP Server running on port ${PORT}`);
  console.log(`📍 Endpoints:`);
  console.log(`   POST /disponibilidad`);
  console.log(`   POST /crear-evento`);
  console.log(`   POST /reagendar-evento`);
  console.log(`   POST /eliminar-evento`);
});
