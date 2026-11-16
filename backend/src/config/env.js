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

  /**
   * Tracking cadence.
   *
   * The patient device uploads a fix every three minutes. The offline
   * threshold is deliberately a little over two cycles: one missed upload is
   * routine (a tunnel, a lift, a slow fix), so alerting on it would train the
   * caretaker to ignore the alert. Two consecutive misses is a real signal.
   *
   * The sweep runs every minute, which bounds how late an offline alert can
   * be rather than how soon it can fire.
   */
  LOCATION_INTERVAL_MS: Number(process.env.LOCATION_INTERVAL_MS || 3 * 60 * 1000),
  OFFLINE_THRESHOLD_MS: Number(process.env.OFFLINE_THRESHOLD_MS || 7 * 60 * 1000),
  PRESENCE_SWEEP_MS: Number(process.env.PRESENCE_SWEEP_MS || 60 * 1000),
  LOW_BATTERY_THRESHOLD: Number(process.env.LOW_BATTERY_THRESHOLD || 20),
  POOR_ACCURACY_THRESHOLD_M: Number(process.env.POOR_ACCURACY_THRESHOLD_M || 150),

  // Minimum gap between two identical alerts for the same patient (anti-spam).
  ALERT_COOLDOWN_MS: Number(process.env.ALERT_COOLDOWN_MS || 120000),

  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),

  /**
   * General API budget per window, per IP.
   *
   * Sized against real traffic rather than a round number. Ingest itself is
   * cheap at one fix per patient every three minutes, but several caretakers
   * behind one NAT share an IP, and each dashboard refetches on socket events.
   * 2,000 per 15 minutes leaves comfortable headroom while still stopping
   * abuse. Location ingest has its own, tighter limiter keyed per patient, so
   * this budget is not the only thing protecting the write path.
   */
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 2000),

  AUTH_RATE_LIMIT_MAX: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),

  TRUST_PROXY: process.env.TRUST_PROXY || (isProduction ? '1' : 'loopback'),
};

module.exports = env;
