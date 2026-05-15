const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:            { type: String, required: true, trim: true },
  email:           { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:        { type: String, required: true, minlength: 6 },
  avatar:          { type: String, default: '' },
  meetingsHosted:  { type: Number, default: 0 },
  meetingsJoined:  { type: Number, default: 0 },
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch(e) {
    next(e);
  }
});

userSchema.methods.comparePassword = async function(candidate) {
  try {
    return await bcrypt.compare(candidate, this.password);
  } catch(e) {
    console.error('comparePassword error:', e.message);
    return false;
  }
};

module.exports = mongoose.model('User', userSchema);
