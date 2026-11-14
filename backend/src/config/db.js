/**
 * MongoDB Atlas connection handling.
 */
const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

// Fail queries that reference undeclared schema paths instead of silently
// returning every document.
mongoose.set('strictQuery', true);

/** Open the shared Mongoose connection. Safe to call once at boot. */
async function connectDatabase(uri = env.MONGODB_URI) {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', err.message));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    autoIndex: !env.isProduction, // build indexes in dev; manage explicitly in prod
  });

  return mongoose.connection;
}

/** Close the connection cleanly (used on shutdown and in tests). */
async function disconnectDatabase() {
  await mongoose.connection.close();
}

module.exports = { connectDatabase, disconnectDatabase };
