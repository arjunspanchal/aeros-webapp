// WhatsApp Cloud API helpers for the PackAI WhatsApp head (server-only).
// Credentials come from env — never hardcoded:
//   WHATSAPP_VERIFY_TOKEN   — webhook verification handshake (you also set this in Meta)
//   WHATSAPP_ACCESS_TOKEN   — permanent system-user token (Graph API auth)
//   WHATSAPP_PHONE_NUMBER_ID— the sending number's ID
//   WHATSAPP_APP_SECRET     — app secret, used to verify X-Hub-Signature-256
import { createHmac, timingSafeEqual } from 'node:crypto';

const GRAPH_VERSION = 'v21.0';

export function whatsappConfigured() {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_VERIFY_TOKEN
  );
}

// Verify Meta's webhook signature (sha256=<hmac of raw body with app secret>).
// Returns true when no app secret is configured (so local/dev still works), but
// logs a warning — in production WHATSAPP_APP_SECRET should always be set.
export function verifySignature(rawBody, signatureHeader) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.warn('[whatsapp] WHATSAPP_APP_SECRET not set — skipping signature check');
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected =
    'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Pull the first inbound text message out of a webhook payload, or null for
// anything else (status callbacks, reactions, non-text, etc.).
export function extractTextMessage(payload) {
  try {
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg || msg.type !== 'text') return null;
    return {
      id: msg.id,
      from: msg.from, // sender's phone number
      text: msg.text?.body || '',
      name: value?.contacts?.[0]?.profile?.name || null,
    };
  } catch {
    return null;
  }
}

// Send a text reply via the Cloud API. WhatsApp uses *_ for italics and *bold*
// (single asterisk) — we convert the model's markdown **bold** accordingly and
// strip link markdown to bare URLs since WhatsApp has no inline links.
export async function sendText(to, body) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error('WhatsApp not configured');

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { preview_url: true, body: toWhatsAppText(body) },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`[whatsapp] send ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error('WhatsApp send failed');
  }
  return res.json();
}

// Markdown → WhatsApp formatting. **bold** → *bold*; [label](url) → "label: url".
export function toWhatsAppText(md) {
  let t = String(md || '');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1: $2'); // links
  t = t.replace(/\*\*([^*]+)\*\*/g, '*$1*'); // bold
  if (t.length > 4000) t = t.slice(0, 3990) + '…'; // WhatsApp 4096-char cap
  return t.trim();
}
