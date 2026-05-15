const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const sign = (u) => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not set in .env');
  return jwt.sign(
    { id: u._id.toString(), name: u.name, email: u.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    console.log('Register attempt:', req.body?.email);
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    if (password.length < 6)
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(400).json({ success: false, message: 'Email already registered. Please login.' });

    const user  = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), password });
    const token = sign(user);

    console.log('User registered:', user.email);
    res.status(201).json({
      success: true,
      token,
      user: { id: user._id.toString(), name: user.name, email: user.email },
    });
  } catch(e) {
    console.error('Register error:', e.message);
    res.status(500).json({ success: false, message: 'Registration failed: ' + e.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    console.log('Login attempt:', req.body?.email);
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password are required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ success: false, message: 'No account found with this email' });

    const match = await user.comparePassword(password);
    if (!match)
      return res.status(401).json({ success: false, message: 'Incorrect password' });

    const token = sign(user);
    console.log('User logged in:', user.email);
    res.json({
      success: true,
      token,
      user: { id: user._id.toString(), name: user.name, email: user.email },
    });
  } catch(e) {
    console.error('Login error:', e.message);
    res.status(500).json({ success: false, message: 'Login failed: ' + e.message });
  }
};

// GET /api/auth/me
exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch(e) {
    console.error('Me error:', e.message);
    res.status(500).json({ success: false, message: 'Failed to get user' });
  }
};
