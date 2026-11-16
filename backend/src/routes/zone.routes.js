/**
 * /api/zones — safe zones and danger zones, caretaker-only.
 *
 * The two kinds get parallel route trees (`/zones/safe`, `/zones/danger`)
 * rather than one tree with a `kind` parameter, so each can validate against
 * its own schema — the radius floor and the extra fields genuinely differ.
 */
const express = require('express');
const controller = require('../controllers/zone.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireCaretaker, requirePatientOwnership } = require('../middleware/auth.middleware');
const schemas = require('../validators/zone.validator');
const { idParam, patientIdParam } = require('../validators/common.validator');

const router = express.Router();

router.use(requireCaretaker);

/* ------------------------------------------------------------ safe zones --- */

router
  .route('/safe')
  .get(validate({ query: schemas.listZonesSchema }), controller.listSafeZones)
  .post(validate({ body: schemas.createSafeZoneSchema }), controller.createSafeZone);

router
  .route('/safe/:id')
  .all(validate({ params: idParam }))
  .put(validate({ body: schemas.updateSafeZoneSchema }), controller.updateSafeZone)
  .delete(controller.deleteSafeZone);

/* ---------------------------------------------------------- danger zones --- */

router
  .route('/danger')
  .get(validate({ query: schemas.listZonesSchema }), controller.listDangerZones)
  .post(validate({ body: schemas.createDangerZoneSchema }), controller.createDangerZone);

router
  .route('/danger/:id')
  .all(validate({ params: idParam }))
  .put(validate({ body: schemas.updateDangerZoneSchema }), controller.updateDangerZone)
  .delete(controller.deleteDangerZone);

/* ------------------------------------------------------- both, per patient --- */

router.get(
  '/patient/:patientId',
  validate({ params: patientIdParam }),
  requirePatientOwnership,
  controller.zonesForPatient
);

module.exports = router;
