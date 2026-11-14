/**
 * /api/danger-zone — caretaker-only.
 */
const express = require('express');
const controller = require('../controllers/dangerZone.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const schemas = require('../validators/zone.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

router.use(requireAuth);

router
  .route('/')
  .get(validate({ query: schemas.listDangerZoneSchema }), controller.listDangerZones)
  .post(validate({ body: schemas.createDangerZoneSchema }), controller.createDangerZone);

// Static path before the `/:id` matcher.
router.get('/categories', controller.listCategories);

router
  .route('/:id')
  .all(validate({ params: idParam }))
  .get(controller.getDangerZone)
  .put(validate({ body: schemas.updateDangerZoneSchema }), controller.updateDangerZone)
  .delete(controller.deleteDangerZone);

module.exports = router;
