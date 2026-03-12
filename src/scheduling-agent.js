/**
 * Agente de Agendamiento - Vercel AI SDK + Nylas + Supabase
 * 
 * Tools:
 * 1. verificarDisponibilidad - Consulta slots disponibles
 * 2. crearEvento - Crea citas en calendario
 * 3. reagendarEvento - Modifica eventos existentes
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { supabase } from "./lib/supabase.js";
import { getCalendars, getEvents, createEvent, updateEvent } from "./lib/nylas.js";
import "dotenv/config";

// Configurar OpenRouter
const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  compatibility: "compatible",
});

/**
 * Obtiene asesores activos de una empresa desde Supabase
 */
async function getAsesoresFromSupabase(empresaId) {
  const { data, error } = await supabase
    .from("wp_team_humano")
    .select("id, nombre, apellido, email, grant_id, timezone, duracion_cita_minutos, disponibilidad")
    .eq("empresa_id", empresaId)
    .eq("is_active", true)
    .eq("acepta_citas", true)
    .not("grant_id", "is", null);

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data || [];
}

/**
 * Calcula slots disponibles basado en eventos existentes y horarios del asesor
 */
function calcularSlotsDisponibles(eventos, disponibilidad, fecha, timezone, duracionMinutos) {
  const slots = [];
  const diaSemana = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const dia = diaSemana[new Date(fecha).getDay()];
  
  const horariosNormales = disponibilidad?.horarios_normales?.[dia] || [];
  if (horariosNormales.length === 0) return slots;

  // Convertir eventos a rangos ocupados
  const ocupados = eventos.map(e => ({
    start: e.when?.start_time || 0,
    end: e.when?.end_time || 0,
  }));

  // Para cada bloque de horario disponible
  for (const horario of horariosNormales) {
    const [inicioH, inicioM] = horario.inicio.split(":").map(Number);
    const [finH, finM] = horario.fin.split(":").map(Number);
    
    const fechaBase = new Date(fecha);
    let slotStart = new Date(fechaBase);
    slotStart.setHours(inicioH, inicioM, 0, 0);
    
    const finBloque = new Date(fechaBase);
    finBloque.setHours(finH, finM, 0, 0);

    // Generar slots de duracionMinutos
    while (slotStart.getTime() + duracionMinutos * 60000 <= finBloque.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + duracionMinutos * 60000);
      const startUnix = Math.floor(slotStart.getTime() / 1000);
      const endUnix = Math.floor(slotEnd.getTime() / 1000);

      // Verificar si el slot está ocupado
      const estaOcupado = ocupados.some(o => 
        (startUnix >= o.start && startUnix < o.end) || 
        (endUnix > o.start && endUnix <= o.end) ||
        (startUnix <= o.start && endUnix >= o.end)
      );

      if (!estaOcupado) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          startUnix,
          endUnix,
        });
      }

      // Siguiente slot
      slotStart = new Date(slotStart.getTime() + duracionMinutos * 60000);
    }
  }

  return slots;
}

/**
 * Ejecuta el agente de agendamiento
 */
export async function ejecutarAgenteAgendamiento(mensaje, contexto = {}) {
  const { empresaId, contactoId, timezoneContacto = "America/Bogota" } = contexto;
  const startTime = Date.now();

  console.log(`\n🤖 Agente de Agendamiento`);
  console.log(`📝 Mensaje: "${mensaje}"`);
  console.log(`🏢 Empresa ID: ${empresaId}`);
  console.log(`👤 Contacto ID: ${contactoId}`);
  console.log(`🌍 Timezone: ${timezoneContacto}`);
  console.log("-".repeat(50));

  let result;
  try {
    result = await generateText({
      model: openrouter("openai/gpt-3.5-turbo"),
    
    system: `Eres un asistente de agendamiento. Tu trabajo es ayudar a agendar, verificar disponibilidad y reagendar citas.

CONTEXTO:
- Empresa ID: ${empresaId}
- Contacto ID: ${contactoId}
- Timezone del contacto: ${timezoneContacto}

INSTRUCCIONES:
1. Cuando te pidan verificar disponibilidad, usa la herramienta "verificarDisponibilidad"
2. Cuando te pidan crear una cita, primero verifica disponibilidad y luego usa "crearEvento"
3. Cuando te pidan reagendar, usa "reagendarEvento"
4. Siempre responde en español y de forma concisa
5. Muestra los horarios en formato legible (ej: "Lunes 10:00 AM")`,

    tools: {
      verificarDisponibilidad: {
        description: "Verifica la disponibilidad de los asesores para una fecha específica. Retorna los slots disponibles.",
        parameters: z.object({
          fecha: z.string().describe("Fecha en formato YYYY-MM-DD"),
        }),
        execute: async ({ fecha, asesorId }) => {
          console.log(`  📅 [verificarDisponibilidad] Fecha: ${fecha}, Asesor: ${asesorId || "todos"}`);
          
          try {
            // Obtener asesores de Supabase
            let asesores = await getAsesoresFromSupabase(empresaId);
            if (asesorId) {
              asesores = asesores.filter(a => a.id === asesorId);
            }

            if (asesores.length === 0) {
              return { disponibilidad: [], mensaje: "No hay asesores disponibles con calendario conectado" };
            }

            const resultados = [];

            for (const asesor of asesores) {
              if (!asesor.grant_id) continue;

              try {
                // Obtener calendarios del asesor
                const calendarios = await getCalendars(asesor.grant_id);
                const calPrimario = calendarios.find(c => c.is_primary) || calendarios[0];
                
                if (!calPrimario) continue;

                // Calcular rango de tiempo para la fecha
                const fechaInicio = new Date(fecha);
                fechaInicio.setHours(0, 0, 0, 0);
                const fechaFin = new Date(fecha);
                fechaFin.setHours(23, 59, 59, 999);

                // Obtener eventos existentes
                const eventos = await getEvents(
                  asesor.grant_id,
                  calPrimario.id,
                  Math.floor(fechaInicio.getTime() / 1000),
                  Math.floor(fechaFin.getTime() / 1000)
                );

                // Calcular slots disponibles
                const slots = calcularSlotsDisponibles(
                  eventos,
                  asesor.disponibilidad,
                  fecha,
                  asesor.timezone,
                  asesor.duracion_cita_minutos || 30
                );

                resultados.push({
                  asesorId: asesor.id,
                  nombre: `${asesor.nombre} ${asesor.apellido || ""}`.trim(),
                  email: asesor.email,
                  duracionCita: asesor.duracion_cita_minutos || 30,
                  slotsDisponibles: slots.slice(0, 10), // Limitar a 10 slots
                  totalSlots: slots.length,
                });
              } catch (err) {
                console.log(`    ⚠️ Error con asesor ${asesor.id}: ${err.message}`);
              }
            }

            console.log(`  ✅ Encontrados ${resultados.length} asesores con disponibilidad`);
            return { disponibilidad: resultados, fecha };
          } catch (error) {
            console.log(`  ❌ Error: ${error.message}`);
            return { error: error.message };
          }
        },
      },

      crearEvento: {
        description: "Crea un evento/cita en el calendario del asesor",
        parameters: z.object({
          asesorId: z.number(),
          titulo: z.string(),
          startTime: z.number(),
          endTime: z.number(),
        }),
        execute: async ({ asesorId, titulo, startTime, endTime }) => {
          console.log(`  📝 [crearEvento] Asesor: ${asesorId}, Título: ${titulo}`);
          
          try {
            // Obtener asesor de Supabase
            const { data: asesor, error } = await supabase
              .from("wp_team_humano")
              .select("id, nombre, apellido, email, grant_id, timezone")
              .eq("id", asesorId)
              .single();

            if (error || !asesor) {
              return { error: "Asesor no encontrado" };
            }

            if (!asesor.grant_id) {
              return { error: "El asesor no tiene calendario conectado" };
            }

            // Obtener calendario primario
            const calendarios = await getCalendars(asesor.grant_id);
            const calPrimario = calendarios.find(c => c.is_primary) || calendarios[0];

            if (!calPrimario) {
              return { error: "No se encontró calendario del asesor" };
            }

            // Crear evento
            const eventoData = {
              title: titulo,
              when: {
                start_time: startTime,
                end_time: endTime,
              },
            };

            const evento = await createEvent(asesor.grant_id, calPrimario.id, eventoData);
            
            console.log(`  ✅ Evento creado: ${evento.id}`);
            return {
              success: true,
              eventoId: evento.id,
              titulo: evento.title,
              inicio: new Date(startTime * 1000).toISOString(),
              fin: new Date(endTime * 1000).toISOString(),
              asesor: `${asesor.nombre} ${asesor.apellido || ""}`.trim(),
            };
          } catch (error) {
            console.log(`  ❌ Error: ${error.message}`);
            return { error: error.message };
          }
        },
      },

      reagendarEvento: {
        description: "Reagenda un evento existente a una nueva fecha/hora",
        parameters: z.object({
          asesorId: z.number(),
          eventoId: z.string(),
          nuevoStartTime: z.number(),
          nuevoEndTime: z.number(),
        }),
        execute: async ({ asesorId, eventoId, nuevoStartTime, nuevoEndTime }) => {
          console.log(`  🔄 [reagendarEvento] Evento: ${eventoId}, Nuevo inicio: ${nuevoStartTime}`);
          
          try {
            // Obtener asesor
            const { data: asesor, error } = await supabase
              .from("wp_team_humano")
              .select("id, nombre, apellido, grant_id")
              .eq("id", asesorId)
              .single();

            if (error || !asesor || !asesor.grant_id) {
              return { error: "Asesor no encontrado o sin calendario" };
            }

            // Obtener calendario primario
            const calendarios = await getCalendars(asesor.grant_id);
            const calPrimario = calendarios.find(c => c.is_primary) || calendarios[0];

            if (!calPrimario) {
              return { error: "No se encontró calendario del asesor" };
            }

            // Actualizar evento
            const eventoActualizado = await updateEvent(
              asesor.grant_id,
              calPrimario.id,
              eventoId,
              {
                when: {
                  start_time: nuevoStartTime,
                  end_time: nuevoEndTime,
                },
              }
            );

            console.log(`  ✅ Evento reagendado: ${eventoId}`);
            return {
              success: true,
              eventoId: eventoActualizado.id,
              nuevoInicio: new Date(nuevoStartTime * 1000).toISOString(),
              nuevoFin: new Date(nuevoEndTime * 1000).toISOString(),
              asesor: `${asesor.nombre} ${asesor.apellido || ""}`.trim(),
            };
          } catch (error) {
            console.log(`  ❌ Error: ${error.message}`);
            return { error: error.message };
          }
        },
      },
    },

    maxSteps: 5,
    prompt: mensaje,
    });
  } catch (err) {
    console.error("Error en generateText:", err.message);
    throw err;
  }

  const elapsed = Date.now() - startTime;

  return {
    respuesta: result.text,
    steps: result.steps?.length || 1,
    tiempoMs: elapsed,
    toolsUsadas: result.steps?.flatMap(s => s.toolCalls?.map(tc => tc.toolName) || []) || [],
  };
}
