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
import { getCalendars, getEvents, getFreeBusy, getAvailability, createEvent, updateEvent, deleteEvent } from "./lib/nylas.js";

console.log("✅ Módulos importados correctamente");

const PORT = process.env.PORT || 3000;

// Cache solo para calendarios (no cambian frecuentemente)
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
  const { data: asesores, error: asesoresError } = await supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id, timezone, duracion_cita_minutos, disponibilidad")
    .eq("empresa_id", empresaId)
    .eq("is_active", true);
  
  if (asesoresError) {
    console.log(`  ❌ Error buscando asesores: ${asesoresError.message}`);
    return [];
  }
  
  // Filtrar solo asesores con calendario configurado
  const asesoresConCalendario = asesores.filter(a => a.grant_id && a.grant_id !== "Solicitud enviada");
  console.log(`  🏢 Asesores: ${asesoresConCalendario.length} con calendario de ${asesores.length} total`);
  
  return asesoresConCalendario;
}

async function getCitaContacto(contactoId) {
  // Buscar la cita más reciente del contacto (no cancelada)
  const { data: cita, error: citaError } = await supabase
    .from("wp_citas")
    .select("id, fecha_hora, titulo, ubicacion, estado, team_humano_id, empresa_id, event_id")
    .eq("contacto_id", contactoId)
    .neq("estado", "cancelada")
    .order("fecha_hora", { ascending: false })
    .limit(1)
    .single();
  
  if (citaError || !cita) {
    return {
      tiene_cita: false,
      texto: null,
      link: null,
      fecha: null,
      estado: "(Sin cita registrada)"
    };
  }
  
  // Obtener nombre de empresa
  let empresaNombre = "";
  if (cita.empresa_id) {
    const { data: empresa } = await supabase
      .from("wp_empresa_perfil")
      .select("nombre")
      .eq("id", cita.empresa_id)
      .single();
    empresaNombre = empresa?.nombre || "";
  }
  
  // Obtener nombre del asesor
  let asesorNombre = "";
  if (cita.team_humano_id) {
    const { data: asesor } = await supabase
      .from("wp_team_humano")
      .select("nombre, apellido")
      .eq("id", cita.team_humano_id)
      .single();
    asesorNombre = asesor ? `${asesor.nombre} ${asesor.apellido?.charAt(0) || ""}` : "";
  }
  
  // Determinar modalidad basada en ubicación
  const esVirtual = cita.ubicacion && (cita.ubicacion.includes("meet.google.com") || cita.ubicacion.includes("zoom") || cita.ubicacion.toLowerCase().includes("virtual"));
  const modalidad = esVirtual ? "Virtual" : "Presencial";
  
  return {
    tiene_cita: true,
    texto: `🗓️ | ${asesorNombre} | ${empresaNombre} | ${modalidad}`,
    link: esVirtual ? cita.ubicacion : null,
    fecha: cita.fecha_hora,
    estado: cita.estado || "pendiente"
  };
}

async function getAsesorByContactoId(contactoId, requireTestMode = false) {
  console.log(`  📋 Buscando contacto: ${contactoId}`);
  
  const { data: contacto, error: contactoError } = await supabase
    .from("wp_contactos")
    .select("asesor_id, empresa_id")
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
// TOOL 1: Disponibilidad_Agenda (OPTIMIZADO - FREE/BUSY PARALELO)
// ============================================
async function disponibilidadAgenda(contactoId, empresaId, timeZoneContacto) {
  const timezone = timeZoneContacto || "America/Bogota";
  
  if (!contactoId) {
    return { error: "Se requiere contacto_id" };
  }
  
  if (!empresaId) {
    return { error: "Se requiere empresa_id" };
  }
  
  const startTime = Date.now();
  
  // Obtener info de cita del contacto en paralelo con asesores
  const [citaInfo, asesores] = await Promise.all([
    getCitaContacto(contactoId),
    getAsesoresByEmpresaId(empresaId)
  ]);
  
  if (asesores.length === 0) {
    return { error: "No se encontraron asesores con calendario configurado para esta empresa" };
  }

  const ahora = getAhoraEnTimezone(timezone);
  const startUnix = Math.floor(ahora.getTime() / 1000);
  const finRango = new Date(ahora);
  finRango.setDate(finRango.getDate() + 7);
  const endUnix = Math.floor(finRango.getTime() / 1000);

  // Free/Busy TODOS en paralelo
  const resultados = await Promise.all(
    asesores.map(asesor => 
      getFreeBusy(asesor.grant_id, asesor.email, startUnix, endUnix)
        .then(freeBusy => ({ asesor, freeBusy, ok: true }))
        .catch(() => ({ asesor, freeBusy: null, ok: false }))
    )
  );
  
  const asesoresOK = resultados.filter(r => r.ok);

  if (asesoresOK.length === 0) {
    return { error: "No se pudo obtener disponibilidad de ningún asesor" };
  }

  // Procesar slots
  const disponibilidadPorDia = new Map();
  
  for (const { asesor, freeBusy } of asesoresOK) {
    const busyPeriods = [];
    if (freeBusy && Array.isArray(freeBusy)) {
      freeBusy.forEach(fb => {
        if (fb.time_slots) {
          fb.time_slots.forEach(slot => {
            if (slot.status === 'busy') {
              busyPeriods.push({ start: slot.start_time, end: slot.end_time });
            }
          });
        }
      });
    }

    for (let i = 0; i < 7; i++) {
      const fecha = new Date(ahora);
      fecha.setDate(fecha.getDate() + i);
      fecha.setHours(0, 0, 0, 0);
      const fechaKey = fecha.toISOString().split("T")[0];
      
      if (!disponibilidadPorDia.has(fechaKey)) {
        disponibilidadPorDia.set(fechaKey, { fecha: fechaKey, fechaObj: fecha, horariosUnicos: new Map() });
      }
      
      const eventosSimulados = busyPeriods.map(bp => ({ when: { start_time: bp.start, end_time: bp.end } }));
      const slots = calcularSlots(fecha, eventosSimulados, asesor.disponibilidad, asesor.duracion_cita_minutos || 30, timezone);
      const diaData = disponibilidadPorDia.get(fechaKey);
      
      slots.forEach(slot => {
        const key = slot.hora;
        if (!diaData.horariosUnicos.has(key)) {
          diaData.horariosUnicos.set(key, { hora: slot.hora, inicio: slot.inicio, asesores_disponibles: 0 });
        }
        diaData.horariosUnicos.get(key).asesores_disponibles++;
      });
    }
  }

  // Formato de respuesta
  const disponibilidadDias = [];
  for (const [fechaKey, diaData] of disponibilidadPorDia) {
    if (diaData.horariosUnicos.size > 0) {
      const fechaStr = diaData.fechaObj.toLocaleDateString("es-CO", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" });
      const slotsUnicos = Array.from(diaData.horariosUnicos.values()).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
      
      const slotsPorPeriodo = {};
      slotsUnicos.forEach(slot => {
        const periodo = getPeriodoDia(slot.inicio);
        if (!slotsPorPeriodo[periodo]) slotsPorPeriodo[periodo] = [];
        slotsPorPeriodo[periodo].push(slot);
      });

      disponibilidadDias.push({ fecha: fechaKey, fechaTexto: fechaStr, total_horarios: slotsUnicos.length, slots: slotsUnicos, porPeriodo: slotsPorPeriodo });
    }
  }

  disponibilidadDias.sort((a, b) => a.fecha.localeCompare(b.fecha));
  
  // Info de cita actual (ya viene formateada de getCitaContacto)
  const citaActual = citaInfo || {
    tiene_cita: false,
    texto: null,
    link: null,
    fecha: null,
    estado: "(Sin cita registrada)"
  };
  
  return {
    cita_actual: citaActual,
    contacto_id: contactoId,
    empresa_id: empresaId,
    time_zone: timezone,
    hora_actual: ahora.toLocaleString("es-CO", { timeZone: timezone }),
    total_asesores: asesores.length,
    asesores_consultados: asesoresOK.length,
    tiempo_consulta_ms: Date.now() - startTime,
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
        console.log(`[${requestId}] Ejecutando: disponibilidadAgenda(${body.contacto_id}, ${body.empresa_id}, ${body.time_zone_contacto})`);
        result = await disponibilidadAgenda(body.contacto_id, body.empresa_id, body.time_zone_contacto);
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
