/**
 * /api/patients — caretaker-only.
 */
const express = require('express');
const controller = require('../controllers/patient.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireAuth, requirePatientOwnership } = require('../middleware/auth.middleware');
const schemas = require('../validators/patient.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

router.use(requireAuth);

// Collection routes.
router
  .route('/')
  .get(validate({ query: schemas.listPatientsSchema }), controller.listPatients)
  .post(validate({ body: schemas.createPatientSchema }), controller.createPatient);

// `/live` must be declared before `/:id` or Express would treat "live" as an id.
router.get('/live', controller.listLivePatients);

// Single-patient routes. `requirePatientOwnership` loads req.patient and
// guarantees it belongs to the signed-in caretaker.
router
  .route('/:id')
  .all(validate({ params: idParam }), requirePatientOwnership)
  .get(controller.getPatient)
  .put(validate({ body: schemas.updatePatientSchema }), controller.updatePatient)
  .delete(controller.deletePatient);

router.get(
  '/:id/zones',
  validate({ params: idParam }),
  requirePatientOwnership,
  controller.getPatientZones
);

router.post(
  '/:id/regenerate-code',
  validate({ params: idParam }),
  requirePatientOwnership,
  controller.regenerateTrackingCode
);

module.exports = router;
