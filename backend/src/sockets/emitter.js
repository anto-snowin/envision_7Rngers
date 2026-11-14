/**
 * Socket.IO emitter registry.
 *
 * Services need to broadcast, but they must not import the HTTP/socket layer —
 * that would create a cycle (server -> sockets -> services -> sockets). So the
 * server registers the live `io` instance here at boot and services emit
 * through these helpers. Before registration every call is a safe no-op, which
 * also keeps the services unit-testable without a running socket server.
 */
const { ROOMS } = require('../utils/constants');
const logger = require('../utils/logger');

/** @type {import('socket.io').Server | null} */
let io = null;

/** Called once from server.js after the Socket.IO server is created. */
function registerIo(instance) {
  io = instance;
  logger.debug('Socket emitter registered');
}

/** The raw instance, for code that needs rooms/adapters directly. */
function getIo() {
  return io;
}

/** Emit to every dashboard session belonging to one caretaker. */
function emitToCaretaker(caretakerId, event, payload) {
  if (!io || !caretakerId) return;
  io.to(ROOMS.caretaker(String(caretakerId))).emit(event, payload);
}

/** Emit to the patient's own device room plus anyone watching that patient. */
function emitToPatientRoom(patientId, event, payload) {
  if (!io || !patientId) return;
  io.to(ROOMS.patient(String(patientId))).emit(event, payload);
}

/**
 * Emit to both the owning caretaker and the patient room. Most domain events
 * (a new fix, a new alert) are interesting to both audiences.
 */
function emitPatientEvent(patient, event, payload) {
  if (!patient) return;
  emitToCaretaker(patient.caretaker, event, payload);
  emitToPatientRoom(patient._id || patient.id, event, payload);
}

/** How many sockets are currently in a room (used for presence checks). */
async function roomSize(room) {
  if (!io) return 0;
  const sockets = await io.in(room).fetchSockets();
  return sockets.length;
}

module.exports = {
  registerIo,
  getIo,
  emitToCaretaker,
  emitToPatientRoom,
  emitPatientEvent,
  roomSize,
};
