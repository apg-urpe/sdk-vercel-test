/**
 * Test simple para diagnosticar el error
 */
import "dotenv/config";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  compatibility: "compatible",
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

console.log("🧪 Test simple de diagnóstico\n");

// Test 1: Verificar Supabase
console.log("1️⃣ Probando Supabase...");
const { data: asesores, error: sbError } = await supabase
  .from("wp_team_humano")
  .select("id, nombre, email, grant_id, acepta_citas")
  .eq("is_active", true)
  .limit(5);

if (sbError) {
  console.log("❌ Error Supabase:", sbError.message);
} else {
  console.log("✅ Supabase OK. Asesores encontrados:", asesores?.length || 0);
  asesores?.forEach(a => {
    console.log(`   - ${a.nombre} (${a.email}) | grant_id: ${a.grant_id ? "✓" : "✗"} | acepta_citas: ${a.acepta_citas}`);
  });
}

// Test 2: Verificar LLM con tool simple
console.log("\n2️⃣ Probando LLM con tool simple...");
try {
  const result = await generateText({
    model: openrouter("openai/gpt-3.5-turbo"),
    tools: {
      saludar: {
        description: "Saluda a alguien",
        parameters: z.object({
          nombre: z.string(),
        }),
        execute: async ({ nombre }) => {
          console.log(`   🔧 Tool ejecutada: saludar(${nombre})`);
          return { mensaje: `Hola ${nombre}!` };
        },
      },
    },
    maxSteps: 2,
    prompt: "Saluda a Juan",
  });
  console.log("✅ LLM OK:", result.text);
} catch (err) {
  console.log("❌ Error LLM:", err.message);
  if (err.cause) console.log("   Causa:", JSON.stringify(err.cause));
}

// Test 3: Verificar Nylas
console.log("\n3️⃣ Probando Nylas API...");
const asesorConGrant = asesores?.find(a => a.grant_id);
if (asesorConGrant) {
  try {
    const nylasRes = await fetch(`${process.env.NYLAS_API_URL}/v3/grants/${asesorConGrant.grant_id}/calendars`, {
      headers: {
        "Authorization": `Bearer ${process.env.NYLAS_API_KEY}`,
      },
    });
    const nylasData = await nylasRes.json();
    if (nylasRes.ok) {
      console.log("✅ Nylas OK. Calendarios:", nylasData.data?.length || 0);
      nylasData.data?.forEach(c => console.log(`   - ${c.name} (${c.id})`));
    } else {
      console.log("❌ Error Nylas:", JSON.stringify(nylasData));
    }
  } catch (err) {
    console.log("❌ Error Nylas:", err.message);
  }
} else {
  console.log("⚠️ No hay asesores con grant_id para probar Nylas");
}

console.log("\n✅ Diagnóstico completado");
