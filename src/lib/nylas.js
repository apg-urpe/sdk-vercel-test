/**
 * Cliente de Nylas API v3
 */
import "dotenv/config";

const NYLAS_API_KEY = process.env.NYLAS_API_KEY;
const NYLAS_API_URL = process.env.NYLAS_API_URL || "https://api.us.nylas.com";

/**
 * Hace una petición a la API de Nylas
 */
async function nylasRequest(endpoint, options = {}) {
  const url = `${NYLAS_API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${NYLAS_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Nylas API Error: ${response.status} - ${JSON.stringify(error)}`);
  }

  return response.json();
}

/**
 * Obtiene la disponibilidad de un asesor usando Free/Busy
 * @param {string} grantId - Grant ID del asesor
 * @param {number} startTime - Unix timestamp inicio
 * @param {number} endTime - Unix timestamp fin
 */
export async function getFreeBusy(grantId, startTime, endTime) {
  const result = await nylasRequest(`/v3/grants/${grantId}/calendars/free-busy`, {
    method: "POST",
    body: JSON.stringify({
      start_time: startTime,
      end_time: endTime,
      emails: [], // Vacío para obtener del propio grant
    }),
  });
  return result.data;
}

/**
 * Lista los calendarios de un asesor
 * @param {string} grantId - Grant ID del asesor
 */
export async function getCalendars(grantId) {
  const result = await nylasRequest(`/v3/grants/${grantId}/calendars`);
  return result.data;
}

/**
 * Lista eventos de un calendario
 * @param {string} grantId - Grant ID del asesor
 * @param {string} calendarId - ID del calendario
 * @param {number} startTime - Unix timestamp inicio
 * @param {number} endTime - Unix timestamp fin
 */
export async function getEvents(grantId, calendarId, startTime, endTime) {
  const params = new URLSearchParams({
    calendar_id: calendarId,
    start: startTime.toString(),
    end: endTime.toString(),
    limit: "50",
  });
  const result = await nylasRequest(`/v3/grants/${grantId}/events?${params}`);
  return result.data;
}

/**
 * Crea un evento en el calendario
 * @param {string} grantId - Grant ID del asesor
 * @param {string} calendarId - ID del calendario
 * @param {object} eventData - Datos del evento
 */
export async function createEvent(grantId, calendarId, eventData) {
  const params = new URLSearchParams({ calendar_id: calendarId });
  const result = await nylasRequest(`/v3/grants/${grantId}/events?${params}`, {
    method: "POST",
    body: JSON.stringify(eventData),
  });
  return result.data;
}

/**
 * Actualiza un evento existente
 * @param {string} grantId - Grant ID del asesor
 * @param {string} calendarId - ID del calendario
 * @param {string} eventId - ID del evento
 * @param {object} eventData - Datos a actualizar
 */
export async function updateEvent(grantId, calendarId, eventId, eventData) {
  const params = new URLSearchParams({ calendar_id: calendarId });
  const result = await nylasRequest(`/v3/grants/${grantId}/events/${eventId}?${params}`, {
    method: "PUT",
    body: JSON.stringify(eventData),
  });
  return result.data;
}

/**
 * Elimina un evento
 * @param {string} grantId - Grant ID del asesor
 * @param {string} calendarId - ID del calendario
 * @param {string} eventId - ID del evento
 */
export async function deleteEvent(grantId, calendarId, eventId) {
  const params = new URLSearchParams({ calendar_id: calendarId });
  await nylasRequest(`/v3/grants/${grantId}/events/${eventId}?${params}`, {
    method: "DELETE",
  });
  return { success: true };
}
