/**
 * Single import point for every Mongoose model.
 * Importing from here guarantees all schemas are registered before any
 * `populate()` call tries to resolve a ref by name.
 */
module.exports = {
  User: require('./User'),
  Patient: require('./Patient'),
  Location: require('./Location'),
  Alert: require('./Alert'),
  Geofence: require('./Geofence'),
  DangerZone: require('./DangerZone'),
  Session: require('./Session'),
};
