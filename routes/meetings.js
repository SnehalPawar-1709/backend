const express = require('express');
const r       = express.Router();
const auth    = require('../middleware/auth');
const c       = require('../controllers/meetingController');

r.post('/create',                   auth, c.createMeeting);
r.post('/join',                     auth, c.joinMeeting);
r.get('/history',                   auth, c.getHistory);
r.get('/scheduled',                 auth, c.getScheduled);
r.get('/:meetingId',                auth, c.getMeeting);
r.put('/:meetingId/end',            auth, c.endMeeting);
r.delete('/:meetingId',             auth, c.cancelMeeting);
r.post('/:meetingId/transcript',    auth, c.saveTranscript);
r.post('/:meetingId/chat',          auth, c.saveChat);
r.get('/:meetingId/transcript',     auth, c.getTranscript);

module.exports = r;
