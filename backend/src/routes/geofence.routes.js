/**
 * /api/geofence — safe zones, caretaker-only.
 */
const express = require('express');
const controller = require('../controllers/geofence.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const schemas = require('../validators/zone.validator');
const { idParam } = require('../validators/common.validator');

const router = express.Router();

router.use(requireAuth);

router
  .route('/')
  .get(validate({ query: schemas.listGeofenceSchema }), controller.listGeofences)
  .post(validate({ body: schemas.createGeofenceSchema }), controller.createGeofence);

router
  .route('/:id')
  .all(validate({ params: idParam }))
  .get(controller.getGeofence)
  .put(validate({ body: schemas.updateGeofenceSchema }), controller.updateGeofence)
  .delete(controller.deleteGeofence);

module.exports = router;
