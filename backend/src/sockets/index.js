/**
 * Socket.IO server: real-time location, alerts and presence.
 *
 * Two kinds of client connect, and they are authenticated differently:
 *
 *  - Caretaker dashboards present the JWT in the connection handshake. They are
 *    put into a private room (`caretaker:<id>`) and receive everything about
 *    their own patients.
 *  - Patient phones present a tracking code. They join only their own patient
 *    room and are allowed to emit heartbeats — nothing else.
 *
 * Authentication happens once, in `io.use`, so no event handler has to re-check
 * identity, and a socket can never subscribe to a patient it does not own.
 */
const { Server } = require('socket.io');
const { Patient } = require('../models');
const { verifyToken } = require('../utils/jwt');
const { SOCKET_EVENTS, ROOMS } = require('../utils/constants');
const presenceService = require('../services/presence.service');
const analyticsService = require('../services/analytics.service');
const emitter = require('./emitter');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Handshake authentication.
 *
 * Reads credentials from `socket.handshake.auth` (set by the client's
 * `io(url, { auth })`) and attaches the resolved identity to the socket.
 */
async function authenticateSocket(socket, next) {
  const { token, trackingCode } = socket.handshake.auth || {};

  try {
    if (token) {
      const decoded = verifyToken(token);
      socket.data.role = 'caretaker';
      socket.data.userId = decoded.sub;
      socket.data.email = decoded.email;
      return next();
    }

    if (trackingCode) {
      const patient = await Patient.findOne({
        trackingCode: String(trackingCode).toUpperCase().trim(),
      })
        .select('_id name caretaker isActive')
        .lean();

      if (!patient) return next(new Error('Invalid tracking code'));
      if (!patient.isActive) return next(new Error('Tracking disabled for this patient'));

      socket.data.role = 'patient';
      socket.data.patientId = String(patient._id);
      socket.data.caretakerId = String(patient.caretaker);
      socket.data.patientName = patient.name;
      return next();
    }

    return next(new Error('Authentication required'));
  } catch (err) {
    logger.warn(`Socket authentication rejected: ${err.message}`);
    return next(new Error('Authentication failed'));
  }
}

/** Wire up the handlers available to an authenticated caretaker socket. */
function registerCaretakerHandlers(socket) {
  const caretakerId = socket.data.userId;
  const room = ROOMS.caretaker(caretakerId);

  socket.join(room);
  logger.debug(`Caretaker ${socket.data.email} joined ${room}`);

  /**
   * Watch one patient (the live map focuses on a single patient at a time).
   * Ownership is verified here; a caretaker cannot subscribe to a patient that
   * is not theirs even by guessing the id.
   */
  socket.on(SOCKET_EVENTS.SUBSCRIBE_PATIENT, async (payload, ack) => {
    const patientId = typeof payload === 'string' ? payload : payload?.patientId;
    if (!patientId) return;

    const owned = await Patient.countDocuments({ _id: patientId, caretaker: caretakerId }).catch(
      () => 0
    );

    if (!owned) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Patient not found' });
      return;
    }

    socket.join(ROOMS.patient(String(patientId)));
    if (typeof ack === 'function') ack({ ok: true, patientId: String(patientId) });
  });

  socket.on(SOCKET_EVENTS.UNSUBSCRIBE_PATIENT, (payload) => {
    const patientId = typeof payload === 'string' ? payload : payload?.patientId;
    if (patientId) socket.leave(ROOMS.patient(String(patientId)));
  });

  /** Push fresh dashboard counters on demand. */
  socket.on('stats:request', async (_payload, ack) => {
    try {
      const stats = await analyticsService.getDashboardStats(caretakerId);
      socket.emit(SOCKET_EVENTS.STATS_UPDATE, stats);
      if (typeof ack === 'function') ack({ ok: true, stats });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });
}

/** Wire up the handlers available to an authenticated patient socket. */
function registerPatientHandlers(socket) {
  const { patientId, caretakerId, patientName } = socket.data;

  socket.join(ROOMS.patient(patientId));
  logger.debug(`Patient device for ${patientName} connected`);

  // Tell the caretaker the device is live.
  emitter.emitToCaretaker(caretakerId, SOCKET_EVENTS.PRESENCE_UPDATE, {
    patientId,
    patientName,
    isOnline: true,
    reason: 'device_connected',
    lastSeenAt: new Date(),
  });

  /**
   * Lightweight keep-alive.
   *
   * The phone posts fixes over REST; this heartbeat exists so that a device
   * which has GPS trouble (and therefore no fixes to send) still counts as
   * present rather than being reported offline.
   */
  socket.on(SOCKET_EVENTS.PATIENT_HEARTBEAT, async (payload) => {
    try {
      const patient = await Patient.findById(patientId).select('liveStatus name caretaker');
      if (!patient) return;

      await presenceService.markOnline(patient);

      // Relay battery / GPS status straight through to the dashboard.
      emitter.emitToCaretaker(caretakerId, SOCKET_EVENTS.PRESENCE_UPDATE, {
        patientId,
        patientName: patient.name,
        isOnline: true,
        reason: 'heartbeat',
        batteryLevel: payload?.batteryLevel ?? null,
        isCharging: payload?.isCharging ?? null,
        gpsStatus: payload?.gpsStatus ?? null,
        lastSeenAt: new Date(),
      });
    } catch (err) {
      logger.warn(`Heartbeat handling failed for ${patientId}: ${err.message}`);
    }
  });

  socket.on('disconnect', (reason) => {
    logger.debug(`Patient device for ${patientName} disconnected (${reason})`);

    // A closed tab is not immediately "offline" — the phone may be switching
    // networks. The presence sweep decides, based on when fixes actually
    // stopped arriving. Here we only report that the socket dropped.
    emitter.emitToCaretaker(caretakerId, SOCKET_EVENTS.PRESENCE_UPDATE, {
      patientId,
      patientName,
      isOnline: false,
      reason: 'socket_disconnected',
      socketDisconnectReason: reason,
      lastSeenAt: new Date(),
    });
  });
}

/**
 * Create and attach the Socket.IO server to an existing HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      credentials: true,
    },
    // Patient phones move between mobile networks constantly; a slightly
    // longer window stops a brief dead spot from tearing the session down.
    pingTimeout: 25000,
    pingInterval: 20000,
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    if (socket.data.role === 'caretaker') {
      registerCaretakerHandlers(socket);
    } else if (socket.data.role === 'patient') {
      registerPatientHandlers(socket);
    }

    socket.on('error', (err) => logger.warn(`Socket error: ${err.message}`));
  });

  // Make the instance available to services without a circular import.
  emitter.registerIo(io);

  logger.info('Socket.IO initialised');
  return io;
}

module.exports = { initSockets, authenticateSocket };
