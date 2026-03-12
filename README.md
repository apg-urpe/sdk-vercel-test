# Scheduling Agent MCP

MCP Server para agendamiento de citas con **Nylas** y **Supabase**.

## Tools Disponibles

- **verificar_disponibilidad** - Consulta horarios libres
- **crear_evento** - Agenda una cita
- **reagendar_evento** - Mueve una cita existente
- **eliminar_evento** - Cancela una cita

## Quick Start

```bash
npm install
npm run chat    # Chat interactivo
npm start       # MCP Server
```

## Configuración

Crear `.env` con las siguientes variables:

```env
NYLAS_API_KEY=your_nylas_api_key
NYLAS_API_URL=https://api.us.nylas.com
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
OPENROUTER_API_KEY=your_openrouter_key
EMPRESA_ID=4
TIMEZONE=America/Bogota
ASESOR_ID=154
```

## Deploy en Railway

1. Conectar repositorio a Railway
2. Configurar variables de entorno
3. Deploy automático

## Uso con Claude Desktop

Agregar a `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "scheduling-agent": {
      "command": "node",
      "args": ["/path/to/src/mcp-server.js"],
      "env": {
        "NYLAS_API_KEY": "...",
        "SUPABASE_URL": "...",
        "SUPABASE_SERVICE_KEY": "..."
      }
    }
  }
}
```
