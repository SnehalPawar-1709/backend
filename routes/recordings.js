const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const auth    = require('../middleware/auth');
const { uploadRecording, getAllRecordings, getRecording, deleteRecording } = require('../controllers/recordingController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Only video/audio files allowed'), false);
  },
});

router.get('/',                   auth, getAllRecordings);
router.post('/upload', auth, upload.single('recording'), uploadRecording);
router.get('/:meetingId',         auth, getRecording);
router.delete('/:meetingId',      auth, deleteRecording);

module.exports = router;
