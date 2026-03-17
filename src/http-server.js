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
import { getCalendars, getEvents, getFreeBusy, createEvent, updateEvent, deleteEvent } from "./lib/nylas.js";

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

      // Comparar usando Unix timestamps (universal)
      if (!estaOcupado && startUnix > ahoraUnix) {
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

  const fechaInicio = new Date(start);
  const startTime = Math.floor(fechaInicio.getTime() / 1000);
  const duracionMin = asesor.duracion_cita_minutos || 30;
  const endTime = startTime + (duracionMin * 60);

  // Generar link de Google Meet si es virtual
  const esVirtual = modalidad === "Virtual";
  
  const eventData = {
    title: summary,
    description: description || "",
    when: { start_time: startTime, end_time: endTime },
    participants: [{ email: attendeeEmail }],
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
  const fechaInicio = new Date(start);
  const startTime = Math.floor(fechaInicio.getTime() / 1000);
  const duracionMin = Duracion_minutos ? parseInt(Duracion_minutos) : (asesorNuevo.duracion_cita_minutos || 30);
  const endTime = startTime + (duracionMin * 60);

  let evento;
  let nuevoEventId = event_id;

  if (cambioAsesor && asesorActual?.grant_id) {
    // Eliminar evento del asesor anterior
    console.log(`  🗑️ Eliminando evento del asesor anterior...`);
    try {
      await deleteEvent(asesorActual.grant_id, asesorActual.email, event_id);
    } catch (e) {
      console.log(`  ⚠️ No se pudo eliminar evento anterior: ${e.message}`);
    }

    // Crear nuevo evento con el nuevo asesor
    console.log(`  📤 Creando evento con nuevo asesor...`);
    const eventData = {
      title: summary || "Cita reagendada",
      description: description || "",
      when: { start_time: startTime, end_time: endTime },
      participants: [{ email: attendeeEmail }],
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
      when: { start_time: startTime, end_time: endTime },
    };
    
    if (summary) updateData.title = summary;
    if (description) updateData.description = description;
    if (attendeeEmail) updateData.participants = [{ email: attendeeEmail }];
    
    if (modalidad === "Virtual") {
      updateData.conferencing = { provider: "Google Meet", autocreate: {} };
    } else if (modalidad === "Presencial") {
      updateData.location = "Presencial";
    }

    console.log(`  📤 Actualizando evento en Nylas...`);
    evento = await updateEvent(asesorNuevo.grant_id, calendarId, event_id, updateData);
  }

  console.log(`  ✅ Evento ${cambioAsesor ? 'creado' : 'actualizado'}: ${evento.id}`);

  const meetLink = evento.conferencing?.details?.url || null;

  // Actualizar cita en Supabase
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
    estado: "reagendada"
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
  
  await deleteEvent(asesor.grant_id, calendarId, event_id);

  console.log(`  ✅ Evento eliminado`);

  // Actualizar estado de la cita en Supabase a "cancelada"
  await actualizarEstadoCita(event_id, "cancelada");

  return {
    success: true,
    event_id,
    contacto_id: contacto_id || cita.contacto_id,
    asesor: `${asesor.nombre} ${asesor.apellido}`,
    asesor_email: asesor.email,
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
        console.log(`[${requestId}] Ejecutando: eliminarEvento`);
        result = await eliminarEvento(body);
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
