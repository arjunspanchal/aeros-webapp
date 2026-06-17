// PackAI WhatsApp head — Meta Cloud API webhook.
//   GET  → verification handshake (hub.challenge)
//   POST → inbound message → shared PackAI brain → reply via Cloud API
// Same brain as the web chat (lib/packai/brain). Transport differs: WhatsApp
// wants one finished message, so we use generateText (not streaming).
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { MODEL, SYSTEM_PROMPT, buildTools } from '@/lib/packai/brain';
import {
  whatsappConfigured,
  verifySignature,
  extractTextMessage,
  sendText,
} from '@/lib/packai/whatsapp';
import { checkRateLimit } from '@/lib/packai/ratelimit';

export const maxDuration = 30;

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// v1 conversation memory: per-sender recent history + processed-message dedupe,
// held in module scope. Survives within a warm instance; durable history is M2
// (advisor.sessions/messages). Bounded so memory can't grow unbounded.
const HISTORY = new Map(); // phone -> [{role, content}]
const SEEN = new Map(); // message id -> ts (dedupe Meta retries)
const MAX_TURNS = 12;
const SEEN_TTL_MS = 10 * 60 * 1000;

function remember(phone, role, content) {
  const h = HISTORY.get(phone) || [];
  h.push({ role, content });
  while (h.length > MAX_TURNS) h.shift();
  HISTORY.set(phone, h);
  return h;
}

function alreadyProcessed(id) {
  const now = Date.now();
  for (const [k, ts] of SEEN) if (now - ts > SEEN_TTL_MS) SEEN.delete(k);
  if (SEEN.has(id)) return true;
  SEEN.set(id, now);
  return false;
}

// --- GET: Meta webhook verification ---
export async function GET(req) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// --- POST: inbound message ---
export async function POST(req) {
  const raw = await req.text();

  // Verify the payload really came from Meta before doing anything with it.
  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'))) {
    return new Response('Bad signature', { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response('ok', { status: 200 }); // ack malformed; don't make Meta retry
  }

  const msg = extractTextMessage(payload);
  // Always 200 for non-text events (status callbacks etc.) so Meta stops retrying.
  if (!msg || !msg.text.trim()) return new Response('ok', { status: 200 });

  // Dedupe Meta retries; rate-limit per sender.
  if (alreadyProcessed(msg.id)) return new Response('ok', { status: 200 });
  if (!checkRateLimit(`wa:${msg.from}`).ok) {
    if (whatsappConfigured()) {
      await sendText(msg.from, "You're sending messages a little fast — give me a moment and try again.").catch(() => {});
    }
    return new Response('ok', { status: 200 });
  }

  try {
    const history = remember(msg.from, 'user', msg.text);
    const { text } = await generateText({
      model: anthropic(MODEL),
      system: SYSTEM_PROMPT,
      messages: history,
      maxSteps: 5,
      tools: buildTools(),
    });
    const reply = text?.trim() || "Sorry, I couldn't put that together — could you rephrase?";
    remember(msg.from, 'assistant', reply);
    if (whatsappConfigured()) await sendText(msg.from, reply);
  } catch (err) {
    console.error('[whatsapp] handler error:', err?.message || err);
    if (whatsappConfigured()) {
      await sendText(msg.from, 'Something went wrong on my end — please try again in a moment.').catch(() => {});
    }
  }

  return new Response('ok', { status: 200 });
}
