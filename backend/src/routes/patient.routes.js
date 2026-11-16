/**
 * /api/patients — caretaker-only patient management.
 */
const express = require('express');
const controller = require('../controllers/patient.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireCaretaker, requirePatientOwnership } = require('../middleware/auth.middleware');
const schemas = require('../validators/patient.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

// Everything below requires a caretaker session.
router.use(requireCaretaker);

router
  .route('/')
  .get(validate({ query: schemas.listPatientsSchema }), controller.listPatients)
  .post(validate({ body: schemas.createPatientSchema }), controller.createPatient);

router
  .route('/:id')
  .all(validate({ params: idParam }), requirePatientOwnership)
  .get(controller.getPatient)
  .put(validate({ body: schemas.updatePatientSchema }), controller.updatePatient)
  .delete(controller.deletePatient);

router.put(
  '/:id/password',
  validate({ params: idParam, body: schemas.resetPasswordSchema }),
  requirePatientOwnership,
  controller.resetPatientPassword
);

router.get(
  '/:id/zones',
  validate({ params: idParam }),
  requirePatientOwnership,
  controller.getPatientZones
);

router.get(
  '/:id/sessions',
  validate({ params: idParam }),
  requirePatientOwnership,
  controller.getPatientSessions
);

module.exports = router;
