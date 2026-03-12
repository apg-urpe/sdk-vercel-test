/**
 * Test del Agente de Agendamiento
 */

import "dotenv/config";
import { ejecutarAgenteAgendamiento } from "./scheduling-agent.js";

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║  🗓️  Test: Agente de Agendamiento                          ║");
console.log("╚════════════════════════════════════════════════════════════╝");

// Contexto de prueba - empresa 4 tiene asesores con grant_id y acepta_citas=true
const contexto = {
  empresaId: 4,
  contactoId: 1,
  timezoneContacto: "America/Bogota",
};

async function test() {
  // Test 1: Verificar disponibilidad
  console.log("\n" + "═".repeat(60));
  console.log("TEST 1: Verificar disponibilidad para mañana");
  console.log("═".repeat(60));

  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const fechaManana = manana.toISOString().split("T")[0];

  const resultado1 = await ejecutarAgenteAgendamiento(
    `¿Qué disponibilidad tienen los asesores para el ${fechaManana}?`,
    contexto
  );

  console.log("\n✅ Respuesta del agente:");
  console.log(resultado1.respuesta);
  console.log(`\n📊 Stats: ${resultado1.tiempoMs}ms | Tools: ${resultado1.toolsUsadas.join(", ") || "ninguna"}`);
}

test().then(() => {
  console.log("\n" + "═".repeat(60));
  console.log("🎉 Test completado!");
}).catch(err => {
  console.error("\n❌ Error:", err.message);
  console.error(err.stack);
});
