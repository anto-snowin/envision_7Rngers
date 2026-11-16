/**
 * Socket.IO server: real-time location, alerts and presence.
 *
 * Both roles connect with the same credential they use for REST — a JWT in the
 * handshake `auth` payload — and the token's `role` claim decides what the
 * socket may do:
 *
 *  - a caretaker joins a private room (`caretaker:<id>`) and receives
 *    everything about their own patients;
 *  - a patient device joins only its own room (`patient:<id>`) and may emit
 *    heartbeats, nothing else.
 *
 * Authentication happens once, in `io.use`, so no event handler has to re-check
 * identity — and a socket can never subscribe to a patient it does not own.
 */
const { Server } = require('socket.io');
const { Caretaker, Patient, AuthSession } = require('../models');
const { verifyToken } = require('../utils/jwt');
const { ROLES, SOCKET_EVENTS, ROOMS } = require('../utils/constants');
const presenceService = require('../services/presence.service');
const dashboardService = require('../services/dashboard.service');
const emitter = require('./emitter');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Handshake authentication.
 *
 * The session is checked here as well as in the REST middleware, because a
 * socket outlives the request that opened it: without this, a token revoked by
 * signing out elsewhere would keep streaming a patient's live position for as
 * long as the tab stayed open.
 */
async function authenticateSocket(socket, next) {
  const { token } = socket.handshake.auth || {};

  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = verifyToken(token);

    if (decoded.sid) {
      const session = await AuthSession.findOne({ sessionId: decoded.sid })
        .select('isRevoked')
        .lean();
      if (!session || session.isRevoked) return next(new Error('Session has been signed out'));
    }

    if (decoded.role === ROLES.CARETAKER) {
      const caretaker = await Caretaker.findById(decoded.sub).select('_id email isActive').lean();
      if (!caretaker || !caretaker.isActive) return next(new Error('Account unavailable'));

      socket.data.role = ROLES.CARETAKER;
      socket.data.caretakerId = String(caretaker._id);
      socket.data.email = caretaker.email;
      return next();
    }

    if (decoded.role === ROLES.PATIENT) {
      const patient = await Patient.findById(decoded.sub)
        .select('_id name caretaker isActive')
        .lean();
      if (!patient) return next(new Error('Patient account unavailable'));
      if (!patient.isActive) return next(new Error('Tracking disabled for this account'));

      socket.data.role = ROLES.PATIENT;
      socket.data.patientId = String(patient._id);
      socket.data.caretakerId = String(patient.caretaker);
      socket.data.patientName = patient.name;
      return next();
    }

    return next(new Error('Unknown role'));
  } catch (err) {
    logger.warn(`Socket authentication rejected: ${err.message}`);
    return next(new Error('Authentication failed'));
  }
}

/** Handlers available to an authenticated caretaker socket. */
function registerCaretakerHandlers(socket) {
  const caretakerId = socket.data.caretakerId;
  const room = ROOMS.caretaker(caretakerId);

  socket.join(room);
  logger.debug(`Caretaker ${socket.data.email} joined ${room}`);

  /**
   * Watch one patient (the live map focuses on a single patient at a time).
   * Ownership is verified here, so a caretaker cannot subscribe to a patient
   * that is not theirs even by guessing the id.
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
  socket.on(SOCKET_EVENTS.STATS_REQUEST, async (_payload, ack) => {
    try {
      const stats = await dashboardService.getSummary(caretakerId);
      socket.emit(SOCKET_EVENTS.STATS_UPDATE, stats);
      if (typeof ack === 'function') ack({ ok: true, stats });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });
}

/** Handlers available to an authenticated patient device socket. */
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
   * With fixes three minutes apart, this is what keeps the dashboard's
   * online/offline indicator responsive — and it means a device whose GPS
   * cannot get a lock still registers as present rather than as missing.
   */
  socket.on(SOCKET_EVENTS.PATIENT_HEARTBEAT, async (payload) => {
    try {
      const patient = await Patient.findById(patientId).select('liveStatus name caretaker');
      if (!patient) return;

      await presenceService.markOnline(patient);

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

    /**
     * A dropped socket is not the same as an offline patient — phones switch
     * between wifi and mobile data constantly. The presence sweep decides that,
     * based on when fixes actually stopped arriving; this event only reports
     * that the live channel went away.
     */
    emitter.emitToCaretaker(caretakerId, SOCKET_EVENTS.PRESENCE_UPDATE, {
      patientId,
      patientName,
      socketConnected: false,
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
    if (socket.data.role === ROLES.CARETAKER) {
      registerCaretakerHandlers(socket);
    } else if (socket.data.role === ROLES.PATIENT) {
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
