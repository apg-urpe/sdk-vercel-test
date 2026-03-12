/**
 * Agente del Clima - Vercel AI SDK
 * 
 * Benchmark de PARALLEL TOOL CALLS con múltiples modelos
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import "dotenv/config";

// Configurar OpenRouter
const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  compatibility: "compatible",
});

// Almacenar tiempos de cada tool
let toolTimings = {};

// Crear tools con tracking de tiempo
function createTools() {
  toolTimings = {};
  
  return {
    climaBogota: {
      description: "Obtiene el clima actual de Bogotá.",
      parameters: z.object({}),
      execute: async () => {
        const start = Date.now();
        await new Promise(r => setTimeout(r, 50)); // Simular API
        const elapsed = Date.now() - start;
        toolTimings.climaBogota = elapsed;
        return { ciudad: "Bogotá", temperatura: 18, condicion: "Nublado", humedad: 65 };
      },
    },
    climaCartagena: {
      description: "Obtiene el clima actual de Cartagena.",
      parameters: z.object({}),
      execute: async () => {
        const start = Date.now();
        await new Promise(r => setTimeout(r, 50)); // Simular API
        const elapsed = Date.now() - start;
        toolTimings.climaCartagena = elapsed;
        return { ciudad: "Cartagena", temperatura: 32, condicion: "Soleado", humedad: 80 };
      },
    },
  };
}

/**
 * Ejecuta benchmark con un modelo específico
 */
export async function benchmarkModelo(modelId, pregunta) {
  const startTime = Date.now();
  const tools = createTools();

  try {
    const result = await generateText({
      model: openrouter(modelId),
      system: `Eres un asistente meteorológico. Cuando pregunten por Bogotá Y Cartagena, llama AMBAS herramientas al mismo tiempo. Responde en español, conciso.`,
      tools,
      maxSteps: 2,
      prompt: pregunta,
    });

    const totalTime = Date.now() - startTime;
    const toolsUsadas = result.steps?.flatMap(s => s.toolCalls?.map(tc => tc.toolName) || []) || [];

    return {
      modelo: modelId,
      exito: true,
      tiempoTotal: totalTime,
      tiempoTools: { ...toolTimings },
      tokens: result.usage?.totalTokens || 0,
      tools: toolsUsadas,
      respuesta: result.text?.substring(0, 100) + "...",
    };
  } catch (error) {
    return {
      modelo: modelId,
      exito: false,
      error: error.message,
      tiempoTotal: Date.now() - startTime,
    };
  }
}
