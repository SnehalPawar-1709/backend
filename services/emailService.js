// ============================================================
// MEMORA - Email Service
// Sends professional HTML email + PDF summary attachment
// ============================================================
const nodemailer = require('nodemailer');

const isConfigured = () => {
  const u = (process.env.EMAIL_USER || '').trim();
  const p = (process.env.EMAIL_PASS || '').replace(/\s/g, '');
  return u.includes('@') && p.length >= 16;
};

const makeTransport = () => nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 587, secure: false,
  auth: {
    user: (process.env.EMAIL_USER || '').trim(),
    pass: (process.env.EMAIL_PASS || '').replace(/\s/g, ''),
  },
  connectionTimeout: 15000,
  socketTimeout:     30000,
});

// ── Generate PDF buffer using PDFKit ─────────────────────────
const generatePDF = (data) => {
  return new Promise((resolve, reject) => {
    let PDFDocument;
    try { PDFDocument = require('pdfkit'); }
    catch(e) { return reject(new Error('pdfkit not installed. Run: npm install pdfkit')); }

    const {
      topic = '', meetingId = '', duration = 0, hostName = '',
      endedAt, participants = [], summary = '',
      keyPoints = [], decisions = [], actionItems = [], recordingUrl,
    } = data;

    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const dateStr = new Date(endedAt || Date.now()).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', weekday:'long', year:'numeric',
      month:'long', day:'numeric', hour:'2-digit', minute:'2-digit',
    });

    // ── Color palette ─────────────────────────────────────────
    const INDIGO  = '#4F46E5';
    const DARK    = '#1E293B';
    const GRAY    = '#64748B';
    const LIGHT   = '#F8FAFC';
    const WHITE   = '#FFFFFF';
    const GREEN   = '#10B981';
    const AMBER   = '#F59E0B';
    const BLACK   = '#0F172A';

    const W = doc.page.width;  // 595
    const M = 50;              // margin

    // ── HEADER BANNER ─────────────────────────────────────────
    doc.rect(0, 0, W, 110).fill(INDIGO);

    // Logo circle
    doc.circle(M + 24, 55, 24).fill(WHITE);
    doc.fontSize(22).fillColor(INDIGO).font('Helvetica-Bold').text('M', M + 14, 43);

    // Brand name
    doc.fontSize(26).fillColor(WHITE).font('Helvetica-Bold').text('Memora', M + 60, 36);
    doc.fontSize(11).fillColor('rgba(255,255,255,0.75)').font('Helvetica')
      .text('Where Moments Become Memories', M + 60, 65);

    // Page number placeholder
    doc.fontSize(9).fillColor('rgba(255,255,255,0.6)').font('Helvetica')
      .text('Meeting Summary Report', W - 200, 90, { width: 150, align: 'right' });

    doc.y = 130;

    // ── MEETING TITLE ─────────────────────────────────────────
    doc.fontSize(20).fillColor(BLACK).font('Helvetica-Bold')
      .text(topic || 'Meeting Summary', M, doc.y, { width: W - M*2 });
    doc.moveDown(0.4);
    doc.fontSize(11).fillColor(GRAY).font('Helvetica')
      .text(`Meeting ended · ${dateStr}`, M, doc.y);
    doc.moveDown(1);

    // ── DIVIDER ───────────────────────────────────────────────
    const divider = () => {
      doc.moveTo(M, doc.y).lineTo(W - M, doc.y).strokeColor('#E2E8F0').lineWidth(1).stroke();
      doc.moveDown(0.6);
    };
    divider();

    // ── MEETING DETAILS TABLE ─────────────────────────────────
    doc.fontSize(10).fillColor(INDIGO).font('Helvetica-Bold')
      .text('MEETING DETAILS', M, doc.y);
    doc.moveDown(0.5);

    const details = [
      ['Meeting ID',   meetingId],
      ['Host',         hostName],
      ['Date & Time',  dateStr],
      ['Duration',     `${duration} minute${duration !== 1 ? 's' : ''}`],
      ['Participants', String(participants.length)],
    ];

    const rowH = 24;
    const col1 = M;
    const col2 = M + 130;

    details.forEach(([label, value], i) => {
      const y = doc.y;
      // Alternating row background
      if (i % 2 === 0) doc.rect(col1 - 6, y - 4, W - M*2 + 12, rowH).fill('#F8FAFC');
      doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(label, col1, y, { width: 120 });
      doc.fontSize(10).fillColor(BLACK).font('Helvetica-Bold').text(value, col2, y, { width: W - col2 - M });
      doc.y = y + rowH;
    });

    doc.moveDown(1);
    divider();

    // ── PARTICIPANTS LIST ─────────────────────────────────────
    if (participants.length > 0) {
      doc.fontSize(10).fillColor(INDIGO).font('Helvetica-Bold').text('PARTICIPANTS', M, doc.y);
      doc.moveDown(0.5);
      participants.forEach((p, i) => {
        const name  = p.name  || 'Unknown';
        const email = p.email ? ` <${p.email}>` : '';
        doc.fontSize(10).fillColor(BLACK).font('Helvetica')
          .text(`${i + 1}.  ${name}${email}`, M + 10, doc.y);
        doc.moveDown(0.35);
      });
      doc.moveDown(0.6);
      divider();
    }

    // ── HELPER: section block ─────────────────────────────────
    const section = (title, items, color = INDIGO, isBullet = true) => {
      if (!items || items.length === 0) return;
      // Check if we need new page
      if (doc.y > 680) doc.addPage();
      doc.fontSize(10).fillColor(color).font('Helvetica-Bold').text(title, M, doc.y);
      doc.moveDown(0.5);
      items.forEach(item => {
        const prefix = isBullet ? '•   ' : '    ';
        doc.fontSize(10).fillColor(BLACK).font('Helvetica')
          .text(prefix + item, M + 10, doc.y, { width: W - M*2 - 10 });
        doc.moveDown(0.4);
      });
      doc.moveDown(0.6);
      divider();
    };

    // ── KEY POINTS ────────────────────────────────────────────
    section('KEY DISCUSSION POINTS', keyPoints, INDIGO);

    // ── DECISIONS ─────────────────────────────────────────────
    section('DECISIONS MADE', decisions, GREEN);

    // ── ACTION ITEMS ──────────────────────────────────────────
    section('ACTION ITEMS', actionItems, AMBER);

    // ── FULL SUMMARY ─────────────────────────────────────────
    if (summary) {
      if (doc.y > 620) doc.addPage();
      doc.fontSize(10).fillColor(INDIGO).font('Helvetica-Bold').text('FULL SUMMARY', M, doc.y);
      doc.moveDown(0.5);
      doc.rect(M - 6, doc.y - 6, W - M*2 + 12, 1).fill(LIGHT); // subtle bg start
      doc.fontSize(10).fillColor('#374151').font('Helvetica')
        .text(summary, M + 6, doc.y, { width: W - M*2 - 12, lineGap: 4 });
      doc.moveDown(1);
      divider();
    }

    // ── RECORDING LINK ────────────────────────────────────────
    if (recordingUrl) {
      if (doc.y > 700) doc.addPage();
      doc.fontSize(10).fillColor(INDIGO).font('Helvetica-Bold').text('RECORDING', M, doc.y);
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor(INDIGO).font('Helvetica')
        .text(recordingUrl, M + 6, doc.y, {
          width: W - M*2 - 12, link: recordingUrl, underline: true,
        });
      doc.moveDown(1);
      divider();
    }

    // ── FOOTER ────────────────────────────────────────────────
    const footerY = doc.page.height - 60;
    doc.rect(0, footerY - 10, W, 70).fill('#F8FAFC');
    doc.moveTo(0, footerY - 10).lineTo(W, footerY - 10).strokeColor('#E2E8F0').stroke();
    doc.fontSize(9).fillColor(GRAY).font('Helvetica')
      .text(
        `Generated by Memora  ·  ${new Date().toLocaleDateString('en-IN')}  ·  Meeting ID: ${meetingId}`,
        M, footerY + 4, { width: W - M*2, align: 'center' }
      );
    doc.fontSize(9).fillColor(GRAY).font('Helvetica')
      .text('© 2026 Memora — Where Moments Become Memories', M, footerY + 20, { width: W - M*2, align: 'center' });

    doc.end();
  });
};

// ── HTML email template ───────────────────────────────────────
const buildHTML = ({ topic, meetingId, duration, hostName, endedAt, participants, summary, keyPoints, decisions, actionItems, recordingUrl }) => {
  const date  = new Date(endedAt || Date.now()).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const pList = (participants||[]).map(p=>`<li style="padding:4px 0;color:#374151;font-size:13px">${p.name}${p.email?` <span style="color:#6B7280">&lt;${p.email}&gt;</span>`:''}</li>`).join('');
  const kpList= (keyPoints||[]).map(k=>`<li style="padding:3px 0;color:#374151;font-size:13px">${k}</li>`).join('');
  const dList = (decisions||[]).map(d=>`<li style="padding:3px 0;color:#374151;font-size:13px">${d}</li>`).join('');
  const aList = (actionItems||[]).map(a=>`<li style="padding:3px 0;color:#374151;font-size:13px">${a}</li>`).join('');
  const sumHtml = (summary||'').replace(/\n/g,'<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meeting Summary — ${topic}</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Inter,Arial,system-ui,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);border-radius:16px 16px 0 0;padding:32px 36px;text-align:center">
    <div style="width:56px;height:56px;background:rgba(255,255,255,.15);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">
      <span style="color:#fff;font-size:24px;font-weight:800">M</span>
    </div>
    <h1 style="color:#fff;font-size:22px;font-weight:800;margin:0 0 4px;letter-spacing:-.3px">Memora</h1>
    <p style="color:rgba(255,255,255,.7);font-size:12px;margin:0">Where Moments Become Memories</p>
  </div>

  <!-- White body -->
  <div style="background:#fff;padding:32px 36px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0">

    <h2 style="color:#0F172A;font-size:20px;font-weight:700;margin:0 0 6px">Your meeting has ended</h2>
    <p style="color:#64748B;font-size:13px;margin:0 0 24px">The full summary is attached as a <strong>PDF file</strong>. You can open it directly on any device.</p>

    <!-- Meeting info card -->
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:20px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="color:#64748B;padding:5px 0;width:110px;vertical-align:top">Topic</td><td style="color:#0F172A;font-weight:600;padding:5px 0">${topic}</td></tr>
        <tr><td style="color:#64748B;padding:5px 0">Meeting ID</td><td style="color:#4F46E5;font-family:monospace;font-size:12px;padding:5px 0">${meetingId}</td></tr>
        <tr><td style="color:#64748B;padding:5px 0">Host</td><td style="color:#0F172A;padding:5px 0">${hostName}</td></tr>
        <tr><td style="color:#64748B;padding:5px 0">Date</td><td style="color:#0F172A;padding:5px 0">${date}</td></tr>
        <tr><td style="color:#64748B;padding:5px 0">Duration</td><td style="color:#0F172A;padding:5px 0">${duration} minute${duration!==1?'s':''}</td></tr>
        <tr><td style="color:#64748B;padding:5px 0">Attendees</td><td style="color:#0F172A;padding:5px 0">${(participants||[]).length}</td></tr>
      </table>
    </div>

    ${pList?`<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:16px">
      <p style="color:#4F46E5;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">Participants</p>
      <ul style="margin:0;padding-left:16px">${pList}</ul></div>`:''}

    ${kpList?`<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:16px">
      <p style="color:#4F46E5;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">Key Points</p>
      <ul style="margin:0;padding-left:16px">${kpList}</ul></div>`:''}

    ${dList?`<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;padding:20px;margin-bottom:16px">
      <p style="color:#059669;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">✓ Decisions Made</p>
      <ul style="margin:0;padding-left:16px">${dList}</ul></div>`:''}

    ${aList?`<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:20px;margin-bottom:16px">
      <p style="color:#D97706;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">⚡ Action Items</p>
      <ul style="margin:0;padding-left:16px">${aList}</ul></div>`:''}

    ${sumHtml?`<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:16px">
      <p style="color:#4F46E5;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">Summary</p>
      <div style="color:#374151;font-size:13px;line-height:1.8">${sumHtml}</div></div>`:''}

    ${recordingUrl?`<div style="text-align:center;margin-bottom:16px">
      <a href="${recordingUrl}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:13px;font-weight:600">▶ Watch Recording</a></div>`:''}

    <!-- PDF note -->
    <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:16px;margin-top:8px">
      <p style="margin:0;font-size:12px;color:#92400E">📎 <strong>Attachment:</strong> The full meeting summary PDF is attached to this email. Open it for a nicely formatted printable report.</p>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:0 0 16px 16px;padding:20px 36px;text-align:center">
    <p style="color:#94A3B8;font-size:11px;margin:0">This email was sent automatically when your Memora meeting ended.</p>
    <p style="color:#94A3B8;font-size:11px;margin:4px 0 0">For questions, contact the meeting host.</p>
    <p style="color:#CBD5E1;font-size:10px;margin:8px 0 0">© ${new Date().getFullYear()} Memora — Where Moments Become Memories</p>
  </div>
</div>
</body>
</html>`;
};

// ── Plain text fallback ───────────────────────────────────────
const buildText = ({ topic, meetingId, duration, hostName, endedAt, participants, summary, keyPoints, actionItems, recordingUrl }) => {
  const date = new Date(endedAt || Date.now()).toLocaleString('en-IN');
  return `MEMORA MEETING SUMMARY
======================
Topic     : ${topic}
ID        : ${meetingId}
Host      : ${hostName}
Date      : ${date}
Duration  : ${duration} min
Attendees : ${(participants||[]).length}

PARTICIPANTS:
${(participants||[]).map((p,i)=>`  ${i+1}. ${p.name}${p.email?` <${p.email}>`:''}`).join('\n')||'  None'}

KEY POINTS:
${(keyPoints||[]).map(k=>`  • ${k}`).join('\n')||'  None recorded'}

ACTION ITEMS:
${(actionItems||[]).map(a=>`  • ${a}`).join('\n')||'  None recorded'}

SUMMARY:
${summary||'No summary available.'}

${recordingUrl?`RECORDING:\n${recordingUrl}`:''}

---
Generated by Memora — Smart Meeting System`;
};

// ── Main send function ────────────────────────────────────────
const sendSummaryEmails = async (data) => {
  if (!isConfigured()) {
    console.warn('Email not configured — skipping');
    return { sent: 0, failed: 0, skipped: true, log: [] };
  }

  // Build unique recipient list
  const emailSet = new Set();
  (data.participants || []).forEach(p => { if (p.email?.includes('@')) emailSet.add(p.email.toLowerCase().trim()); });
  if (data.hostEmail?.includes('@')) emailSet.add(data.hostEmail.toLowerCase().trim());
  const emails = [...emailSet];

  if (!emails.length) {
    console.warn('No email recipients');
    return { sent: 0, failed: 0, noRecipients: true, log: [] };
  }

  // Generate PDF
  let pdfBuffer = null;
  try {
    pdfBuffer = await generatePDF(data);
    console.log(`PDF generated: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  } catch(e) {
    console.error('PDF generation failed:', e.message);
    // Continue without PDF if generation fails
  }

  // Verify SMTP
  let transport;
  try {
    transport = makeTransport();
    await transport.verify();
    console.log(`SMTP verified — sending to ${emails.length} recipients`);
  } catch(e) {
    console.error('SMTP verify failed:', e.message);
    return { sent: 0, failed: emails.length, error: e.message, log: [] };
  }

  const pdfName = `meeting-summary-${data.meetingId}.pdf`;
  const from    = `"${(process.env.EMAIL_FROM_NAME || 'Memora').trim()}" <${(process.env.EMAIL_USER || '').trim()}>`;
  const subject = `Meeting Summary — ${data.topic}`;
  const html    = buildHTML(data);
  const text    = buildText(data);

  // Build attachments array
  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename:    pdfName,
      content:     pdfBuffer,
      contentType: 'application/pdf',
    });
  }

  const log = [];
  let sent = 0, failed = 0;

  for (const email of emails) {
    try {
      await transport.sendMail({ from, to: email, subject, html, text, attachments });
      console.log(`✓ Email sent → ${email}`);
      log.push({ email, status: 'sent', sentAt: new Date() });
      sent++;
    } catch(e) {
      console.error(`✗ Email failed → ${email}: ${e.message}`);
      log.push({ email, status: 'failed', error: e.message, sentAt: new Date() });
      failed++;
    }
  }

  return { sent, failed, log };
};

// ── SMTP test ─────────────────────────────────────────────────
const testEmail = async () => {
  if (!isConfigured()) return { ok: false, message: 'EMAIL_USER or EMAIL_PASS not set in .env' };
  try {
    await makeTransport().verify();
    return { ok: true, message: `SMTP verified for ${process.env.EMAIL_USER}` };
  } catch(e) {
    return { ok: false, message: e.message };
  }
};

module.exports = { sendSummaryEmails, testEmail };
