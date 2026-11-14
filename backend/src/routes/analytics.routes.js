/**
 * /api/analytics — caretaker-only.
 */
const express = require('express');
const controller = require('../controllers/analytics.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/dashboard', controller.getDashboard);
router.get('/overview', controller.getOverview);
router.get('/movement', controller.getMovement);
router.get('/alerts', controller.getAlertTrends);

module.exports = router;
