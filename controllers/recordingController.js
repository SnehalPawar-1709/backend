// ============================================================
// MEMORA - Recording Controller
// Copied approach from working project — multipart stream to Cloudinary
// IMPORTANT: No eager/format params — they cause Invalid Signature on this account
// ============================================================
const cloudinary   = require('../config/cloudinary');
const Meeting      = require('../models/Meeting');
const { Readable } = require('stream');

// POST /api/recordings/upload
const uploadRecording = async (req, res) => {
  try {
    const { meetingId } = req.body;
    const file          = req.file;

    if (!file || !meetingId) {
      return res.status(400).json({ success:false, message:'Recording file and meeting ID are required' });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME === 'your_cloud_name_here') {
      return res.status(500).json({ success:false, message:'Cloudinary not configured. Add CLOUDINARY_* to backend/.env' });
    }

    const id = meetingId.trim();
    console.log(`\n📹 Uploading recording for meeting ${id} (${(file.size/1024/1024).toFixed(2)} MB)`);

    // Find or create meeting record
    const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let meeting  = await Meeting.findOne({ meetingId: { $regex: new RegExp(`^${safeId}$`, 'i') } });

    if (!meeting) {
      meeting = await Meeting.create({
        meetingId: id, topic: 'Meeting ' + id,
        hostName:  req.user?.name || 'Host',
        hostEmail: req.user?.email || '',
        hostId:    String(req.user?.id || ''),
        status:    'ended', startedAt: new Date(), endedAt: new Date(),
        participants: [{ userId: String(req.user?.id||''), name: req.user?.name||'Host', email: req.user?.email||'' }],
      });
    } else if (!meeting.hostId) {
      await Meeting.findOneAndUpdate({ _id: meeting._id }, { hostId: String(req.user?.id||'') });
      meeting.hostId = String(req.user?.id || '');
    }

    // Prevent duplicate
    if (meeting.isRecorded && meeting.recordingUrl) {
      console.log(`   Duplicate upload prevented`);
      return res.json({ success:true, recordingUrl: meeting.recordingUrl, duplicate:true, sizeMB:'0' });
    }

    // Stream buffer to Cloudinary
    // ⚠️ ONLY resource_type, folder, public_id — NO eager/format (causes Invalid Signature)
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder:        `memora/recordings`,
          public_id:     `recording_${id}_${Date.now()}`,
        },
        (error, result) => error ? reject(error) : resolve(result)
      );
      const readable = new Readable();
      readable.push(file.buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });

    // Save URL to MongoDB
    await Meeting.findOneAndUpdate(
      { _id: meeting._id },
      {
        recordingUrl:        uploadResult.secure_url,
        recordingPublicId:   uploadResult.public_id,
        isRecorded:          true,
        recordingUploadedAt: new Date(),
      }
    );

    console.log(`✅ Recording uploaded successfully: ${uploadResult.secure_url}`);

    res.json({
      success:      true,
      message:      'Recording uploaded to Cloudinary successfully!',
      recordingUrl: uploadResult.secure_url,
      publicId:     uploadResult.public_id,
      sizeMB:       (uploadResult.bytes / 1024 / 1024).toFixed(2),
    });

  } catch(error) {
    console.error('Recording upload error:', error);
    if (error.http_code === 401 || error.message?.includes('Signature') || error.message?.includes('Invalid'))
      return res.status(500).json({ success:false, message:'Cloudinary auth failed', hint:'Check CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in backend/.env' });
    res.status(500).json({ success:false, message:'Upload failed: ' + error.message });
  }
};

// GET /api/recordings  — all recordings for this user
const getAllRecordings = async (req, res) => {
  try {
    const userId = String(req.user.id);
    console.log(`\n📋 getAllRecordings — user: ${userId}`);

    // Two separate queries — avoids $or + field conflict bug
    const [asHost, asParticipant] = await Promise.all([
      Meeting.find({ hostId: userId, isRecorded: true, recordingUrl: { $exists: true, $nin: [null, ''] } })
        .select('meetingId topic recordingUrl recordingPublicId recordingUploadedAt endedAt duration hostName hostId participants summary keyPoints isRecorded createdAt'),
      Meeting.find({ 'participants.userId': userId, isRecorded: true, recordingUrl: { $exists: true, $nin: [null, ''] } })
        .select('meetingId topic recordingUrl recordingPublicId recordingUploadedAt endedAt duration hostName hostId participants summary keyPoints isRecorded createdAt'),
    ]);

    const seen = new Set();
    const all  = [...asHost, ...asParticipant].filter(m => {
      const k = String(m._id);
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).sort((a, b) => new Date(b.recordingUploadedAt||b.createdAt) - new Date(a.recordingUploadedAt||a.createdAt));

    console.log(`   asHost:${asHost.length} asParticipant:${asParticipant.length} total:${all.length}`);
    res.json({ success: true, recordings: all, count: all.length });

  } catch(e) {
    console.error('getAllRecordings error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/recordings/:meetingId
const getRecording = async (req, res) => {
  try {
    const id = req.params.meetingId?.trim();
    const m  = await Meeting.findOne({ meetingId: { $regex: new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i') } })
      .select('meetingId topic recordingUrl isRecorded endedAt duration hostName');
    if (!m) return res.status(404).json({ success:false, message:'Meeting not found' });
    res.json({ success:true, recording: m });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

// DELETE /api/recordings/:meetingId
const deleteRecording = async (req, res) => {
  try {
    const id = req.params.meetingId?.trim();
    const m  = await Meeting.findOne({ meetingId: { $regex: new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,'i') } });
    if (!m) return res.status(404).json({ success:false, message:'Meeting not found' });
    if (String(m.hostId) !== String(req.user.id)) return res.status(403).json({ success:false, message:'Only host can delete' });
    if (m.recordingPublicId) {
      try { await cloudinary.uploader.destroy(m.recordingPublicId, { resource_type:'video' }); } catch(_) {}
    }
    await Meeting.findOneAndUpdate({ _id: m._id }, { recordingUrl:null, recordingPublicId:null, isRecorded:false, recordingUploadedAt:null });
    res.json({ success:true, message:'Recording deleted' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
};

module.exports = { uploadRecording, getAllRecordings, getRecording, deleteRecording };
