/**
 * /api/auth — sign-in for both roles.
 *
 * Every credential-accepting route sits behind the stricter auth limiter, which
 * is keyed per IP and far tighter than the general API budget.
 */
const express = require('express');
const controller = require('../controllers/auth.controller');
const { validate } = require('../middleware/validate.middleware');
const { authLimiter } = require('../middleware/rateLimit.middleware');
const { requireAnyRole, requireCaretaker } = require('../middleware/auth.middleware');
const schemas = require('../validators/auth.validator');

const router = express.Router();

/* ----------------------------------------------------------- caretaker --- */

router.post(
  '/caretaker/register',
  authLimiter,
  validate({ body: schemas.caretakerRegisterSchema }),
  controller.registerCaretaker
);

router.post(
  '/caretaker/login',
  authLimiter,
  validate({ body: schemas.caretakerLoginSchema }),
  controller.loginCaretaker
);

/* ------------------------------------------------------------- patient --- */

router.post(
  '/patient/login',
  authLimiter,
  validate({ body: schemas.patientLoginSchema }),
  controller.loginPatient
);

/* -------------------------------------------------------------- shared --- */

router.post('/logout', requireAnyRole, controller.logout);
router.get('/me', requireAnyRole, controller.me);

/* ------------------------------------------- caretaker account management --- */

router.get('/sessions', requireCaretaker, controller.listSessions);
router.delete(
  '/sessions/:sessionId',
  requireCaretaker,
  validate({ params: schemas.sessionIdParam }),
  controller.revokeSession
);

router.put(
  '/password',
  requireCaretaker,
  validate({ body: schemas.changePasswordSchema }),
  controller.changePassword
);

module.exports = router;
