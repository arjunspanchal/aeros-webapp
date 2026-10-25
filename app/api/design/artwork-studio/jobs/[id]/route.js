import { NextResponse } from "next/server";
import { studioGuard } from "../../_access";
import {
  canApprove, canDownload, chatView, DAILY_CAP_INR, PRODUCTS, spentTodayInr, userKey,
} from "@/lib/design/artwork-studio";
import { dbUpdate } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_MS = 15 * 60 * 1000;

// GET — job detail for the job page (polled every few seconds while running).
// Never returns raw API messages, storage paths or Anthropic file ids.
export async function GET(_request, { params }) {
  const { session, job, error } = await studioGuard(params.id);
  if (error) return error;

  let j = job;
  // A run killed mid-way (deploy, timeout) leaves the job "running" forever.
  if (j.status === "running" && !j.continue_pending && Date.now() - Date.parse(j.updated_at) > STALE_MS) {
    j = { ...j, status: "failed", error: "The run stopped unexpectedly. Press Retry.", progress: null };
    await dbUpdate("artwork_studio_jobs", "id", j.id, { status: j.status, error: j.error, progress: null }, { returning: "minimal" });
  }

  const outputs = (j.outputs || []).map((o) => ({
    name: o.name,
    kind: o.kind,
    version: o.version,
    size: o.size,
    createdAt: o.created_at,
    locked: !canDownload(session, j, o),
  }));
  const spent = await spentTodayInr(userKey(session));
  return NextResponse.json({
    job: {
      id: j.id,
      createdAt: j.created_at,
      updatedAt: j.updated_at,
      createdBy: j.created_by_name || j.created_by_email,
      isOwner: j.created_by_email === userKey(session),
      product: PRODUCTS.find((p) => p.key === j.product_key)?.label || j.product_key,
      productKey: j.product_key,
      brand: j.brand,
      channel: j.channel,
      lid: j.lid,
      inks: j.inks,
      digitalSample: j.digital_sample,
      brief: j.brief,
      status: j.status,
      progress: j.progress,
      continuePending: !!j.continue_pending,
      error: j.error,
      inputs: (j.inputs || []).map((i) => ({ name: i.name, size: i.size, pending: !!i.pending })),
      outputs,
      result: j.result,
      // 3D preview: latest unrolled wrap + the formed-cup shape.
      wrap: (j.outputs || []).findLast((o) => o.kind === "wrap")?.name || null,
      cup3d: j.result?.cup3d || PRODUCTS.find((p) => p.key === j.product_key)?.cup3d || null,
      cup3dApprox: !j.result?.cup3d,
      chat: chatView(j.messages),
      costInr: Number(j.cost_inr || 0),
      approvedVersion: j.approved_version,
      approvedBy: j.approved_by,
      approvedAt: j.approved_at,
    },
    me: {
      canApprove: canApprove(session),
      isAdmin: !!session.isAdmin,
      spentTodayInr: spent,
      capInr: session.isAdmin ? null : DAILY_CAP_INR,
    },
  });
}
