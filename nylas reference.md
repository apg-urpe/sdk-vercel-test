# Nylas API v3 — Documentación de Referencia Completa

> **Fuente:** https://developer.nylas.com/docs/v3/api-references/  
> **Versión:** Nylas API v3  
> **Propósito:** Contexto completo para agentes de IA que interactúan con la plataforma Nylas

---

## Tabla de Contenidos

1. [Visión General de la Plataforma](#1-visión-general-de-la-plataforma)
2. [Autenticación](#2-autenticación)
3. [API de Email (Messages, Threads, Folders, Attachments, Contacts)](#3-api-de-email)
4. [API de Calendario (Calendars, Events, Availability)](#4-api-de-calendario)
5. [API de Scheduler](#5-api-de-scheduler)
6. [API de Notetaker](#6-api-de-notetaker)
7. [APIs de Administración](#7-apis-de-administración)
8. [Webhooks y Notificaciones](#8-webhooks-y-notificaciones)
9. [SDKs Oficiales](#9-sdks-oficiales)
10. [Códigos de Error](#10-códigos-de-error)
11. [Rate Limits y Mejores Prácticas](#11-rate-limits-y-mejores-prácticas)
12. [Scopes y Permisos](#12-scopes-y-permisos)

---

## 1. Visión General de la Plataforma

Nylas es una plataforma de APIs que permite a los desarrolladores integrar funcionalidades de **email, calendario y contactos** de múltiples proveedores (Gmail, Outlook, Exchange, IMAP, Yahoo, iCloud) en sus aplicaciones mediante una sola API unificada.

### Base URL

```
https://api.us.nylas.com    # Región US (por defecto)
https://api.eu.nylas.com    # Región EU (data residency)
```

### Estructura General de Requests

Todos los endpoints de Nylas v3 siguen el patrón:

```
https://api.us.nylas.com/v3/{recurso}
https://api.us.nylas.com/v3/grants/{grant_id}/{recurso}
```

### Autenticación en Headers

```http
Authorization: Bearer {API_KEY}
# o para requests a nivel de usuario:
Authorization: Bearer {ACCESS_TOKEN}
Content-Type: application/json
```

### Modelos de Autenticación

| Tipo | Cuándo usarlo |
|------|--------------|
| API Key | Server-side, acceso a nivel de aplicación |
| Access Token (Grant Token) | Acceso a datos de usuario específico (grant) |

---

## 2. Autenticación

### 2.1 Conceptos Clave

- **Grant:** Representa el permiso otorgado por un usuario para que Nylas acceda a su cuenta de email/calendario. Cada usuario autenticado tiene un `grant_id`.
- **Connector:** Configuración del proveedor OAuth (Google, Microsoft, IMAP, etc.).
- **Application:** La app registrada en el dashboard de Nylas con su `client_id` y `client_secret`.

### 2.2 Flujo Hosted OAuth con API Key

Este es el flujo más común para autenticar usuarios.

**Paso 1: Iniciar el flujo de autenticación**

```http
GET https://api.us.nylas.com/v3/connect/auth
  ?client_id={CLIENT_ID}
  &redirect_uri={REDIRECT_URI}
  &response_type=code
  &scope=openid email calendar
  &provider=google   # o microsoft, imap, etc.
```

**Paso 2: Intercambiar el código por tokens**

```http
POST https://api.us.nylas.com/v3/connect/token
Content-Type: application/json

{
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "redirect_uri": "https://yourapp.com/callback",
  "code": "AUTHORIZATION_CODE",
  "grant_type": "authorization_code"
}
```

**Respuesta:**
```json
{
  "access_token": "nylas_access_token_...",
  "grant_id": "grant_abc123",
  "email": "user@example.com",
  "provider": "google",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### 2.3 Hosted OAuth con Access Token + PKCE

Para aplicaciones cliente (sin backend):

```http
GET https://api.us.nylas.com/v3/connect/auth
  ?client_id={CLIENT_ID}
  &redirect_uri={REDIRECT_URI}
  &response_type=code
  &code_challenge={CODE_CHALLENGE}
  &code_challenge_method=S256
```

### 2.4 Bring Your Own Authentication (BYOA)

Permite reutilizar el token OAuth ya obtenido directamente:

```http
POST https://api.us.nylas.com/v3/connect/custom/auth
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "provider": "google",
  "settings": {
    "google_client_id": "...",
    "google_client_secret": "...",
    "google_refresh_token": "...",
    "google_service_account": false
  },
  "scope": ["Mail.Read", "Calendar.ReadWrite"],
  "email": "user@company.com"
}
```

### 2.5 IMAP Authentication

```http
POST https://api.us.nylas.com/v3/connect/custom/auth
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "provider": "imap",
  "settings": {
    "imap_username": "user@domain.com",
    "imap_password": "password",
    "imap_host": "imap.domain.com",
    "imap_port": 993,
    "smtp_username": "user@domain.com",
    "smtp_password": "password",
    "smtp_host": "smtp.domain.com",
    "smtp_port": 587
  },
  "email": "user@domain.com"
}
```

### 2.6 Service Account (Google Workspace)

Para autenticar múltiples usuarios de un dominio sin interacción manual:

```http
POST https://api.us.nylas.com/v3/connect/custom/auth
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "provider": "google",
  "settings": {
    "google_client_id": "...",
    "google_client_secret": "...",
    "google_service_account_key": "{...service_account_json...}",
    "google_service_account": true
  },
  "email": "user@yourdomain.com"
}
```

### 2.7 Gestión de Grants

**Listar grants de la aplicación:**
```http
GET https://api.us.nylas.com/v3/grants
Authorization: Bearer {API_KEY}
```

**Obtener un grant específico:**
```http
GET https://api.us.nylas.com/v3/grants/{grant_id}
Authorization: Bearer {API_KEY}
```

**Eliminar un grant (revocar acceso):**
```http
DELETE https://api.us.nylas.com/v3/grants/{grant_id}
Authorization: Bearer {API_KEY}
```

**Respuesta de Grant:**
```json
{
  "request_id": "req_123",
  "data": {
    "id": "grant_abc123",
    "provider": "google",
    "grant_status": "valid",
    "email": "user@example.com",
    "user_agent": "Nylas/v3",
    "ip": "1.2.3.4",
    "created_at": 1690000000,
    "updated_at": 1690000000
  }
}
```

### 2.8 Nylas Connect (SDK Frontend)

Para integraciones en el frontend, Nylas ofrece componentes web:

**NylasConnect JS:**
```javascript
import NylasConnect from '@nylas/nylas-js';

const connect = new NylasConnect({
  clientId: 'YOUR_CLIENT_ID',
  redirectUri: 'https://yourapp.com/callback',
  scope: ['openid', 'email', 'calendar'],
});

// Iniciar autenticación
await connect.connect({ provider: 'google' });

// Obtener sesión activa
const session = await connect.getSession();
console.log(session.grantId);
```

**NylasConnectButton (React):**
```jsx
import { NylasConnectButton } from '@nylas/nylas-react';

<NylasConnectButton
  clientId="YOUR_CLIENT_ID"
  redirectUri="https://yourapp.com/callback"
  onSuccess={(data) => console.log(data.grantId)}
/>
```

---

## 3. API de Email

Base path para todos los endpoints de email:
```
/v3/grants/{grant_id}/messages
/v3/grants/{grant_id}/threads
/v3/grants/{grant_id}/folders
/v3/grants/{grant_id}/attachments
/v3/grants/{grant_id}/contacts
```

### 3.1 Messages API

#### Listar mensajes

```http
GET /v3/grants/{grant_id}/messages
Authorization: Bearer {API_KEY_or_ACCESS_TOKEN}
```

**Query params disponibles:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `subject` | string | Filtrar por asunto |
| `from` | string | Email del remitente |
| `to` | string | Email del destinatario |
| `cc` | string | Filtrar por CC |
| `bcc` | string | Filtrar por BCC |
| `in` | string | ID de carpeta/label |
| `unread` | boolean | Solo mensajes no leídos |
| `starred` | boolean | Solo mensajes destacados |
| `has_attachment` | boolean | Solo con adjuntos |
| `received_after` | integer | Timestamp Unix |
| `received_before` | integer | Timestamp Unix |
| `limit` | integer | Máx resultados (default: 50, max: 200) |
| `page_token` | string | Token para paginación |
| `fields` | string | Campos a retornar (ej: `id,subject,from`) |

**Ejemplo de request:**
```http
GET /v3/grants/abc123/messages?subject=Invoice&unread=true&limit=10
Authorization: Bearer nylas_api_key_...
```

**Respuesta:**
```json
{
  "request_id": "req_xyz",
  "data": [
    {
      "id": "msg_001",
      "grant_id": "abc123",
      "thread_id": "thread_001",
      "subject": "Invoice #123",
      "from": [{"name": "John Doe", "email": "john@example.com"}],
      "to": [{"name": "Jane", "email": "jane@example.com"}],
      "cc": [],
      "bcc": [],
      "reply_to": [],
      "date": 1690000000,
      "unread": true,
      "starred": false,
      "snippet": "Please find attached the invoice...",
      "body": "<html>...</html>",
      "attachments": [
        {
          "id": "attach_001",
          "filename": "invoice.pdf",
          "content_type": "application/pdf",
          "size": 12345,
          "content_id": null,
          "is_inline": false
        }
      ],
      "folders": ["INBOX"],
      "labels": [],
      "created_at": 1690000000,
      "updated_at": 1690000000
    }
  ],
  "next_cursor": "cursor_token_abc"
}
```

#### Obtener un mensaje por ID

```http
GET /v3/grants/{grant_id}/messages/{message_id}
Authorization: Bearer {TOKEN}
```

#### Actualizar un mensaje (marcar leído, destacar, mover)

```http
PUT /v3/grants/{grant_id}/messages/{message_id}
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "unread": false,
  "starred": true,
  "folders": ["INBOX", "Important"]
}
```

#### Eliminar un mensaje

```http
DELETE /v3/grants/{grant_id}/messages/{message_id}
Authorization: Bearer {TOKEN}
```

### 3.2 Enviar Mensajes (Send API)

#### Envío simple

```http
POST /v3/grants/{grant_id}/messages/send
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "subject": "Hello World",
  "to": [{"name": "Recipient", "email": "recipient@example.com"}],
  "cc": [],
  "bcc": [],
  "reply_to": [{"email": "replyto@mycompany.com"}],
  "body": "<h1>Hello!</h1><p>This is the email body.</p>",
  "tracking_options": {
    "opens": true,
    "links": true,
    "thread_replies": true,
    "label": "campaign_q3"
  }
}
```

#### Envío con adjunto

```http
POST /v3/grants/{grant_id}/messages/send
Authorization: Bearer {TOKEN}
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="message"
Content-Type: application/json

{
  "subject": "See attached file",
  "to": [{"email": "user@example.com"}],
  "body": "<p>Please find the file attached.</p>"
}
--boundary
Content-Disposition: form-data; name="file"; filename="report.pdf"
Content-Type: application/pdf

[binary data]
--boundary--
```

#### Responder a un mensaje

```http
POST /v3/grants/{grant_id}/messages/send
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "subject": "Re: Original Subject",
  "to": [{"email": "original_sender@example.com"}],
  "reply_to_message_id": "msg_001",
  "body": "<p>Thanks for your message!</p>"
}
```

#### Envío programado (Scheduled Send)

```http
POST /v3/grants/{grant_id}/messages/send
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "subject": "Scheduled Email",
  "to": [{"email": "user@example.com"}],
  "body": "<p>This was scheduled.</p>",
  "send_at": 1700000000
}
```

**Listar mensajes programados:**
```http
GET /v3/grants/{grant_id}/messages/schedules
Authorization: Bearer {TOKEN}
```

**Cancelar un mensaje programado:**
```http
DELETE /v3/grants/{grant_id}/messages/schedules/{schedule_id}
Authorization: Bearer {TOKEN}
```

#### Smart Compose (IA para redactar emails)

```http
POST /v3/grants/{grant_id}/messages/smart-compose
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "prompt": "Write a professional follow-up email after a sales meeting"
}
```

**Respuesta:**
```json
{
  "suggestion": "Dear [Name],\n\nThank you for taking the time to meet with us..."
}
```

### 3.3 Threads API

Los hilos agrupan mensajes relacionados.

#### Listar threads

```http
GET /v3/grants/{grant_id}/threads
Authorization: Bearer {TOKEN}
```

**Query params:** Mismos que Messages API más:

| Parámetro | Descripción |
|-----------|-------------|
| `any_email` | Busca en cualquier campo de email |
| `latest_message_before` | Timestamp del último mensaje |
| `latest_message_after` | Timestamp del último mensaje |

**Respuesta de un Thread:**
```json
{
  "id": "thread_001",
  "grant_id": "abc123",
  "subject": "Project Update",
  "latest_draft_or_message": {
    "date": 1690000100,
    "snippet": "Latest reply content..."
  },
  "has_attachments": false,
  "has_drafts": false,
  "starred": false,
  "unread": true,
  "earliest_message_date": 1690000000,
  "latest_message_received_date": 1690000100,
  "message_ids": ["msg_001", "msg_002", "msg_003"],
  "draft_ids": [],
  "folders": ["INBOX"],
  "participants": [
    {"name": "Alice", "email": "alice@example.com"},
    {"name": "Bob", "email": "bob@example.com"}
  ]
}
```

#### Obtener thread con todos sus mensajes

```http
GET /v3/grants/{grant_id}/threads/{thread_id}
Authorization: Bearer {TOKEN}
```

#### Actualizar thread (marcar leído, destacar)

```http
PUT /v3/grants/{grant_id}/threads/{thread_id}
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "unread": false,
  "starred": true,
  "folders": ["Archive"]
}
```

#### Eliminar thread

```http
DELETE /v3/grants/{grant_id}/threads/{thread_id}
Authorization: Bearer {TOKEN}
```

### 3.4 Folders API

Gestiona carpetas (Gmail) y labels. En Gmail son "labels"; en Outlook/Exchange son "folders".

#### Listar folders/labels

```http
GET /v3/grants/{grant_id}/folders
Authorization: Bearer {TOKEN}
```

**Respuesta:**
```json
{
  "data": [
    {
      "id": "INBOX",
      "name": "Inbox",
      "system_folder": true,
      "total_count": 245,
      "unread_count": 12,
      "child_count": 0,
      "background_color": null,
      "text_color": null
    },
    {
      "id": "Label_123",
      "name": "Work",
      "system_folder": false,
      "total_count": 56,
      "unread_count": 3,
      "background_color": "#2196F3",
      "text_color": "#FFFFFF"
    }
  ]
}
```

#### Crear folder/label

```http
POST /v3/grants/{grant_id}/folders
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "name": "Important Clients",
  "parent_id": null,
  "background_color": "#4CAF50",
  "text_color": "#FFFFFF"
}
```

#### Actualizar folder

```http
PUT /v3/grants/{grant_id}/folders/{folder_id}
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "name": "VIP Clients",
  "background_color": "#FF5722"
}
```

#### Eliminar folder

```http
DELETE /v3/grants/{grant_id}/folders/{folder_id}
Authorization: Bearer {TOKEN}
```

### 3.5 Attachments API

#### Obtener metadata de un adjunto

```http
GET /v3/grants/{grant_id}/attachments/{attachment_id}?message_id={message_id}
Authorization: Bearer {TOKEN}
```

**Respuesta:**
```json
{
  "data": {
    "id": "attach_001",
    "grant_id": "abc123",
    "filename": "report.pdf",
    "content_type": "application/pdf",
    "size": 54321,
    "content_id": null,
    "is_inline": false
  }
}
```

#### Descargar contenido de adjunto

```http
GET /v3/grants/{grant_id}/attachments/{attachment_id}/download?message_id={message_id}
Authorization: Bearer {TOKEN}
```

Retorna los bytes binarios del archivo.

### 3.6 Contacts API

#### Listar contactos

```http
GET /v3/grants/{grant_id}/contacts
Authorization: Bearer {TOKEN}
```

**Query params:**

| Parámetro | Descripción |
|-----------|-------------|
| `email` | Filtrar por email exacto |
| `phone_number` | Filtrar por teléfono |
| `source` | `address_book` o `inbox` |
| `group` | ID de grupo |
| `limit` | Máximo (default: 100, max: 1000) |
| `page_token` | Paginación |

**Respuesta de Contacto:**
```json
{
  "id": "contact_001",
  "grant_id": "abc123",
  "display_name": "John Doe",
  "given_name": "John",
  "middle_name": null,
  "surname": "Doe",
  "nickname": "Johnny",
  "birthday": "1985-03-15",
  "company_name": "Acme Corp",
  "job_title": "CTO",
  "manager_name": null,
  "office_location": "New York",
  "notes": "Met at conference 2023",
  "emails": [
    {"type": "work", "email": "john@acme.com"},
    {"type": "personal", "email": "john@gmail.com"}
  ],
  "phone_numbers": [
    {"type": "mobile", "number": "+1-555-0100"}
  ],
  "im_addresses": [],
  "physical_addresses": [
    {
      "type": "work",
      "street_address": "123 Business Ave",
      "city": "New York",
      "region": "NY",
      "postal_code": "10001",
      "country": "US"
    }
  ],
  "web_pages": [
    {"type": "homepage", "url": "https://acme.com"}
  ],
  "groups": [{"id": "group_001", "name": "VIP"}],
  "source": "address_book",
  "picture_url": "https://...",
  "created_at": 1690000000,
  "updated_at": 1690000000
}
```

#### Crear contacto

```http
POST /v3/grants/{grant_id}/contacts
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "given_name": "Jane",
  "surname": "Smith",
  "emails": [{"type": "work", "email": "jane@company.com"}],
  "phone_numbers": [{"type": "mobile", "number": "+1-555-0200"}],
  "company_name": "Tech Corp",
  "job_title": "Developer"
}
```

#### Actualizar contacto

```http
PUT /v3/grants/{grant_id}/contacts/{contact_id}
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "job_title": "Senior Developer",
  "notes": "Promoted in Q2 2024"
}
```

#### Eliminar contacto

```http
DELETE /v3/grants/{grant_id}/contacts/{contact_id}
Authorization: Bearer {TOKEN}
```

### 3.7 Parsing de Mensajes

```http
POST /v3/grants/{grant_id}/messages/{message_id}/parse
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "parse_options": ["links", "events", "receipts"]
}
```

### 3.8 Message Tracking

Para habilitar tracking de aperturas y clicks en emails enviados:

```json
{
  "tracking_options": {
    "opens": true,
    "links": true,
    "thread_replies": true,
    "label": "my_campaign"
  }
}
```

Los eventos de tracking se reciben por webhooks con tipo `message.opened` y `message.link_clicked`.

---

## 4. API de Calendario

Base path:
```
/v3/grants/{grant_id}/calendars
/v3/grants/{grant_id}/events
/v3/grants/{grant_id}/free-busy
```

### 4.1 Calendars API

#### Listar calendarios

```http
GET /v3/grants/{grant_id}/calendars
Authorization: Bearer {TOKEN}
```

**Respuesta:**
```json
{
  "data": [
    {
      "id": "cal_primary",
      "name": "John's Calendar",
      "description": "Primary calendar",
      "location": "America/New_York",
      "timezone": "America/New_York",
      "hex_color": "#1E88E5",
      "hex_foreground_color": "#FFFFFF",
      "is_owned_by_user": true,
      "is_primary": true,
      "read_only": false,
      "object": "calendar"
    }
  ]
}
```

#### Crear calendario

```http
POST /v3/grants/{grant_id}/calendars
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "name": "Team Calendar",
  "description": "Shared team events",
  "location": "America/Chicago",
  "timezone": "America/Chicago",
  "metadata": {
    "custom_key": "custom_value"
  }
}
```

#### Calendarios Virtuales

Los calendarios virtuales son calendarios independientes del proveedor, creados directamente en Nylas:

```http
POST /v3/grants/{grant_id}/calendars
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "name": "Virtual Meeting Room",
  "description": "Nylas-managed virtual calendar",
  "is_virtual": true,
  "timezone": "UTC"
}
```

### 4.2 Events API

#### Listar eventos

```http
GET /v3/grants/{grant_id}/events?calendar_id={calendar_id}
Authorization: Bearer {TOKEN}
```

**Query params:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `calendar_id` | string | **Requerido** — ID del calendario |
| `title` | string | Filtrar por título |
| `description` | string | Buscar en descripción |
| `location` | string | Filtrar por ubicación |
| `start` | integer | Timestamp Unix inicio del rango |
| `end` | integer | Timestamp Unix fin del rango |
| `expand_recurring` | boolean | Expandir eventos recurrentes |
| `busy` | boolean | Solo eventos que bloquean calendario |
| `limit` | integer | Default 50, max 200 |
| `page_token` | string | Paginación |

**Respuesta de Evento:**
```json
{
  "id": "event_001",
  "grant_id": "abc123",
  "calendar_id": "cal_primary",
  "title": "Q4 Planning Meeting",
  "description": "Annual planning session",
  "location": "Conference Room B / Zoom",
  "when": {
    "object": "timespan",
    "start_time": 1700000000,
    "end_time": 1700003600,
    "start_timezone": "America/New_York",
    "end_timezone": "America/New_York"
  },
  "status": "confirmed",
  "busy": true,
  "visibility": "default",
  "organizer": {
    "name": "Alice",
    "email": "alice@company.com"
  },
  "participants": [
    {
      "name": "Bob",
      "email": "bob@company.com",
      "status": "yes",
      "comment": "Will attend via Zoom"
    },
    {
      "name": "Carol",
      "email": "carol@company.com",
      "status": "noreply"
    }
  ],
  "conferencing": {
    "provider": "Zoom Meeting",
    "details": {
      "meeting_code": "123456789",
      "url": "https://zoom.us/j/123456789",
      "password": "abc123"
    }
  },
  "recurrence": null,
  "reminders": {
    "use_default": false,
    "overrides": [
      {"reminder_minutes": 30, "reminder_method": "email"},
      {"reminder_minutes": 10, "reminder_method": "popup"}
    ]
  },
  "attachments": [],
  "metadata": {},
  "read_only": false,
  "html_link": "https://calendar.google.com/...",
  "created_at": 1690000000,
  "updated_at": 1690000000
}
```

#### Crear evento

```http
POST /v3/grants/{grant_id}/events?calendar_id={calendar_id}
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "title": "Team Standup",
  "description": "Daily sync",
  "location": "Zoom",
  "when": {
    "start_time": 1700000000,
    "end_time": 1700001800
  },
  "participants": [
    {"email": "alice@company.com", "name": "Alice"},
    {"email": "bob@company.com", "name": "Bob"}
  ],
  "conferencing": {
    "provider": "Zoom Meeting",
    "autocreate": {
      "extras": {}
    }
  },
  "reminders": {
    "use_default": false,
    "overrides": [
      {"reminder_minutes": 15, "reminder_method": "popup"}
    ]
  },
  "send_updates": "all",
  "metadata": {
    "source_system": "my_crm",
    "deal_id": "deal_456"
  }
}
```

**Tipos de `when` soportados:**

```json
// Timespan (hora de inicio y fin)
{
  "start_time": 1700000000,
  "end_time": 1700003600
}

// Date (evento de día completo)
{
  "date": "2024-01-15"
}

// Datespan (múltiples días completos)
{
  "start_date": "2024-01-15",
  "end_date": "2024-01-17"
}
```

#### Actualizar evento

```http
PUT /v3/grants/{grant_id}/events/{event_id}?calendar_id={calendar_id}
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "title": "Updated Title",
  "when": {
    "start_time": 1700007200,
    "end_time": 1700010800
  },
  "send_updates": "all"
}
```

#### Eliminar evento

```http
DELETE /v3/grants/{grant_id}/events/{event_id}?calendar_id={calendar_id}&send_updates=all
Authorization: Bearer {TOKEN}
```

#### Eventos Recurrentes (RRULE)

Para crear eventos recurrentes:

```json
{
  "title": "Weekly Team Sync",
  "when": {
    "start_time": 1700000000,
    "end_time": 1700003600
  },
  "recurrence": [
    "RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10"
  ]
}
```

Patrón RRULE estándar RFC 5545:
- `FREQ`: DAILY, WEEKLY, MONTHLY, YEARLY
- `BYDAY`: MO, TU, WE, TH, FR, SA, SU
- `COUNT`: número de repeticiones
- `UNTIL`: fecha fin (ej: `20241231T000000Z`)
- `INTERVAL`: cada N períodos

Para actualizar solo una instancia de un evento recurrente, usar `event_id` con el sufijo `_{timestamp}`.

### 4.3 Availability API

Verifica disponibilidad de uno o múltiples usuarios.

#### Verificar disponibilidad

```http
POST /v3/calendars/availability
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "start_time": 1700000000,
  "end_time": 1700086400,
  "duration_minutes": 30,
  "interval_minutes": 15,
  "emails": [
    "alice@company.com",
    "bob@company.com"
  ],
  "availability_rules": {
    "availability_method": "collective",
    "buffer": {
      "before": 5,
      "after": 5
    },
    "default_open_hours": [
      {
        "days": [0, 1, 2, 3, 4],
        "timezone": "America/New_York",
        "start": "09:00",
        "end": "17:00",
        "exdates": []
      }
    ],
    "round_robin_group_id": null
  }
}
```

**Respuesta:**
```json
{
  "request_id": "req_xyz",
  "data": {
    "order": ["alice@company.com", "bob@company.com"],
    "time_slots": [
      {
        "start_time": 1700032800,
        "end_time": 1700034600,
        "status": "free",
        "emails": ["alice@company.com", "bob@company.com"]
      }
    ]
  }
}
```

#### Free/Busy

```http
POST /v3/grants/{grant_id}/calendars/free-busy
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "start_time": 1700000000,
  "end_time": 1700086400,
  "emails": ["user@company.com", "colleague@company.com"]
}
```

**Respuesta:**
```json
{
  "data": [
    {
      "email": "user@company.com",
      "time_slots": [
        {
          "start_time": 1700010000,
          "end_time": 1700013600,
          "status": "busy",
          "object": "time_slot"
        }
      ]
    }
  ]
}
```

### 4.4 Conferencing

Nylas puede autocreate conferencias al crear eventos:

**Google Meet (para cuentas Google):**
```json
{
  "conferencing": {
    "provider": "Google Meet",
    "autocreate": {}
  }
}
```

**Zoom (requiere cuenta Zoom conectada):**
```json
{
  "conferencing": {
    "provider": "Zoom Meeting",
    "autocreate": {
      "extras": {
        "password": "optional_password"
      }
    }
  }
}
```

**Microsoft Teams:**
```json
{
  "conferencing": {
    "provider": "Microsoft Teams",
    "autocreate": {}
  }
}
```

**Enlace manual:**
```json
{
  "conferencing": {
    "provider": "Webex",
    "details": {
      "url": "https://webex.com/meet/myroom",
      "meeting_code": "myroom"
    }
  }
}
```

---

## 5. API de Scheduler

El Scheduler permite crear páginas de reserva de reuniones sin código adicional. Es similar a Calendly pero totalmente embebible.

Base URL del Scheduler:
```
https://api.us.nylas.com/v3/scheduling/
```

### 5.1 Configuraciones (Configurations)

Una "configuración" es equivalente a un tipo de reunión o página de reserva.

#### Crear una configuración

```http
POST /v3/scheduling/configurations
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "requires_session_auth": false,
  "participants": [
    {
      "name": "Alice",
      "email": "alice@company.com",
      "is_organizer": true,
      "availability": {
        "calendars": [
          {
            "account_id": "abc123",
            "calendar_id": "cal_primary"
          }
        ]
      },
      "booking": {
        "calendar_id": "cal_primary"
      }
    }
  ],
  "availability": {
    "duration_minutes": 30,
    "interval_minutes": 15,
    "round_robin_group_id": null,
    "availability_rules": {
      "availability_method": "collective",
      "buffer": {"before": 5, "after": 5},
      "default_open_hours": [
        {
          "days": [1, 2, 3, 4, 5],
          "timezone": "America/New_York",
          "start": "09:00",
          "end": "17:00"
        }
      ]
    }
  },
  "event_booking": {
    "title": "30-min Meeting with Alice",
    "description": "Let's connect!",
    "location": "Zoom",
    "conferencing": {
      "provider": "Zoom Meeting",
      "autocreate": {}
    }
  },
  "scheduler": {
    "available_days_in_future": 30,
    "min_cancellation_notice": 60,
    "min_booking_notice": 120,
    "confirmation_redirect_url": "https://myapp.com/booked",
    "cancellation_policy": "You can cancel up to 2 hours before."
  }
}
```

#### Listar configuraciones

```http
GET /v3/scheduling/configurations
Authorization: Bearer {API_KEY}
```

#### Obtener configuración

```http
GET /v3/scheduling/configurations/{config_id}
Authorization: Bearer {API_KEY}
```

#### Actualizar configuración

```http
PUT /v3/scheduling/configurations/{config_id}
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "availability": {
    "duration_minutes": 60
  }
}
```

#### Eliminar configuración

```http
DELETE /v3/scheduling/configurations/{config_id}
Authorization: Bearer {API_KEY}
```

### 5.2 Bookings API

#### Crear una reserva (booking)

```http
POST /v3/scheduling/bookings
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "configuration_id": "config_001",
  "start_time": 1700032800,
  "end_time": 1700034600,
  "guests": [
    {
      "name": "John Guest",
      "email": "john@guest.com"
    }
  ],
  "additional_fields": {
    "company": "Guest Corp",
    "message": "Looking forward to meeting!"
  }
}
```

**Respuesta:**
```json
{
  "request_id": "req_xyz",
  "data": {
    "booking_id": "booking_001",
    "event_id": "event_xyz",
    "status": "confirmed",
    "title": "30-min Meeting",
    "organizer": {
      "name": "Alice",
      "email": "alice@company.com"
    },
    "start_time": 1700032800,
    "end_time": 1700034600,
    "guests": [
      {
        "name": "John Guest",
        "email": "john@guest.com",
        "status": "confirmed"
      }
    ],
    "conferencing": {
      "url": "https://zoom.us/j/987654321"
    }
  }
}
```

#### Obtener booking

```http
GET /v3/scheduling/bookings/{booking_id}
Authorization: Bearer {API_KEY}
```

#### Cancelar booking

```http
DELETE /v3/scheduling/bookings/{booking_id}
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "cancellation_reason": "Schedule conflict"
}
```

#### Confirmar booking (para flujos de confirmación manual)

```http
PUT /v3/scheduling/bookings/{booking_id}
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "status": "confirmed"
}
```

### 5.3 Hosted Scheduling Pages

Nylas puede alojar la página de scheduling directamente:

```
https://book.nylas.com/{config_slug}
```

Para obtener el slug de una configuración y personalizar la URL:
```json
{
  "scheduler": {
    "slug": "mi-reunion-30min"
  }
}
```

### 5.4 Componentes Web del Scheduler

**NylasScheduling (React/Web Component):**

```html
<!-- Web Component -->
<nylas-scheduling
  configuration-id="config_001"
  nylas-api-request="true"
>
</nylas-scheduling>
```

```jsx
// React
import { NylasScheduling } from '@nylas/react';

<NylasScheduling
  configurationId="config_001"
  onBookingConfirmed={(booking) => console.log(booking)}
  onBookingCancelled={(data) => console.log(data)}
/>
```

**NylasSchedulerEditor (Editor de configuraciones):**

```jsx
import { NylasSchedulerEditor } from '@nylas/react';

<NylasSchedulerEditor
  configurationId="config_001"
  nylasSessionsConfig={{
    clientId: 'YOUR_CLIENT_ID',
    redirectUri: 'https://yourapp.com',
    domain: 'https://api.us.nylas.com',
    hosted: true,
    accessType: 'online',
  }}
  onConfigurationSaved={(config) => console.log(config)}
/>
```

---

## 6. API de Notetaker

El Notetaker es un bot de IA que se une a videollamadas y genera transcripciones y resúmenes.

Base path:
```
/v3/grants/{grant_id}/notetakers
/v3/notetakers
```

### 6.1 Crear un Notetaker

```http
POST /v3/grants/{grant_id}/notetakers
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "meeting_link": "https://zoom.us/j/123456789",
  "meeting_settings": {
    "video_recording": true,
    "audio_recording": true,
    "transcription": true
  },
  "join_time": 1700032800,
  "name": "AI Notetaker Bot",
  "leave_without_update_duration": 120
}
```

**Respuesta:**
```json
{
  "data": {
    "id": "notetaker_001",
    "name": "AI Notetaker Bot",
    "meeting_link": "https://zoom.us/j/123456789",
    "join_time": 1700032800,
    "state": "scheduled",
    "meeting_settings": {
      "video_recording": true,
      "audio_recording": true,
      "transcription": true
    }
  }
}
```

### 6.2 Listar Notetakers

```http
GET /v3/grants/{grant_id}/notetakers
Authorization: Bearer {TOKEN}
```

**Query params:**

| Parámetro | Descripción |
|-----------|-------------|
| `state` | `scheduled`, `joining_call`, `attending_call`, `done`, `failed` |
| `join_time_before` | Timestamp |
| `join_time_after` | Timestamp |

### 6.3 Obtener Notetaker

```http
GET /v3/grants/{grant_id}/notetakers/{notetaker_id}
Authorization: Bearer {TOKEN}
```

### 6.4 Obtener Media (Transcripción, Grabación)

```http
GET /v3/grants/{grant_id}/notetakers/{notetaker_id}/media
Authorization: Bearer {TOKEN}
```

**Respuesta:**
```json
{
  "data": {
    "recording": {
      "url": "https://storage.nylas.com/recordings/...",
      "size": 54321000,
      "expires": 1700200000
    },
    "transcript": {
      "url": "https://storage.nylas.com/transcripts/...",
      "expires": 1700200000
    }
  }
}
```

### 6.5 Expulsar Notetaker

```http
DELETE /v3/grants/{grant_id}/notetakers/{notetaker_id}/leave
Authorization: Bearer {TOKEN}
```

### 6.6 Sincronización con Calendario

El Notetaker puede sincronizarse con el calendario para unirse automáticamente a reuniones:

```http
PUT /v3/grants/{grant_id}/notetakers/calendar-sync
Authorization: Bearer {TOKEN}
Content-Type: application/json

{
  "enabled": true,
  "rules": {
    "event_selection": "all_events",
    "participants_count_threshold": 2
  },
  "meeting_settings": {
    "transcription": true,
    "video_recording": false,
    "audio_recording": true
  }
}
```

---

## 7. APIs de Administración

Base URL:
```
https://api.us.nylas.com/v3/
```

### 7.1 Applications API

#### Obtener info de la aplicación

```http
GET /v3/applications
Authorization: Bearer {API_KEY}
```

**Respuesta:**
```json
{
  "data": {
    "application_id": "app_001",
    "name": "My App",
    "description": "CRM Integration",
    "icon_url": "https://...",
    "redirect_uris": [
      "https://myapp.com/callback"
    ],
    "hosted_authentication": {
      "background_image_url": null,
      "alignment": "left",
      "color_primary": "#1E88E5",
      "color_secondary": "#FFFFFF",
      "title": "Connect your account",
      "subtitle": "Allow access to your email and calendar",
      "background_color": "#F5F5F5"
    },
    "privacy_url": "https://myapp.com/privacy",
    "terms_url": "https://myapp.com/terms",
    "support_email": "support@myapp.com",
    "support_url": "https://myapp.com/support",
    "created_at": 1690000000,
    "updated_at": 1690000000
  }
}
```

### 7.2 Connectors API

Los Connectors representan la configuración de un proveedor OAuth por aplicación.

#### Listar connectors

```http
GET /v3/connectors
Authorization: Bearer {API_KEY}
```

#### Crear connector Google

```http
POST /v3/connectors
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "provider": "google",
  "settings": {
    "client_id": "YOUR_GOOGLE_CLIENT_ID",
    "client_secret": "YOUR_GOOGLE_CLIENT_SECRET",
    "topic_name": "projects/your-project/topics/nylas-notifications"
  },
  "scope": [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar"
  ]
}
```

#### Crear connector Microsoft

```http
POST /v3/connectors
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "provider": "microsoft",
  "settings": {
    "client_id": "YOUR_AZURE_CLIENT_ID",
    "client_secret": "YOUR_AZURE_CLIENT_SECRET",
    "tenant": "common"
  },
  "scope": [
    "Mail.ReadWrite",
    "Mail.Send",
    "Calendar.ReadWrite",
    "offline_access"
  ]
}
```

### 7.3 Webhooks API

#### Crear webhook

```http
POST /v3/webhooks
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "description": "Production webhook",
  "trigger_types": [
    "message.created",
    "message.updated",
    "event.created",
    "event.updated",
    "event.deleted",
    "grant.created",
    "grant.updated",
    "grant.deleted",
    "grant.expired"
  ],
  "webhook_url": "https://myapp.com/webhooks/nylas",
  "notification_email_address": "devops@myapp.com"
}
```

#### Listar webhooks

```http
GET /v3/webhooks
Authorization: Bearer {API_KEY}
```

#### Rotar secreto del webhook

```http
PUT /v3/webhooks/{webhook_id}/rotate-secret
Authorization: Bearer {API_KEY}
```

#### Enviar IP de prueba

```http
POST /v3/webhooks/{webhook_id}/send-test-event
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "trigger_type": "message.created"
}
```

---

## 8. Webhooks y Notificaciones

### 8.1 Trigger Types Disponibles

| Trigger | Descripción |
|---------|-------------|
| `message.created` | Nuevo mensaje recibido |
| `message.updated` | Mensaje actualizado (leído, movido, etc.) |
| `message.deleted` | Mensaje eliminado |
| `thread.updated` | Thread actualizado |
| `thread.deleted` | Thread eliminado |
| `event.created` | Nuevo evento de calendario creado |
| `event.updated` | Evento actualizado |
| `event.deleted` | Evento eliminado |
| `calendar.created` | Nuevo calendario |
| `calendar.updated` | Calendario actualizado |
| `calendar.deleted` | Calendario eliminado |
| `grant.created` | Nuevo grant creado (nuevo usuario autenticado) |
| `grant.updated` | Grant actualizado |
| `grant.deleted` | Grant eliminado |
| `grant.expired` | Grant expirado (necesita reautenticación) |
| `message.bounce_detected` | Email rebotado |
| `message.send_success` | Email enviado exitosamente |
| `message.send_failed` | Fallo en envío |
| `message.opened` | Email abierto (tracking) |
| `message.link_clicked` | Link clickeado en email (tracking) |
| `contact.created` | Contacto creado |
| `contact.updated` | Contacto actualizado |
| `contact.deleted` | Contacto eliminado |
| `notetaker.state_updated` | Estado del notetaker cambiado |

### 8.2 Estructura del Payload del Webhook

```json
{
  "specversion": "1.0",
  "type": "message.created",
  "source": "/nylas/us-west-2",
  "id": "webhook_notif_001",
  "time": 1700000000,
  "webhookDeliveryAttempt": 1,
  "data": {
    "application_id": "app_001",
    "grant_id": "abc123",
    "object": {
      "id": "msg_001",
      "grant_id": "abc123",
      "thread_id": "thread_001",
      "subject": "New order",
      "from": [{"name": "Customer", "email": "customer@example.com"}],
      "to": [{"name": "Support", "email": "support@myapp.com"}],
      "date": 1700000000,
      "unread": true,
      "starred": false,
      "snippet": "I placed an order...",
      "folders": ["INBOX"]
    }
  }
}
```

### 8.3 Verificación de Firma del Webhook

Para verificar autenticidad del webhook:

```python
import hmac
import hashlib

def verify_webhook(payload_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode('utf-8'),
        payload_body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

# En tu endpoint:
signature = request.headers.get('X-Nylas-Signature')
is_valid = verify_webhook(request.body, signature, WEBHOOK_SECRET)
```

```javascript
// Node.js
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}
```

### 8.4 Pub/Sub (Google)

Alternativa a webhooks para cuentas de Google:

```http
POST /v3/connectors
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "provider": "google",
  "settings": {
    "client_id": "...",
    "client_secret": "...",
    "topic_name": "projects/my-project/topics/nylas-events"
  }
}
```

---

## 9. SDKs Oficiales

### 9.1 Python SDK

**Instalación:**
```bash
pip install nylas
```

**Configuración:**
```python
from nylas import Client

nylas = Client(
    api_key="YOUR_API_KEY",
    api_uri="https://api.us.nylas.com"  # opcional
)
```

**Ejemplos de uso:**

```python
# Listar mensajes
messages = nylas.messages.list(
    identifier="grant_abc123",
    query_params={
        "limit": 10,
        "unread": True
    }
)
for msg in messages:
    print(msg.subject, msg.from_)

# Enviar email
message = nylas.messages.send(
    identifier="grant_abc123",
    request_body={
        "subject": "Hello from Nylas SDK",
        "to": [{"name": "John", "email": "john@example.com"}],
        "body": "<p>Hello!</p>"
    }
)

# Crear evento
event = nylas.events.create(
    identifier="grant_abc123",
    request_body={
        "title": "SDK Meeting",
        "when": {
            "start_time": 1700032800,
            "end_time": 1700036400
        },
        "participants": [
            {"email": "attendee@example.com"}
        ]
    },
    query_params={"calendar_id": "cal_primary"}
)

# Listar calendarios
calendars = nylas.calendars.list("grant_abc123")
for cal in calendars:
    print(cal.name, cal.id)
```

### 9.2 Node.js / TypeScript SDK

**Instalación:**
```bash
npm install nylas
```

**Configuración:**
```typescript
import Nylas from 'nylas';

const nylas = new Nylas({
  apiKey: 'YOUR_API_KEY',
  apiUri: 'https://api.us.nylas.com'
});
```

**Ejemplos:**

```typescript
// Listar mensajes
const messages = await nylas.messages.list({
  identifier: 'grant_abc123',
  queryParams: { limit: 10, unread: true }
});

// Enviar email
const message = await nylas.messages.send({
  identifier: 'grant_abc123',
  requestBody: {
    subject: 'Hello from Node SDK',
    to: [{ name: 'Alice', email: 'alice@example.com' }],
    body: '<p>Hello!</p>'
  }
});

// Leer threads
const threads = await nylas.threads.list({
  identifier: 'grant_abc123',
  queryParams: { limit: 20 }
});

// Crear contacto
const contact = await nylas.contacts.create({
  identifier: 'grant_abc123',
  requestBody: {
    givenName: 'Jane',
    surname: 'Doe',
    emails: [{ type: 'work', email: 'jane@example.com' }]
  }
});
```

### 9.3 Ruby SDK

**Instalación:**
```ruby
gem 'nylas'
```

```ruby
require 'nylas'

nylas = Nylas::Client.new(api_key: 'YOUR_API_KEY')

# Listar mensajes
messages, _ = nylas.messages.list(identifier: 'grant_abc123',
                                   query_params: { limit: 10 })

# Enviar email
message, _ = nylas.messages.send(
  identifier: 'grant_abc123',
  request_body: {
    subject: 'Hello from Ruby!',
    to: [{ name: 'Bob', email: 'bob@example.com' }],
    body: '<p>Hello from Ruby SDK</p>'
  }
)
```

### 9.4 Kotlin/Java SDK

**Gradle:**
```groovy
implementation 'com.nylas.sdk:nylas:2.x.x'
```

```kotlin
import com.nylas.NylasClient

val nylas = NylasClient(apiKey = "YOUR_API_KEY")

// Listar mensajes
val messages = nylas.messages().list("grant_abc123")

// Enviar email
val draft = Draft()
draft.subject = "Hello from Kotlin"
draft.to = listOf(EmailName("alice@example.com", "Alice"))
draft.body = "<p>Hello!</p>"
nylas.messages().send("grant_abc123", draft)
```

---

## 10. Códigos de Error

### 10.1 Estructura de Error

```json
{
  "request_id": "req_xyz",
  "error": {
    "type": "invalid_request_error",
    "message": "The parameter 'calendar_id' is required.",
    "provider_error": {
      "provider_type": "google",
      "message": "Calendar not found",
      "provider_error_code": "notFound"
    }
  }
}
```

### 10.2 Códigos HTTP

| Código | Tipo | Descripción |
|--------|------|-------------|
| `200` | OK | Request exitoso |
| `201` | Created | Recurso creado |
| `204` | No Content | Eliminado exitosamente |
| `400` | Bad Request | Parámetros inválidos |
| `401` | Unauthorized | API key/token inválido o faltante |
| `403` | Forbidden | Sin permisos para este recurso |
| `404` | Not Found | Recurso no encontrado |
| `409` | Conflict | Conflicto con estado actual |
| `422` | Unprocessable | Datos válidos pero lógica falla |
| `429` | Too Many Requests | Rate limit alcanzado |
| `500` | Server Error | Error interno de Nylas |
| `502` | Bad Gateway | Error del proveedor upstream |
| `504` | Gateway Timeout | Timeout del proveedor |

### 10.3 Códigos de Error Específicos (700-799)

| Código | Descripción |
|--------|-------------|
| `700` | Invalid grant (grant expirado o revocado) |
| `701` | Provider error (fallo del proveedor: Gmail, Outlook, etc.) |
| `702` | Invalid scope (permisos insuficientes en el grant) |
| `703` | Sending quota exceeded (límite de envío del proveedor alcanzado) |
| `704` | Rate limit exceeded (límite de Nylas o del proveedor) |
| `705` | Invalid message ID |
| `706` | Invalid calendar ID |

---

## 11. Rate Limits y Mejores Prácticas

### 11.1 Rate Limits de Nylas

| Nivel | Límite |
|-------|--------|
| API Requests (por app) | 10,000 requests / minuto |
| API Requests (por grant) | 1,000 requests / minuto |
| Send Email | 100 emails / minuto por grant |
| Webhooks | 1,000 entregas / minuto |

### 11.2 Rate Limits por Proveedor

| Proveedor | Límite aproximado |
|-----------|------------------|
| Gmail | 250 quota units/segundo por usuario |
| Microsoft | 10,000 requests/10 minutos por app |
| IMAP | Variable según servidor |

### 11.3 Manejo de Rate Limits

```python
import time
from nylas.errors import RateLimitError

def fetch_with_retry(func, max_retries=3):
    for attempt in range(max_retries):
        try:
            return func()
        except RateLimitError as e:
            if attempt < max_retries - 1:
                wait = 2 ** attempt  # backoff exponencial
                time.sleep(wait)
            else:
                raise
```

### 11.4 Paginación

Todos los endpoints de listado soportan paginación por cursor:

```python
# Python - paginación manual
page_token = None
all_messages = []

while True:
    params = {"limit": 100}
    if page_token:
        params["page_token"] = page_token
    
    result = nylas.messages.list("grant_id", query_params=params)
    all_messages.extend(result.data)
    
    if not result.next_cursor:
        break
    page_token = result.next_cursor
```

### 11.5 Field Selection

Para reducir el tamaño de respuesta, usa `fields`:

```http
GET /v3/grants/{grant_id}/messages?fields=id,subject,from,date,unread
```

### 11.6 Mejores Prácticas

1. **Usar webhooks en lugar de polling** — evita rate limits y es más eficiente.
2. **Cachear grant_ids** — no consultar la lista de grants en cada request.
3. **Manejar `grant.expired`** — redirigir al usuario para reautenticar cuando el grant expira.
4. **Usar `field_selection`** — solo pedir los campos necesarios.
5. **Backoff exponencial** — al recibir 429, esperar con `2^attempt` segundos.
6. **Validar webhooks** — siempre verificar la firma `X-Nylas-Signature`.
7. **Privacy Mode** — en entornos sensibles, activar para que Nylas no almacene datos de emails.

### 11.7 Privacy Mode

```http
POST /v3/connect/custom/auth
Authorization: Bearer {API_KEY}
X-Nylas-Privacy-Mode: true
Content-Type: application/json

{...}
```

---

## 12. Scopes y Permisos

### 12.1 Google Scopes

| Scope | Acceso |
|-------|--------|
| `https://www.googleapis.com/auth/gmail.readonly` | Leer emails |
| `https://www.googleapis.com/auth/gmail.modify` | Leer y modificar emails |
| `https://www.googleapis.com/auth/gmail.send` | Solo enviar |
| `https://www.googleapis.com/auth/gmail.compose` | Crear borradores y enviar |
| `https://www.googleapis.com/auth/calendar.readonly` | Leer calendarios |
| `https://www.googleapis.com/auth/calendar` | Leer y escribir calendarios |
| `https://www.googleapis.com/auth/contacts.readonly` | Leer contactos |
| `https://www.googleapis.com/auth/contacts` | Leer y escribir contactos |

### 12.2 Microsoft Scopes

| Scope | Acceso |
|-------|--------|
| `Mail.Read` | Leer emails |
| `Mail.ReadWrite` | Leer y modificar emails |
| `Mail.Send` | Enviar emails |
| `Calendar.Read` | Leer calendarios |
| `Calendar.ReadWrite` | Leer y escribir calendarios |
| `Contacts.Read` | Leer contactos |
| `Contacts.ReadWrite` | Leer y escribir contactos |
| `offline_access` | Obtener refresh token |

### 12.3 Scopes de Nylas Granulares

Nylas también ofrece un sistema de scopes granulares propio:

| Scope Nylas | Descripción |
|-------------|-------------|
| `email.read_only` | Solo lectura de emails |
| `email.modify` | Leer y modificar emails (sin envío) |
| `email.send` | Enviar emails |
| `email.drafts` | Gestionar borradores |
| `email.folders_and_labels` | Gestionar carpetas/labels |
| `calendar.read_only` | Solo lectura de calendarios y eventos |
| `calendar.modify` | Crear y modificar eventos |
| `calendar.free_busy` | Solo consultar disponibilidad |
| `contacts.read_only` | Solo lectura de contactos |
| `contacts.modify` | Crear y modificar contactos |

---

## 13. Casos de Uso Comunes

### 13.1 CRM Integration

Automatizar el registro de emails y reuniones:

```python
# Al recibir webhook de message.created
def handle_new_message(webhook_data):
    message = webhook_data['data']['object']
    sender = message['from'][0]['email']
    
    # Buscar contacto en CRM
    crm_contact = crm.find_contact(sender)
    if crm_contact:
        crm.log_activity(
            contact_id=crm_contact.id,
            type='email_received',
            subject=message['subject'],
            timestamp=message['date']
        )
```

### 13.2 Monitor Inbox para Tickets de Soporte

```python
nylas = Client(api_key="...")

# Webhook handler
def process_support_email(data):
    message_id = data['data']['object']['id']
    grant_id = data['data']['grant_id']
    
    # Obtener mensaje completo con body
    msg = nylas.messages.find(grant_id, message_id)
    
    # Crear ticket en sistema de soporte
    ticket = support_system.create_ticket(
        from_email=msg.from_[0].email,
        subject=msg.subject,
        body=msg.body,
        received_at=msg.date
    )
    
    # Mover mensaje a carpeta "Processed"
    nylas.messages.update(grant_id, message_id, {
        "folders": ["Processed"]
    })
```

### 13.3 Scheduling Pipeline para Entrevistas

```python
# 1. Crear configuración de scheduler
config = nylas.scheduling.configurations.create(
    request_body={
        "participants": [{
            "email": "recruiter@company.com",
            "is_organizer": True,
            "availability": {"calendars": [{"account_id": grant_id, "calendar_id": "primary"}]},
            "booking": {"calendar_id": "primary"}
        }],
        "availability": {
            "duration_minutes": 45,
            "availability_rules": {
                "availability_method": "collective",
                "default_open_hours": [{
                    "days": [1, 2, 3, 4, 5],
                    "timezone": "America/New_York",
                    "start": "09:00",
                    "end": "17:00"
                }]
            }
        },
        "event_booking": {
            "title": "Interview - {candidate_name}",
            "conferencing": {"provider": "Google Meet", "autocreate": {}}
        }
    }
)

# 2. Enviar link de booking al candidato
booking_url = f"https://book.nylas.com/{config.id}"
nylas.messages.send(grant_id, {
    "to": [{"email": candidate_email}],
    "subject": "Schedule your interview",
    "body": f"<p>Please book a time: <a href='{booking_url}'>Schedule Interview</a></p>"
})
```

---

## 14. Glosario de Términos

| Término | Definición |
|---------|-----------|
| **Grant** | Permiso otorgado por un usuario para acceder a su cuenta. Identificado por `grant_id`. |
| **Connector** | Configuración del proveedor OAuth para tu app (Google, Microsoft, IMAP). |
| **API Key** | Clave para autenticar requests a nivel de aplicación en el servidor. |
| **Access Token** | Token de usuario específico, obtenido tras el flujo OAuth. |
| **Grant ID** | ID único que identifica el acceso de un usuario específico. |
| **Thread** | Grupo de mensajes relacionados (conversación). |
| **Trigger** | Tipo de evento que dispara un webhook. |
| **Booking** | Una reserva creada a través del Scheduler. |
| **Configuration** | Configuración de una página de scheduling (equivalente a un "tipo de reunión"). |
| **Notetaker** | Bot de IA que se une a videollamadas para transcribir y resumir. |
| **Virtual Calendar** | Calendario manejado por Nylas, independiente del proveedor. |
| **RRULE** | Regla de recurrencia estándar RFC 5545 para eventos repetitivos. |
| **Privacy Mode** | Modo donde Nylas no almacena los datos de email del usuario. |
| **Field Selection** | Técnica para solicitar solo campos específicos en la respuesta. |

---

## 15. Referencias de URLs Completas

| Recurso | URL |
|---------|-----|
| Documentación principal | https://developer.nylas.com/docs/v3/ |
| API Reference ECC (Email/Calendar/Contacts) | https://developer.nylas.com/docs/api/v3/ecc/ |
| API Reference Admin | https://developer.nylas.com/docs/api/v3/admin/ |
| API Reference Scheduler | https://developer.nylas.com/docs/api/v3/scheduler/ |
| Postman Collection | https://www.postman.com/trynylas/workspace/nylas-api/overview |
| Dashboard | https://dashboard-v3.nylas.com |
| Status | https://status-v3.nylas.com |
| Forums | https://forums.nylas.com |