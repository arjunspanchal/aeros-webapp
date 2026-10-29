// Artwork Studio email: approver pings and "send the proof to the customer".
// Resend, like the OTP mails. Customer mails carry the CUSTOMER PROOF only -
// never the print file, the check file or anything internal.

import { signStorageUrl } from "../db/storage.js";
import { BUCKET } from "./artwork-studio.js";

const FROM = () => process.env.ARTWORK_STUDIO_FROM_EMAIL || process.env.OTP_FROM_EMAIL || "Aeros <noreply@aeros-x.com>";
const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://webapp.aeros-x.com").replace(/\/$/, "");

async function send(msg) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[dev] artwork-studio mail:", msg.subject, "->", msg.to);
    return { id: "dev" };
  }
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from: FROM(), ...msg });
  if (error) throw new Error(error.message || String(error));
  return data;
}

const esc = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// To the approvers: a proof is waiting. One mail per job version.
export async function notifyApprovers({ to, job, version }) {
  if (!to.length) return null;
  const url = `${SITE()}/design/artwork-studio/${job.id}`;
  const who = job.created_by_name || job.created_by_email;
  return send({
    to,
    subject: `Artwork to approve: ${job.brand} - ${job.product_key} v${version}`,
    text: `${who} made a proof for ${job.brand} (${job.product_key}), version ${version}.\n\nReview and approve the print file: ${url}`,
    html: `<p><strong>${esc(who)}</strong> made a proof for <strong>${esc(job.brand)}</strong> (${esc(job.product_key)}), version ${version}.</p>
<p><a href="${url}">Review and approve the print file</a></p>
<p style="color:#888;font-size:12px">Aeros Artwork Studio</p>`,
  });
}

// To the customer: the proof PDF, with the staff member's note, from Aeros.
export async function sendProofToCustomer({ to, cc, job, output, note, senderName }) {
  const url = await signStorageUrl(BUCKET, output.storage_path, 600);
  const pdf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const filename = `${job.brand.replace(/[^A-Za-z0-9]+/g, "-")}_${job.product_key}_CUSTOMER-PROOF-v${output.version}.pdf`;
  const lines = (note || "").trim().split("\n").filter(Boolean);
  const text = [
    `Dear ${job.brand} team,`,
    "",
    ...(lines.length ? lines : [`Please find attached the artwork proof (v${output.version}) for your ${job.product_key.replace(/-/g, " ")}.`]),
    "",
    "Please check the position and size of every element and the spelling, then reply with your approval or changes.",
    "The last page explains how colours are printed - this digital proof is not a colour approval.",
    "",
    `Regards,`,
    senderName || "Aeros",
    "Aeros - Boson Machines OPC Pvt Ltd, Mumbai, India",
    "WhatsApp +91 79770 77571 · aeros-x.com",
  ].join("\n");
  return send({
    to,
    ...(cc?.length ? { cc } : {}),
    subject: `Aeros - artwork proof v${output.version} for ${job.brand}`,
    text,
    html: `<div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">${text.split("\n").map((l) => (l ? `<p style="margin:0 0 8px">${esc(l)}</p>` : "<br/>")).join("")}</div>`,
    attachments: [{ filename, content: pdf.toString("base64") }],
  });
}
