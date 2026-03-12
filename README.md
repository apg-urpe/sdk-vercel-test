# Scheduling Agent MCP

MCP Server para agendamiento de citas con **Nylas** y **Supabase**.

## Tools Disponibles

| Tool | Descripción | Parámetros |
|------|-------------|------------|
| **Disponibilidad_Agenda** | Consulta horarios libres (7 días) | `contacto_id`, `time_zone_contacto` |
| **Crear_Evento_Calendario** | Agenda una cita | `start`, `attendeeEmail`, `summary`, `description`, `contacto_id`, `Virtual-presencial`, `time_zone_contacto` |
| **Reagendar_Evento** | Mueve una cita existente | `event_id`, `start`, `contacto_id`, + opcionales |
| **Eliminar_Evento** | Cancela una cita | `event_id`, `contacto_id` |

## Quick Start

```bash
npm install
npm run chat    # Chat interactivo (desarrollo)
npm start       # MCP Server
```

## Variables de Entorno

### Para Railway (MCP Server)

```env
NYLAS_API_KEY=your_nylas_api_key
NYLAS_API_URL=https://api.us.nylas.com
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
```

### Para desarrollo local (chat.js)

```env
OPENROUTER_API_KEY=your_openrouter_key
EMPRESA_ID=4
TIMEZONE=America/Bogota
ASESOR_ID=154
```

## Deploy en Railway

1. Conectar repositorio GitHub
2. Configurar variables de entorno (solo las de MCP Server)
3. Deploy automático

## Ejemplos de Parámetros

### Disponibilidad_Agenda
```json
{
  "contacto_id": "123456",
  "time_zone_contacto": "America/Bogota"
}
```

### Crear_Evento_Calendario
```json
{
  "start": "2024-12-20T14:30:00",
  "attendeeEmail": "cliente@email.com",
  "summary": "🗓️ | Juan Perez | Empresa ABC | Virtual",
  "description": "- Nombre: Juan Perez\n- Teléfono: 300000000",
  "contacto_id": "123456",
  "Virtual-presencial": "Virtual",
  "time_zone_contacto": "America/Bogota"
}
```

### Reagendar_Evento
```json
{
  "event_id": "abc123def456",
  "start": "2024-12-22T16:00:00",
  "contacto_id": "123456",
  "Duracion_minutos": "60"
}
```
