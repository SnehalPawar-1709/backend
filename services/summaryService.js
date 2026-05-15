// ============================================================
// MEMORA - Summary Service (bug-fixed)
// ============================================================
let OpenAI;
try { OpenAI = require('openai'); } catch(_) {}

let client = null;
const getAI = () => {
  if (!client && OpenAI && process.env.OPENAI_API_KEY)
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
};

const generateSummary = async ({ topic, duration, participants, transcript }) => {
  const ai = getAI();
  if (!ai) return buildFallback({ topic, duration, participants, transcript });

  try {
    const snippet = (transcript || '').slice(0, 7000);

    const resp = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `You are a professional meeting secretary. Return ONLY a valid JSON object — no markdown, no text outside JSON.

Meeting:
- Topic: ${topic}
- Duration: ${duration} minutes  
- Participants: ${participants.join(', ')}
- Date: ${new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
${snippet ? `\nTranscript:\n${snippet}` : ''}

Return this exact JSON:
{
  "overview": "2-3 sentence meeting overview",
  "keyPoints": ["point1", "point2", "point3"],
  "decisions": ["decision1"],
  "actionItems": ["action1 - Owner: Name"],
  "nextSteps": "Follow-up description",
  "fullSummary": "Complete MoM in 200-300 words"
}`
      }],
      max_tokens: 1500,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const raw = resp.choices[0]?.message?.content?.trim() || '{}';

    // BUG FIX: strip markdown fences if model ignores response_format
    const cleaned = raw.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
    const parsed  = JSON.parse(cleaned);

    return {
      overview:    String(parsed.overview    || ''),
      keyPoints:   Array.isArray(parsed.keyPoints)   ? parsed.keyPoints   : [],
      decisions:   Array.isArray(parsed.decisions)   ? parsed.decisions   : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      nextSteps:   String(parsed.nextSteps   || ''),
      fullSummary: String(parsed.fullSummary || ''),
    };
  } catch(e) {
    console.error('Summary error:', e.message);
    return buildFallback({ topic, duration, participants, transcript });
  }
};

const buildFallback = ({ topic, duration, participants, transcript }) => {
  const lines = (transcript || '').split('\n').filter(Boolean).slice(0, 10);
  return {
    overview:    `Meeting on "${topic}" — ${duration} minutes, ${participants.length} participants.`,
    keyPoints:   lines.slice(0,3).map(l => l.replace(/^\[.*?\]:\s*/,'')).filter(Boolean),
    decisions:   [],
    actionItems: [],
    nextSteps:   'Review transcript and follow up on discussed items.',
    fullSummary: `MEETING SUMMARY\n\nTopic: ${topic}\nDuration: ${duration} min\nParticipants: ${participants.join(', ')}\nDate: ${new Date().toLocaleString()}\n\n${lines.length ? lines.join('\n') : 'No transcript captured.'}\n\nNote: Add OPENAI_API_KEY to backend/.env for AI summaries.`,
  };
};

module.exports = { generateSummary };
