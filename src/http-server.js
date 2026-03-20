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
import { getCalendars, getEvents, getFreeBusy, createEvent, updateEvent, deleteEvent, listNotetakers, listAllNotetakers, getNotetaker, getNotetakerMedia, inviteNotetaker } from "./lib/nylas.js";

console.log("✅ Módulos importados correctamente");

const PORT = process.env.PORT || 3000;

// Cache solo para calendarios (no cambian frecuentemente)
const calendariosCache = new Map();

// ⚠️ MODO TEST: Solo permitir operaciones con Luis Villegas (id=154)
// Poner null para permitir todos los asesores
const ASESOR_TEST_ID = null;

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
    .eq("is_actestan", true)
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
    .eq("is_active", true)
    .eq("is_actestan", true);
  
  if (asesoresError) {
    console.log(`  ❌ Error buscando asesores: ${asesoresError.message}`);
    return [];
  }
  
  // Filtrar solo asesores con calendario configurado
  const asesoresConCalendario = asesores.filter(a => a.grant_id && a.grant_id !== "Solicitud enviada");
  console.log(`  🏢 Asesores: ${asesoresConCalendario.length} con calendario de ${asesores.length} total`);
  
  return asesoresConCalendario;
}

/**
 * Obtiene el conteo de citas pendientes por asesor
 */
async function getConteoCitasPorAsesor(empresaId) {
  const { data: citas, error } = await supabase
    .from("wp_citas")
    .select("team_humano_id")
    .eq("empresa_id", empresaId)
    .eq("estado", "pendiente");
  
  if (error || !citas) return {};
  
  // Contar citas por asesor
  const conteo = {};
  citas.forEach(c => {
    if (c.team_humano_id) {
      conteo[c.team_humano_id] = (conteo[c.team_humano_id] || 0) + 1;
    }
  });
  return conteo;
}

/**
 * Verifica si el contacto tiene una cita con estado "Realizada"
 * Si la tiene, devuelve el asesor asignado (debe mantenerlo siempre)
 */
async function getAsesorFijoDeContacto(contactoId) {
  // Buscar si tiene alguna cita con estado "Realizada"
  const { data: citaRealizada, error } = await supabase
    .from("wp_citas")
    .select("team_humano_id")
    .eq("contacto_id", contactoId)
    .ilike("estado", "%realizada%")
    .order("fecha_hora", { ascending: false })
    .limit(1)
    .single();
  
  if (error || !citaRealizada?.team_humano_id) {
    return null; // No tiene cita realizada, puede asignarse cualquier asesor
  }
  
  // Obtener datos del asesor fijo
  const { data: asesor } = await supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id, timezone, duracion_cita_minutos, disponibilidad")
    .eq("id", citaRealizada.team_humano_id)
    .eq("is_active", true)
    .eq("is_actestan", true)
    .single();
  
  if (!asesor || !asesor.grant_id || asesor.grant_id === "Solicitud enviada") {
    console.log(`  ⚠️ Asesor fijo ${citaRealizada.team_humano_id} no tiene calendario configurado`);
    return null;
  }
  
  console.log(`  🔒 Contacto tiene cita Realizada - Asesor fijo: ${asesor.nombre} ${asesor.apellido}`);
  return asesor;
}

/**
 * Selecciona el mejor asesor para un horario específico
 * Criterios: 1) Está disponible en ese horario, 2) Tiene menos citas pendientes
 * IMPORTANTE: Si el contacto tiene cita "Realizada", usa siempre el mismo asesor
 */
async function seleccionarMejorAsesor(empresaId, fechaHoraISO, timezone, contactoId = null) {
  // Si hay contactoId, verificar si tiene asesor fijo (cita Realizada)
  if (contactoId) {
    const asesorFijo = await getAsesorFijoDeContacto(contactoId);
    if (asesorFijo) {
      // Verificar si el asesor fijo está disponible en ese horario
      const fechaHora = new Date(fechaHoraISO);
      const startUnix = Math.floor(fechaHora.getTime() / 1000);
      const endUnix = startUnix + 3600;
      
      try {
        const freeBusy = await getFreeBusy(asesorFijo.grant_id, asesorFijo.email, startUnix, endUnix);
        let ocupado = false;
        
        if (Array.isArray(freeBusy)) {
          freeBusy.forEach(fb => {
            if (fb.time_slots) {
              fb.time_slots.forEach(slot => {
                if (slot.status === 'busy' && slot.start_time <= startUnix && slot.end_time > startUnix) {
                  ocupado = true;
                }
              });
            }
          });
        }
        
        if (ocupado) {
          console.log(`  ❌ Asesor fijo ${asesorFijo.nombre} NO está disponible a las ${fechaHora.toLocaleTimeString()}`);
          return { 
            error: `El asesor asignado (${asesorFijo.nombre} ${asesorFijo.apellido}) no está disponible en ese horario. Por favor seleccione otro horario.`,
            asesor_fijo: asesorFijo
          };
        }
        
        console.log(`  ✅ Asesor fijo ${asesorFijo.nombre} está disponible`);
        return {
          asesor: asesorFijo,
          citas_pendientes: 0,
          total_disponibles: 1,
          es_asesor_fijo: true
        };
      } catch (e) {
        console.log(`  ⚠️ Error verificando disponibilidad de asesor fijo: ${e.message}`);
        return { error: "Error verificando disponibilidad del asesor asignado" };
      }
    }
  }
  
  // Sin asesor fijo, usar lógica normal
  const asesores = await getAsesoresByEmpresaId(empresaId);
  if (asesores.length === 0) return null;
  
  const fechaHora = new Date(fechaHoraISO);
  const startUnix = Math.floor(fechaHora.getTime() / 1000);
  const endUnix = startUnix + 3600; // 1 hora de ventana
  
  // Obtener free/busy de todos los asesores en paralelo
  const freeBusyResults = await Promise.all(
    asesores.map(asesor => 
      getFreeBusy(asesor.grant_id, asesor.email, startUnix, endUnix)
        .then(freeBusy => ({ asesor, freeBusy, ok: true }))
        .catch(() => ({ asesor, freeBusy: null, ok: false }))
    )
  );
  
  // Filtrar asesores disponibles en ese horario
  const asesoresDisponibles = freeBusyResults.filter(r => {
    if (!r.ok || !r.freeBusy) return false;
    
    // Verificar que no tenga eventos ocupados en ese horario
    let ocupado = false;
    if (Array.isArray(r.freeBusy)) {
      r.freeBusy.forEach(fb => {
        if (fb.time_slots) {
          fb.time_slots.forEach(slot => {
            if (slot.status === 'busy') {
              // Verificar si el slot ocupado se superpone con el horario deseado
              if (slot.start_time <= startUnix && slot.end_time > startUnix) {
                ocupado = true;
              }
            }
          });
        }
      });
    }
    return !ocupado;
  }).map(r => r.asesor);
  
  if (asesoresDisponibles.length === 0) {
    console.log(`  ❌ No hay asesores disponibles a las ${fechaHoraISO}`);
    return null;
  }
  
  console.log(`  ✅ ${asesoresDisponibles.length} asesores disponibles a las ${fechaHora.toLocaleTimeString()}`);
  
  // Obtener conteo de citas pendientes
  const conteoCitas = await getConteoCitasPorAsesor(empresaId);
  
  // Ordenar por cantidad de citas (menor primero)
  asesoresDisponibles.sort((a, b) => {
    const citasA = conteoCitas[a.id] || 0;
    const citasB = conteoCitas[b.id] || 0;
    return citasA - citasB;
  });
  
  // Mostrar ranking
  console.log(`  📊 Ranking de asesores disponibles:`);
  asesoresDisponibles.slice(0, 5).forEach((a, i) => {
    console.log(`     ${i+1}. ${a.nombre} ${a.apellido} - ${conteoCitas[a.id] || 0} citas pendientes`);
  });
  
  return {
    asesor: asesoresDisponibles[0],
    citas_pendientes: conteoCitas[asesoresDisponibles[0].id] || 0,
    total_disponibles: asesoresDisponibles.length
  };
}

/**
 * Actualiza el team_humano_id en wp_contactos cuando se asigna/cambia un asesor
 */
async function actualizarAsesorEnContacto(contactoId, nuevoAsesorId) {
  console.log(`  📝 Actualizando asesor ${nuevoAsesorId} en wp_contactos para contacto ${contactoId}`);
  
  const ahora = new Date().toISOString();
  
  const { error } = await supabase
    .from("wp_contactos")
    .update({ team_humano_id: nuevoAsesorId, updated_at: ahora })
    .eq("id", contactoId);
  
  if (error) {
    console.log(`  ⚠️ Error actualizando wp_contactos: ${error.message}`);
    return false;
  }
  
  console.log(`  ✅ wp_contactos actualizado`);
  return true;
}

/**
 * Crea o actualiza la cita en wp_citas
 */
async function guardarCitaEnSupabase(params) {
  const { contactoId, empresaId, asesorId, eventId, fechaHora, duracion, titulo, ubicacion, modalidad, estado = "pendiente" } = params;
  
  console.log(`  📝 Guardando cita en Supabase...`);
  
  const ahora = new Date().toISOString();
  
  // Verificar si ya existe una cita con este event_id
  const { data: citaExistente } = await supabase
    .from("wp_citas")
    .select("id")
    .eq("event_id", eventId)
    .single();
  
  if (citaExistente) {
    // Actualizar cita existente
    const { error } = await supabase
      .from("wp_citas")
      .update({
        team_humano_id: asesorId,
        fecha_hora: fechaHora,
        duracion: duracion,
        titulo: titulo,
        ubicacion: ubicacion,
        estado: estado,
        updated_at: ahora,
        sincronizacion: "sincronizado"
      })
      .eq("id", citaExistente.id);
    
    if (error) {
      console.log(`  ⚠️ Error actualizando wp_citas: ${error.message}`);
    } else {
      console.log(`  ✅ wp_citas actualizado (id: ${citaExistente.id})`);
    }
    return citaExistente.id;
  } else {
    // Crear nueva cita
    const { data: nuevaCita, error } = await supabase
      .from("wp_citas")
      .insert({
        contacto_id: contactoId,
        empresa_id: empresaId,
        team_humano_id: asesorId,
        event_id: eventId,
        fecha_hora: fechaHora,
        duracion: duracion,
        titulo: titulo,
        ubicacion: ubicacion,
        estado: estado,
        created_at: ahora,
        updated_at: ahora,
        sincronizacion: "sincronizado"
      })
      .select("id")
      .single();
    
    if (error) {
      console.log(`  ⚠️ Error insertando wp_citas: ${error.message}`);
      return null;
    } else {
      console.log(`  ✅ wp_citas insertado (id: ${nuevaCita.id})`);
      return nuevaCita.id;
    }
  }
}

/**
 * Actualiza el estado de una cita en wp_citas
 */
async function actualizarEstadoCita(eventId, nuevoEstado) {
  const ahora = new Date().toISOString();
  
  const { error } = await supabase
    .from("wp_citas")
    .update({ estado: nuevoEstado, updated_at: ahora })
    .eq("event_id", eventId);
  
  if (error) {
    console.log(`  ⚠️ Error actualizando estado de cita: ${error.message}`);
    return false;
  }
  
  console.log(`  ✅ Estado de cita actualizado a: ${nuevoEstado}`);
  return true;
}

async function getCitaContacto(contactoId) {
  // Buscar la cita más reciente del contacto (cualquier estado excepto cancelada)
  const { data: citas, error: citaError } = await supabase
    .from("wp_citas")
    .select("id, fecha_hora, titulo, ubicacion, estado, team_humano_id, empresa_id, event_id")
    .eq("contacto_id", contactoId)
    .order("fecha_hora", { ascending: false })
    .limit(5);
  
  // Filtrar: preferir pendiente, luego cualquier otra que no sea cancelada
  const cita = citas?.find(c => c.estado === "pendiente") 
    || citas?.find(c => c.estado !== "cancelada") 
    || citas?.[0];
  
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
  
  // Buscar el asesor desde la última cita del contacto (wp_citas tiene team_humano_id)
  const { data: cita, error: citaError } = await supabase
    .from("wp_citas")
    .select("team_humano_id, empresa_id")
    .eq("contacto_id", contactoId)
    .neq("estado", "cancelada")
    .order("fecha_hora", { ascending: false })
    .limit(1)
    .single();
  
  // Si no hay cita, intentar buscar en wp_contactos con team_humano_id
  let asesorId = cita?.team_humano_id;
  let empresaId = cita?.empresa_id;
  
  if (!asesorId) {
    const { data: contacto } = await supabase
      .from("wp_contactos")
      .select("team_humano_id, empresa_id")
      .eq("id", contactoId)
      .single();
    asesorId = contacto?.team_humano_id;
    empresaId = contacto?.empresa_id;
  }
  
  if (!asesorId) {
    console.log(`  ❌ Contacto no tiene asesor asignado`);
    return null;
  }
  
  console.log(`  📋 Asesor ID del contacto: ${asesorId}`);
  
  if (ASESOR_TEST_ID && requireTestMode && asesorId !== ASESOR_TEST_ID) {
    console.log(`  ⚠️ Bloqueado: asesor ${asesorId} != test ${ASESOR_TEST_ID}`);
    return { blocked: true, message: `⚠️ Modo test activo: Solo se permiten operaciones con el asesor de prueba (ID: ${ASESOR_TEST_ID})` };
  }
  
  const { data: asesor, error: asesorError } = await supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id, timezone, duracion_cita_minutos, disponibilidad")
    .eq("id", asesorId)
    .eq("is_active", true)
    .eq("is_actestan", true)
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
  
  // Usar timestamp Unix actual (universal, no depende de timezone)
  const ahoraUnix = Math.floor(Date.now() / 1000);
  
  const ocupados = (eventos || []).map(e => ({
    start: e.when?.start_time || 0,
    end: e.when?.end_time || 0,
  }));

  // Calcular offset de timezone para convertir hora local a UTC
  // Crear una fecha en la zona horaria del contacto y obtener el offset
  const fechaStr = fecha.toISOString().split("T")[0]; // YYYY-MM-DD
  
  for (const horario of horariosNormales) {
    const [inicioH, inicioM] = horario.inicio.split(":").map(Number);
    const [finH, finM] = horario.fin.split(":").map(Number);
    
    // Crear fecha/hora en la zona horaria del contacto usando string ISO
    // Formato: YYYY-MM-DDTHH:MM:SS en la zona horaria local
    let currentH = inicioH;
    let currentM = inicioM;
    
    while (currentH < finH || (currentH === finH && currentM < finM)) {
      // Crear string de fecha/hora local
      const localTimeStr = `${fechaStr}T${String(currentH).padStart(2, '0')}:${String(currentM).padStart(2, '0')}:00`;
      
      // Convertir a Date usando la zona horaria del contacto
      // Usamos un truco: crear la fecha como si fuera local y calcular el offset
      const localDate = new Date(localTimeStr);
      
      // Obtener el offset de la zona horaria del contacto
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      });
      
      // Calcular el offset comparando UTC con la hora en la zona horaria
      const utcDate = new Date(localTimeStr + "Z"); // Interpretar como UTC
      const tzParts = formatter.formatToParts(utcDate);
      const getTzPart = (type) => tzParts.find(p => p.type === type)?.value || '0';
      const tzHour = parseInt(getTzPart('hour'));
      
      // El offset es la diferencia entre la hora UTC y la hora en timezone
      // Para America/Bogota (UTC-5): si UTC es 14:00, Bogota es 09:00, offset = -5
      // Necesitamos: hora_local + offset_horas = hora_utc
      // Para Bogota: 09:00 + 5 = 14:00 UTC
      
      // Calcular offset en minutos (America/Bogota = -300 minutos = -5 horas)
      const testDate = new Date();
      const utcTime = testDate.toLocaleString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
      const tzTime = testDate.toLocaleString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
      const [utcH, utcM] = utcTime.split(':').map(Number);
      const [tzH, tzM] = tzTime.split(':').map(Number);
      const offsetMinutes = (utcH * 60 + utcM) - (tzH * 60 + tzM);
      
      // Crear la fecha UTC correcta: hora local + offset = hora UTC
      const slotStartUTC = new Date(localTimeStr + "Z");
      slotStartUTC.setMinutes(slotStartUTC.getMinutes() + offsetMinutes);
      
      const slotEndUTC = new Date(slotStartUTC.getTime() + duracionMinutos * 60000);
      const startUnix = Math.floor(slotStartUTC.getTime() / 1000);
      const endUnix = Math.floor(slotEndUTC.getTime() / 1000);

      const estaOcupado = ocupados.some(o => 
        (startUnix >= o.start && startUnix < o.end) || 
        (endUnix > o.start && endUnix <= o.end) ||
        (startUnix <= o.start && endUnix >= o.end)
      );

      // Comparar usando Unix timestamps (universal)
      if (!estaOcupado && startUnix > ahoraUnix) {
        const horaLocal = slotStartUTC.toLocaleTimeString("es-CO", { 
          timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: true 
        });
        slots.push({
          inicio: slotStartUTC.toISOString(),
          fin: slotEndUTC.toISOString(),
          hora: horaLocal,
          startUnix,
          endUnix,
        });
      }

      // Avanzar al siguiente slot
      currentM += duracionMinutos;
      while (currentM >= 60) {
        currentM -= 60;
        currentH++;
      }
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
  
  // Verificar si el contacto tiene asesor fijo (cita Realizada)
  const asesorFijo = await getAsesorFijoDeContacto(contactoId);
  
  // Obtener info de cita del contacto
  const citaInfo = await getCitaContacto(contactoId);
  
  // Si tiene asesor fijo, solo mostrar disponibilidad de ese asesor
  let asesores;
  if (asesorFijo) {
    console.log(`  🔒 Contacto tiene asesor fijo: ${asesorFijo.nombre} ${asesorFijo.apellido}`);
    asesores = [asesorFijo];
  } else {
    asesores = await getAsesoresByEmpresaId(empresaId);
  }
  
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
    asesor_fijo: asesorFijo ? {
      id: asesorFijo.id,
      nombre: `${asesorFijo.nombre} ${asesorFijo.apellido}`,
      email: asesorFijo.email,
      mensaje: "Este contacto tiene una cita Realizada. Solo se muestra disponibilidad de su asesor asignado."
    } : null,
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
  const { start, attendeeEmail, summary, description, contacto_id, empresa_id, "Virtual-presencial": modalidad, time_zone_contacto } = params;
  const timezone = time_zone_contacto || "America/Bogota";

  console.log(`  📅 Crear evento - Contacto: ${contacto_id}, Empresa: ${empresa_id}`);
  console.log(`  📅 Horario solicitado: ${start}`);

  // Obtener empresa_id del contacto si no viene en params
  let empresaIdFinal = empresa_id;
  if (!empresaIdFinal) {
    const { data: contacto } = await supabase
      .from("wp_contactos")
      .select("empresa_id")
      .eq("id", contacto_id)
      .single();
    empresaIdFinal = contacto?.empresa_id;
  }

  if (!empresaIdFinal) {
    return { error: "No se pudo determinar la empresa del contacto" };
  }

  // Seleccionar el mejor asesor: disponible en ese horario + menos citas
  // Si el contacto tiene cita "Realizada", se mantiene el mismo asesor
  console.log(`  🔍 Buscando mejor asesor disponible...`);
  const seleccion = await seleccionarMejorAsesor(empresaIdFinal, start, timezone, contacto_id);
  
  if (!seleccion) {
    return { error: "No hay asesores disponibles en ese horario" };
  }
  
  // Si hay error (asesor fijo no disponible)
  if (seleccion.error) {
    return { error: seleccion.error };
  }

  const asesor = seleccion.asesor;
  console.log(`  ✅ Asesor seleccionado: ${asesor.nombre} ${asesor.apellido} (${seleccion.citas_pendientes} citas pendientes)`);

  // Usar email del asesor como calendar_id
  const calendarId = asesor.email;

  // El start viene en UTC, parsearlo directamente
  // Nylas usará el timezone para mostrar la hora correcta al usuario
  const partes = start.split('T');
  const [year, month, day] = partes[0].split('-').map(Number);
  const [hour, minute, second] = (partes[1] || '00:00:00').split(':').map(n => parseInt(n) || 0);
  const startTime = Math.floor(Date.UTC(year, month - 1, day, hour, minute, second) / 1000);
  const fechaInicio = new Date(startTime * 1000);
  console.log(`  🕐 Start UTC: ${start} = ${fechaInicio.toISOString()}, se mostrará en ${timezone}`);
  const duracionMin = asesor.duracion_cita_minutos || 30;
  const endTime = startTime + (duracionMin * 60);

  // Generar link de Google Meet si es virtual
  const esVirtual = modalidad === "Virtual";
  
  // Extraer nombre del contacto del summary (formato: "🗓️ | Nombre | Empresa | ...")
  const nombreContacto = summary?.split('|')[1]?.trim() || "Invitado";
  
  // Calcular hora local para mostrar en descripción
  const horaLocal = fechaInicio.toLocaleString('es-CO', { 
    timeZone: timezone, 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
  
  // Agregar hora local a la descripción si no está incluida
  let descFinal = description || "";
  if (!descFinal.includes("Hora:")) {
    descFinal += `\n- Hora: ${horaLocal} hora Colombia (${timezone})`;
  }
  
  const eventData = {
    title: summary,
    description: descFinal,
    when: { 
      start_time: startTime, 
      end_time: endTime,
      start_timezone: timezone,
      end_timezone: timezone
    },
    participants: [
      { name: nombreContacto, email: attendeeEmail, status: "yes" },
      { name: `${asesor.nombre} ${asesor.apellido}`, email: asesor.email, status: "yes" }
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { reminderMinutes: 1440, reminderMethod: "email" },
        { reminderMinutes: 120, reminderMethod: "email" },
        { reminderMinutes: 30, reminderMethod: "popup" },
        { reminderMinutes: 10, reminderMethod: "popup" }
      ]
    }
  };

  // Agregar conferencing si es virtual
  if (esVirtual) {
    eventData.conferencing = {
      provider: "Google Meet",
      autocreate: {}
    };
  } else {
    eventData.location = "Presencial";
  }

  console.log(`  📤 Creando evento en Nylas...`);
  
  const evento = await createEvent(asesor.grant_id, calendarId, eventData);

  console.log(`  ✅ Evento creado: ${evento.id}`);

  // Obtener link de conferencia si existe
  const meetLink = evento.conferencing?.details?.url || null;

  // Si es virtual y tiene meet link, invitar al Notetaker para grabar
  let notetakerId = null;
  if (esVirtual && meetLink) {
    console.log(`  🎥 Invitando Notetaker para grabar la reunión...`);
    try {
      const notetaker = await inviteNotetaker(meetLink);
      notetakerId = notetaker.id;
      console.log(`  ✅ Notetaker invitado: ${notetakerId}`);
    } catch (e) {
      console.log(`  ⚠️ No se pudo invitar al Notetaker: ${e.message}`);
    }
  }

  // Guardar cita en Supabase
  await guardarCitaEnSupabase({
    contactoId: contacto_id,
    empresaId: empresaIdFinal,
    asesorId: asesor.id,
    eventId: evento.id,
    fechaHora: fechaInicio.toISOString(),
    duracion: duracionMin,
    titulo: summary,
    ubicacion: meetLink || (esVirtual ? "Virtual" : "Presencial"),
    modalidad: modalidad || "Virtual",
    estado: "pendiente"
  });

  // Actualizar asesor en wp_contactos
  await actualizarAsesorEnContacto(contacto_id, asesor.id);

  const inicioLocal = fechaInicio.toLocaleString("es-CO", { timeZone: timezone });

  return {
    success: true,
    event_id: evento.id,
    contacto_id,
    asesor_id: asesor.id,
    asesor: `${asesor.nombre} ${asesor.apellido}`,
    asesor_email: asesor.email,
    asesor_citas_pendientes: seleccion.citas_pendientes,
    asesores_disponibles: seleccion.total_disponibles,
    participante: attendeeEmail,
    inicio: inicioLocal,
    duracion_minutos: duracionMin,
    modalidad: modalidad || "Virtual",
    summary,
    meet_link: meetLink,
    notetaker_id: notetakerId,
    grabacion_activada: !!notetakerId,
  };
}

// ============================================
// TOOL 3: Reagendar_Evento
// ============================================
async function reagendarEvento(params) {
  const { event_id, start, attendeeEmail, summary, description, contacto_id, empresa_id, "Virtual-presencial": modalidad, time_zone_contacto, Duracion_minutos } = params;
  const timezone = time_zone_contacto || "America/Bogota";

  console.log(`  📅 Reagendar evento: ${event_id}`);
  console.log(`  📅 Nuevo horario: ${start}`);

  // Buscar la cita en wp_citas para obtener info actual
  const { data: cita, error: citaError } = await supabase
    .from("wp_citas")
    .select("team_humano_id, empresa_id, event_id")
    .eq("event_id", event_id)
    .single();

  if (citaError || !cita) {
    console.log(`  ❌ Cita no encontrada con event_id: ${event_id}`);
    return { error: "No se encontró la cita con ese event_id" };
  }

  const empresaIdFinal = empresa_id || cita.empresa_id;

  // Obtener el asesor actual de la cita
  const { data: asesorActual } = await supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id, duracion_cita_minutos")
    .eq("id", cita.team_humano_id)
    .single();

  console.log(`  👤 Asesor actual: ${asesorActual?.nombre} ${asesorActual?.apellido}`);

  // Seleccionar el mejor asesor disponible para el nuevo horario
  // Si el contacto tiene cita "Realizada", se mantiene el mismo asesor
  console.log(`  🔍 Verificando disponibilidad para el nuevo horario...`);
  const seleccion = await seleccionarMejorAsesor(empresaIdFinal, start, timezone, contacto_id);
  
  if (!seleccion) {
    return { error: "No hay asesores disponibles en ese horario" };
  }
  
  // Si hay error (asesor fijo no disponible)
  if (seleccion.error) {
    return { error: seleccion.error };
  }

  const asesorNuevo = seleccion.asesor;
  const cambioAsesor = !seleccion.es_asesor_fijo && asesorActual?.id !== asesorNuevo.id;
  
  if (cambioAsesor) {
    console.log(`  � Cambio de asesor: ${asesorActual?.nombre} → ${asesorNuevo.nombre} ${asesorNuevo.apellido}`);
  } else {
    console.log(`  ✅ Mismo asesor disponible: ${asesorNuevo.nombre} ${asesorNuevo.apellido}`);
  }

  // Si hay cambio de asesor, eliminar evento anterior y crear nuevo
  // Si es el mismo asesor, solo actualizar
  const calendarId = asesorNuevo.email;
  
  // El start viene en UTC, parsearlo directamente
  // Nylas usará el timezone para mostrar la hora correcta al usuario
  const partes = start.split('T');
  const [year, month, day] = partes[0].split('-').map(Number);
  const [hour, minute, second] = (partes[1] || '00:00:00').split(':').map(n => parseInt(n) || 0);
  const startTime = Math.floor(Date.UTC(year, month - 1, day, hour, minute, second) / 1000);
  const fechaInicio = new Date(startTime * 1000);
  console.log(`  🕐 Start UTC: ${start} = ${fechaInicio.toISOString()}, se mostrará en ${timezone}`);
  const duracionMin = Duracion_minutos ? parseInt(Duracion_minutos) : (asesorNuevo.duracion_cita_minutos || 30);
  const endTime = startTime + (duracionMin * 60);

  // Extraer nombre del contacto del summary (formato: "🗓️ | Nombre | Empresa | ...")
  const nombreContacto = summary?.split('|')[1]?.trim() || "Invitado";
  
  // Calcular hora local para mostrar en descripción
  const horaLocal = fechaInicio.toLocaleString('es-CO', { 
    timeZone: timezone, 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
  
  // Agregar hora local a la descripción si no está incluida
  let descFinal = description || "";
  if (!descFinal.includes("Hora:")) {
    descFinal += `\n- Hora: ${horaLocal} hora Colombia (${timezone})`;
  }

  let evento;
  let nuevoEventId = event_id;

  if (cambioAsesor && asesorActual?.grant_id) {
    // Marcar la cita anterior como "reagendada" en Supabase (NO borrar)
    console.log(`  📝 Marcando cita anterior como reagendada...`);
    await actualizarEstadoCita(event_id, "reagendada");
    
    // Eliminar evento del calendario del asesor anterior (solo en Nylas, no en BD)
    console.log(`  🗑️ Eliminando evento del calendario anterior...`);
    try {
      await deleteEvent(asesorActual.grant_id, asesorActual.email, event_id);
    } catch (e) {
      console.log(`  ⚠️ No se pudo eliminar evento del calendario: ${e.message}`);
    }

    // Crear nuevo evento con el nuevo asesor
    console.log(`  📤 Creando evento con nuevo asesor...`);
    const eventData = {
      title: summary || "Cita reagendada",
      description: descFinal,
      when: { 
        start_time: startTime, 
        end_time: endTime,
        start_timezone: timezone,
        end_timezone: timezone
      },
      participants: [
        { name: nombreContacto, email: attendeeEmail, status: "yes" },
        { name: `${asesorNuevo.nombre} ${asesorNuevo.apellido}`, email: asesorNuevo.email, status: "yes" }
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { reminderMinutes: 1440, reminderMethod: "email" },
          { reminderMinutes: 120, reminderMethod: "email" },
          { reminderMinutes: 30, reminderMethod: "popup" },
          { reminderMinutes: 10, reminderMethod: "popup" }
        ]
      }
    };

    if (modalidad === "Virtual") {
      eventData.conferencing = { provider: "Google Meet", autocreate: {} };
    } else {
      eventData.location = "Presencial";
    }

    evento = await createEvent(asesorNuevo.grant_id, calendarId, eventData);
    nuevoEventId = evento.id;
  } else {
    // Mismo asesor, solo actualizar
    const updateData = {
      when: { 
        start_time: startTime, 
        end_time: endTime,
        start_timezone: timezone,
        end_timezone: timezone
      },
      reminders: {
        useDefault: false,
        overrides: [
          { reminderMinutes: 1440, reminderMethod: "email" },
          { reminderMinutes: 120, reminderMethod: "email" },
          { reminderMinutes: 30, reminderMethod: "popup" },
          { reminderMinutes: 10, reminderMethod: "popup" }
        ]
      }
    };
    
    if (summary) updateData.title = summary;
    if (descFinal) updateData.description = descFinal;
    if (attendeeEmail) {
      updateData.participants = [
        { name: nombreContacto, email: attendeeEmail, status: "yes" },
        { name: `${asesorNuevo.nombre} ${asesorNuevo.apellido}`, email: asesorNuevo.email, status: "yes" }
      ];
    }
    
    if (modalidad === "Virtual") {
      updateData.conferencing = { provider: "Google Meet", autocreate: {} };
    } else if (modalidad === "Presencial") {
      updateData.location = "Presencial";
    }

    console.log(`  📤 Actualizando evento en Nylas...`);
    console.log(`  📤 startTime (Unix): ${startTime} = ${new Date(startTime * 1000).toISOString()}`);
    evento = await updateEvent(asesorNuevo.grant_id, calendarId, event_id, updateData);
  }

  console.log(`  ✅ Evento ${cambioAsesor ? 'creado' : 'actualizado'}: ${evento.id}`);

  const meetLink = evento.conferencing?.details?.url || null;

  // Si es virtual y tiene meet link, invitar al Notetaker para grabar
  let notetakerId = null;
  if (modalidad === "Virtual" && meetLink) {
    console.log(`  🎥 Invitando Notetaker para grabar la reunión reagendada...`);
    try {
      const notetaker = await inviteNotetaker(meetLink);
      notetakerId = notetaker.id;
      console.log(`  ✅ Notetaker invitado: ${notetakerId}`);
    } catch (e) {
      console.log(`  ⚠️ No se pudo invitar al Notetaker: ${e.message}`);
    }
  }

  // Guardar/actualizar cita en Supabase
  // Si cambió de asesor: crear nueva cita con estado "pendiente" (la anterior ya está marcada como "reagendada")
  // Si mismo asesor: actualizar la cita existente con estado "pendiente"
  await guardarCitaEnSupabase({
    contactoId: contacto_id || cita.contacto_id,
    empresaId: empresaIdFinal,
    asesorId: asesorNuevo.id,
    eventId: evento.id,
    fechaHora: fechaInicio.toISOString(),
    duracion: duracionMin,
    titulo: summary || "Cita reagendada",
    ubicacion: meetLink || (modalidad === "Virtual" ? "Virtual" : "Presencial"),
    modalidad: modalidad || "Virtual",
    estado: "pendiente"
  });

  // Si hubo cambio de asesor, actualizar en wp_contactos
  if (cambioAsesor) {
    await actualizarAsesorEnContacto(contacto_id || cita.contacto_id, asesorNuevo.id);
  }

  const inicioLocal = fechaInicio.toLocaleString("es-CO", { timeZone: timezone });

  return {
    success: true,
    event_id: evento.id,
    event_id_anterior: cambioAsesor ? event_id : null,
    contacto_id: contacto_id || cita.contacto_id,
    asesor_anterior: cambioAsesor ? `${asesorActual?.nombre} ${asesorActual?.apellido}` : null,
    asesor_id: asesorNuevo.id,
    asesor: `${asesorNuevo.nombre} ${asesorNuevo.apellido}`,
    asesor_email: asesorNuevo.email,
    asesor_citas_pendientes: seleccion.citas_pendientes,
    cambio_asesor: cambioAsesor,
    nuevo_inicio: inicioLocal,
    duracion_minutos: duracionMin,
    modalidad: modalidad || "Virtual",
    meet_link: meetLink,
    notetaker_id: notetakerId,
    grabacion_activada: !!notetakerId,
    mensaje: cambioAsesor 
      ? `Evento reagendado con nuevo asesor: ${asesorNuevo.nombre} ${asesorNuevo.apellido}` 
      : "Evento reagendado correctamente",
  };
}

// ============================================
// TOOL 4: Eliminar_Evento
// ============================================
async function eliminarEvento(params) {
  const { event_id, contacto_id } = params;
  
  console.log(`  🗑️ Eliminar evento: ${event_id}`);

  // Buscar la cita en wp_citas para obtener el asesor
  const { data: cita, error: citaError } = await supabase
    .from("wp_citas")
    .select("team_humano_id, empresa_id, contacto_id")
    .eq("event_id", event_id)
    .single();

  if (citaError || !cita) {
    console.log(`  ❌ Cita no encontrada con event_id: ${event_id}`);
    return { error: "No se encontró la cita con ese event_id" };
  }

  // Obtener el asesor de la cita
  const { data: asesor, error: asesorError } = await supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id")
    .eq("id", cita.team_humano_id)
    .single();

  if (asesorError || !asesor) {
    return { error: "No se encontró el asesor de la cita" };
  }

  if (!asesor.grant_id || asesor.grant_id === "Solicitud enviada") {
    return { error: "El asesor no tiene calendario configurado" };
  }

  console.log(`  👤 Asesor: ${asesor.nombre} ${asesor.apellido} (${asesor.email})`);

  // Usar email del asesor como calendar_id
  const calendarId = asesor.email;

  console.log(`  📤 Eliminando evento en Nylas...`);
  
  let eliminadoEnNylas = false;
  try {
    await deleteEvent(asesor.grant_id, calendarId, event_id);
    console.log(`  ✅ Evento eliminado de Nylas`);
    eliminadoEnNylas = true;
  } catch (nylasError) {
    console.log(`  ⚠️ Error al eliminar en Nylas: ${nylasError.message}`);
    // Continuar con la cancelación en Supabase aunque falle en Nylas
    // El evento puede no existir, haber sido creado con otra API, o ya estar eliminado
    console.log(`  ℹ️ Continuando con cancelación en Supabase...`);
  }

  // Actualizar estado de la cita en Supabase a "cancelada"
  await actualizarEstadoCita(event_id, "cancelada");

  return {
    success: true,
    event_id,
    contacto_id: contacto_id || cita.contacto_id,
    asesor: `${asesor.nombre} ${asesor.apellido}`,
    asesor_email: asesor.email,
    eliminado_en_nylas: eliminadoEnNylas,
    mensaje: eliminadoEnNylas 
      ? "Evento eliminado correctamente" 
      : "Cita cancelada en Supabase (el evento ya no existía en el calendario)",
  };
}

// ============================================
// TOOL 5: Obtener Grabaciones de Reuniones
// ============================================
async function obtenerGrabaciones(params) {
  let { contacto_id, empresa_id, grant_id, grant_ids, notetaker_id } = params;
  
  console.log(`  🎥 Obtener grabaciones`);
  
  // Si grant_ids viene como string separado por comas, convertir a array
  if (grant_ids && typeof grant_ids === 'string') {
    grant_ids = grant_ids.split(',').map(g => g.trim()).filter(g => g.length > 0);
    console.log(`  📋 Convertido string a array: ${grant_ids.length} grants`);
  }
  
  // Si grant_id viene como string con comas, tratarlo como grant_ids
  if (grant_id && typeof grant_id === 'string' && grant_id.includes(',')) {
    grant_ids = grant_id.split(',').map(g => g.trim()).filter(g => g.length > 0);
    grant_id = null;
    console.log(`  📋 grant_id contenía múltiples valores, convertido a array: ${grant_ids.length} grants`);
  }
  
  // Si no viene nada, obtener TODOS los notetakers directamente desde Nylas
  if (!notetaker_id && !grant_id && (!grant_ids || grant_ids.length === 0) && !contacto_id) {
    console.log(`  📋 Sin parámetros, obteniendo todos los notetakers desde Nylas...`);
    
    try {
      const allNotetakers = await listAllNotetakers();
      
      // Filtrar solo los que tienen grabaciones disponibles
      const notetakersDisponibles = allNotetakers.filter(n => n.state === 'available');
      
      console.log(`  📹 Encontrados ${notetakersDisponibles.length} notetakers con grabaciones de ${allNotetakers.length} total`);
      
      // Obtener media de cada notetaker en paralelo
      const grabaciones = await Promise.all(
        notetakersDisponibles.map(async (n) => {
          let media = null;
          try {
            media = await getNotetakerMedia(n.id);
          } catch (e) {
            console.log(`  ⚠️ No se pudo obtener media de ${n.id}: ${e.message}`);
          }
          
          return {
            notetaker_id: n.id,
            grant_id: n.grant_id || null,
            meeting_link: n.meeting_link,
            meeting_provider: n.meeting_provider,
            estado: n.state,
            join_time: n.join_time ? new Date(n.join_time * 1000).toISOString() : null,
            media: media ? {
              recording_url: media.recording || null,
              recording_duration: media.recording_duration || null,
              transcript_url: media.transcript || null,
              summary_url: media.summary || null,
              action_items_url: media.action_items || null,
            } : null
          };
        })
      );
      
      return {
        success: true,
        total_notetakers: allNotetakers.length,
        total_con_grabacion: grabaciones.length,
        grabaciones,
        mensaje: "URLs válidas por 60 minutos. Archivos disponibles por 14 días."
      };
    } catch (e) {
      return { error: `Error obteniendo notetakers: ${e.message}` };
    }
  }
  
  // Si viene notetaker_id específico, obtener solo ese
  if (notetaker_id) {
    console.log(`  📹 Buscando notetaker específico: ${notetaker_id}`);
    try {
      const notetaker = await getNotetaker(notetaker_id);
      const media = await getNotetakerMedia(notetaker_id);
      
      return {
        success: true,
        notetaker_id,
        estado: notetaker.state,
        meeting_link: notetaker.meeting_link,
        meeting_provider: notetaker.meeting_provider,
        media: {
          recording_url: media?.recording || null,
          recording_duration: media?.recording_duration || null,
          transcript_url: media?.transcript || null,
          summary_url: media?.summary || null,
          action_items_url: media?.action_items || null,
        },
        mensaje: "URLs válidas por 60 minutos"
      };
    } catch (e) {
      return { error: `No se pudo obtener el notetaker: ${e.message}` };
    }
  }
  
  // Función auxiliar para obtener grabaciones de un grant
  async function obtenerGrabacionesDeGrant(grantId) {
    const notetakers = await listNotetakers(grantId);
    const notetakersDisponibles = notetakers.filter(n => n.state === 'available');
    
    return Promise.all(
      notetakersDisponibles.map(async (n) => {
        let media = null;
        try {
          media = await getNotetakerMedia(n.id);
        } catch (e) {
          console.log(`  ⚠️ No se pudo obtener media de ${n.id}: ${e.message}`);
        }
        
        return {
          grant_id: grantId,
          notetaker_id: n.id,
          meeting_link: n.meeting_link,
          meeting_provider: n.meeting_provider,
          estado: n.state,
          join_time: n.join_time ? new Date(n.join_time * 1000).toISOString() : null,
          media: media ? {
            recording_url: media.recording || null,
            recording_duration: media.recording_duration || null,
            transcript_url: media.transcript || null,
            summary_url: media.summary || null,
            action_items_url: media.action_items || null,
          } : null
        };
      })
    );
  }
  
  // Si viene grant_ids (array), procesar todos en paralelo
  if (grant_ids && Array.isArray(grant_ids) && grant_ids.length > 0) {
    console.log(`  📋 Procesando ${grant_ids.length} grants en paralelo...`);
    try {
      const resultadosPorGrant = await Promise.all(
        grant_ids.map(async (gId) => {
          try {
            const grabaciones = await obtenerGrabacionesDeGrant(gId);
            return { grant_id: gId, success: true, grabaciones };
          } catch (e) {
            console.log(`  ⚠️ Error en grant ${gId}: ${e.message}`);
            return { grant_id: gId, success: false, error: e.message, grabaciones: [] };
          }
        })
      );
      
      // Aplanar todas las grabaciones
      const todasLasGrabaciones = resultadosPorGrant.flatMap(r => r.grabaciones);
      
      return {
        success: true,
        grants_procesados: grant_ids.length,
        total_grabaciones: todasLasGrabaciones.length,
        grabaciones: todasLasGrabaciones,
        detalle_por_grant: resultadosPorGrant.map(r => ({
          grant_id: r.grant_id,
          success: r.success,
          total: r.grabaciones.length,
          error: r.error || null
        })),
        mensaje: "URLs válidas por 60 minutos. Archivos disponibles por 14 días."
      };
    } catch (e) {
      return { error: `Error procesando grants: ${e.message}` };
    }
  }
  
  // Si viene grant_id individual
  if (grant_id) {
    console.log(`  📋 Listando notetakers del grant: ${grant_id}`);
    try {
      const grabaciones = await obtenerGrabacionesDeGrant(grant_id);
      
      return {
        success: true,
        grant_id,
        total: grabaciones.length,
        grabaciones,
        mensaje: "URLs válidas por 60 minutos. Archivos disponibles por 14 días."
      };
    } catch (e) {
      return { error: `No se pudo listar notetakers: ${e.message}` };
    }
  }
  
  // Si viene contacto_id, buscar citas del contacto y sus grabaciones
  if (contacto_id) {
    console.log(`  👤 Buscando grabaciones del contacto: ${contacto_id}`);
    
    // Obtener citas del contacto con estado "Realizada"
    const { data: citas, error: citasError } = await supabase
      .from("wp_citas")
      .select("id, event_id, team_humano_id, fecha_hora, titulo, estado, ubicacion")
      .eq("contacto_id", contacto_id)
      .eq("estado", "Realizada")
      .order("fecha_hora", { ascending: false });
    
    if (citasError) {
      return { error: `Error buscando citas: ${citasError.message}` };
    }
    
    if (!citas || citas.length === 0) {
      return { 
        success: true, 
        contacto_id,
        total: 0,
        grabaciones: [],
        mensaje: "No hay citas realizadas para este contacto"
      };
    }
    
    // Para cada cita, obtener info del asesor
    const grabaciones = [];
    for (const cita of citas) {
      const { data: asesor } = await supabase
        .from("wp_team_humano")
        .select("id, nombre, apellido, email, grant_id")
        .eq("id", cita.team_humano_id)
        .single();
      
      grabaciones.push({
        cita_id: cita.id,
        event_id: cita.event_id,
        fecha: cita.fecha_hora,
        titulo: cita.titulo,
        asesor: asesor ? `${asesor.nombre} ${asesor.apellido}` : null,
        grant_id: asesor?.grant_id,
        meet_link: cita.ubicacion,
      });
    }
    
    return {
      success: true,
      contacto_id,
      total: grabaciones.length,
      grabaciones,
      mensaje: "Para obtener URLs de grabación, usa el grant_id del asesor para listar notetakers"
    };
  }
  
  return { error: "Se requiere contacto_id, grant_id o notetaker_id" };
}

// ============================================
// TOOL 6: Obtener Grabación Específica con Datos Completos
// ============================================
async function obtenerGrabacionCompleta(params) {
  const { notetaker_id, grant_id, event_id } = params;
  
  console.log(`  🎥 Obtener grabación completa`);
  console.log(`  📹 Notetaker: ${notetaker_id}`);
  console.log(`  🔑 Grant: ${grant_id}`);
  console.log(`  📅 Event: ${event_id}`);
  
  if (!notetaker_id && !grant_id && !event_id) {
    return { error: "Se requiere notetaker_id, grant_id o event_id" };
  }
  
  // 1. Obtener datos del notetaker y media desde Nylas
  let notetaker = null;
  let media = null;
  
  if (notetaker_id) {
    try {
      notetaker = await getNotetaker(notetaker_id);
      console.log(`  ✅ Notetaker encontrado: ${notetaker.state}`);
    } catch (e) {
      console.log(`  ⚠️ No se pudo obtener notetaker: ${e.message}`);
    }
    
    try {
      media = await getNotetakerMedia(notetaker_id);
      console.log(`  ✅ Media obtenida`);
    } catch (e) {
      console.log(`  ⚠️ No se pudo obtener media: ${e.message}`);
    }
  }
  
  // 2. Buscar asesor por grant_id en Supabase
  let asesor = null;
  if (grant_id) {
    const { data: asesorData } = await supabase
      .from("wp_team_humano")
      .select("id, nombre, apellido, email, telefono, cargo, foto_url, grant_id")
      .eq("grant_id", grant_id)
      .single();
    
    if (asesorData) {
      asesor = {
        id: asesorData.id,
        nombre: asesorData.nombre,
        apellido: asesorData.apellido,
        nombre_completo: `${asesorData.nombre} ${asesorData.apellido}`,
        email: asesorData.email,
        telefono: asesorData.telefono,
        cargo: asesorData.cargo,
        foto_url: asesorData.foto_url
      };
      console.log(`  ✅ Asesor encontrado: ${asesor.nombre_completo}`);
    }
  }
  
  // 3. Buscar cita por event_id en Supabase
  let cita = null;
  let contacto = null;
  
  if (event_id) {
    // Limpiar event_id (puede venir con sufijo de fecha)
    const eventIdBase = event_id.split('_')[0];
    
    const { data: citaData } = await supabase
      .from("wp_citas")
      .select("id, contacto_id, empresa_id, fecha_hora, duracion, titulo, ubicacion, estado, timezone_cliente, descripcion, metadata")
      .or(`event_id.eq.${event_id},event_id.eq.${eventIdBase}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    
    if (citaData) {
      cita = {
        id: citaData.id,
        contacto_id: citaData.contacto_id,
        empresa_id: citaData.empresa_id,
        fecha_hora: citaData.fecha_hora,
        duracion: citaData.duracion,
        titulo: citaData.titulo,
        ubicacion: citaData.ubicacion,
        estado: citaData.estado,
        timezone: citaData.timezone_cliente,
        descripcion: citaData.descripcion,
        metadata: citaData.metadata
      };
      console.log(`  ✅ Cita encontrada: ${cita.titulo}`);
      
      // 4. Buscar contacto
      if (citaData.contacto_id) {
        const { data: contactoData } = await supabase
          .from("wp_contactos")
          .select("id, nombre, apellido, email, telefono, origen, metadata")
          .eq("id", citaData.contacto_id)
          .single();
        
        if (contactoData) {
          contacto = {
            id: contactoData.id,
            nombre: contactoData.nombre,
            apellido: contactoData.apellido,
            nombre_completo: `${contactoData.nombre} ${contactoData.apellido}`,
            email: contactoData.email,
            telefono: contactoData.telefono,
            origen: contactoData.origen,
            metadata: contactoData.metadata
          };
          console.log(`  ✅ Contacto encontrado: ${contacto.nombre_completo}`);
        }
      }
    }
  }
  
  return {
    success: true,
    notetaker_id,
    grant_id,
    event_id,
    
    // Datos del notetaker
    notetaker: notetaker ? {
      id: notetaker.id,
      state: notetaker.state,
      meeting_link: notetaker.meetingLink,
      meeting_provider: notetaker.meetingProvider,
      join_time: notetaker.joinTime ? new Date(notetaker.joinTime * 1000).toISOString() : null,
    } : null,
    
    // URLs de media (válidas por 60 minutos)
    media: media ? {
      recording_url: media.recording || null,
      recording_duration: media.recordingDuration || null,
      transcript_url: media.transcript || null,
      summary_url: media.summary || null,
      action_items_url: media.actionItems || null,
    } : null,
    
    // Datos del asesor
    asesor,
    
    // Datos de la cita
    cita,
    
    // Datos del contacto
    contacto,
    
    mensaje: "URLs de media válidas por 60 minutos. Archivos disponibles por 14 días."
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
        console.log(`[${requestId}] Ejecutando: eliminarEvento`);
        result = await eliminarEvento(body);
        break;
      
      case "/grabaciones":
        console.log(`[${requestId}] Ejecutando: obtenerGrabaciones`);
        result = await obtenerGrabaciones(body);
        break;
      
      case "/grabacion":
        console.log(`[${requestId}] Ejecutando: obtenerGrabacionCompleta`);
        result = await obtenerGrabacionCompleta(body);
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
  console.log(`   POST /grabaciones`);
  console.log(`   POST /grabacion`);
});
