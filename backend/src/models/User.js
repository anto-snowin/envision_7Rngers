/**
 * User (caretaker) account.
 *
 * Only caretakers authenticate. Patients are tracked subjects and never hold
 * credentials, which is why there is no patient login anywhere in the system.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name must be at most 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Never selected by default so it cannot leak through a stray `find()`.
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    phone: { type: String, trim: true, default: '' },
    organisation: { type: String, trim: true, default: '' },
    role: {
      type: String,
      enum: ['caretaker', 'admin'],
      default: 'caretaker',
    },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      alertSound: { type: Boolean, default: true },
      emailAlerts: { type: Boolean, default: false },
    },
    lastLoginAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true, // createdAt / updatedAt
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * Hash the password whenever it is set or changed.
 *
 * Declared `async` with no `next` parameter: Mongoose 9 resolves the returned
 * promise and no longer supplies a callback to async middleware.
 */
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

/** Compare a plaintext candidate against the stored hash. */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
