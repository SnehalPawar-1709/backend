require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const mongoose   = require('mongoose');
const cors       = require('cors');

const app    = express();
const server = http.createServer(app);

const origins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all origins
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors()); // handle preflight
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Request logger ────────────────────────────────────────────
app.use((req, _, next) => {
  console.log(`→ ${req.method} ${req.originalUrl}`);
  next();
});

// ── Socket.IO ─────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
});
try { require('./socket/socketHandler')(io); } catch(e) { console.error('Socket handler error:', e.message); }

// ── MongoDB ───────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/memora')
  .then(() => console.log('✓ MongoDB connected'))
  .catch(e  => console.error('✗ MongoDB error:', e.message));

// ── Route loader (shows exact error) ─────────────────────────
const load = (path, name) => {
  try {
    const route = require(path);
    console.log(`✓ Route loaded: ${name}`);
    return route;
  } catch(e) {
    console.error(`✗ ROUTE LOAD FAILED [${name}]: ${e.message}`);
    const r = require('express').Router();
    r.all('*', (_, res) => res.status(500).json({ success: false, message: `${name} failed to load: ${e.message}` }));
    return r;
  }
};

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',       load('./routes/auth',       'auth'));
app.use('/api/meetings',   load('./routes/meetings',   'meetings'));
app.use('/api/recordings', load('./routes/recordings', 'recordings'));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', async (_, res) => {
  let emailStatus = 'not checked';
  try { emailStatus = (await require('./services/emailService').testEmail()).message; } catch(_) {}
  res.json({
    status:     'OK',
    app:        'Memora v3.0',
    db:         mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    videosdk:   process.env.VIDEOSDK_TOKEN     ? 'OK' : 'MISSING',
    openai:     process.env.OPENAI_API_KEY     ? 'OK' : 'MISSING (fallback)',
    cloudinary: process.env.CLOUDINARY_API_KEY ? `OK (${process.env.CLOUDINARY_CLOUD_NAME})` : 'MISSING',
    email:      emailStatus,
  });
});

app.get('/api/email/test', async (_, res) => {
  try { res.json(await require('./services/emailService').testEmail()); }
  catch(e) { res.json({ ok: false, message: e.message }); }
});

// ── 404 ───────────────────────────────────────────────────────

// Cloudinary test
app.get('/api/cloudinary/test', async (_, res) => {
  try {
    if (!process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY === 'REPLACE_THIS')
      return res.json({ ok:false, message:'Cloudinary not configured in .env' });
    const cloudinary = require('./config/cloudinary');
    const result     = await cloudinary.api.ping();
    res.json({ ok:true, message:`Cloudinary OK (${process.env.CLOUDINARY_CLOUD_NAME})`, result });
  } catch(e) {
    res.json({ ok:false, message:'Cloudinary error: '+e.message, fix:'Check CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in backend/.env' });
  }
});
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`\n🚀 Memora v3.0 → http://localhost:${PORT}`);
  console.log(`❤  Health      → http://localhost:${PORT}/api/health\n`);
  console.log(`VideoSDK  : ${process.env.VIDEOSDK_TOKEN     ? '✓ OK' : '✗ MISSING'}`);
  console.log(`OpenAI    : ${process.env.OPENAI_API_KEY     ? '✓ OK' : '✗ MISSING (fallback)'}`);
  console.log(`Cloudinary: ${process.env.CLOUDINARY_API_KEY ? `✓ OK (${process.env.CLOUDINARY_CLOUD_NAME})` : '✗ MISSING'}`);
  console.log(`Email     : ${process.env.EMAIL_USER         ? `✓ ${process.env.EMAIL_USER}` : '✗ MISSING'}\n`);
});

// TEMP DEBUG: check recordings in DB
app.get('/api/debug/recordings', async (req, res) => {
  try {
    const Meeting = require('./models/Meeting');
    const all = await Meeting.find({ isRecorded: true }).select('meetingId topic hostId hostName recordingUrl isRecorded participants createdAt');
    res.json({ count: all.length, meetings: all });
  } catch(e) { res.json({ error: e.message }); }
});
