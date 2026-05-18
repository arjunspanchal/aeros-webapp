// Business-card OCR for the NRA lead-capture page.
//
// Owner-mode-only — the visitor self-registration form does NOT call this
// (keeps the public POST endpoint free of any AI-cost surface area, and
// avoids the abuse vector of strangers hitting our Anthropic budget).
//
// Flow:
//   client snaps a card with the rear camera ->
//   uploads the JPEG as a base64 data URL ->
//   we hand it to Claude vision with a structured-extraction schema ->
//   client populates the lead form and Arjun reviews before saving.
//
// The image is never persisted. We pass the bytes to Anthropic and discard.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function isStaffAdmin(session) {
  if (!session) return false;
  if (session.isAdmin) return true;
  return session.modules?.factoryos === "admin";
}

// Liberal schema — every field optional. If the model can't find a field
// on the card (no booth number, no role, no notes) it returns "" rather
// than hallucinating. We let the user review/edit before save.
const CardSchema = z.object({
  name:    z.string().describe("Person's full name from the card. Empty string if not visible."),
  company: z.string().describe("Company / organisation name. Empty string if not visible."),
  role:    z.string().describe("Job title or role. Empty string if not visible."),
  email:   z.string().describe("Email address. Empty string if not visible."),
  phone:   z.string().describe("Phone number, formatted as printed. Empty string if not visible."),
  booth:   z.string().describe("Booth number IF mentioned on the card (rare; only NRA-specific cards). Empty string if not visible."),
  notes:   z.string().describe("Anything else worth capturing — secondary contact, tagline, address city. Empty string if nothing notable."),
  confidence: z.enum(["high", "medium", "low"]).describe("How confident the extraction is. 'low' if the image is blurry, not a business card, or partially obscured."),
});

const SYSTEM = `You extract structured contact details from a photographed business card.

Return ONLY what is actually printed on the card. If a field is not visible, return an empty string for that field — never guess, never hallucinate.

Common pitfalls to avoid:
- Don't confuse a company tagline with a job title.
- If multiple phone numbers (mobile + office), pick the most prominent / first listed; put others in notes.
- If multiple emails, pick the most personal-looking one (no info@/sales@ unless that's the only one); put others in notes.
- Names on Asian cards often appear in two scripts — return the Latin-script version.
- Trim whitespace; preserve casing as printed.

Set confidence to "low" if the image is blurry, not a business card, badly cropped, or you had to guess any major field.`;

export async function POST(request) {
  const session = getSession();
  if (!isStaffAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Card scanner not configured. Set ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dataUrl = typeof body?.image === "string" ? body.image : "";
  // Accept data URLs from the file-reader path, e.g. "data:image/jpeg;base64,...".
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    return NextResponse.json(
      { error: "Expected a base64 image data URL in `image`" },
      { status: 400 },
    );
  }
  const mediaType = match[1];
  const base64 = match[2];
  // Reject anything over ~6 MB raw — phones produce 2–4 MB JPEGs typically.
  if (base64.length > 8 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Image too large. Please retake at lower quality." },
      { status: 413 },
    );
  }
  const imageBuffer = Buffer.from(base64, "base64");

  try {
    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-5"),
      schema: CardSchema,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the contact details from this business card." },
            { type: "image", image: imageBuffer, mediaType },
          ],
        },
      ],
      temperature: 0,
    });

    return NextResponse.json({ extracted: object });
  } catch (e) {
    // Hide raw provider errors (might leak the model id / API quirks).
    return NextResponse.json(
      { error: e?.message?.slice(0, 200) || "Scan failed" },
      { status: 500 },
    );
  }
}
