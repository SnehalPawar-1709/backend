// routes/auth.js
const express = require('express');
const r = express.Router();
const { register, login, me } = require('../controllers/authController');
const auth = require('../middleware/auth');
r.post('/register', register);
r.post('/login',    login);
r.get('/me',        auth, me);
module.exports = r;
