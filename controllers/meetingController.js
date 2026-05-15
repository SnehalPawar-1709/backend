// ============================================================
// MEMORA - Meeting Controller (complete, bug-fixed)
// ============================================================
const Meeting = require('../models/Meeting');
const https   = require('https');

let generateSummary, sendSummaryEmails;
try { generateSummary   = require('../services/summaryService').generateSummary;   } catch(_) { generateSummary   = async()=>({ overview:'', keyPoints:[], decisions:[], actionItems:[], nextSteps:'', fullSummary:'' }); }
try { sendSummaryEmails = require('../services/emailService').sendSummaryEmails;   } catch(_) { sendSummaryEmails = async()=>({ sent:0, failed:0, log:[] }); }

function httpsReq(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: u.hostname, path: u.pathname+(u.search||''), method,
      headers: { ...headers, ...(payload ? { 'Content-Length': Buffer.byteLength(payload), 'Content-Type':'application/json' } : {}) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve({ ok: res.statusCode < 400, data: JSON.parse(raw) }); } catch(_) { resolve({ ok:false, data:{} }); } });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createVideoSDKRoom() {
  const token = process.env.VIDEOSDK_TOKEN;
  if (!token) return 'MEM-' + Math.random().toString(36).substring(2,8).toUpperCase();
  try {
    const r = await httpsReq('POST','https://api.videosdk.live/v2/rooms',{ authorization: token },{});
    return r.data?.roomId || 'MEM-' + Math.random().toString(36).substring(2,8).toUpperCase();
  } catch(e) {
    console.error('VideoSDK room creation failed:', e.message);
    return 'MEM-' + Math.random().toString(36).substring(2,8).toUpperCase();
  }
}

// POST /api/meetings/create
exports.createMeeting = async (req, res) => {
  try {
    const { topic, scheduledAt, password } = req.body;
    const user = req.user;
    if (!topic) return res.status(400).json({ success:false, message:'Topic is required' });

    const meetingId  = await createVideoSDKRoom();
    const isScheduled = !!scheduledAt && new Date(scheduledAt) > new Date();

    const meeting = await Meeting.create({
      meetingId,
      topic:       topic.trim(),
      hostId:      String(user.id),
      hostName:    user.name,
      hostEmail:   user.email,
      // FIX: set status='scheduled' if future date, else 'active'
      status:      isScheduled ? 'scheduled' : 'active',
      startedAt:   isScheduled ? null : new Date(),
      participants: [{ userId: String(user.id), name: user.name, email: user.email }],
      scheduledAt:  scheduledAt ? new Date(scheduledAt) : null,
      password:     password || null,
    });

    console.log(`Meeting ${isScheduled ? 'scheduled' : 'created'}: ${meetingId} by ${user.name}`);

    res.status(201).json({
      success:     true,
      meetingId:   meeting.meetingId,
      topic:       meeting.topic,
      hostName:    meeting.hostName,
      status:      meeting.status,
      scheduledAt: meeting.scheduledAt,
      // Share link for the frontend
      shareLink:   `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join/${meeting.meetingId}`,
    });
  } catch(e) {
    console.error('createMeeting:', e.message);
    res.status(500).json({ success:false, message:'Failed to create meeting: ' + e.message });
  }
};

// POST /api/meetings/join
exports.joinMeeting = async (req, res) => {
  try {
    const { meetingId, password } = req.body;
    const user = req.user;
    if (!meetingId) return res.status(400).json({ success:false, message:'Meeting ID required' });

    const meeting = await Meeting.findOne({ meetingId: { $regex: new RegExp(`^${meetingId.trim()}$`, 'i') } });
    if (!meeting)                    return res.status(404).json({ success:false, message:'Meeting not found. Check the ID.' });
    if (meeting.status === 'ended')  return res.status(400).json({ success:false, message:'This meeting has already ended.' });
    if (meeting.password && meeting.password !== password)
      return res.status(401).json({ success:false, message:'Incorrect meeting password.' });

    // FIX: if scheduled and time not yet reached, return scheduled info so frontend can show countdown
    const now = new Date();
    if (meeting.status === 'scheduled' && meeting.scheduledAt && meeting.scheduledAt > now) {
      return res.json({
        success:     true,
        meetingId:   meeting.meetingId,
        topic:       meeting.topic,
        hostName:    meeting.hostName,
        hostId:      meeting.hostId,
        status:      'scheduled',
        scheduledAt: meeting.scheduledAt,
        // still return so frontend can show waiting room
      });
    }

    // If it was scheduled and time has come, activate it
    if (meeting.status === 'scheduled') {
      meeting.status    = 'active';
      meeting.startedAt = new Date();
      await meeting.save();
    }

    const already = meeting.participants.some(p => p.userId === String(user.id));
    if (!already) {
      meeting.participants.push({ userId: String(user.id), name: user.name, email: user.email });
      await meeting.save();
    }

    console.log(`${user.name} joined: ${meeting.meetingId}`);
    res.json({
      success:   true,
      meetingId: meeting.meetingId,
      topic:     meeting.topic,
      hostName:  meeting.hostName,
      hostId:    meeting.hostId,
      status:    meeting.status,
    });
  } catch(e) {
    console.error('joinMeeting:', e.message);
    res.status(500).json({ success:false, message:'Failed to join: ' + e.message });
  }
};

// PUT /api/meetings/:meetingId/end
exports.endMeeting = async (req, res) => {
  try {
    const { meetingId }      = req.params;
    const { fullTranscript } = req.body;
    const user               = req.user;

    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) return res.status(404).json({ success:false, message:'Meeting not found' });
    if (String(meeting.hostId) !== String(user.id))
      return res.status(403).json({ success:false, message:'Only the host can end the meeting' });
    if (meeting.status === 'ended')
      return res.json({ success:true, summary: meeting.summary, keyPoints: meeting.keyPoints, decisions: meeting.decisions, actionItems: meeting.actionItems, duration: meeting.duration });

    const endedAt  = new Date();
    const started  = meeting.startedAt || endedAt;
    const duration = Math.max(1, Math.floor((endedAt - started) / 60000));
    const transcript = fullTranscript || meeting.transcriptLines.map(l=>`[${l.speaker}]: ${l.text}`).join('\n');

    meeting.status         = 'ended';
    meeting.endedAt        = endedAt;
    meeting.duration       = duration;
    meeting.fullTranscript = transcript;
    await meeting.save();

    let summaryData = { overview:'', keyPoints:[], decisions:[], actionItems:[], nextSteps:'', fullSummary:'' };
    try {
      summaryData = await generateSummary({ topic: meeting.topic, duration, participants: meeting.participants.map(p=>p.name), transcript });
    } catch(e) { console.warn('Summary error:', e.message); }

    meeting.summary     = summaryData.fullSummary || '';
    meeting.keyPoints   = summaryData.keyPoints   || [];
    meeting.decisions   = summaryData.decisions   || [];
    meeting.actionItems = summaryData.actionItems || [];
    await meeting.save();

    console.log(`Meeting ended: ${meetingId} (${duration} min)`);
    res.json({ success:true, summary: summaryData.fullSummary, overview: summaryData.overview, keyPoints: summaryData.keyPoints, decisions: summaryData.decisions, actionItems: summaryData.actionItems, nextSteps: summaryData.nextSteps, duration });

    setImmediate(async () => {
      try {
        const latest = await Meeting.findOne({ meetingId });
        if (latest?.emailSent) return;
        const result = await sendSummaryEmails({ topic: meeting.topic, meetingId: meeting.meetingId, duration, endedAt, hostName: meeting.hostName, hostEmail: meeting.hostEmail, summary: summaryData.fullSummary, keyPoints: summaryData.keyPoints, decisions: summaryData.decisions, actionItems: summaryData.actionItems, recordingUrl: meeting.recordingUrl, participants: meeting.participants.map(p=>({ name:p.name, email:p.email })) });
        await Meeting.findOneAndUpdate({ meetingId }, { emailSent: result.sent>0, emailSentAt: new Date(), emailLog: result.log||[] });
        console.log(`Emails — sent:${result.sent} failed:${result.failed}`);
      } catch(e) { console.error('Email bg error:', e.message); }
    });
  } catch(e) {
    console.error('endMeeting:', e.message);
    res.status(500).json({ success:false, message: e.message });
  }
};

// POST /api/meetings/:meetingId/transcript
exports.saveTranscript = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { speaker, text, timestamp, language } = req.body;
    if (!text) return res.status(400).json({ success:false, message:'text required' });
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) return res.status(404).json({ success:false, message:'Meeting not found' });
    meeting.transcriptLines.push({ speaker: speaker||'Unknown', text, language: language||'en', timestamp: timestamp||new Date() });
    await meeting.save();
    res.json({ success:true });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// POST /api/meetings/:meetingId/chat
exports.saveChat = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { message }   = req.body;
    const user          = req.user;
    if (!message) return res.status(400).json({ success:false, message:'message required' });
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) return res.status(404).json({ success:false, message:'Meeting not found' });
    meeting.chatMessages.push({ senderId: String(user.id), senderName: user.name, message });
    await meeting.save();
    res.json({ success:true });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/meetings/history
exports.getHistory = async (req, res) => {
  try {
    const { page=1, limit=10 } = req.query;
    const userId = String(req.user.id);
    const query  = { $or:[{ hostId: userId },{ 'participants.userId': userId }] };
    const [meetings, total] = await Promise.all([
      Meeting.find(query).sort({ createdAt:-1 }).skip((page-1)*limit).limit(parseInt(limit)).select('-transcriptLines -chatMessages -fullTranscript -emailLog'),
      Meeting.countDocuments(query),
    ]);
    res.json({ success:true, meetings, total, pages: Math.ceil(total/limit) });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/meetings/scheduled
exports.getScheduled = async (req, res) => {
  try {
    const userId   = String(req.user.id);
    // Return all scheduled meetings for this user (host or participant)
    const meetings = await Meeting.find({
      $or:[{ hostId: userId },{ 'participants.userId': userId }],
      status:      'scheduled',
      scheduledAt: { $gte: new Date(Date.now() - 60*60*1000) }, // include meetings that started up to 1hr ago
    }).sort({ scheduledAt: 1 });
    res.json({ success:true, meetings });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/meetings/:meetingId
exports.getMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });
    if (!meeting) return res.status(404).json({ success:false, message:'Meeting not found' });
    res.json({ success:true, meeting });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// DELETE /api/meetings/:meetingId  (cancel a scheduled meeting)
exports.cancelMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const user          = req.user;
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) return res.status(404).json({ success:false, message:'Meeting not found' });
    if (String(meeting.hostId) !== String(user.id))
      return res.status(403).json({ success:false, message:'Only host can cancel this meeting' });
    await Meeting.findOneAndUpdate({ meetingId }, { status:'ended', endedAt: new Date() });
    res.json({ success:true, message:'Meeting cancelled' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// GET /api/meetings/:meetingId/transcript
exports.getTranscript = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ meetingId: req.params.meetingId })
      .select('transcriptLines fullTranscript topic summary keyPoints decisions actionItems');
    if (!meeting) return res.status(404).json({ success:false, message:'Meeting not found' });
    res.json({ success:true, ...meeting.toObject() });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};
