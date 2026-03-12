/**
 * Benchmark - Comparación de velocidad entre modelos
 * 
 * Prueba parallel tool calls con diferentes LLMs
 */

import { benchmarkModelo } from "./weather-agent.js";

// Modelos a probar (disponibles en OpenRouter)
const MODELOS = [
  "openai/gpt-3.5-turbo",
  "openai/gpt-4o-mini", 
  "meta-llama/llama-3.1-8b-instruct",
  "anthropic/claude-3-haiku",
];

const PREGUNTA = "¿Cómo está el clima en Bogotá y en Cartagena?";

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║  🏎️  BENCHMARK: Parallel Tool Calls - Comparación         ║");
console.log("╚════════════════════════════════════════════════════════════╝");
console.log(`\n📝 Pregunta: "${PREGUNTA}"\n`);

async function runBenchmark() {
  const resultados = [];

  for (const modelo of MODELOS) {
    console.log(`\n⏳ Probando: ${modelo}...`);
    
    const resultado = await benchmarkModelo(modelo, PREGUNTA);
    resultados.push(resultado);

    if (resultado.exito) {
      console.log(`   ✅ ${resultado.tiempoTotal}ms | Tools: ${resultado.tools.join(", ")}`);
      console.log(`      └─ climaBogota: ${resultado.tiempoTools.climaBogota || 0}ms`);
      console.log(`      └─ climaCartagena: ${resultado.tiempoTools.climaCartagena || 0}ms`);
    } else {
      console.log(`   ❌ Error: ${resultado.error}`);
    }
  }

  // Tabla resumen
  console.log("\n" + "═".repeat(70));
  console.log("📊 RESUMEN DE RESULTADOS");
  console.log("═".repeat(70));
  console.log("| Modelo                              | Total   | Bogotá | Cartagena | Tokens |");
  console.log("|-------------------------------------|---------|--------|-----------|--------|");

  for (const r of resultados) {
    if (r.exito) {
      const modelo = r.modelo.padEnd(35);
      const total = `${r.tiempoTotal}ms`.padStart(7);
      const bogota = `${r.tiempoTools.climaBogota || 0}ms`.padStart(6);
      const cartagena = `${r.tiempoTools.climaCartagena || 0}ms`.padStart(9);
      const tokens = `${r.tokens}`.padStart(6);
      console.log(`| ${modelo} | ${total} | ${bogota} | ${cartagena} | ${tokens} |`);
    } else {
      const modelo = r.modelo.padEnd(35);
      console.log(`| ${modelo} | ERROR   |   -    |     -     |    -   |`);
    }
  }

  console.log("═".repeat(70));

  // Encontrar el más rápido
  const exitosos = resultados.filter(r => r.exito);
  if (exitosos.length > 0) {
    const masRapido = exitosos.reduce((a, b) => a.tiempoTotal < b.tiempoTotal ? a : b);
    console.log(`\n🏆 Más rápido: ${masRapido.modelo} (${masRapido.tiempoTotal}ms)`);
  }
}

runBenchmark().then(() => {
  console.log("\n🎉 Benchmark completado!");
}).catch(console.error);
