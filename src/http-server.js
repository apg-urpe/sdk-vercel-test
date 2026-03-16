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

// Log de inicio
console.log("🔄 Iniciando servidor...");
console.log("📋 Variables de entorno:");
console.log(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? "✅" : "❌ FALTA"}`);
console.log(`   SUPABASE_SERVICE_KEY: ${process.env.SUPABASE_SERVICE_KEY ? "✅" : "❌ FALTA"}`);
console.log(`   NYLAS_API_KEY: ${process.env.NYLAS_API_KEY ? "✅" : "❌ FALTA"}`);
console.log(`   NYLAS_API_URL: ${process.env.NYLAS_API_URL ? "✅" : "❌ FALTA"}`);
console.log(`   PORT: ${process.env.PORT || "3000 (default)"}`);

import { supabase } from "./lib/supabase.js";
import { getCalendars, getEvents, createEvent, updateEvent, deleteEvent } from "./lib/nylas.js";

console.log("✅ Módulos importados correctamente");

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

async function getAsesorById(asesorId) {
  console.log(`  📋 Buscando asesor directo: ${asesorId}`);
  
  const { data: asesor, error: asesorError } = await supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id, timezone, duracion_cita_minutos, disponibilidad")
    .eq("id", asesorId)
    .eq("is_active", true)
    .single();
  
  if (asesorError) {
    console.log(`  ❌ Error buscando asesor: ${asesorError.message}`);
    return null;
  }
  
  console.log(`  ✅ Asesor encontrado: ${asesor?.nombre} ${asesor?.apellido} (grant_id: ${asesor?.grant_id})`);
  return asesor;
}

async function getAsesoresByEmpresaId(empresaId) {
  console.log(`  🏢 Buscando asesores de empresa: ${empresaId}`);
  
  const { data: asesores, error: asesoresError } = await supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id, timezone, duracion_cita_minutos, disponibilidad")
    .eq("empresa_id", empresaId)
    .eq("is_active", true);
  
  if (asesoresError) {
    console.log(`  ❌ Error buscando asesores: ${asesoresError.message}`);
    return [];
  }
  
  console.log(`  📋 Asesores totales en empresa: ${asesores?.length || 0}`);
  asesores?.forEach(a => {
    console.log(`     - ${a.nombre} ${a.apellido} (id: ${a.id}, grant_id: ${a.grant_id ? '✅' : '❌'})`);
  });
  
  // Filtrar solo asesores con calendario configurado
  const asesoresConCalendario = asesores.filter(a => a.grant_id && a.grant_id !== "Solicitud enviada");
  console.log(`  ✅ Asesores con calendario: ${asesoresConCalendario.length}`);
  
  return asesoresConCalendario;
}

async function getAsesorByContactoId(contactoId, requireTestMode = false) {
  console.log(`  📋 Buscando contacto: ${contactoId}`);
  
  const { data: contacto, error: contactoError } = await supabase
    .from("wp_contactos")
    .select("asesor_id")
    .eq("id", contactoId)
    .single();
  
  if (contactoError) {
    console.log(`  ❌ Error buscando contacto: ${contactoError.message}`);
    return null;
  }
  
  if (!contacto?.asesor_id) {
    console.log(`  ❌ Contacto no tiene asesor asignado`);
    return null;
  }
  
  console.log(`  📋 Asesor ID del contacto: ${contacto.asesor_id}`);
  
  if (ASESOR_TEST_ID && requireTestMode && contacto.asesor_id !== ASESOR_TEST_ID) {
    console.log(`  ⚠️ Bloqueado: asesor ${contacto.asesor_id} != test ${ASESOR_TEST_ID}`);
    return { blocked: true, message: `⚠️ Modo test activo: Solo se permiten operaciones con el asesor de prueba (ID: ${ASESOR_TEST_ID})` };
  }
  
  const { data: asesor, error: asesorError } = await supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id, timezone, duracion_cita_minutos, disponibilidad")
    .eq("id", contacto.asesor_id)
    .eq("is_active", true)
    .single();
  
  if (asesorError) {
    console.log(`  ❌ Error buscando asesor: ${asesorError.message}`);
    return null;
  }
  
  console.log(`  ✅ Asesor encontrado: ${asesor?.nombre} ${asesor?.apellido} (grant_id: ${asesor?.grant_id})`);
  return asesor;
}

async function getCalendarioPrimario(grantId) {
  console.log(`  📅 Buscando calendario para grant: ${grantId}`);
  
  if (calendariosCache.has(grantId)) {
    console.log(`  📅 Calendario en cache`);
    return calendariosCache.get(grantId);
  }
  
  try {
    const calendarios = await getCalendars(grantId);
    console.log(`  📅 Calendarios encontrados: ${calendarios?.length || 0}`);
    const cal = calendarios?.find(c => c.is_primary) || calendarios?.[0];
    if (cal) {
      console.log(`  ✅ Calendario primario: ${cal.id}`);
      calendariosCache.set(grantId, cal);
    } else {
      console.log(`  ❌ No se encontró calendario`);
    }
    return cal;
  } catch (error) {
    console.log(`  ❌ Error obteniendo calendarios: ${error.message}`);
    throw error;
  }
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
async function disponibilidadAgenda(empresaId, timeZoneContacto) {
  const timezone = timeZoneContacto || "America/Bogota";
  
  if (!empresaId) {
    return { error: "Se requiere empresa_id" };
  }
  
  // Obtener todos los asesores de la empresa
  const asesores = await getAsesoresByEmpresaId(empresaId);
  
  if (asesores.length === 0) {
    return { error: "No se encontraron asesores con calendario configurado para esta empresa" };
  }

  const ahora = getAhoraEnTimezone(timezone);
  const disponibilidadDias = [];

  // Consolidar disponibilidad de todos los asesores
  for (let i = 0; i < 7; i++) {
    const fecha = new Date(ahora);
    fecha.setDate(fecha.getDate() + i);
    fecha.setHours(0, 0, 0, 0);
    
    const fechaFin = new Date(fecha);
    fechaFin.setHours(23, 59, 59, 999);
    
    const startUnix = Math.floor(fecha.getTime() / 1000);
    const endUnix = Math.floor(fechaFin.getTime() / 1000);

    // Map para consolidar horarios únicos: key = hora, value = array de asesor_ids
    const horariosUnicos = new Map();

    // Obtener slots de cada asesor
    for (const asesor of asesores) {
      try {
        const cal = await getCalendarioPrimario(asesor.grant_id);
        if (!cal) continue;
        
        const eventos = await getEvents(asesor.grant_id, cal.id, startUnix, endUnix);
        const slots = calcularSlots(fecha, eventos, asesor.disponibilidad, asesor.duracion_cita_minutos || 30, timezone);
        
        // Agregar cada slot al mapa de horarios únicos
        slots.forEach(slot => {
          const key = slot.hora; // Usar la hora como key única
          if (!horariosUnicos.has(key)) {
            horariosUnicos.set(key, {
              hora: slot.hora,
              inicio: slot.inicio,
              asesores_disponibles: []
            });
          }
          horariosUnicos.get(key).asesores_disponibles.push(asesor.id);
        });
      } catch (e) {
        console.log(`  ⚠️ Error obteniendo slots de ${asesor.nombre}: ${e.message}`);
      }
    }

    if (horariosUnicos.size > 0) {
      const fechaStr = fecha.toLocaleDateString("es-CO", { 
        timeZone: timezone, weekday: "long", day: "numeric", month: "long" 
      });
      
      // Convertir Map a array y ordenar por hora
      const slotsUnicos = Array.from(horariosUnicos.values())
        .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
        .map(s => ({
          hora: s.hora,
          inicio: s.inicio,
          asesores_disponibles: s.asesores_disponibles.length
        }));
      
      // Agrupar por período
      const slotsPorPeriodo = {};
      slotsUnicos.forEach(slot => {
        const periodo = getPeriodoDia(slot.inicio);
        if (!slotsPorPeriodo[periodo]) slotsPorPeriodo[periodo] = [];
        slotsPorPeriodo[periodo].push(slot);
      });

      disponibilidadDias.push({
        fecha: fecha.toISOString().split("T")[0],
        fechaTexto: fechaStr,
        total_horarios: slotsUnicos.length,
        slots: slotsUnicos,
        porPeriodo: slotsPorPeriodo,
      });
    }
  }

  const ahoraStr = ahora.toLocaleString("es-CO", { timeZone: timezone });
  
  return {
    empresa_id: empresaId,
    time_zone: timezone,
    hora_actual: ahoraStr,
    total_asesores: asesores.length,
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
  const requestId = Date.now().toString(36);
  const startTime = Date.now();
  
  console.log(`[${requestId}] ${req.method} ${req.url}`);

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
    return sendJSON(res, { 
      status: "ok", 
      service: "scheduling-agent", 
      timestamp: new Date().toISOString(),
      env_check: {
        NYLAS_API_KEY: !!process.env.NYLAS_API_KEY,
        NYLAS_API_URL: !!process.env.NYLAS_API_URL,
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
      }
    });
  }

  // Solo POST
  if (req.method !== "POST") {
    return sendJSON(res, { error: "Method not allowed" }, 405);
  }

  try {
    const body = await parseBody(req);
    console.log(`[${requestId}] Body:`, JSON.stringify(body));
    
    let result;

    switch (req.url) {
      case "/disponibilidad":
        console.log(`[${requestId}] Ejecutando: disponibilidadAgenda(${body.empresa_id}, ${body.time_zone_contacto})`);
        result = await disponibilidadAgenda(body.empresa_id, body.time_zone_contacto);
        break;
      
      case "/crear-evento":
        console.log(`[${requestId}] Ejecutando: crearEventoCalendario`);
        result = await crearEventoCalendario(body);
        break;
      
      case "/reagendar-evento":
        console.log(`[${requestId}] Ejecutando: reagendarEvento`);
        result = await reagendarEvento(body);
        break;
      
      case "/eliminar-evento":
        console.log(`[${requestId}] Ejecutando: eliminarEvento(${body.event_id}, ${body.contacto_id})`);
        result = await eliminarEvento(body.event_id, body.contacto_id);
        break;
      
      default:
        return sendJSON(res, { error: "Endpoint not found" }, 404);
    }

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ✅ Completado en ${duration}ms`);
    sendJSON(res, result, result.error ? 400 : 200);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] ❌ Error en ${duration}ms:`);
    console.error(`[${requestId}] - Mensaje: ${error.message}`);
    console.error(`[${requestId}] - Stack: ${error.stack}`);
    sendJSON(res, { 
      error: error.message,
      request_id: requestId,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, 500);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Scheduling Agent HTTP Server running on port ${PORT}`);
  console.log(`🌐 Listening on 0.0.0.0:${PORT}`);
  console.log(`📍 Endpoints:`);
  console.log(`   POST /disponibilidad`);
  console.log(`   POST /crear-evento`);
  console.log(`   POST /reagendar-evento`);
  console.log(`   POST /eliminar-evento`);
});
