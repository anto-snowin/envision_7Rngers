/**
 * Process entry point: connect to MongoDB, start HTTP + Socket.IO, begin the
 * presence sweep, and shut all of it down cleanly on a signal.
 */
const http = require('http');

const app = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const { initSockets } = require('./sockets');
const { startPresenceSweep, stopPresenceSweep } = require('./services/presence.service');
const env = require('./config/env');
const logger = require('./utils/logger');

const server = http.createServer(app);
let io = null;

async function start() {
  // Refuse to serve traffic without a database: every endpoint needs it, and
  // failing loudly at boot beats returning 500s to a caretaker mid-emergency.
  await connectDatabase();

  io = initSockets(server);
  startPresenceSweep();

  server.listen(env.PORT, () => {
    logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
    logger.info(`Allowed origins: ${env.CORS_ORIGINS.join(', ') || '(none configured)'}`);
  });
}

/**
 * Graceful shutdown: stop accepting connections, close sockets, then release
 * the database handle. In-flight location writes get a chance to finish.
 */
async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);

  stopPresenceSweep();

  const forceExit = setTimeout(() => {
    logger.error('Shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    if (io) await io.close();
    await new Promise((resolve) => server.close(resolve));
    await disconnectDatabase();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown:', err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM')); // Render sends this on deploy
process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl-C locally

/**
 * An unhandled rejection or uncaught exception leaves the process in an unknown
 * state. Log it and exit so the platform restarts a clean instance.
 */
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err.message, err.stack);
  shutdown('uncaughtException');
});

start().catch((err) => {
  logger.error('Failed to start server:', err.message);
  process.exit(1);
});

module.exports = { server, start, shutdown };
