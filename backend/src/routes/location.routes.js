/**
 * /api/location
 *
 * Split cleanly by role: the write endpoints take a patient token and act on
 * "me", the read endpoints take a caretaker token and name a patient. No route
 * here accepts a patient id from a patient-authenticated client, so a device
 * cannot write a fix against someone else.
 */
const express = require('express');
const controller = require('../controllers/location.controller');
const { validate } = require('../middleware/validate.middleware');
const { ingestLimiter } = require('../middleware/rateLimit.middleware');
const {
  requireCaretaker,
  requirePatient,
  requirePatientOwnership,
} = require('../middleware/auth.middleware');
const schemas = require('../validators/location.validator');
const { patientIdParam } = require('../validators/common.validator');

const router = express.Router();

/* ----------------------------------------------- patient device (writes) --- */

// `requirePatient` runs before the limiter so the limiter can key on the
// authenticated patient id rather than on a spoofable body field.
router.post(
  '/update',
  requirePatient,
  ingestLimiter,
  validate({ body: schemas.updateLocationSchema }),
  controller.updateLocation
);

router.post(
  '/ping',
  requirePatient,
  ingestLimiter,
  validate({ body: schemas.pingSchema }),
  controller.ping
);

router.post('/sos', requirePatient, validate({ body: schemas.sosSchema }), controller.raiseSos);

router.post(
  '/device-event',
  requirePatient,
  validate({ body: schemas.deviceEventSchema }),
  controller.deviceEvent
);

router.get('/me', requirePatient, controller.myStatus);

/* ------------------------------------------------ caretaker side (reads) --- */

router.get(
  '/latest/:patientId',
  requireCaretaker,
  validate({ params: patientIdParam }),
  requirePatientOwnership,
  controller.latestLocation
);

router.get(
  '/history/:patientId',
  requireCaretaker,
  validate({ params: patientIdParam, query: schemas.historyQuerySchema }),
  requirePatientOwnership,
  controller.locationHistory
);

router.get(
  '/alerts/:patientId',
  requireCaretaker,
  validate({ params: patientIdParam }),
  requirePatientOwnership,
  controller.patientAlerts
);

module.exports = router;
