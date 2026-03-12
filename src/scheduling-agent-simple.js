/**
 * Agente de Agendamiento SIMPLIFICADO
 * Versión mínima para diagnosticar el error del provider
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { supabase } from "./lib/supabase.js";
import { getCalendars, getEvents } from "./lib/nylas.js";
import "dotenv/config";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  compatibility: "compatible",
});

/**
 * Ejecuta el agente de agendamiento (versión simple)
 */
export async function consultarDisponibilidad(empresaId, fecha) {
  console.log(`\n🤖 Consultando disponibilidad`);
  console.log(`🏢 Empresa: ${empresaId} | 📅 Fecha: ${fecha}`);
  console.log("-".repeat(50));

  const result = await generateText({
    model: openrouter("openai/gpt-3.5-turbo"),
    
    system: `Eres un asistente de agendamiento. Usa la herramienta verificarDisponibilidad para consultar los horarios disponibles.`,

    tools: {
      verificarDisponibilidad: {
        description: "Consulta la disponibilidad de asesores para una fecha",
        parameters: z.object({
          fecha: z.string(),
        }),
        execute: async ({ fecha }) => {
          console.log(`  📅 [Tool] Buscando disponibilidad para ${fecha}...`);
          
          // Obtener asesores
          const { data: asesores } = await supabase
            .from("wp_team_humano")
            .select("id, nombre, grant_id, duracion_cita_minutos, disponibilidad, timezone")
            .eq("empresa_id", empresaId)
            .eq("is_active", true)
            .eq("acepta_citas", true)
            .not("grant_id", "is", null)
            .limit(3);

          if (!asesores?.length) {
            return { error: "No hay asesores disponibles" };
          }

          const resultados = [];

          for (const asesor of asesores) {
            try {
              // Obtener calendarios
              const calendarios = await getCalendars(asesor.grant_id);
              const cal = calendarios?.find(c => c.is_primary) || calendarios?.[0];
              
              if (!cal) continue;

              // Calcular rango
              const inicio = new Date(fecha);
              inicio.setHours(0, 0, 0, 0);
              const fin = new Date(fecha);
              fin.setHours(23, 59, 59, 999);

              // Obtener eventos
              const eventos = await getEvents(
                asesor.grant_id,
                cal.id,
                Math.floor(inicio.getTime() / 1000),
                Math.floor(fin.getTime() / 1000)
              );

              resultados.push({
                asesor: asesor.nombre,
                eventosOcupados: eventos?.length || 0,
                duracionCita: asesor.duracion_cita_minutos || 30,
              });

              console.log(`    ✅ ${asesor.nombre}: ${eventos?.length || 0} eventos`);
            } catch (err) {
              console.log(`    ⚠️ ${asesor.nombre}: ${err.message}`);
            }
          }

          return { fecha, asesores: resultados };
        },
      },
    },

    maxSteps: 3,
    prompt: `Verifica la disponibilidad para el ${fecha}`,
  });

  return {
    respuesta: result.text,
    tiempoMs: 0,
  };
}

// Test directo
if (process.argv[1].includes("scheduling-agent-simple")) {
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const fecha = manana.toISOString().split("T")[0];

  consultarDisponibilidad(4, fecha)
    .then(r => {
      console.log("\n✅ Respuesta:", r.respuesta);
    })
    .catch(e => {
      console.error("\n❌ Error:", e.message);
      console.error("Causa:", e.cause);
    });
}
