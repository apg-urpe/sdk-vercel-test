# Context - Agente de Agendamiento

> Última actualización: Marzo 2026

## Objetivo

Agente de Agendamiento que integra **Vercel AI SDK + Nylas + Supabase** para:

- Verificar disponibilidad de asesores
- Crear eventos en calendarios
- Reagendar citas existentes

## Arquitectura

```text
Usuario → Agente (LLM) → Tools → Supabase (asesores) + Nylas (calendarios)
```

## Tools del Agente

### verificarDisponibilidad

Consulta slots libres de asesores para una fecha.

```javascript
parameters: z.object({ fecha: z.string() })
// Retorna: { disponibilidad: [{ asesor, slots }], fecha }
```

### crearEvento

Crea una cita en el calendario del asesor.

```javascript
parameters: z.object({
  asesorId: z.number(),
  titulo: z.string(),
  startTime: z.number(),  // Unix timestamp
  endTime: z.number(),
})
```

### reagendarEvento

Modifica un evento existente.

```javascript
parameters: z.object({
  asesorId: z.number(),
  eventoId: z.string(),
  nuevoStartTime: z.number(),
  nuevoEndTime: z.number(),
})
```

## Estructura del Proyecto

```text
src/
├── lib/
│   ├── supabase.js          # Cliente Supabase
│   └── nylas.js             # Cliente Nylas API
├── scheduling-agent.js      # Agente principal
├── test-scheduling.js       # Test del agente
└── test-simple.js           # Test de diagnóstico
```

## Base de Datos (Supabase)

Tabla: `wp_team_humano`

Columnas clave:
- `id` - ID del asesor
- `empresa_id` - Empresa a la que pertenece
- `grant_id` - ID de Nylas (calendario conectado)
- `acepta_citas` - Si acepta agendamiento
- `duracion_cita_minutos` - Duración default (30)
- `disponibilidad` - JSON con horarios

## Nylas API

Endpoints usados:
- `GET /v3/grants/{grant_id}/calendars` - Listar calendarios
- `GET /v3/grants/{grant_id}/events` - Obtener eventos
- `POST /v3/grants/{grant_id}/events` - Crear evento
- `PUT /v3/grants/{grant_id}/events/{id}` - Actualizar evento

## Uso del Agente

```javascript
import { ejecutarAgenteAgendamiento } from "./scheduling-agent.js";

const resultado = await ejecutarAgenteAgendamiento(
  "¿Qué disponibilidad hay para mañana?",
  {
    empresaId: 4,
    contactoId: 123,
    timezoneContacto: "America/Bogota",
  }
);

console.log(resultado.respuesta);
```

## Variables de Entorno

```env
OPENROUTER_API_KEY=sk-or-v1-xxx
NYLAS_API_KEY=nyk_v0_xxx
NYLAS_API_URL=https://api.us.nylas.com
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx
```

## Comandos

```bash
npm install                    # Instalar dependencias
node src/test-scheduling.js    # Probar agente
node src/test-simple.js        # Diagnóstico
```

## Aprendizajes Clave

1. **Tools simples** - Evitar parámetros opcionales y arrays anidados
2. **Service key** - Usar service_role para bypass RLS en Supabase
3. **gpt-3.5-turbo** - Funciona bien para tool calling básico
4. **Nylas grant_id** - Cada asesor necesita calendario conectado

## Referencias

- `nylas reference.md` - API de Nylas v3
- `Vercel ai sdk reference.md` - SDK de Vercel AI
