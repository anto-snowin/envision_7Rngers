/**
 * /api/location
 *
 * This router mixes two very different audiences:
 *
 *  - The patient's phone (no login). It authenticates with the patient's
 *    tracking code and may only *write* its own fixes.
 *  - The caretaker dashboard (JWT). It may only *read*, and only for patients
 *    it owns.
 *
 * The write routes are declared first and each is explicitly gated by
 * `requireTrackingCode`, so no caretaker route can accidentally inherit the
 * patient-facing authentication.
 */
const express = require('express');
const controller = require('../controllers/location.controller');
const { validate } = require('../middleware/validate.middleware');
const {
  requireAuth,
  requireTrackingCode,
  requirePatientOwnership,
} = require('../middleware/auth.middleware');
const { ingestLimiter } = require('../middleware/rateLimit.middleware');
const schemas = require('../validators/location.validator');
const { patientIdParam, trackingCode } = require('../validators/common.validator');
const { z } = require('zod');

const router = express.Router();

// ---------------------------------------------------------------- patient side

/** Open a tracking session when the patient portal loads. */
router.post(
  '/session/:trackingCode',
  ingestLimiter,
  validate({ params: z.object({ trackingCode }) }),
  requireTrackingCode,
  controller.startTrackingSession
);

/** A single live fix, posted every ~5 seconds. */
router.post(
  '/',
  ingestLimiter,
  validate({ body: schemas.createLocationSchema }),
  requireTrackingCode,
  controller.createLocation
);

/** A backlog of fixes buffered while the phone was offline. */
router.post(
  '/batch',
  ingestLimiter,
  validate({ body: schemas.batchLocationSchema }),
  requireTrackingCode,
  controller.createLocationBatch
);

/** SOS button. */
router.post(
  '/sos',
  ingestLimiter,
  validate({ body: schemas.sosSchema }),
  requireTrackingCode,
  controller.triggerSos
);

/** GPS / connectivity problems the phone observed. */
router.post(
  '/device-event',
  ingestLimiter,
  validate({ body: schemas.deviceEventSchema }),
  requireTrackingCode,
  controller.reportDeviceEvent
);

// -------------------------------------------------------------- caretaker side

router.use(requireAuth);

/** Route history for the history page and playback. */
router.get(
  '/history/:patientId',
  validate({ params: patientIdParam, query: schemas.historyQuerySchema }),
  requirePatientOwnership,
  controller.getHistory
);

/** Short recent trail drawn behind the live marker. */
router.get(
  '/trail/:patientId',
  validate({ params: patientIdParam }),
  requirePatientOwnership,
  controller.getTrail
);

/** Latest known fix. Declared last so it cannot shadow the paths above. */
router.get(
  '/:patientId',
  validate({ params: patientIdParam }),
  requirePatientOwnership,
  controller.getLatestLocation
);

module.exports = router;
