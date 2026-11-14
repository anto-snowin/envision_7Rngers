/**
 * /api/alerts — caretaker-only.
 */
const express = require('express');
const controller = require('../controllers/alert.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const schemas = require('../validators/alert.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

router.use(requireAuth);

router
  .route('/')
  .get(validate({ query: schemas.listAlertsSchema }), controller.listAlerts)
  .post(validate({ body: schemas.createAlertSchema }), controller.createAlert);

// Static paths before `/:id`.
router.get('/summary', controller.getAlertSummary);
router.patch('/read-all', controller.markAllRead);

router.get('/:id', validate({ params: idParam }), controller.getAlert);
router.patch('/:id/read', validate({ params: idParam }), controller.markRead);
router.patch(
  '/:id/resolve',
  validate({ params: idParam, body: schemas.resolveAlertSchema }),
  controller.resolveAlert
);
router.delete('/:id', validate({ params: idParam }), controller.deleteAlert);

module.exports = router;
