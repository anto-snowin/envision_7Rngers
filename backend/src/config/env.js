/**
 * Centralised, validated environment configuration.
 *
 * Every process-level setting is read exactly once here so that the rest of the
 * codebase never touches `process.env` directly. Missing critical values fail
 * fast on boot rather than surfacing as confusing runtime errors later.
 */
require('dotenv').config({ quiet: true });

/** Read a required variable, throwing when it is absent in production. */
function required(key, fallback) {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** Parse a comma separated list into a trimmed array. */
function list(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const env = {
  NODE_ENV,
  isProduction,
  isTest: NODE_ENV === 'test',

  PORT: Number(process.env.PORT || 5000),

  // MongoDB Atlas connection string.
  MONGODB_URI: required(
    'MONGODB_URI',
    isProduction ? undefined : 'mongodb://127.0.0.1:27017/dementia-care'
  ),

  // JWT signing material. A weak dev default is tolerated outside production.
  JWT_SECRET: required('JWT_SECRET', isProduction ? undefined : 'dev-only-insecure-jwt-secret'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // Comma separated list of allowed browser origins.
  CORS_ORIGINS: list(process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'),

  // Tracking / alerting behaviour.
  LOCATION_INTERVAL_MS: Number(process.env.LOCATION_INTERVAL_MS || 5000),
  OFFLINE_THRESHOLD_MS: Number(process.env.OFFLINE_THRESHOLD_MS || 30000),
  PRESENCE_SWEEP_MS: Number(process.env.PRESENCE_SWEEP_MS || 15000),
  LOW_BATTERY_THRESHOLD: Number(process.env.LOW_BATTERY_THRESHOLD || 20),
  POOR_ACCURACY_THRESHOLD_M: Number(process.env.POOR_ACCURACY_THRESHOLD_M || 150),

  // Minimum gap between two identical alerts for the same patient (anti-spam).
  ALERT_COOLDOWN_MS: Number(process.env.ALERT_COOLDOWN_MS || 120000),

  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 1000),
  AUTH_RATE_LIMIT_MAX: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),

  TRUST_PROXY: process.env.TRUST_PROXY || (isProduction ? '1' : 'loopback'),
};

module.exports = env;
