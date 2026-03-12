# Vercel AI SDK v6 — Referencia Ultra-Detallada para Agentes

> **Versión:** v6 (Latest) | **Fuente:** https://ai-sdk.dev/docs/introduction  
> **Documentación completa en Markdown:** https://ai-sdk.dev/llms.txt  
> **Última actualización de este documento:** Marzo 2026

---

## ÍNDICE

1. [Conceptos Fundamentales](#1-conceptos-fundamentales)
2. [Instalación y Setup](#2-instalación-y-setup)
3. [Proveedores de Modelos](#3-proveedores-de-modelos)
4. [AI SDK Core — generateText](#4-ai-sdk-core--generatetext)
5. [AI SDK Core — streamText](#5-ai-sdk-core--streamtext)
6. [AI SDK Core — Structured Output](#6-ai-sdk-core--structured-output)
7. [AI SDK Core — Tool Calling](#7-ai-sdk-core--tool-calling)
8. [AI SDK Core — Embeddings](#8-ai-sdk-core--embeddings)
9. [AI SDK Core — Settings (Parámetros)](#9-ai-sdk-core--settings-parámetros)
10. [AI SDK Core — Error Handling](#10-ai-sdk-core--error-handling)
11. [AI SDK Core — Language Model Middleware](#11-ai-sdk-core--language-model-middleware)
12. [AI SDK Core — MCP (Model Context Protocol)](#12-ai-sdk-core--mcp-model-context-protocol)
13. [Agentes — ToolLoopAgent](#13-agentes--toolloopagent)
14. [Agentes — Loop Control y stopWhen](#14-agentes--loop-control-y-stopwhen)
15. [Agentes — prepareStep (control por paso)](#15-agentes--preparestep-control-por-paso)
16. [Agentes — Manual Loop (control total)](#16-agentes--manual-loop-control-total)
17. [Agentes — Workflow Patterns](#17-agentes--workflow-patterns)
18. [Agentes — Memoria](#18-agentes--memoria)
19. [Agentes — Subagentes](#19-agentes--subagentes)
20. [AI SDK UI — useChat Hook](#20-ai-sdk-ui--usechat-hook)
21. [AI SDK UI — Route Handler (Next.js)](#21-ai-sdk-ui--route-handler-nextjs)
22. [AI SDK UI — useCompletion Hook](#22-ai-sdk-ui--usecompletion-hook)
23. [AI SDK UI — useObject Hook](#23-ai-sdk-ui--useobject-hook)
24. [Image Generation, Speech, Transcription](#24-image-generation-speech-transcription)
25. [Provider & Model Management](#25-provider--model-management)
26. [Testing](#26-testing)
27. [Telemetría (OpenTelemetry)](#27-telemetría-opentelemetry)
28. [Variables de Entorno y Configuración](#28-variables-de-entorno-y-configuración)
29. [Estructura de Proyecto Recomendada](#29-estructura-de-proyecto-recomendada)
30. [Herramientas de Terceros / Tool Packages](#30-herramientas-de-terceros--tool-packages)
31. [Links de Referencia](#31-links-de-referencia)

---

## 1. Conceptos Fundamentales

### ¿Qué es el AI SDK?

El AI SDK es el **toolkit TypeScript oficial de Vercel** para construir aplicaciones y agentes con IA. Su objetivo principal es **estandarizar la integración de LLMs** entre múltiples proveedores, de modo que cambiar de proveedor sea cuestión de una línea de código.

### Dos librerías principales

| Librería | Propósito |
|---|---|
| **AI SDK Core** (`ai`) | API unificada para generar texto, objetos estructurados, llamadas a herramientas y construir agentes con LLMs. |
| **AI SDK UI** (`@ai-sdk/react`, etc.) | Hooks framework-agnostic (React, Svelte, Vue) para construir interfaces de chat y UIs generativas. |

### Conceptos clave

- **LLM (Large Language Model):** Modelo que predice y genera texto. Puede "alucinar" información que no conoce.
- **Embedding Model:** Convierte texto o imágenes en vectores numéricos de alta dimensión. Permite búsqueda semántica (similitud coseno).
- **Tool (Herramienta):** Función que el modelo puede invocar para interactuar con el mundo exterior (APIs, DBs, etc.).
- **Step (Paso):** Una generación LLM individual. Puede terminar en texto o en una tool call.
- **Agent Loop:** Ciclo repetido de generación → tool call → resultado → nueva generación, hasta cumplir condición de parada.

---

## 2. Instalación y Setup

```bash
# Paquete principal
pnpm add ai

# React hooks
pnpm add @ai-sdk/react

# Provider específico (elegir el que necesites)
pnpm add @ai-sdk/openai
pnpm add @ai-sdk/anthropic
pnpm add @ai-sdk/google
pnpm add @ai-sdk/mistral
pnpm add @ai-sdk/groq
pnpm add @ai-sdk/amazon-bedrock
pnpm add @ai-sdk/azure
pnpm add @ai-sdk/google-vertex

# MCP (Model Context Protocol)
pnpm add @ai-sdk/mcp
```

---

## 3. Proveedores de Modelos

### Tabla completa de capacidades

| Proveedor | Image Input | Image Gen | Object Gen | Tool Use | Tool Streaming |
|---|:---:|:---:|:---:|:---:|:---:|
| Vercel AI Gateway | ✅ | ✅ | ✅ | ✅ | ✅ |
| OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ |
| Anthropic | ✅ | ❌ | ✅ | ✅ | ✅ |
| Google Generative AI | ✅ | ❌ | ✅ | ✅ | ✅ |
| Google Vertex AI | ✅ | ✅ | ✅ | ✅ | ✅ |
| Azure | ✅ | ❌ | ✅ | ✅ | ✅ |
| Amazon Bedrock | ✅ | ✅ | ✅ | ✅ | ✅ |
| Groq | ✅ | ❌ | ✅ | ✅ | ✅ |
| Mistral | ✅ | ❌ | ✅ | ✅ | ✅ |
| xAI Grok | ✅ | ✅ | ✅ | ✅ | ✅ |
| DeepInfra | ✅ | ❌ | ✅ | ✅ | ✅ |
| Together.ai | ❌ | ❌ | ✅ | ✅ | ✅ |
| Fireworks | ❌ | ✅ | ✅ | ✅ | ✅ |
| Cohere | ❌ | ❌ | ❌ | ✅ | ✅ |
| DeepSeek | ❌ | ❌ | ✅ | ✅ | ✅ |
| Cerebras | ❌ | ❌ | ✅ | ✅ | ✅ |
| Perplexity | ❌ | ❌ | ❌ | ❌ | ❌ |
| Fal AI | ❌ | ✅ | ❌ | ❌ | ❌ |
| Luma AI | ❌ | ✅ | ❌ | ❌ | ❌ |
| Baseten | ❌ | ❌ | ✅ | ✅ | ❌ |

### Uso del Vercel AI Gateway (recomendado)

El Gateway provee acceso a todos los modelos con una sola API key. No requiere importar el provider específico:

```typescript
import { generateText } from "ai";

// El formato es: "proveedor/modelo"
const { text } = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  prompt: "Hola",
});

// Variable de entorno requerida:
// AI_GATEWAY_API_KEY=tu-api-key-de-vercel
```

### Uso de provider específico

```typescript
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

// OpenAI
const { text: t1 } = await generateText({
  model: openai("gpt-4o"),
  prompt: "...",
});

// Anthropic
const { text: t2 } = await generateText({
  model: anthropic("claude-opus-4-5"),
  prompt: "...",
});

// Google
const { text: t3 } = await generateText({
  model: google("gemini-2.0-flash"),
  prompt: "...",
});
```

---

## 4. AI SDK Core — generateText

`generateText` genera texto de forma completa (no streaming). Ideal para tareas no interactivas: automatización, resúmenes, emails, agentes con herramientas.

### Uso básico

```typescript
import { generateText } from "ai";

const { text } = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  prompt: "Escribe una receta de lasaña vegetariana para 4 personas.",
});

console.log(text);
```

### Con system prompt y mensajes

```typescript
import { generateText } from "ai";

const { text } = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  system: "Eres un escritor profesional. Escribe contenido claro y conciso.",
  prompt: `Resume el siguiente artículo en 3-5 oraciones: ${article}`,
});
```

### Con historial de conversación

```typescript
import { generateText } from "ai";

const { text } = await generateText({
  model: "openai/gpt-4o",
  messages: [
    { role: "user", content: "¿Cuál es la capital de Colombia?" },
    { role: "assistant", content: "La capital de Colombia es Bogotá." },
    { role: "user", content: "¿Cuántos habitantes tiene?" },
  ],
});
```

### Objeto de retorno completo

```typescript
const result = await generateText({ model, prompt });

result.text             // string — texto generado en el último step
result.content          // ContentPart[] — contenido del último step
result.reasoning        // string | undefined — razonamiento del modelo (si disponible)
result.reasoningText    // string | undefined — texto de razonamiento
result.files            // GeneratedFile[] — archivos generados
result.sources          // Source[] — fuentes referenciadas (solo algunos modelos)
result.toolCalls        // ToolCall[] — llamadas a herramientas del último step
result.toolResults      // ToolResult[] — resultados de tool calls
result.finishReason     // 'stop' | 'length' | 'tool-calls' | 'error' | 'other'
result.rawFinishReason  // string — razón raw del proveedor
result.usage            // { promptTokens, completionTokens, totalTokens }
result.totalUsage       // Usage total en todos los steps (multi-step)
result.warnings         // Warning[] — advertencias del proveedor
result.request          // RequestInfo — info adicional de la petición
result.response         // ResponseInfo — headers, body, messages de la respuesta
result.providerMetadata // Record<string, any> — metadata específica del proveedor
result.steps            // StepResult[] — detalles de cada step (útil en multi-step)
result.output           // Typed structured output (cuando se usa output spec)
```

### Acceder a headers y body de la respuesta

```typescript
const result = await generateText({ model, prompt });

console.log(JSON.stringify(result.response.headers, null, 2));
console.log(JSON.stringify(result.response.body, null, 2));
```

### Callback `onFinish`

```typescript
const result = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  prompt: "Inventa un nuevo día festivo.",
  onFinish({ text, finishReason, usage, response, steps, totalUsage }) {
    // Guardar historial, registrar uso, etc.
    const messages = response.messages;
    console.log("Tokens usados:", usage.totalTokens);
  },
});
```

### Lifecycle callbacks (experimental)

```typescript
const result = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  prompt: "¿Cuál es el clima en Bogotá?",
  tools: { /* tus herramientas */ },

  experimental_onStart({ model, settings, functionId }) {
    console.log("Generación iniciada", { model, functionId });
  },

  experimental_onStepStart({ stepNumber, model, promptMessages }) {
    console.log(`Step ${stepNumber} iniciando`, { model: model.modelId });
  },

  experimental_onToolCallStart({ toolName, toolCallId, input }) {
    console.log(`Tool call iniciando: ${toolName}`, { toolCallId });
  },

  experimental_onToolCallFinish({ toolName, durationMs, error }) {
    console.log(`Tool call finalizada: ${toolName} (${durationMs}ms)`, {
      success: !error,
    });
  },

  onStepFinish({ stepNumber, finishReason, usage }) {
    console.log(`Step ${stepNumber} finalizado`, { finishReason, usage });
  },
});
```

---

## 5. AI SDK Core — streamText

`streamText` inicia el streaming inmediatamente. Ideal para chatbots e interfaces donde el usuario ve la respuesta mientras se genera.

**IMPORTANTE:** `streamText` suprime errores por defecto para evitar crashes. Usa `onError` para loguearlos.

### Uso básico

```typescript
import { streamText } from "ai";

const result = streamText({
  model: "anthropic/claude-sonnet-4-5",
  prompt: "Inventa un nuevo día festivo y describe sus tradiciones.",
});

// Como async iterable
for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

### Métodos de integración con HTTP

```typescript
const result = streamText({ model, messages });

// Para Next.js App Router (recomendado)
return result.toUIMessageStreamResponse();

// Para Node.js response
result.pipeUIMessageStreamToResponse(res);

// Stream de texto puro HTTP
return result.toTextStreamResponse();

// Pipe de texto puro a Node.js response
result.pipeTextStreamToResponse(res);
```

### Propiedades del resultado (Promises que resuelven al finalizar)

```typescript
result.textStream          // ReadableStream<string> y AsyncIterable<string>
result.fullStream          // Stream con todos los tipos de chunks
result.text                // Promise<string> — texto completo generado
result.reasoning           // Promise<string | undefined>
result.reasoningText       // Promise<string | undefined>
result.files               // Promise<GeneratedFile[]>
result.sources             // Promise<Source[]>
result.toolCalls           // Promise<ToolCall[]>
result.toolResults         // Promise<ToolResult[]>
result.finishReason        // Promise<FinishReason>
result.usage               // Promise<Usage>
result.totalUsage          // Promise<Usage>
result.warnings            // Promise<Warning[]>
result.steps               // Promise<StepResult[]>
result.request             // Promise<RequestInfo>
result.response            // Promise<ResponseInfo>
result.providerMetadata    // Promise<ProviderMetadata>
```

### Callbacks disponibles

```typescript
const result = streamText({
  model: "anthropic/claude-sonnet-4-5",
  prompt: "...",

  onError({ error }) {
    console.error("Error en stream:", error);
  },

  onChunk({ chunk }) {
    // chunk.type puede ser: 'text', 'reasoning', 'source',
    // 'tool-call', 'tool-input-start', 'tool-input-delta',
    // 'tool-result', 'raw'
    if (chunk.type === "text") {
      console.log(chunk.text);
    }
  },

  onFinish({ text, finishReason, usage, response, steps, totalUsage }) {
    console.log("Stream finalizado. Tokens:", usage.totalTokens);
  },

  onAbort({ steps }) {
    // Llamado cuando el stream es abortado (no llama onFinish)
    console.log("Stream abortado después de", steps.length, "steps");
  },

  onStepFinish({ stepNumber, finishReason, usage, toolCalls, toolResults }) {
    console.log(`Step ${stepNumber} finalizado`);
  },
});
```

### Consumir `fullStream` con todos los tipos de chunks

```typescript
const { fullStream } = streamText({ model, prompt });

for await (const part of fullStream) {
  switch (part.type) {
    case "text":
      process.stdout.write(part.text);
      break;
    case "reasoning":
      console.log("Razonamiento:", part.text);
      break;
    case "tool-call":
      console.log("Tool llamada:", part.toolName, part.args);
      break;
    case "tool-result":
      console.log("Tool resultado:", part.toolName, part.result);
      break;
    case "error":
      console.error("Error en stream:", part.error);
      break;
    case "abort":
      console.log("Stream abortado");
      break;
    case "tool-error":
      console.error("Error en tool:", part.error);
      break;
    case "finish":
      console.log("Finalizado:", part.finishReason, part.usage);
      break;
  }
}
```

---

## 6. AI SDK Core — Structured Output

Generación de datos estructurados tipados con Zod schema, integrado en `generateText` y `streamText` a través de la propiedad `output`.

### `Output.object()` — Objeto tipado

```typescript
import { generateText, Output } from "ai";
import { z } from "zod";

const { output } = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  output: Output.object({
    name: "Recipe",                    // opcional — nombre para el provider
    description: "A recipe for a dish.", // opcional
    schema: z.object({
      recipe: z.object({
        name: z.string().describe("Nombre de la receta"),
        ingredients: z.array(
          z.object({
            name: z.string(),
            amount: z.string().describe("Cantidad en gramos o ml"),
          })
        ).describe("Lista de ingredientes"),
        steps: z.array(z.string()).describe("Pasos de preparación"),
        servings: z.number().optional(),
      }),
    }),
  }),
  prompt: "Genera una receta de lasaña.",
});

// output es completamente tipado por Zod
console.log(output.recipe.name);
console.log(output.recipe.ingredients);
```

### `Output.array()` — Array de objetos

```typescript
const { output } = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  output: Output.array({
    element: z.object({
      ciudad: z.string(),
      temperatura: z.number(),
      condicion: z.string(),
    }),
  }),
  prompt: "Lista el clima de Bogotá, Medellín y Cali.",
});

// output es un array tipado
output.forEach(ciudad => console.log(ciudad.ciudad, ciudad.temperatura));
```

### `Output.choice()` — Clasificación entre opciones fijas

```typescript
const { output } = await generateText({
  model: "openai/gpt-4o",
  output: Output.choice({
    options: ["positivo", "neutral", "negativo"],
  }),
  prompt: "¿Cuál es el sentimiento de este comentario: 'Me encantó el producto'?",
});

// output es exactamente uno de: 'positivo' | 'neutral' | 'negativo'
console.log(output); // "positivo"
```

### `Output.json()` — JSON libre sin schema

```typescript
const { output } = await generateText({
  model: "openai/gpt-4o",
  output: Output.json(),
  prompt: "Devuelve el clima de Bogotá y París como JSON.",
});

// output es any (JSON válido pero sin validar estructura)
```

### `Output.text()` — Texto plano (default)

```typescript
const { output } = await generateText({
  model: "openai/gpt-4o",
  output: Output.text(),
  prompt: "Cuéntame un chiste.",
});
// output es un string
```

### Streaming de objetos estructurados

```typescript
import { streamText, Output } from "ai";
import { z } from "zod";

const { partialOutputStream } = streamText({
  model: "anthropic/claude-sonnet-4-5",
  output: Output.object({
    schema: z.object({
      receta: z.object({
        nombre: z.string(),
        ingredientes: z.array(z.string()),
        pasos: z.array(z.string()),
      }),
    }),
  }),
  prompt: "Genera una receta de paella.",
});

for await (const partialObject of partialOutputStream) {
  // partialObject tiene la estructura parcial que va llegando
  console.log(partialObject);
}
```

### Streaming de arrays (elementos completos uno a uno)

```typescript
const { elementStream } = streamText({
  model: "openai/gpt-4o",
  output: Output.array({
    element: z.object({
      nombre: z.string(),
      clase: z.string(),
      descripcion: z.string(),
    }),
  }),
  prompt: "Genera 3 descripciones de héroes para un RPG.",
});

for await (const heroe of elementStream) {
  // Cada héroe es completo y validado
  console.log(heroe.nombre, heroe.clase);
}
```

### Combinar structured output con tools

```typescript
const { output } = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  tools: {
    clima: tool({
      description: "Obtiene el clima de una ubicación",
      inputSchema: z.object({ ubicacion: z.string() }),
      execute: async ({ ubicacion }) => ({ temperatura: 22, condicion: "soleado" }),
    }),
  },
  output: Output.object({
    schema: z.object({
      resumen: z.string(),
      recomendacion: z.string(),
    }),
  }),
  stopWhen: stepCountIs(5), // generar output cuenta como un step
  prompt: "¿Qué ropa debo usar en Bogotá hoy?",
});
```

### Manejo de errores en structured output

```typescript
import { generateText, Output, NoObjectGeneratedError } from "ai";

try {
  await generateText({
    model,
    output: Output.object({ schema }),
    prompt,
  });
} catch (error) {
  if (NoObjectGeneratedError.isInstance(error)) {
    console.log("Error al generar objeto estructurado");
    console.log("Causa:", error.cause);
    console.log("Texto generado:", error.text);
    console.log("Respuesta:", error.response);
    console.log("Uso:", error.usage);
  }
}
```

---

## 7. AI SDK Core — Tool Calling

### Tipos de herramientas

#### 1. Custom Tools (herramientas propias)

```typescript
import { tool } from "ai";
import { z } from "zod";

const weatherTool = tool({
  description: "Obtiene el clima de una ubicación. Úsala cuando se pregunte por el tiempo.",
  inputSchema: z.object({
    location: z.string().describe("La ciudad para la que consultar el clima"),
    unit: z.enum(["celsius", "fahrenheit"]).optional().default("celsius"),
  }),
  strict: true,  // opcional — validación estricta del schema (si el proveedor lo soporta)
  inputExamples: [           // opcional — solo Anthropic lo soporta nativamente
    { input: { location: "Bogotá" } },
    { input: { location: "Medellín", unit: "celsius" } },
  ],
  execute: async ({ location, unit }) => {
    // Tu lógica real aquí
    return {
      location,
      temperature: 18,
      unit,
      condition: "Parcialmente nublado",
    };
  },
});
```

#### 2. Provider-Defined Tools (herramientas del proveedor, tú ejecutas)

```typescript
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

const result = await generateText({
  model: anthropic("claude-opus-4-5"),
  tools: {
    bash: anthropic.tools.bash_20250124({
      execute: async ({ command }) => {
        return runCommand(command); // tu implementación
      },
    }),
  },
  prompt: "Lista los archivos del directorio actual",
});
```

#### 3. Provider-Executed Tools (herramientas ejecutadas por el proveedor)

```typescript
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

const result = await generateText({
  model: openai("gpt-4o"),
  tools: {
    web_search: openai.tools.webSearch(), // OpenAI ejecuta en sus servidores
  },
  prompt: "¿Qué pasó en las noticias hoy?",
});
```

#### Comparación de tipos de tools

| Aspecto | Custom Tools | Provider-Defined | Provider-Executed |
|---|---|---|---|
| Ejecución | Tu código | Tu código | Servidores del proveedor |
| Schema | Tú defines | Proveedor define | Proveedor define |
| Portabilidad | Cualquier proveedor | Solo ese proveedor | Solo ese proveedor |
| Setup | Implementas todo | Implementas `execute` | Solo configuración |

### Tool Calling con generateText y multi-step

```typescript
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";

const { text, steps, toolCalls, toolResults } = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  tools: {
    clima: tool({
      description: "Obtiene el clima de una ciudad",
      inputSchema: z.object({
        ciudad: z.string().describe("Nombre de la ciudad"),
      }),
      execute: async ({ ciudad }) => ({
        ciudad,
        temperatura: 20 + Math.floor(Math.random() * 10),
        condicion: "Soleado",
      }),
    }),
    buscarHotel: tool({
      description: "Busca hoteles disponibles en una ciudad",
      inputSchema: z.object({
        ciudad: z.string(),
        fechaEntrada: z.string(),
        fechaSalida: z.string(),
      }),
      execute: async ({ ciudad, fechaEntrada, fechaSalida }) => ({
        hoteles: [
          { nombre: "Hotel Andino", precio: 150000 },
          { nombre: "Casa Medina", precio: 280000 },
        ],
      }),
    }),
  },
  stopWhen: stepCountIs(10), // máximo 10 steps
  prompt: "¿Cuál es el clima en Bogotá? Y busca hoteles del 1 al 5 de abril.",
});

// Extraer todos los tool calls de todos los steps
const allToolCalls = steps.flatMap(step => step.toolCalls);
```

### Tool Execution Approval (aprobación antes de ejecutar)

```typescript
import { tool, generateText, type ModelMessage, type ToolApprovalResponse } from "ai";
import { z } from "zod";

// Tool que requiere aprobación
const eliminarArchivo = tool({
  description: "Elimina un archivo del sistema",
  inputSchema: z.object({
    ruta: z.string().describe("Ruta del archivo a eliminar"),
  }),
  needsApproval: true,  // siempre pide aprobación
  // O dinámico:
  // needsApproval: async ({ ruta }) => ruta.includes("/prod/"),
  execute: async ({ ruta }) => {
    // se ejecuta solo si fue aprobado
    return { eliminado: true, ruta };
  },
});

// Primer llamado — retorna tool-approval-request
const messages: ModelMessage[] = [
  { role: "user", content: "Elimina el archivo /tmp/test.txt" },
];

const result = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  tools: { eliminarArchivo },
  messages,
});

messages.push(...result.response.messages);

// Revisar si hay solicitudes de aprobación
const approvals: ToolApprovalResponse[] = [];
for (const part of result.content) {
  if (part.type === "tool-approval-request") {
    console.log("Se requiere aprobación para:", part.toolCall.toolName);
    console.log("Con parámetros:", part.toolCall.input);
    
    approvals.push({
      type: "tool-approval-response",
      approvalId: part.approvalId,
      approved: true,          // o false para denegar
      reason: "El usuario confirmó la eliminación",
    });
  }
}

// Enviar respuesta de aprobación
messages.push({ role: "tool", content: approvals });

// Segundo llamado — ejecuta la tool aprobada
const finalResult = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  tools: { eliminarArchivo },
  messages,
});
```

### `onStepFinish` callback en multi-step

```typescript
const result = await generateText({
  model,
  tools,
  stopWhen: stepCountIs(5),
  prompt: "...",
  onStepFinish({ stepNumber, text, toolCalls, toolResults, finishReason, usage }) {
    console.log(`Step ${stepNumber} (${finishReason}):`, {
      texto: text,
      toolsUsadas: toolCalls.map(tc => tc.toolName),
    });
  },
});
```

### `prepareStep` — modificar settings por step

```typescript
const result = await generateText({
  model: "openai/gpt-4o-mini",
  tools: { tool1, tool2 },
  stopWhen: stepCountIs(10),
  prompt: "...",
  prepareStep: async ({ model, stepNumber, steps, messages }) => {
    if (stepNumber === 0) {
      return {
        model: "anthropic/claude-sonnet-4-5", // cambia modelo en step 0
        toolChoice: { type: "tool", toolName: "tool1" }, // fuerza tool1
        activeTools: ["tool1"], // solo tool1 disponible
      };
    }
    // Sin return = usa settings por defecto
  },
});
```

### Forced Tool Calling (forzar tools en cada step)

```typescript
import { tool, generateText, ToolLoopAgent, stepCountIs } from "ai";
import { z } from "zod";

const agent = new ToolLoopAgent({
  model: "anthropic/claude-sonnet-4-5",
  tools: {
    buscar: searchTool,
    analizar: analyzeTool,
    done: tool({
      description: "Indica que has terminado y proporciona la respuesta final.",
      inputSchema: z.object({
        respuesta: z.string().describe("La respuesta final"),
      }),
      // Sin execute → detiene el loop cuando se invoca
    }),
  },
  toolChoice: "required", // fuerza tool call en cada step
});

const result = await agent.generate({
  prompt: "Investiga y analiza las tendencias de IA en 2025, luego da tu respuesta.",
});

// Extraer respuesta del done tool
const toolCall = result.staticToolCalls[0];
if (toolCall?.toolName === "done") {
  console.log("Respuesta final:", toolCall.input.respuesta);
}
```

---

## 8. AI SDK Core — Embeddings

### Embedding individual

```typescript
import { embed } from "ai";

const { embedding, usage, response } = await embed({
  model: "openai/text-embedding-3-small",
  value: "día soleado en la playa",
  maxRetries: 2,                        // default: 2
  abortSignal: AbortSignal.timeout(5000), // timeout de 5s
  headers: { "X-Custom-Header": "valor" },
  providerOptions: {
    openai: { dimensions: 512 },        // reducir dimensiones
  },
});

console.log(embedding);  // number[] — vector de embedding
console.log(usage);      // { tokens: 8 }
```

### Embedding múltiple (batch)

```typescript
import { embedMany } from "ai";

const { embeddings, usage } = await embedMany({
  model: "openai/text-embedding-3-small",
  values: [
    "día soleado en la playa",
    "tarde lluviosa en la ciudad",
    "noche nevada en la montaña",
  ],
  maxParallelCalls: 3,  // controla paralelismo
});

// embeddings es number[][] — mismo orden que values
```

### Similitud coseno

```typescript
import { cosineSimilarity, embedMany } from "ai";

const { embeddings } = await embedMany({
  model: "openai/text-embedding-3-small",
  values: ["perro", "gato", "automóvil"],
});

// Valor entre -1 (opuestos) y 1 (idénticos)
const sim1 = cosineSimilarity(embeddings[0], embeddings[1]); // ~0.85 (similares)
const sim2 = cosineSimilarity(embeddings[0], embeddings[2]); // ~0.3 (menos similares)
```

### Modelos de embedding disponibles

| Proveedor | Modelo | Dimensiones |
|---|---|---:|
| OpenAI | `text-embedding-3-large` | 3072 |
| OpenAI | `text-embedding-3-small` | 1536 |
| OpenAI | `text-embedding-ada-002` | 1536 |
| Google | `gemini-embedding-001` | 3072 |
| Google | `text-embedding-004` | 768 |
| Mistral | `mistral-embed` | 1024 |
| Cohere | `embed-english-v3.0` | 1024 |
| Cohere | `embed-multilingual-v3.0` | 1024 |
| Cohere | `embed-english-light-v3.0` | 384 |
| Amazon Bedrock | `amazon.titan-embed-text-v1` | 1536 |
| Amazon Bedrock | `amazon.titan-embed-text-v2:0` | 1024 |

### Embedding Middleware

```typescript
import { defaultEmbeddingSettingsMiddleware, wrapEmbeddingModel, gateway } from "ai";

const embeddingModelWithDefaults = wrapEmbeddingModel({
  model: gateway.embeddingModel("google/gemini-embedding-001"),
  middleware: defaultEmbeddingSettingsMiddleware({
    settings: {
      providerOptions: {
        google: {
          outputDimensionality: 256,
          taskType: "CLASSIFICATION",
        },
      },
    },
  }),
});
```

---

## 9. AI SDK Core — Settings (Parámetros)

Todos los parámetros comunes disponibles en `generateText`, `streamText`, y funciones relacionadas:

```typescript
const result = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  prompt: "...",

  // ── GENERACIÓN ──────────────────────────────────────────────────────────────
  maxOutputTokens: 1000,        // Máximo de tokens a generar
  temperature: 0.7,             // Aleatoriedad: 0 = determinista, >1 = más creativo
                                // NOTA: En v5+, ya NO tiene default de 0
  topP: 0.9,                   // Nucleus sampling: considera tokens con prob. acumulada ≤ topP
                                // Usar temperature O topP, no ambos
  topK: 40,                    // Solo considera los top-K tokens más probables
                                // Solo para uso avanzado
  presencePenalty: 0.5,        // Penaliza repetir temas ya mencionados (0 = sin penalidad)
  frequencyPenalty: 0.3,       // Penaliza repetir palabras ya usadas frecuentemente
  stopSequences: ["DONE", "\n\n"], // Detiene generación si aparece alguna de estas
  seed: 42,                    // Seed para reproducibilidad (si el modelo lo soporta)

  // ── RETRIES Y TIMEOUT ───────────────────────────────────────────────────────
  maxRetries: 3,               // Máximo de reintentos en error (default: 2, 0 = deshabilita)

  abortSignal: AbortSignal.timeout(10000), // Cancela después de 10s

  timeout: 30000,              // Timeout simple en ms
  // O timeout con desglose:
  timeout: {
    totalMs: 60000,            // Total para toda la operación
    stepMs: 10000,             // Por cada step (solo multi-step)
    chunkMs: 5000,             // Entre chunks (solo streamText)
  },

  // ── MULTI-STEP / AGENTES ────────────────────────────────────────────────────
  stopWhen: stepCountIs(10),   // Condición de parada del agent loop
  // stopWhen: [stepCountIs(10), hasToolCall('finalizarTarea')],

  toolChoice: "auto",          // 'auto' | 'required' | 'none'
  // toolChoice: { type: 'tool', toolName: 'miTool' }, // fuerza tool específica

  activeTools: ["tool1", "tool2"], // limita qué tools están disponibles

  // ── HTTP ─────────────────────────────────────────────────────────────────────
  headers: {
    "Prompt-Id": "mi-prompt-123",
    "X-Custom-Header": "valor",
  },

  // ── PROVIDER-SPECIFIC ────────────────────────────────────────────────────────
  providerOptions: {
    anthropic: {
      thinking: { type: "enabled", budgetTokens: 10000 }, // extended thinking
    },
    openai: {
      store: true,      // guardar en OpenAI
      reasoningEffort: "high",
    },
  },

  // ── TELEMETRÍA ───────────────────────────────────────────────────────────────
  experimental_telemetry: {
    isEnabled: true,
    functionId: "generar-respuesta",
    metadata: {
      userId: "user-123",
      sessionId: "session-abc",
    },
  },
});
```

---

## 10. AI SDK Core — Error Handling

### Errores regulares (try/catch)

```typescript
import { generateText } from "ai";

try {
  const { text } = await generateText({
    model: "anthropic/claude-sonnet-4-5",
    prompt: "...",
  });
} catch (error) {
  console.error("Error:", error.message);
}
```

### Errores en streaming (simple)

```typescript
import { streamText } from "ai";

try {
  const { textStream } = streamText({
    model: "anthropic/claude-sonnet-4-5",
    prompt: "...",
  });

  for await (const textPart of textStream) {
    process.stdout.write(textPart);
  }
} catch (error) {
  console.error("Error en stream:", error);
}
```

### Errores en fullStream (con soporte de error chunks)

```typescript
import { streamText } from "ai";

try {
  const { fullStream } = streamText({
    model: "anthropic/claude-sonnet-4-5",
    prompt: "...",
  });

  for await (const part of fullStream) {
    switch (part.type) {
      case "text":
        process.stdout.write(part.text);
        break;
      case "error":
        console.error("Error en stream:", part.error);
        break;
      case "abort":
        console.log("Stream abortado");
        break;
      case "tool-error":
        console.error("Error en tool:", part.error);
        break;
    }
  }
} catch (error) {
  console.error("Error fuera del stream:", error);
}
```

### Tipos de error específicos

```typescript
import {
  APICallError,           // Error en llamada a la API del proveedor
  InvalidResponseDataError, // Respuesta inválida del proveedor
  RetryError,             // Se agotaron los reintentos
  NoObjectGeneratedError, // No se pudo generar el objeto estructurado
  LoadAPIKeyError,        // No se encontró la API key
  InvalidArgumentError,   // Argumento inválido
} from "ai";

try {
  await generateText({ model, prompt });
} catch (error) {
  if (APICallError.isInstance(error)) {
    console.error("Error API:", error.statusCode, error.message);
    console.error("Response body:", error.responseBody);
  } else if (RetryError.isInstance(error)) {
    console.error("Reintentos agotados:", error.message);
  } else if (NoObjectGeneratedError.isInstance(error)) {
    console.error("No se generó objeto:", error.cause);
  }
}
```

---

## 11. AI SDK Core — Language Model Middleware

Permite interceptar y modificar llamadas al modelo. Casos de uso: guardrails, RAG, caching, logging.

### Uso básico

```typescript
import { wrapLanguageModel, streamText } from "ai";

const wrappedModel = wrapLanguageModel({
  model: tuModelo,
  middleware: tuMiddleware,
  // O múltiples: middleware: [middlewareA, middlewareB]
  // Se aplican en orden: middlewareA(middlewareB(tuModelo))
});

const result = streamText({
  model: wrappedModel, // se usa igual que cualquier modelo
  prompt: "...",
});
```

### Built-in Middlewares

#### `extractReasoningMiddleware` — Extraer razonamiento (thinking tags)

```typescript
import { wrapLanguageModel, extractReasoningMiddleware } from "ai";

const model = wrapLanguageModel({
  model: tuModelo, // ej: DeepSeek R1 que usa <think>...</think>
  middleware: extractReasoningMiddleware({
    tagName: "think",           // tag que contiene el razonamiento
    startWithReasoning: false,  // true = prepende el tag al inicio
  }),
});

const result = await generateText({ model, prompt: "..." });
console.log(result.reasoning); // texto de razonamiento extraído
console.log(result.text);      // texto sin el tag de razonamiento
```

#### `extractJsonMiddleware` — Limpiar code fences de JSON

```typescript
import { wrapLanguageModel, extractJsonMiddleware, Output, generateText } from "ai";
import { z } from "zod";

// Para modelos que envuelven JSON en ```json...```
const model = wrapLanguageModel({
  model: tuModelo,
  middleware: extractJsonMiddleware(),
  // O con transformación custom:
  // middleware: extractJsonMiddleware({
  //   transform: text => text.replace(/^PREFIX/, '').replace(/SUFFIX$/, ''),
  // }),
});

const result = await generateText({
  model,
  output: Output.object({ schema: z.object({ nombre: z.string() }) }),
  prompt: "...",
});
```

#### `simulateStreamingMiddleware` — Simular streaming

```typescript
import { wrapLanguageModel, simulateStreamingMiddleware } from "ai";

// Para modelos que no soportan streaming pero quieres interfaz consistente
const model = wrapLanguageModel({
  model: tuModelo,
  middleware: simulateStreamingMiddleware(),
});
```

#### `defaultSettingsMiddleware` — Aplicar settings por defecto

```typescript
import { wrapLanguageModel, defaultSettingsMiddleware } from "ai";

const model = wrapLanguageModel({
  model: tuModelo,
  middleware: defaultSettingsMiddleware({
    settings: {
      temperature: 0.5,
      maxOutputTokens: 800,
      providerOptions: { openai: { store: false } },
    },
  }),
});
```

#### `addToolInputExamplesMiddleware` — Añadir ejemplos al description

```typescript
import { wrapLanguageModel, addToolInputExamplesMiddleware } from "ai";

// Para proveedores que no soportan inputExamples nativamente
const model = wrapLanguageModel({
  model: tuModelo,
  middleware: addToolInputExamplesMiddleware({
    prefix: "Ejemplos de entrada:",
    format: (example, index) => `${index + 1}. ${JSON.stringify(example.input)}`,
    remove: true,  // elimina inputExamples del tool después de procesarlos
  }),
});
```

### Implementar middleware personalizado

```typescript
import type { LanguageModelV3Middleware } from "@ai-sdk/provider";

// Middleware de logging
const loggingMiddleware: LanguageModelV3Middleware = {
  // Transforma params antes de llamar al modelo (genera Y stream)
  transformParams: async ({ params }) => {
    console.log("Prompt enviado al modelo:", params.prompt);
    return params;
  },

  // Envuelve doGenerate
  wrapGenerate: async ({ doGenerate, params }) => {
    console.log("Iniciando generateText...");
    const result = await doGenerate();
    console.log("Texto generado:", result.text);
    return result;
  },

  // Envuelve doStream
  wrapStream: async ({ doStream, params }) => {
    console.log("Iniciando streamText...");
    const result = await doStream();
    return result;
  },
};

const model = wrapLanguageModel({
  model: tuModelo,
  middleware: loggingMiddleware,
});
```

---

## 12. AI SDK Core — MCP (Model Context Protocol)

Conecta tu aplicación a servidores MCP para acceder a sus herramientas, recursos y prompts.

### Crear cliente MCP

```typescript
import { createMCPClient } from "@ai-sdk/mcp";

// ── HTTP Transport (RECOMENDADO para producción) ──
const mcpClient = await createMCPClient({
  transport: {
    type: "http",
    url: "https://tu-servidor.com/mcp",
    headers: { Authorization: "Bearer mi-api-key" },
    authProvider: miOAuthClientProvider, // opcional
  },
});

// ── SSE Transport ──
const mcpClientSSE = await createMCPClient({
  transport: {
    type: "sse",
    url: "https://mi-servidor.com/sse",
    headers: { Authorization: "Bearer mi-api-key" },
  },
});

// ── Stdio Transport (SOLO LOCAL, no usar en producción) ──
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const mcpClientLocal = await createMCPClient({
  transport: new StdioClientTransport({
    command: "node",
    args: ["src/servidor-mcp.js"],
  }),
});
```

### Usar herramientas MCP

```typescript
// Schema Discovery (automático, sin tipos)
const tools = await mcpClient.tools();

// Schema Definition (explícito, con tipos completos)
import { z } from "zod";

const toolsTyped = await mcpClient.tools({
  schemas: {
    "get-weather": {
      inputSchema: z.object({
        location: z.string().describe("Ciudad"),
        unit: z.enum(["celsius", "fahrenheit"]).optional(),
      }),
      outputSchema: z.object({       // opcional — para typed outputs
        temperature: z.number(),
        conditions: z.string(),
        humidity: z.number(),
      }),
    },
    "tool-sin-args": {
      inputSchema: z.object({}),
    },
  },
});

// Usar las tools con generateText o streamText
const result = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  tools: toolsTyped,
  prompt: "¿Cuál es el clima en Bogotá?",
  stopWhen: stepCountIs(5),
  onFinish: async () => {
    await mcpClient.close(); // cerrar el cliente cuando termina
  },
});
```

### Usar recursos MCP

```typescript
// Listar recursos disponibles
const resources = await mcpClient.listResources();

// Leer contenido de un recurso
const resourceData = await mcpClient.readResource({
  uri: "file:///example/document.txt",
});

// Listar templates de recursos
const templates = await mcpClient.listResourceTemplates();
```

### Usar prompts MCP

```typescript
// Listar prompts disponibles
const prompts = await mcpClient.experimental_listPrompts();

// Obtener un prompt con argumentos
const prompt = await mcpClient.experimental_getPrompt({
  name: "code_review",
  arguments: { code: "function add(a, b) { return a + b; }" },
});
```

### Cerrar el cliente MCP correctamente

```typescript
// En streaming: usar onFinish
const result = await streamText({
  model,
  tools: await mcpClient.tools(),
  prompt: "...",
  onFinish: async () => {
    await mcpClient.close();
  },
});

// En generateText: usar try/finally
let mcpClient;
try {
  mcpClient = await createMCPClient({ /* ... */ });
  const result = await generateText({
    model,
    tools: await mcpClient.tools(),
    prompt: "...",
  });
} finally {
  await mcpClient?.close();
}
```

---

## 13. Agentes — ToolLoopAgent

`ToolLoopAgent` es la clase oficial para encapsular la configuración de un agente (modelo, instrucciones, herramientas, comportamiento) en un componente reutilizable.

### Crear un agente

```typescript
import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { z } from "zod";

const miAgente = new ToolLoopAgent({
  // ── MODELO ───────────────────────────────────────────────────────────────────
  model: "anthropic/claude-sonnet-4-5",

  // ── INSTRUCCIONES DEL SISTEMA ─────────────────────────────────────────────────
  instructions: `Eres un asistente de soporte al cliente para una empresa de e-commerce.

Reglas:
- Nunca prometas reembolsos sin verificar la política
- Sé siempre empático y profesional
- Si no sabes algo, dilo y ofrece escalar
- Mantén respuestas concisas y accionables
- Nunca compartas información interna de la empresa`,

  // ── HERRAMIENTAS ──────────────────────────────────────────────────────────────
  tools: {
    verificarOrden: tool({
      description: "Verifica el estado de una orden",
      inputSchema: z.object({
        orderId: z.string(),
      }),
      execute: async ({ orderId }) => {
        return { estado: "enviado", tracking: "ABC123" };
      },
    }),
    crearTicket: tool({
      description: "Crea un ticket de soporte",
      inputSchema: z.object({
        motivo: z.string(),
        prioridad: z.enum(["baja", "media", "alta"]),
      }),
      execute: async ({ motivo, prioridad }) => {
        return { ticketId: "TKT-456", creado: true };
      },
    }),
  },

  // ── CONTROL DEL LOOP ─────────────────────────────────────────────────────────
  stopWhen: stepCountIs(20),  // default: 20 steps

  // ── TOOL CHOICE ──────────────────────────────────────────────────────────────
  toolChoice: "auto",  // 'auto' | 'required' | 'none'
  // toolChoice: { type: 'tool', toolName: 'verificarOrden' },

  // ── OUTPUT ESTRUCTURADO ───────────────────────────────────────────────────────
  // output: Output.object({ schema: z.object({ ... }) }),

  // ── CALLBACKS GLOBALES ────────────────────────────────────────────────────────
  onStepFinish: async ({ stepNumber, usage }) => {
    console.log(`Step ${stepNumber} completado. Tokens: ${usage.totalTokens}`);
  },
});
```

### Usar el agente — generate()

```typescript
const result = await miAgente.generate({
  prompt: "¿En qué estado está mi orden #12345?",
  // O con historial:
  messages: [
    { role: "user", content: "..." },
    { role: "assistant", content: "..." },
    { role: "user", content: "¿Y la orden #67890?" },
  ],
});

console.log(result.text);         // respuesta final
console.log(result.steps);        // todos los steps
console.log(result.totalUsage);   // uso total de tokens
```

### Usar el agente — stream()

```typescript
const result = await miAgente.stream({
  prompt: "Explica nuestra política de devoluciones",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### Usar el agente en un API Route (Next.js)

```typescript
// app/api/chat/route.ts
import { createAgentUIStreamResponse } from "ai";
import { miAgente } from "@/lib/agent";

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: miAgente,
    uiMessages: messages,
  });
}
```

### Lifecycle callbacks en generate/stream

```typescript
const result = await miAgente.generate({
  prompt: "Investiga y resume las tendencias de IA",

  experimental_onStart({ model, functionId }) {
    console.log("Agente iniciado", { model: model.modelId });
  },

  experimental_onStepStart({ stepNumber, model }) {
    console.log(`Step ${stepNumber} iniciando`);
  },

  experimental_onToolCallStart({ toolCall }) {
    console.log(`Tool: ${toolCall.toolName}`, toolCall.input);
  },

  experimental_onToolCallFinish({ toolCall, durationMs, success, error }) {
    if (!success) console.error(`Tool fallida: ${toolCall.toolName}`, error);
    else console.log(`Tool OK: ${toolCall.toolName} (${durationMs}ms)`);
  },

  onStepFinish({ stepNumber, usage, finishReason, toolCalls }) {
    console.log(`Step ${stepNumber}:`, {
      tokens: usage.totalTokens,
      finishReason,
      tools: toolCalls?.map(tc => tc.toolName),
    });
  },

  onFinish({ totalUsage, steps }) {
    console.log(`Agente terminado: ${steps.length} steps, ${totalUsage.totalTokens} tokens`);
  },
});
```

### Type safety end-to-end

```typescript
import { ToolLoopAgent, InferAgentUIMessage } from "ai";

const myAgent = new ToolLoopAgent({ /* ... */ });

// Inferir el tipo de UIMessage del agente
export type MyAgentUIMessage = InferAgentUIMessage<typeof myAgent>;

// Usar en componente React con useChat
import { useChat } from "@ai-sdk/react";
import type { MyAgentUIMessage } from "@/agent/my-agent";

export function Chat() {
  const { messages } = useChat<MyAgentUIMessage>();
  // Full type safety para messages y tools
}
```

---

## 14. Agentes — Loop Control y stopWhen

El loop del agente continúa hasta que:
1. El modelo retorna texto (sin tool calls) → `finishReason !== 'tool-calls'`
2. Una tool invocada no tiene función `execute`
3. Una tool call necesita aprobación
4. Se cumple una condición `stopWhen`

### Built-in stop conditions

```typescript
import { stepCountIs, hasToolCall } from "ai";

// Parar después de N steps (default de ToolLoopAgent: 20)
stopWhen: stepCountIs(20)

// Parar cuando se llame una tool específica
stopWhen: hasToolCall("finalizarTarea")

// Múltiples condiciones (para cuando se cumpla cualquiera)
stopWhen: [stepCountIs(20), hasToolCall("done")]
```

### Custom stop conditions

```typescript
import { type StopCondition, type ToolSet } from "ai";

const tools = { /* tus tools */ } satisfies ToolSet;

// Parar cuando el texto contiene "RESPUESTA:"
const tieneRespuesta: StopCondition<typeof tools> = ({ steps }) => {
  return steps.some(step => step.text?.includes("RESPUESTA:")) ?? false;
};

// Parar si el costo estimado supera $0.50
const presupuestoAgotado: StopCondition<typeof tools> = ({ steps }) => {
  const totalUsage = steps.reduce(
    (acc, step) => ({
      inputTokens: acc.inputTokens + (step.usage?.inputTokens ?? 0),
      outputTokens: acc.outputTokens + (step.usage?.outputTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0 }
  );
  const costoEstimado =
    (totalUsage.inputTokens * 0.01 + totalUsage.outputTokens * 0.03) / 1000;
  return costoEstimado > 0.5;
};

const agent = new ToolLoopAgent({
  model: "anthropic/claude-sonnet-4-5",
  tools,
  stopWhen: [stepCountIs(20), tieneRespuesta, presupuestoAgotado],
});
```

---

## 15. Agentes — prepareStep (control por paso)

`prepareStep` se ejecuta antes de cada step del loop, permitiendo modificar modelo, tools, mensajes y más.

```typescript
const agent = new ToolLoopAgent({
  model: "openai/gpt-4o-mini",
  tools: {
    buscar: searchTool,
    analizar: analyzeTool,
    resumir: summarizeTool,
  },
  prepareStep: async ({ model, stepNumber, steps, messages }) => {
    // ── Cambiar modelo según el step ────────────────────────────────────────────
    if (stepNumber > 2 && messages.length > 10) {
      return { model: "anthropic/claude-sonnet-4-5" }; // modelo más potente
    }

    // ── Limitar contexto (evitar token overflow en loops largos) ────────────────
    if (messages.length > 20) {
      return {
        messages: [
          messages[0],          // conservar system prompt
          ...messages.slice(-10), // últimos 10 mensajes
        ],
      };
    }

    // ── Fases de herramientas según el step ────────────────────────────────────
    if (stepNumber <= 2) {
      return {
        activeTools: ["buscar"],
        toolChoice: "required",
      };
    }
    if (stepNumber <= 5) {
      return {
        activeTools: ["analizar"],
      };
    }
    // Step 6+: resumir
    return {
      activeTools: ["resumir"],
      toolChoice: "required",
    };

    // ── Forzar una tool específica ──────────────────────────────────────────────
    if (stepNumber === 0) {
      return {
        toolChoice: { type: "tool", toolName: "buscar" },
      };
    }

    // ── Modificar mensajes (comprimir tool results) ────────────────────────────
    const processedMessages = messages.map(msg => {
      if (msg.role === "tool" && JSON.stringify(msg.content).length > 2000) {
        return { ...msg, content: comprimirResultado(msg.content) };
      }
      return msg;
    });
    return { messages: processedMessages };

    // ── Sin cambios ────────────────────────────────────────────────────────────
    return {};
  },
});
```

---

## 16. Agentes — Manual Loop (control total)

Para máximo control sobre el loop del agente, sin usar `ToolLoopAgent` ni `stopWhen`.

```typescript
import { generateText, type ModelMessage } from "ai";

const messages: ModelMessage[] = [
  { role: "user", content: "Investiga el mercado de IA en 2025" },
];

let step = 0;
const maxSteps = 10;

while (step < maxSteps) {
  const result = await generateText({
    model: "anthropic/claude-sonnet-4-5",
    messages,
    tools: {
      buscarWeb: searchTool,
      analizarDatos: analyzeTool,
    },
  });

  // Agregar respuesta al historial
  messages.push(...result.response.messages);

  // Verificar condición de parada
  if (result.finishReason === "stop") {
    console.log("Respuesta final:", result.text);
    break;
  }

  // Verificar si una tool específica fue llamada
  const toolsLlamadas = result.toolCalls.map(tc => tc.toolName);
  if (toolsLlamadas.includes("finalizarInvestigacion")) {
    break;
  }

  step++;
}

if (step >= maxSteps) {
  console.warn("Se alcanzó el máximo de steps sin finalizar.");
}
```

---

## 17. Agentes — Workflow Patterns

### Chaining (cadena secuencial)

```typescript
// Paso 1: Extraer información
const { output: datos } = await generateText({
  model: "openai/gpt-4o",
  output: Output.object({
    schema: z.object({
      temas: z.array(z.string()),
      entidades: z.array(z.string()),
    }),
  }),
  prompt: `Extrae temas y entidades de: ${documento}`,
});

// Paso 2: Usar los datos del paso anterior
const { text: resumen } = await generateText({
  model: "openai/gpt-4o",
  prompt: `Genera un resumen sobre los temas: ${datos.temas.join(", ")} 
           y las entidades: ${datos.entidades.join(", ")}`,
});

// Paso 3: Revisar y mejorar
const { text: final } = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  prompt: `Revisa y mejora este texto, verificando que mencione todas las entidades: 
           ${resumen}`,
});
```

### Routing (enrutamiento)

```typescript
// Clasificar la intención del usuario
const { output: ruta } = await generateText({
  model: "openai/gpt-4o",
  output: Output.choice({
    options: ["soporte_tecnico", "ventas", "reclamos", "informacion_general"],
  }),
  prompt: `Clasifica esta solicitud: "${mensajeUsuario}"`,
});

// Enrutar al agente adecuado
switch (ruta) {
  case "soporte_tecnico":
    return await agenteSoporteTecnico.generate({ prompt: mensajeUsuario });
  case "ventas":
    return await agenteVentas.generate({ prompt: mensajeUsuario });
  case "reclamos":
    return await agenteReclamos.generate({ prompt: mensajeUsuario });
  default:
    return await agenteGeneral.generate({ prompt: mensajeUsuario });
}
```

### Paralelización

```typescript
// Ejecutar múltiples tareas en paralelo
const [analisisTecnico, analisisNegocio, analisisRiesgos] = await Promise.all([
  generateText({
    model: "openai/gpt-4o",
    prompt: `Analiza aspectos técnicos de: ${propuesta}`,
  }),
  generateText({
    model: "openai/gpt-4o",
    prompt: `Analiza impacto de negocio de: ${propuesta}`,
  }),
  generateText({
    model: "openai/gpt-4o",
    prompt: `Analiza riesgos de: ${propuesta}`,
  }),
]);

// Combinar resultados
const { text: reporte } = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  prompt: `Genera un reporte ejecutivo combinando:
    Análisis técnico: ${analisisTecnico.text}
    Análisis de negocio: ${analisisTecnico.text}
    Análisis de riesgos: ${analisisRiesgos.text}`,
});
```

### Orchestrator-Worker Pattern

```typescript
// Orchestrador que delega a workers especializados
const orchestradorTool = tool({
  description: "Delega una tarea a un worker especializado.",
  inputSchema: z.object({
    tipo: z.enum(["legal", "financiero", "tecnico"]),
    tarea: z.string(),
  }),
  execute: async ({ tipo, tarea }) => {
    const worker = {
      legal: agenteJuridico,
      financiero: agenteFinanciero,
      tecnico: agenteTecnico,
    }[tipo];

    const result = await worker.generate({ prompt: tarea });
    return { resultado: result.text };
  },
});

const orchestrador = new ToolLoopAgent({
  model: "anthropic/claude-sonnet-4-5",
  instructions: "Eres un coordinador. Delega tareas a especialistas según su naturaleza.",
  tools: { delegarTarea: orchestradorTool },
  stopWhen: stepCountIs(15),
});
```

### Map-Reduce

```typescript
// MAP: procesar cada documento en paralelo
const analisis = await Promise.all(
  documentos.map(doc =>
    generateText({
      model: "openai/gpt-4o",
      output: Output.object({
        schema: z.object({
          sentimiento: z.enum(["positivo", "neutral", "negativo"]),
          puntosClave: z.array(z.string()),
          score: z.number().min(0).max(10),
        }),
      }),
      prompt: `Analiza este feedback: ${doc}`,
    })
  )
);

// REDUCE: consolidar en un reporte
const { output: reporteConsolidado } = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  output: Output.object({
    schema: z.object({
      sentimientoGeneral: z.string(),
      temasRecurrentes: z.array(z.string()),
      scorePromedio: z.number(),
      recomendaciones: z.array(z.string()),
    }),
  }),
  prompt: `Consolida estos ${analisis.length} análisis: ${JSON.stringify(analisis.map(a => a.output))}`,
});
```

---

## 18. Agentes — Memoria

### Memoria en ventana de contexto (corto plazo)

```typescript
import { type ModelMessage } from "ai";

const historial: ModelMessage[] = [];

async function chatConMemoria(mensajeUsuario: string): Promise<string> {
  historial.push({ role: "user", content: mensajeUsuario });

  const { text, response } = await generateText({
    model: "anthropic/claude-sonnet-4-5",
    system: "Eres un asistente útil que recuerda el contexto de la conversación.",
    messages: historial,
  });

  // Agregar respuesta al historial
  historial.push(...response.messages);

  return text;
}

// Uso
await chatConMemoria("Mi nombre es Agustín");
await chatConMemoria("¿Cuál es mi nombre?"); // Recuerda "Agustín"
```

### Memoria externa (largo plazo con embeddings)

```typescript
import { embed, generateText } from "ai";
import { cosineSimilarity } from "ai";

// Estructura para almacenar memorias
interface Memoria {
  contenido: string;
  embedding: number[];
  timestamp: Date;
}

const memorias: Memoria[] = [];

// Guardar una memoria
async function guardarMemoria(contenido: string) {
  const { embedding } = await embed({
    model: "openai/text-embedding-3-small",
    value: contenido,
  });
  memorias.push({ contenido, embedding, timestamp: new Date() });
}

// Recuperar memorias relevantes
async function recuperarMemorias(consulta: string, topK = 3): Promise<string[]> {
  const { embedding: consultaEmbedding } = await embed({
    model: "openai/text-embedding-3-small",
    value: consulta,
  });

  return memorias
    .map(m => ({
      memoria: m,
      similitud: cosineSimilarity(consultaEmbedding, m.embedding),
    }))
    .sort((a, b) => b.similitud - a.similitud)
    .slice(0, topK)
    .map(m => m.memoria.contenido);
}

// Responder con contexto de memorias externas
async function responderConMemoria(pregunta: string): Promise<string> {
  const memoriasRelevantes = await recuperarMemorias(pregunta);

  const { text } = await generateText({
    model: "anthropic/claude-sonnet-4-5",
    system: `Eres un asistente con memoria.
Usa el siguiente contexto de memorias para responder:
${memoriasRelevantes.join("\n")}`,
    prompt: pregunta,
  });

  return text;
}
```

### Comprimir historial largo (context window management)

```typescript
import { type ModelMessage, generateText } from "ai";

async function comprimirHistorial(messages: ModelMessage[]): Promise<ModelMessage[]> {
  if (messages.length <= 10) return messages; // no comprimir si es corto

  // Comprimir mensajes viejos
  const mensajesViejos = messages.slice(0, -6);
  const mensajesRecientes = messages.slice(-6);

  const { text: resumen } = await generateText({
    model: "openai/gpt-4o-mini", // modelo barato para resúmenes
    prompt: `Resume esta conversación en 2-3 oraciones:
${mensajesViejos.map(m => `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`).join("\n")}`,
  });

  return [
    { role: "user", content: `[Resumen de conversación previa]: ${resumen}` },
    { role: "assistant", content: "Entendido, continuemos." },
    ...mensajesRecientes,
  ];
}
```

---

## 19. Agentes — Subagentes

### Subagente como tool

```typescript
import { tool, ToolLoopAgent, stepCountIs } from "ai";
import { z } from "zod";

// Definir agentes especializados
const agenteJuridico = new ToolLoopAgent({
  model: "anthropic/claude-sonnet-4-5",
  instructions: "Eres un experto en derecho colombiano especializado en derecho comercial.",
  stopWhen: stepCountIs(5),
});

const agenteFinanciero = new ToolLoopAgent({
  model: "openai/gpt-4o",
  instructions: "Eres un analista financiero experto en valoración de empresas.",
  stopWhen: stepCountIs(5),
});

// Crear tools que invocan los subagentes
const consultarJuridico = tool({
  description: "Consulta al agente legal para preguntas jurídicas.",
  inputSchema: z.object({
    consulta: z.string(),
  }),
  execute: async ({ consulta }) => {
    const { text } = await agenteJuridico.generate({ prompt: consulta });
    return { respuesta: text };
  },
});

const consultarFinanciero = tool({
  description: "Consulta al agente financiero para análisis económicos.",
  inputSchema: z.object({
    consulta: z.string(),
  }),
  execute: async ({ consulta }) => {
    const { text } = await agenteFinanciero.generate({ prompt: consulta });
    return { respuesta: text };
  },
});

// Agente orquestador
const orquestador = new ToolLoopAgent({
  model: "anthropic/claude-sonnet-4-5",
  instructions: `Eres un coordinador empresarial que delega preguntas a especialistas.
Identifica si la pregunta es jurídica o financiera y delega al experto correspondiente.`,
  tools: { consultarJuridico, consultarFinanciero },
  stopWhen: stepCountIs(10),
});

const result = await orquestador.generate({
  prompt: "¿Qué consideraciones legales y financieras debo tener para constituir una SAS en Colombia?",
});
```

---

## 20. AI SDK UI — useChat Hook

### Configuración completa

```typescript
"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const {
  // Estado
  messages,          // UIMessage[] — historial completo de mensajes
  status,            // 'submitted' | 'streaming' | 'ready' | 'error'
  error,             // Error | undefined
  isLoading,         // boolean (deprecated, usar status)

  // Acciones
  sendMessage,       // (message: { text: string, files?: File[] }) => void
  stop,              // () => void — detiene el streaming actual
  regenerate,        // () => void — regenera el último mensaje
  setMessages,       // (messages: UIMessage[]) => void — modifica mensajes directamente

  // Input (si usas handleInputChange/handleSubmit)
  input,
  setInput,
  handleInputChange,
  handleSubmit,
} = useChat({
  // Transport
  transport: new DefaultChatTransport({
    api: "/api/chat",             // endpoint (default)
    headers: {
      Authorization: "Bearer token",
    },
    body: {
      userId: "123",              // datos extra enviados en cada request
    },
    credentials: "same-origin",
    // O dinámico:
    // headers: async () => ({ Authorization: await getToken() }),
  }),

  // Configuración inicial
  id: "chat-session-1",           // ID de la conversación
  initialMessages: [],            // mensajes iniciales
  initialInput: "",               // texto inicial en el input

  // Rendimiento
  experimental_throttle: 50,      // throttle de re-renders en ms (solo React)

  // Callbacks
  onFinish: ({ message, messages, isAbort, isDisconnect, isError }) => {
    // Guardar historial, analytics, etc.
    if (isAbort) console.log("Stream abortado");
  },
  onError: (error) => {
    console.error("Error en chat:", error);
  },
  onData: (data) => {
    console.log("Data recibida del server:", data);
  },
});
```

### Ejemplo completo de UI

```tsx
"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

export default function ChatPage() {
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onFinish: ({ message }) => {
      console.log("Mensaje final:", message);
    },
  });
  const [input, setInput] = useState("");

  return (
    <div>
      {/* Mensajes */}
      {messages.map(message => (
        <div key={message.id}>
          <strong>{message.role === "user" ? "Tú" : "IA"}:</strong>
          {message.parts.map((part, index) => {
            switch (part.type) {
              case "text":
                return <p key={index}>{part.text}</p>;
              case "tool-invocation":
                return (
                  <p key={index} style={{ color: "gray" }}>
                    🔧 Usando herramienta: {part.toolName}
                  </p>
                );
              default:
                return null;
            }
          })}
        </div>
      ))}

      {/* Indicadores de estado */}
      {status === "submitted" && <div>Enviando...</div>}
      {status === "streaming" && (
        <button onClick={stop}>⏹ Detener</button>
      )}
      {error && (
        <div>
          <p style={{ color: "red" }}>Error: {error.message}</p>
          <button onClick={regenerate}>🔄 Reintentar</button>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={e => {
          e.preventDefault();
          if (input.trim() && status === "ready") {
            sendMessage({ text: input });
            setInput("");
          }
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={status !== "ready"}
          placeholder="Escribe tu mensaje..."
        />
        <button type="submit" disabled={status !== "ready"}>
          Enviar
        </button>
      </form>
    </div>
  );
}
```

### Manejo de `message.parts`

```tsx
{messages.map(message => (
  <div key={message.id}>
    {message.parts.map((part, index) => {
      switch (part.type) {
        case "text":
          return <p key={index}>{part.text}</p>;

        case "reasoning":
          return (
            <details key={index}>
              <summary>Ver razonamiento</summary>
              <p>{part.reasoning}</p>
            </details>
          );

        case "tool-invocation":
          return (
            <div key={index} style={{ background: "#f0f0f0", padding: 8 }}>
              <strong>🔧 {part.toolName}</strong>
              <pre>{JSON.stringify(part.args, null, 2)}</pre>
              {part.state === "result" && (
                <pre>{JSON.stringify(part.result, null, 2)}</pre>
              )}
            </div>
          );

        case "source":
          return (
            <a key={index} href={part.url}>
              Fuente: {part.title}
            </a>
          );

        case "image":
          return <img key={index} src={part.url} alt="Imagen generada" />;

        default:
          return null;
      }
    })}
  </div>
))}
```

---

## 21. AI SDK UI — Route Handler (Next.js)

### Básico

```typescript
// app/api/chat/route.ts
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: "anthropic/claude-sonnet-4-5",
    system: "Eres un asistente útil.",
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

### Con tools y body personalizado

```typescript
// app/api/chat/route.ts
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";

export const maxDuration = 60;

export async function POST(req: Request) {
  const {
    messages,
    userId,        // datos extras del body
    sessionId,
  }: {
    messages: UIMessage[];
    userId?: string;
    sessionId?: string;
  } = await req.json();

  const result = streamText({
    model: "anthropic/claude-sonnet-4-5",
    system: `Eres un asistente. ID de usuario: ${userId ?? "anónimo"}`,
    messages: await convertToModelMessages(messages),
    tools: {
      buscarProducto: tool({
        description: "Busca un producto en el catálogo",
        inputSchema: z.object({
          query: z.string(),
          categoria: z.string().optional(),
        }),
        execute: async ({ query, categoria }) => {
          // Tu lógica de búsqueda
          return { productos: [{ id: 1, nombre: "Laptop" }] };
        },
      }),
    },
    stopWhen: stepCountIs(5),
    onFinish: async ({ usage, totalUsage }) => {
      // Registrar uso para facturación
      console.log(`Usuario ${userId}: ${totalUsage.totalTokens} tokens`);
    },
  });

  return result.toUIMessageStreamResponse();
}
```

### Con ToolLoopAgent

```typescript
// app/api/chat/route.ts
import { createAgentUIStreamResponse } from "ai";
import { miAgente } from "@/lib/agent";

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: miAgente,
    uiMessages: messages,
  });
}
```

### Streaming de datos custom (Server → Client)

```typescript
// app/api/chat/route.ts
import { streamText, createDataStream } from "ai";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const dataStream = createDataStream({
    execute: async dataStreamWriter => {
      // Enviar datos custom al cliente durante el stream
      dataStreamWriter.writeData({ tipo: "estado", valor: "procesando" });

      const result = streamText({
        model: "openai/gpt-4o",
        messages,
        onChunk: () => {
          // Actualizar progreso
          dataStreamWriter.writeData({ tipo: "progreso", valor: Date.now() });
        },
      });

      result.mergeIntoDataStream(dataStreamWriter);
    },
  });

  return dataStream.toResponse();
}

// En el cliente:
const { messages, data } = useChat({ /* ... */ });
// data contiene los datos custom enviados por el servidor
```

---

## 22. AI SDK UI — useCompletion Hook

Para completions simples (no chat), como autocompletado o generación de texto individual.

```typescript
"use client";
import { useCompletion } from "@ai-sdk/react";
import { DefaultCompletionTransport } from "ai";

const {
  completion,        // string — texto generado hasta ahora
  input,             // string — valor del input
  setInput,          // setter del input
  handleInputChange, // handler para <input onChange>
  handleSubmit,      // handler para <form onSubmit>
  isLoading,         // boolean
  stop,              // detiene el streaming
  error,             // Error | undefined
  complete,          // función para completar programáticamente: complete(prompt)
  setCompletion,     // setter del completion
} = useCompletion({
  transport: new DefaultCompletionTransport({
    api: "/api/completion",
  }),
  onFinish: (prompt, completion) => {
    console.log("Completion finalizado:", completion);
  },
  onError: (error) => {
    console.error("Error:", error);
  },
});

// Route Handler para completion
// app/api/completion/route.ts
import { streamText } from "ai";
export async function POST(req: Request) {
  const { prompt } = await req.json();
  const result = streamText({
    model: "openai/gpt-4o",
    prompt,
  });
  return result.toTextStreamResponse();
}
```

---

## 23. AI SDK UI — useObject Hook

Para generar y recibir objetos JSON estructurados en streaming desde el cliente.

```typescript
"use client";
import { useObject } from "@ai-sdk/react";
import { z } from "zod";

const schema = z.object({
  noticia: z.object({
    titulo: z.string(),
    resumen: z.string(),
    categoria: z.enum(["tecnologia", "deportes", "cultura", "economia"]),
    puntosClave: z.array(z.string()),
  }),
});

const {
  object,      // Partial<z.infer<typeof schema>> — objeto parcial en streaming
  submit,      // (input: any) => void — iniciar generación
  isLoading,   // boolean
  error,       // Error | undefined
  stop,        // detiene el streaming
} = useObject({
  api: "/api/generate-object",
  schema,
});

// UI
return (
  <div>
    <button onClick={() => submit({ tema: "inteligencia artificial" })}>
      Generar noticia
    </button>
    {isLoading && <p>Generando...</p>}
    {object?.noticia && (
      <article>
        <h1>{object.noticia.titulo}</h1>
        <p>{object.noticia.resumen}</p>
        {object.noticia.puntosClave?.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </article>
    )}
  </div>
);

// Route Handler
// app/api/generate-object/route.ts
import { streamText, Output } from "ai";
import { z } from "zod";

export async function POST(req: Request) {
  const { tema } = await req.json();
  const { partialOutputStream } = streamText({
    model: "openai/gpt-4o",
    output: Output.object({ schema }),
    prompt: `Genera una noticia sobre: ${tema}`,
  });
  // ... o usar generateObject
}
```

---

## 24. Image Generation, Speech, Transcription

### Image Generation

```typescript
import { experimental_generateImage as generateImage } from "ai";

const { image } = await generateImage({
  model: "openai/dall-e-3",
  prompt: "Una ciudad futurista al atardecer, estilo cyberpunk",
  size: "1024x1024",   // '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792'
  n: 1,               // número de imágenes
});

// Usar la imagen
console.log(image.base64);     // Base64 string
console.log(image.uint8Array); // Uint8Array
```

### Transcription (Speech to Text)

```typescript
import { experimental_transcribe as transcribe } from "ai";
import { readFile } from "fs/promises";
import { openai } from "@ai-sdk/openai";

const audioBuffer = await readFile("audio.mp3");

const { text, segments, language, durationInSeconds } = await transcribe({
  model: openai.transcription("whisper-1"),
  audio: audioBuffer,
  providerOptions: {
    openai: {
      language: "es",            // idioma del audio
      prompt: "vocabulario técnico de IA",
    },
  },
});

console.log("Transcripción:", text);
console.log("Idioma detectado:", language);
console.log("Duración:", durationInSeconds, "segundos");
```

### Speech (Text to Speech)

```typescript
import { experimental_generateSpeech as generateSpeech } from "ai";
import { openai } from "@ai-sdk/openai";
import { writeFile } from "fs/promises";

const { audio } = await generateSpeech({
  model: openai.speech("tts-1"),
  text: "Hola, soy un asistente de inteligencia artificial.",
  voice: "nova",  // 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
  providerOptions: {
    openai: { speed: 1.0 },
  },
});

// Guardar como archivo
await writeFile("output.mp3", audio.uint8Array);
console.log("Audio generado:", audio.mimeType); // 'audio/mpeg'
```

---

## 25. Provider & Model Management

### Provider Registry

```typescript
import { experimental_createProviderRegistry as createProviderRegistry } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

const registry = createProviderRegistry({
  openai,
  anthropic,
  google,
  // Proveedor con prefijo personalizado:
  "mi-proveedor": openai,
});

// Usar modelos del registry: "proveedor:modelo"
const model = registry.languageModel("openai:gpt-4o");
const embeddingModel = registry.textEmbeddingModel("openai:text-embedding-3-small");

const { text } = await generateText({
  model: registry.languageModel("anthropic:claude-opus-4-5"),
  prompt: "...",
});
```

### Custom Provider

```typescript
import { customProvider } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

// Crear un provider con modelo personalizado (ej: fine-tuned)
const miProvider = customProvider({
  languageModels: {
    "mi-gpt-ftunado": openai("ft:gpt-4o-mini:org:modelo:abc123"),
    "mi-claude": anthropic("claude-opus-4-5"),
    "modelo-default": openai("gpt-4o"),
  },
  fallbackProvider: openai, // para otros modelos no mapeados
});

const { text } = await generateText({
  model: miProvider.languageModel("mi-gpt-ftunado"),
  prompt: "...",
});
```

---

## 26. Testing

```typescript
import { generateText, streamText } from "ai";
import {
  MockLanguageModelV1,
  simulateReadableStream,
} from "ai/test";

// Mock para generateText
const mockModel = new MockLanguageModelV1({
  doGenerate: async ({ prompt, messages }) => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: "stop",
    usage: { promptTokens: 10, completionTokens: 20 },
    text: "Respuesta simulada del modelo.",
    toolCalls: [],
    toolResults: [],
  }),
});

const { text } = await generateText({
  model: mockModel,
  prompt: "Prompt de prueba",
});
// text === "Respuesta simulada del modelo."

// Mock para streamText
const mockStreamModel = new MockLanguageModelV1({
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: "text-delta", textDelta: "Hola " },
        { type: "text-delta", textDelta: "mundo" },
        {
          type: "finish",
          finishReason: "stop",
          usage: { promptTokens: 5, completionTokens: 10 },
        },
      ],
    }),
    rawCall: { rawPrompt: null, rawSettings: {} },
  }),
});

const result = streamText({
  model: mockStreamModel,
  prompt: "...",
});

let texto = "";
for await (const chunk of result.textStream) {
  texto += chunk;
}
// texto === "Hola mundo"

// Mock con tool calls
const mockConTool = new MockLanguageModelV1({
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: "tool-calls",
    usage: { promptTokens: 20, completionTokens: 30 },
    text: "",
    toolCalls: [
      {
        toolCallType: "function",
        toolCallId: "call_1",
        toolName: "miTool",
        args: '{"param": "valor"}',
      },
    ],
  }),
});
```

---

## 27. Telemetría (OpenTelemetry)

```typescript
import { generateText } from "ai";

const { text } = await generateText({
  model: "anthropic/claude-sonnet-4-5",
  prompt: "...",
  experimental_telemetry: {
    isEnabled: true,
    functionId: "generar-respuesta-chat",  // identificador de la función
    metadata: {
      userId: "user-123",
      sessionId: "session-abc",
      conversationId: "conv-xyz",
      // cualquier metadata personalizada
    },
    tracer: tuOpenTelemetryTracer, // opcional — tracer personalizado
  },
});

// Setup de OpenTelemetry con @vercel/otel
// (en instrumentación de tu app)
import { registerOTel } from "@vercel/otel";

registerOTel({
  serviceName: "mi-app-ai",
});
```

---

## 28. Variables de Entorno y Configuración

```env
# ── VERCEL AI GATEWAY (recomendado, acceso unificado) ────────────────────────
AI_GATEWAY_API_KEY=vg-xxxxxxxxxxxxxxxxxxxx

# ── PROVIDERS ESPECÍFICOS (si no usas Gateway) ───────────────────────────────
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
GOOGLE_GENERATIVE_AI_API_KEY=xxxxxxxxxxxx
GOOGLE_VERTEX_AI_API_KEY=xxxxxxxxxxxx
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
MISTRAL_API_KEY=xxxxxxxxxxxxxxxxxxxx
COHERE_API_KEY=xxxxxxxxxxxxxxxxxxxx
DEEPSEEK_API_KEY=xxxxxxxxxxxxxxxxxxxx
XAI_API_KEY=xxxxxxxxxxxxxxxxxxxx
AZURE_OPENAI_API_KEY=xxxxxxxxxxxxxxxxxxxx
AZURE_OPENAI_ENDPOINT=https://turecurso.openai.azure.com/
AWS_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxx    # Amazon Bedrock
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1

# ── BASE DE DATOS (para persistencia/RAG) ────────────────────────────────────
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

---

## 29. Estructura de Proyecto Recomendada

```
mi-app/
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts         # Route Handler principal del chatbot
│   │   ├── completion/
│   │   │   └── route.ts         # Para useCompletion
│   │   └── generate-object/
│   │       └── route.ts         # Para useObject
│   └── page.tsx                 # UI con useChat
├── lib/
│   ├── ai/
│   │   ├── agents/
│   │   │   ├── index.ts         # Exportar agentes
│   │   │   ├── support-agent.ts # ToolLoopAgent de soporte
│   │   │   └── research-agent.ts
│   │   ├── tools/
│   │   │   ├── index.ts         # Exportar tools
│   │   │   ├── search.ts        # Tool de búsqueda
│   │   │   └── database.ts      # Tool de base de datos
│   │   ├── middleware/
│   │   │   └── logging.ts       # Middleware personalizado
│   │   └── embedding.ts         # Funciones de embedding/RAG
│   └── db/
│       ├── index.ts             # Conexión a DB
│       └── schema/
│           ├── conversations.ts
│           └── embeddings.ts    # Tabla para vectores
├── components/
│   └── chat.tsx                 # Componente de chat
└── .env.local                   # Variables de entorno
```

---

## 30. Herramientas de Terceros / Tool Packages

El AI SDK soporta instalar y usar paquetes de tools de npm:

```typescript
import { generateText, stepCountIs } from "ai";
import { searchTool } from "some-tool-package";

const { text } = await generateText({
  model: "anthropic/claude-haiku-4-5",
  prompt: "¿Cuándo fue Vercel Ship AI?",
  tools: { webSearch: searchTool },
  stopWhen: stepCountIs(10),
});
```

### Packages de tools disponibles en la comunidad

| Package | Descripción |
|---|---|
| `@exalabs/ai-sdk` | Búsqueda web con resultados en tiempo real |
| `@parallel-web/ai-sdk-tools` | Búsqueda y extracción web (Parallel Web API) |
| `@perplexity-ai/ai-sdk` | Búsqueda web con Perplexity |
| `@tavily/ai-sdk` | Búsqueda, crawl y extracción web enterprise |
| `@airweave/vercel-ai-sdk` | Búsqueda semántica en 35+ fuentes de datos |
| `Composio` | 250+ tools: GitHub, Gmail, Salesforce, etc. |
| `agentic` | 20+ tools: Exa, E2B, y más APIs externas |
| `bash-tool` | Tools bash, readFile, writeFile para agentes |
| `JigsawStack` | 30+ modelos fine-tuned para tareas específicas |

### MCP Servers (ecosistema amplio)

| Servidor | Descripción |
|---|---|
| Smithery | Marketplace de 6000+ MCPs |
| Pipedream | 3000+ integraciones de terceros |
| Apify | Web scraping y extracción de datos |

---

## 31. Links de Referencia

| Recurso | URL |
|---|---|
| Documentación principal | https://ai-sdk.dev/docs/introduction |
| Foundations — Prompts | https://ai-sdk.dev/docs/foundations/prompts |
| Foundations — Tools | https://ai-sdk.dev/docs/foundations/tools |
| Foundations — Streaming | https://ai-sdk.dev/docs/foundations/streaming |
| AI SDK Core — Referencia API | https://ai-sdk.dev/docs/reference/ai-sdk-core |
| AI SDK UI — Referencia API | https://ai-sdk.dev/docs/reference/ai-sdk-ui |
| Agentes — Overview | https://ai-sdk.dev/docs/agents/overview |
| Agentes — Building Agents | https://ai-sdk.dev/docs/agents/building-agents |
| Agentes — Workflow Patterns | https://ai-sdk.dev/docs/agents/workflows |
| Agentes — Memoria | https://ai-sdk.dev/docs/agents/memory |
| Agentes — Subagentes | https://ai-sdk.dev/docs/agents/subagents |
| MCP — Overview | https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools |
| Proveedores | https://ai-sdk.dev/providers |
| Cookbook (ejemplos) | https://ai-sdk.dev/cookbook |
| GitHub | https://github.com/vercel/ai |
| Documentación completa (llms.txt) | https://ai-sdk.dev/llms.txt |
| Playground | https://ai-sdk.dev/playground |
| Tools Registry | https://ai-sdk.dev/tools-registry |
| Templates | https://vercel.com/templates?type=ai |
| Errores API | https://ai-sdk.dev/docs/reference/ai-sdk-errors |
| Migración v5 → v6 | https://ai-sdk.dev/docs/migration-guides |

---

## 32. Aprendizajes Prácticos — Parallel Tool Calls

### Configuración con OpenRouter

Para usar el SDK con OpenRouter (acceso a múltiples modelos con una sola API key):

```typescript
import { createOpenAI } from "@ai-sdk/openai";

const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  compatibility: "compatible", // Importante para proveedores externos
});

// Usar con cualquier modelo de OpenRouter
const result = await generateText({
  model: openrouter("openai/gpt-4o-mini"),
  // ...
});
```

### Parallel Tool Calls — Ejecución Simultánea

El SDK ejecuta múltiples tool calls **en paralelo automáticamente** cuando el LLM las solicita en el mismo step:

```typescript
const result = await generateText({
  model: openrouter("openai/gpt-4o-mini"),
  system: "Cuando pregunten por múltiples ciudades, llama AMBAS herramientas al mismo tiempo.",
  tools: {
    climaBogota: {
      description: "Obtiene el clima de Bogotá",
      parameters: z.object({}),
      execute: async () => {
        // Se ejecuta en paralelo con otras tools
        return { ciudad: "Bogotá", temperatura: 18 };
      },
    },
    climaCartagena: {
      description: "Obtiene el clima de Cartagena",
      parameters: z.object({}),
      execute: async () => {
        // Se ejecuta en paralelo
        return { ciudad: "Cartagena", temperatura: 32 };
      },
    },
  },
  maxSteps: 2,
  prompt: "¿Cómo está el clima en Bogotá y Cartagena?",
});
```

**Resultado:** Ambas tools se ejecutan con el mismo timestamp, reduciendo latencia total.

### Benchmark de Modelos — Resultados Reales

Prueba realizada con parallel tool calls (2 tools ejecutadas simultáneamente):

| Modelo | Tiempo Total | Tool 1 | Tool 2 | Tokens | Notas |
|--------|-------------|--------|--------|--------|-------|
| **openai/gpt-4o-mini** 🏆 | **2710ms** | 61ms | 61ms | 406 | Más rápido y eficiente |
| openai/gpt-3.5-turbo | 2867ms | 62ms | 62ms | 483 | Buen balance |
| meta-llama/llama-3.1-8b | 3427ms | - | - | 270 | No usó tools correctamente |
| anthropic/claude-3-haiku | 3761ms | 58ms | 58ms | 1281 | Funciona pero más tokens |

### Recomendaciones de Velocidad

1. **Modelo más rápido:** `openai/gpt-4o-mini` — mejor balance velocidad/calidad
2. **Para tool calling:** OpenAI y Anthropic son los más confiables
3. **Latencia:** ~2.5-3s es principalmente red (tu app → OpenRouter → proveedor)
4. **Tools en paralelo:** Solo agregan ~60ms cuando se ejecutan simultáneamente

### Código de Benchmark

```typescript
export async function benchmarkModelo(modelId, pregunta) {
  const startTime = Date.now();
  
  const result = await generateText({
    model: openrouter(modelId),
    tools: { /* tus tools */ },
    maxSteps: 2,
    prompt: pregunta,
  });

  return {
    modelo: modelId,
    tiempoTotal: Date.now() - startTime,
    tokens: result.usage?.totalTokens || 0,
    tools: result.steps?.flatMap(s => s.toolCalls?.map(tc => tc.toolName) || []),
  };
}
```

### Versiones Probadas

- `ai`: ^4.0.0
- `@ai-sdk/openai`: ^1.0.0
- `zod`: ^3.23.8

---

*Documento generado para uso por agentes de IA — fuente: https://ai-sdk.dev — marzo 2026*