/**
 * /api/dashboard — caretaker-only summary counters.
 */
const express = require('express');
const controller = require('../controllers/dashboard.controller');
const { requireCaretaker } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/summary', requireCaretaker, controller.getSummary);

module.exports = router;
