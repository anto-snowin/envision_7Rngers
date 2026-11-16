/**
 * /api/alerts — caretaker-only alert feed and acknowledgement.
 */
const express = require('express');
const controller = require('../controllers/alert.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireCaretaker, requirePatientOwnership } = require('../middleware/auth.middleware');
const schemas = require('../validators/alert.validator');
const { idParam, patientIdParam } = require('../validators/common.validator');

const router = express.Router();

router.use(requireCaretaker);

router.get('/', validate({ query: schemas.listAlertsSchema }), controller.listAlerts);

// Declared before `/:id/...` only for readability; the paths differ in segment
// count, so there is no ambiguity for the router to resolve.
router.put('/read-all', validate({ body: schemas.markAllReadSchema }), controller.markAllRead);

router.put('/:id/read', validate({ params: idParam }), controller.markRead);

router.put(
  '/:id/resolved',
  validate({ params: idParam, body: schemas.resolveAlertSchema }),
  controller.markResolved
);

router.get(
  '/:patientId',
  validate({ params: patientIdParam, query: schemas.pagination }),
  requirePatientOwnership,
  controller.listPatientAlerts
);

module.exports = router;
