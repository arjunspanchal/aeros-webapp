import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { MODEL, SYSTEM_PROMPT, buildTools } from '@/lib/packai/brain';
import { checkRateLimit, clientKey, limits } from '@/lib/packai/ratelimit';

export const maxDuration = 30;

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req) {
  // Public free endpoint — rate-limit before doing anything expensive.
  const rl = checkRateLimit(clientKey(req));
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfterS) },
    });
  }

  const raw = await req.text();
  if (raw.length > limits.MAX_BODY_CHARS) {
    return new Response(JSON.stringify({ error: 'Message too long' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  let messages;
  try {
    ({ messages } = JSON.parse(raw));
    if (!Array.isArray(messages) || messages.length === 0) throw new Error('bad');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await streamText({
    model: anthropic(MODEL),
    system: SYSTEM_PROMPT,
    messages,
    maxSteps: 5,
    tools: buildTools(),
  });

  return result.toDataStreamResponse();
}
