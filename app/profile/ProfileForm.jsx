"use client";
import { useState } from "react";

const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const inputCls =
  "w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-600 bg-white";
const labelCls = "block text-xs font-medium text-ink-500 mb-1";

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result || "";
      const idx = String(res).indexOf(",");
      resolve(String(res).slice(idx + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function initials(name, email) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

// Self-contained profile editor for /profile. Hits the same self-service
// endpoint the customer profile editor uses (/api/factoryos/profile) — the
// route is misnamed but its auth gate is just "any logged-in user with an
// email," not customer-only.
export default function ProfileForm({ initial }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    designation: initial?.designation || "",
    phone: initial?.phone || "",
  });
  const [photoUrl, setPhotoUrl] = useState(initial?.photoUrl || null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  function onPickPhoto(file) {
    setErr("");
    if (!file) { setPhotoFile(null); setPhotoPreview(null); return; }
    if (!PHOTO_TYPES.has(file.type)) { setErr("Photo must be JPG, PNG, WebP, or GIF"); return; }
    if (file.size > PHOTO_MAX_BYTES) { setErr("Photo too large. Max 5 MB."); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function save(e) {
    e.preventDefault();
    setErr(""); setOk(false); setBusy(true);
    const body = { ...form };
    if (photoFile) {
      body.photoBase64 = await readAsBase64(photoFile);
      body.photoFilename = photoFile.name;
      body.photoContentType = photoFile.type;
    }
    const res = await fetch("/api/factoryos/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) { setErr((await res.json()).error || "Failed"); return; }
    const data = await res.json();
    if (data.user?.photoUrl) setPhotoUrl(data.user.photoUrl);
    setPhotoFile(null); setPhotoPreview(null);
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  }

  const avatarSrc = photoPreview || photoUrl;

  return (
    <form onSubmit={save} className="mt-6 bg-white border border-ink-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full overflow-hidden bg-ink-100 flex items-center justify-center text-lg font-semibold text-ink-500">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : initials(form.name, initial?.email)}
        </div>
        <div>
          <label className="inline-block">
            <span className="cursor-pointer px-3 py-1.5 text-xs bg-white border border-ink-200 rounded-md hover:border-ink-300">
              {avatarSrc ? "Change photo" : "Upload photo"}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => onPickPhoto(e.target.files?.[0] || null)}
            />
          </label>
          <p className="text-xs text-ink-400 mt-1">JPG / PNG / WebP, up to 5 MB.</p>
        </div>
      </div>

      <div>
        <label className={labelCls}>Email</label>
        <input className={`${inputCls} opacity-60`} value={initial?.email || ""} disabled />
        <p className="text-xs text-ink-400 mt-1">This is how you sign in. Contact Aeros to change.</p>
      </div>
      <div>
        <label className={labelCls}>Full name</label>
        <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Vinay Dubey" />
      </div>
      <div>
        <label className={labelCls}>Designation</label>
        <input className={inputCls} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Brand Manager" />
      </div>
      <div>
        <label className={labelCls}>Phone</label>
        <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91…" />
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button disabled={busy} className="bg-royal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-royal-700 disabled:opacity-60">
          {busy ? "Saving…" : "Save profile"}
        </button>
        {ok && <span className="text-xs text-green-600">Saved</span>}
        {err && <span className="text-xs text-red-500">{err}</span>}
      </div>
    </form>
  );
}
