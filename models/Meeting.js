const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  userId:   { type: String, default: '' },
  name:     { type: String, required: true },
  email:    { type: String, default: '' },
  joinedAt: { type: Date, default: Date.now },
});

const transcriptLineSchema = new mongoose.Schema({
  speaker:   { type: String, default: 'Unknown' },
  text:      { type: String, required: true },
  language:  { type: String, default: 'en' },
  timestamp: { type: Date, default: Date.now },
});

const chatMessageSchema = new mongoose.Schema({
  senderId:   { type: String, default: '' },
  senderName: { type: String, required: true },
  message:    { type: String, required: true },
  timestamp:  { type: Date, default: Date.now },
});

const emailLogSchema = new mongoose.Schema({
  email:  { type: String },
  status: { type: String, enum: ['sent','failed'], default: 'sent' },
  sentAt: { type: Date, default: Date.now },
  error:  { type: String, default: '' },
});

const meetingSchema = new mongoose.Schema({
  meetingId:           { type: String, unique: true, required: true },
  topic:               { type: String, required: true, trim: true },
  hostId:              { type: String, default: '' },
  hostName:            { type: String, required: true },
  hostEmail:           { type: String, default: '' },
  // BUG FIX: added 'scheduled' as valid status
  status:              { type: String, enum: ['scheduled','active','ended'], default: 'active' },
  startedAt:           { type: Date, default: null },
  endedAt:             { type: Date },
  duration:            { type: Number, default: 0 },
  participants:        [participantSchema],
  transcriptLines:     [transcriptLineSchema],
  chatMessages:        [chatMessageSchema],
  fullTranscript:      { type: String, default: '' },
  summary:             { type: String, default: '' },
  keyPoints:           [String],
  decisions:           [String],
  actionItems:         [String],
  recordingUrl:        { type: String, default: null },
  recordingPublicId:   { type: String, default: null },
  isRecorded:          { type: Boolean, default: false },
  recordingUploadedAt: { type: Date },
  emailSent:           { type: Boolean, default: false },
  emailSentAt:         { type: Date },
  emailLog:            [emailLogSchema],
  scheduledAt:         { type: Date, default: null },
  password:            { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Meeting', meetingSchema);
