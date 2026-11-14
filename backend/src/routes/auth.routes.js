/**
 * /api/auth
 */
const express = require('express');
const controller = require('../controllers/auth.controller');
const { validate } = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimit.middleware');
const schemas = require('../validators/auth.validator');

const router = express.Router();

// Public, rate limited to blunt brute-force attempts.
router.post(
  '/register',
  authLimiter,
  validate({ body: schemas.registerSchema }),
  controller.register
);
router.post('/login', authLimiter, validate({ body: schemas.loginSchema }), controller.login);

// Everything below needs a valid token.
router.use(requireAuth);

router.get('/me', controller.getCurrentUser);
router.put('/me', validate({ body: schemas.updateProfileSchema }), controller.updateProfile);
router.put(
  '/password',
  validate({ body: schemas.changePasswordSchema }),
  controller.changePassword
);
router.post('/logout', controller.logout);
router.get('/sessions', controller.listSessions);
router.delete('/sessions/:sessionId', controller.revokeSession);

module.exports = router;
