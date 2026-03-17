/**
 * Cliente de Nylas API v3 - Usando SDK oficial
 */
import "dotenv/config";
import Nylas from "nylas";

const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY,
  apiUri: process.env.NYLAS_API_URL || "https://api.us.nylas.com",
});

/**
 * Obtiene la disponibilidad de un asesor usando Free/Busy
 * @param {string} grantId - Grant ID del asesor
 * @param {string} email - Email del asesor
 * @param {number} startTime - Unix timestamp inicio
 * @param {number} endTime - Unix timestamp fin
 */
export async function getFreeBusy(grantId, email, startTime, endTime) {
  const response = await nylas.calendars.getFreeBusy({
    identifier: grantId,
    requestBody: {
      startTime: startTime,
      endTime: endTime,
      emails: [email],
    },
  });
  return response.data;
}

/**
 * Lista los calendarios de un asesor
 * @param {string} grantId - Grant ID del asesor
 */
export async function getCalendars(grantId) {
  const response = await nylas.calendars.list({
    identifier: grantId,
  });
  return response.data;
}

/**
 * Lista eventos de un calendario
 * @param {string} grantId - Grant ID del asesor
 * @param {string} calendarId - ID del calendario
 * @param {number} startTime - Unix timestamp inicio
 * @param {number} endTime - Unix timestamp fin
 */
export async function getEvents(grantId, calendarId, startTime, endTime) {
  const response = await nylas.events.list({
    identifier: grantId,
    queryParams: {
      calendarId: calendarId,
      start: startTime.toString(),
      end: endTime.toString(),
      limit: 50,
    },
  });
  return response.data;
}

/**
 * Crea un evento en el calendario
 * @param {string} grantId - Grant ID del asesor
 * @param {string} calendarId - ID del calendario
 * @param {object} eventData - Datos del evento
 */
export async function createEvent(grantId, calendarId, eventData) {
  const response = await nylas.events.create({
    identifier: grantId,
    requestBody: {
      title: eventData.title,
      description: eventData.description || "",
      when: {
        startTime: eventData.when.start_time,
        endTime: eventData.when.end_time,
      },
      participants: eventData.participants,
      location: eventData.location,
      conferencing: eventData.conferencing,
    },
    queryParams: {
      calendarId: calendarId,
    },
  });
  return response.data;
}

/**
 * Actualiza un evento existente
 * @param {string} grantId - Grant ID del asesor
 * @param {string} calendarId - ID del calendario
 * @param {string} eventId - ID del evento
 * @param {object} eventData - Datos a actualizar
 */
export async function updateEvent(grantId, calendarId, eventId, eventData) {
  const requestBody = {};
  
  if (eventData.title) requestBody.title = eventData.title;
  if (eventData.description) requestBody.description = eventData.description;
  if (eventData.when) {
    requestBody.when = {
      startTime: eventData.when.start_time,
      endTime: eventData.when.end_time,
    };
  }
  if (eventData.participants) requestBody.participants = eventData.participants;
  if (eventData.location) requestBody.location = eventData.location;
  if (eventData.conferencing) requestBody.conferencing = eventData.conferencing;

  const response = await nylas.events.update({
    identifier: grantId,
    eventId: eventId,
    requestBody: requestBody,
    queryParams: {
      calendarId: calendarId,
    },
  });
  return response.data;
}

/**
 * Elimina un evento
 * @param {string} grantId - Grant ID del asesor
 * @param {string} calendarId - ID del calendario
 * @param {string} eventId - ID del evento
 */
export async function deleteEvent(grantId, calendarId, eventId) {
  await nylas.events.destroy({
    identifier: grantId,
    eventId: eventId,
    queryParams: {
      calendarId: calendarId,
    },
  });
  return { success: true };
}
