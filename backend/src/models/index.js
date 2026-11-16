/**
 * Single import point for every Mongoose model.
 * Importing from here guarantees all schemas are registered before any
 * `populate()` call tries to resolve a ref by name.
 */
module.exports = {
  Caretaker: require('./Caretaker'),
  Patient: require('./Patient'),
  Location: require('./Location'),
  Alert: require('./Alert'),
  SafeZone: require('./SafeZone'),
  DangerZone: require('./DangerZone'),
  AuthSession: require('./AuthSession'),
  TrackingSession: require('./TrackingSession'),
};
