/**
 * Minimal levelled logger. Keeps output greppable without pulling in a
 * heavyweight logging framework.
 */
const env = require('../config/env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? (env.isProduction ? LEVELS.info : LEVELS.debug);

function emit(level, args) {
  if (LEVELS[level] > threshold) return;
  const stamp = new Date().toISOString();
  const line = `[${stamp}] [${level.toUpperCase()}]`;

  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(line, ...args);
}

module.exports = {
  error: (...args) => emit('error', args),
  warn: (...args) => emit('warn', args),
  info: (...args) => emit('info', args),
  debug: (...args) => emit('debug', args),
};
