// Personal profile page for Arjun Panchal. Served as raw HTML to bypass
// the app's root layout, fonts, and global CSS — keeps this page visually
// and functionally isolated from the rest of webapp.aeros-x.com.
//
// Two server-side data fetches:
// • Strava: env-var-only (refresh_token doesn't rotate). Falls back to a
//   static "Follow on Strava" CTA when not configured.
// • Whoop: env vars + Supabase row in `public.oauth_tokens` because Whoop
//   rotates the refresh_token on every refresh; that new token must be
//   persisted between requests. Falls back to nothing rendered when not
//   configured.
//
// All fetch failures are swallowed — page never breaks on a fitness API
// hiccup.

import { dbSelect, dbInsert, dbUpdate } from "@/lib/db/supabase";

const STRAVA_PROFILE_URL = "https://strava.app.link/qBiP7A1nX2b";
// Captured from the OAuth token-exchange response when the integration was set up.
// Hardcoded because it never changes and the /athletes/{id}/stats endpoint requires it.
const STRAVA_ATHLETE_ID = "186630390";

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
function fmtDist(m) {
  if (!m) return "";
  return (m / 1000).toFixed(1) + " km";
}
function fmtDur(s) {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}
function fmtPace(m, s) {
  if (!m || !s) return "";
  const sec = s / (m / 1000);
  const pm = Math.floor(sec / 60);
  const ps = Math.round(sec % 60);
  return `${pm}:${String(ps).padStart(2, "0")} /km`;
}
function fmtRel(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const wk = Math.floor(days / 7);
  if (wk === 1) return "a week ago";
  if (wk < 5) return `${wk} weeks ago`;
  const mo = Math.floor(days / 30);
  if (mo <= 1) return "a month ago";
  return `${mo} months ago`;
}
function isRunType(t) { return /run/i.test(t || ""); }

const STATIC_STRAVA_CTA = `<div class="strava-cta">
      <div>
        <div class="eyebrow">Training feed</div>
        <div class="strava-cta-title">Follow the day-to-day on Strava.</div>
        <p>Long runs, threshold work, lifts, the occasional ugly recovery jog. Updated daily.</p>
      </div>
      <a href="${STRAVA_PROFILE_URL}" target="_blank" rel="noopener">Follow on Strava →</a>
    </div>`;

function renderStravaPRsBlock(prs) {
  if (!prs) return "";
  // Strava ships effort names with mixed casing ("1 mile", "5K", "10K",
  // "Half Marathon"). Normalize lookup so we don't miss anything.
  const lookup = {};
  for (const [k, v] of Object.entries(prs)) lookup[k.toLowerCase()] = v;
  const order = [
    { key: "1 mile", label: "Mile" },
    { key: "5k", label: "5K" },
    { key: "10k", label: "10K" },
    { key: "half marathon", label: "Half" },
  ];
  const cards = order
    .filter((o) => lookup[o.key])
    .map(
      (o) => `<div class="strava-stat">
          <div class="strava-stat-val">${escHtml(fmtDur(lookup[o.key].time))}</div>
          <div class="strava-stat-lbl">${o.label}</div>
        </div>`,
    )
    .join("");
  if (!cards) return "";
  return `<div class="strava-stats">
      <div class="strava-stats-head">
        <span class="strava-stats-eyebrow">Personal bests · Running</span>
      </div>
      <div class="strava-stats-grid">${cards}</div>
    </div>`;
}

function renderStravaStatsBlock(stats) {
  const ytd = stats?.ytd_run_totals;
  if (!ytd) return "";
  const km = ytd.distance ? Math.round(ytd.distance / 1000) : 0;
  const hours = ytd.moving_time ? Math.round(ytd.moving_time / 3600) : 0;
  const elev = ytd.elevation_gain ? Math.round(ytd.elevation_gain) : 0;
  const count = ytd.count || 0;
  const year = new Date().getFullYear();
  return `<div class="strava-stats">
      <div class="strava-stats-head">
        <span class="strava-stats-eyebrow">${year} · Running so far</span>
      </div>
      <div class="strava-stats-grid">
        <div class="strava-stat">
          <div class="strava-stat-val">${count}</div>
          <div class="strava-stat-lbl">Runs</div>
        </div>
        <div class="strava-stat">
          <div class="strava-stat-val">${km.toLocaleString("en-IN")}<span class="strava-stat-unit">km</span></div>
          <div class="strava-stat-lbl">Distance</div>
        </div>
        <div class="strava-stat">
          <div class="strava-stat-val">${hours}<span class="strava-stat-unit">h</span></div>
          <div class="strava-stat-lbl">Moving</div>
        </div>
        <div class="strava-stat">
          <div class="strava-stat-val">${elev.toLocaleString("en-IN")}<span class="strava-stat-unit">m</span></div>
          <div class="strava-stat-lbl">Elevation</div>
        </div>
      </div>
    </div>`;
}

function renderStravaFeed(data) {
  const activities = data?.activities;
  const stats = data?.stats;
  if (!Array.isArray(activities) || activities.length === 0) {
    // No activities — show static CTA. If we somehow have stats but no
    // activities, that's a Strava data weirdness; the fallback CTA still
    // links them to the profile.
    return STATIC_STRAVA_CTA;
  }
  const statsBlock = renderStravaStatsBlock(stats);
  const prsBlock = renderStravaPRsBlock(data?.prs);
  const items = activities.slice(0, 3).map((a) => {
    const stats = [
      fmtDist(a.distance),
      fmtDur(a.moving_time),
      isRunType(a.type) ? fmtPace(a.distance, a.moving_time) : "",
    ].filter(Boolean).join(" · ");
    return `<div class="strava-act">
        <div class="strava-act-row">
          <span class="strava-act-type">${escHtml(a.type || "Activity")}</span>
          <span class="strava-act-when">${escHtml(fmtRel(a.start_date_local || a.start_date))}</span>
        </div>
        <div class="strava-act-name">${escHtml(a.name || "")}</div>
        <div class="strava-act-stats">${escHtml(stats)}</div>
      </div>`;
  }).join("");
  return `<div class="strava-feed">
      <div class="strava-feed-head">
        <div>
          <div class="eyebrow">Training feed</div>
          <div class="strava-cta-title">Year so far on Strava.</div>
        </div>
        <a href="${STRAVA_PROFILE_URL}" target="_blank" rel="noopener">View all →</a>
      </div>
      ${statsBlock}
      ${prsBlock}
      <div class="strava-feed-list">${items}</div>
    </div>`;
}

// Personal bests: Strava only ships best_efforts on the activity DETAIL endpoint,
// not the summary list. So we pull the last ~30 runs, fetch each detail, and
// aggregate the minimum elapsed_time per standard distance ("1 mile", "5k",
// "10k", "Half Marathon"). Detail responses are aggressively cached (6h) since
// PRs don't change often. With per_page=30, worst-case cold load = ~30 detail
// fetches; warm = 0. Comfortably under Strava's 1000/day limit.
async function fetchStravaPRs(accessToken) {
  try {
    // Pull a wide net (100 activities) but only detail-fetch the runs likely to
    // contain PRs. Strategy: top 20 by speed (fast runs hold 5K/10K best efforts)
    // + top 10 by distance (long runs hold HM efforts), deduped. This stays
    // comfortably under Strava's 100 req / 15min burst limit on cold loads.
    const listRes = await fetch(
      "https://www.strava.com/api/v3/athlete/activities?per_page=100",
      { headers: { Authorization: `Bearer ${accessToken}` }, next: { revalidate: 3600 } },
    );
    if (!listRes.ok) return null;
    const list = await listRes.json();
    if (!Array.isArray(list) || list.length === 0) return null;
    const runs = list.filter((a) => /run/i.test(a.type) && (a.distance || 0) >= 1500);
    const bySpeed = [...runs]
      .sort((a, b) => (b.average_speed || 0) - (a.average_speed || 0))
      .slice(0, 20);
    const byDist = [...runs]
      .sort((a, b) => (b.distance || 0) - (a.distance || 0))
      .slice(0, 10);
    const seen = new Set();
    const targets = [];
    for (const a of [...bySpeed, ...byDist]) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        targets.push(a);
      }
    }
    // include_all_efforts=true is critical — without it Strava only returns
    // best_efforts that were PRs *at the time the activity was uploaded*. Every
    // standard-distance effort (5K, 10K, HM, etc.) only lands in the response
    // with this flag set. Without it, we just see the very first PRs ever
    // recorded — usually 1 mile and nothing else.
    const details = await Promise.all(
      targets.map((a) =>
        fetch(
          `https://www.strava.com/api/v3/activities/${a.id}?include_all_efforts=true`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            next: { revalidate: 21600 },
          },
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    );
    const prs = {};
    for (const d of details) {
      if (!d?.best_efforts) continue;
      for (const eff of d.best_efforts) {
        const key = eff.name;
        if (!key || !eff.elapsed_time) continue;
        if (!prs[key] || eff.elapsed_time < prs[key].time) {
          prs[key] = { time: eff.elapsed_time, date: eff.start_date_local };
        }
      }
    }
    return Object.keys(prs).length ? prs : null;
  } catch {
    return null;
  }
}

async function fetchStravaData() {
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN;
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) return null;
  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      next: { revalidate: 600 },
    });
    if (!tokenRes.ok) return null;
    const { access_token } = await tokenRes.json();
    if (!access_token) return null;
    const auth = { Authorization: `Bearer ${access_token}` };
    const next = { revalidate: 600 };
    const [actRes, statsRes, prs] = await Promise.all([
      fetch("https://www.strava.com/api/v3/athlete/activities?per_page=3", { headers: auth, next }),
      fetch(`https://www.strava.com/api/v3/athletes/${STRAVA_ATHLETE_ID}/stats`, { headers: auth, next }),
      fetchStravaPRs(access_token),
    ]);
    const activities = actRes.ok ? await actRes.json() : null;
    const stats = statsRes.ok ? await statsRes.json() : null;
    if (!activities && !stats && !prs) return null;
    return { activities, stats, prs };
  } catch {
    return null;
  }
}

// ── Whoop ──────────────────────────────────────────────────────────────────
// Whoop rotates the refresh_token on every refresh. Persist the new token
// to public.oauth_tokens (provider='whoop') so the next request can use it.
// Reuses the cached access_token until 60s before expiry to avoid hammering
// Whoop's OAuth endpoint.

const WHOOP_API = "https://api.prod.whoop.com";

function fmtSleepDuration(ms) {
  if (!ms) return "";
  const total = Math.floor(ms / 60000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

async function whoopAccessToken() {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  let row;
  try {
    const rows = await dbSelect("oauth_tokens", {
      select: "refresh_token,access_token,access_expires_at",
      filter: { provider: "eq.whoop" },
      limit: 1,
    });
    row = rows[0];
  } catch {
    return null;
  }
  if (!row || !row.refresh_token) return null;
  const now = Date.now();
  if (
    row.access_token &&
    row.access_expires_at &&
    new Date(row.access_expires_at).getTime() > now + 60000
  ) {
    return row.access_token;
  }
  // Refresh.
  let tokenJson;
  try {
    const res = await fetch(`${WHOOP_API}/oauth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: row.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
        scope: "offline",
      }).toString(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    tokenJson = await res.json();
  } catch {
    return null;
  }
  if (!tokenJson?.access_token || !tokenJson?.refresh_token) return null;
  try {
    await dbUpdate("oauth_tokens", "provider", "whoop", {
      refresh_token: tokenJson.refresh_token,
      access_token: tokenJson.access_token,
      access_expires_at: new Date(now + (tokenJson.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { returning: "minimal" });
  } catch {
    // If we couldn't persist, the rotated refresh_token is lost on next call.
    // Return the access_token anyway so this request still works.
  }
  return tokenJson.access_token;
}

async function whoopGet(path, accessToken) {
  try {
    const res = await fetch(`${WHOOP_API}/developer${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 600 },
    });
    if (!res.ok) {
      const body = await res.text();
      console.log("[whoop] GET", path, "→", res.status, body.slice(0, 300));
      return null;
    }
    return await res.json();
  } catch (e) {
    console.log("[whoop] GET", path, "threw", e.message);
    return null;
  }
}

// Whoop returns the most recent records first. Fresh records can have
// score_state="PENDING" (no score yet — processing); skip those and fall
// back to the most recent SCORED record for each metric.
function firstScored(records, scorePicker) {
  if (!Array.isArray(records)) return null;
  for (const r of records) {
    const v = scorePicker(r);
    if (v != null) return { record: r, value: v };
  }
  return null;
}

async function fetchWhoopStats() {
  const token = await whoopAccessToken();
  if (!token) return null;
  // Whoop API: cycle is still v1; recovery and sleep moved to v2 (May 2025+).
  const [recovery, cycle, sleep] = await Promise.all([
    whoopGet("/v2/recovery?limit=10", token),
    whoopGet("/v1/cycle?limit=10", token),
    whoopGet("/v2/activity/sleep?limit=10", token),
  ]);
  const recHit = firstScored(recovery?.records, (r) => r?.score?.recovery_score);
  const strainHit = firstScored(cycle?.records, (r) => r?.score?.strain);
  const sleepHit = firstScored(sleep?.records, (r) => {
    const s = r?.score?.stage_summary;
    if (!s) return null;
    const ms = (s.total_light_sleep_time_milli || 0) +
               (s.total_slow_wave_sleep_time_milli || 0) +
               (s.total_rem_sleep_time_milli || 0);
    return ms > 0 ? ms : null;
  });
  if (!recHit && !strainHit && !sleepHit) return null;
  return {
    recovery: recHit
      ? { score: Math.round(recHit.value), when: recHit.record.created_at }
      : null,
    strain: strainHit
      ? {
          value: Math.round(strainHit.value * 10) / 10,
          when: strainHit.record.start || strainHit.record.created_at,
        }
      : null,
    sleep: sleepHit
      ? {
          duration: fmtSleepDuration(sleepHit.value),
          performance: sleepHit.record?.score?.sleep_performance_percentage != null
            ? Math.round(sleepHit.record.score.sleep_performance_percentage)
            : null,
          when: sleepHit.record.start || sleepHit.record.created_at,
        }
      : null,
  };
}

// Reduce Whoop numbers into a single customer-readable mood signal.
// Recovery is the primary driver (Whoop's own zones: ≥67 green, 34-66 yellow,
// <34 red). Bad sleep can downgrade an otherwise-green day so a 78% recovery
// after 4h of sleep doesn't lie about how Arjun's actually feeling.
function computeVibe(stats) {
  if (!stats) return null;
  const rec = stats.recovery?.score;
  const sleepPerf = stats.sleep?.performance;
  let level = null;
  if (rec != null) {
    level = rec >= 67 ? "green" : rec >= 34 ? "yellow" : "red";
  } else if (sleepPerf != null) {
    level = sleepPerf >= 80 ? "green" : sleepPerf >= 60 ? "yellow" : "red";
  }
  if (level === null) return null;
  if (level === "green" && sleepPerf != null && sleepPerf < 65) level = "yellow";
  if (level === "yellow" && sleepPerf != null && sleepPerf < 45) level = "red";
  const copy = {
    green: { label: "Up for drama.", sub: "Recovered, sharp. Send the hard conversation." },
    yellow: { label: "Match my energy.", sub: "Mid recovery — real work fine, no firefights." },
    red: { label: "Keep it light.", sub: "Recovering. Easy questions only today." },
  };
  return { level, ...copy[level] };
}

function renderWhoopStats(stats) {
  if (!stats) return "";
  const cards = [];
  if (stats.recovery) {
    cards.push(`<div class="whoop-stat">
        <div class="whoop-lbl">Recovery</div>
        <div class="whoop-val">${stats.recovery.score}<span class="whoop-unit">%</span></div>
        <div class="whoop-sub">${escHtml(fmtRel(stats.recovery.when))}</div>
      </div>`);
  }
  if (stats.strain) {
    cards.push(`<div class="whoop-stat">
        <div class="whoop-lbl">Day strain</div>
        <div class="whoop-val">${stats.strain.value.toFixed(1)}</div>
        <div class="whoop-sub">${escHtml(fmtRel(stats.strain.when))}</div>
      </div>`);
  }
  if (stats.sleep) {
    const sub = stats.sleep.performance != null
      ? `${stats.sleep.performance}% perf · ${escHtml(fmtRel(stats.sleep.when))}`
      : escHtml(fmtRel(stats.sleep.when));
    cards.push(`<div class="whoop-stat">
        <div class="whoop-lbl">Sleep</div>
        <div class="whoop-val">${escHtml(stats.sleep.duration)}</div>
        <div class="whoop-sub">${sub}</div>
      </div>`);
  }
  if (cards.length === 0) return "";
  const vibe = computeVibe(stats);
  const vibeBlock = vibe
    ? `<div class="vibe vibe--${vibe.level}">
        <span class="vibe-dot" aria-hidden="true"></span>
        <div class="vibe-content">
          <div class="vibe-eyebrow">Today · By Whoop</div>
          <div class="vibe-label">${escHtml(vibe.label)}</div>
          <div class="vibe-sub">${escHtml(vibe.sub)}</div>
        </div>
      </div>`
    : "";
  return `<div class="whoop-block">
      ${vibeBlock}
      <div class="whoop-head">
        <div>
          <div class="eyebrow">Body data</div>
          <div class="strava-cta-title">Latest from Whoop.</div>
        </div>
        <span class="whoop-tag">Live</span>
      </div>
      <div class="whoop-grid">${cards.join("")}</div>
    </div>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Arjun Panchal — Co-founder of Aeros · HYROX athlete · Mumbai">
<meta name="theme-color" content="#0A0A0A">
<title>Arjun Panchal — Co-founder, athlete, Mumbai.</title>

<meta property="og:title" content="Arjun Panchal">
<meta property="og:description" content="Co-founder of Aeros · HYROX athlete · Mumbai">
<meta property="og:type" content="profile">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;700&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700;6..12,800&display=swap" rel="stylesheet">

<style>
  :root {
    --paper: #FFFFFF;
    --paper-soft: #F5F5F5;
    --ink: #0A0A0A;
    --ink-2: #1A1A1A;
    --ink-3: #404040;
    --muted: #737373;
    --rule: #E5E5E5;
    --rule-2: #C2C2C2;
    /* Monochrome palette — accent var kept for class compatibility but rendered as paper/white */
    --gold: #FFFFFF;
    --navy: #1A1A1A;
    --green: #16A34A;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; }

  body {
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    font-size: 16px;
    line-height: 1.55;
    color: var(--ink);
    background: var(--paper);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  .wrap {
    max-width: 980px;
    margin: 0 auto;
    padding: 0 24px;
  }

  /* ─── HEADER ────────────────────────────────────────── */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 50;
    background: rgba(255,255,255,0.85);
    backdrop-filter: saturate(180%) blur(12px);
    -webkit-backdrop-filter: saturate(180%) blur(12px);
    border-bottom: 1px solid var(--rule);
  }
  .topbar-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
    max-width: 980px;
    margin: 0 auto;
    padding: 0 24px;
  }
  .wordmark {
    font-family: 'Nunito Sans', system-ui, sans-serif;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--ink);
    font-size: 16px;
    line-height: 1;
    text-transform: uppercase;
    text-decoration: none;
  }
  .topbar-cta {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    text-decoration: none;
    border: 1px solid var(--rule);
    border-radius: 999px;
    padding: 9px 16px;
    transition: background 200ms, color 200ms;
  }
  .topbar-cta:hover { background: var(--ink); color: var(--paper); border-color: var(--ink); }

  /* ─── EYEBROW (slash-prefix mono) ──────────────────── */
  .eyebrow {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    font-weight: 400;
    color: var(--muted);
    line-height: 1;
    margin-bottom: 24px;
  }
  .eyebrow::before {
    content: '/ ';
    color: var(--muted);
  }
  .eyebrow.on-dark { color: rgba(255,255,255,0.6); }
  .eyebrow.on-dark::before { color: rgba(255,255,255,0.6); }

  /* ─── NRA / TRAVEL BANNER ──────────────────────────── */
  .notice {
    background: var(--ink);
    color: var(--paper);
    border-bottom: 1px solid var(--ink-2);
  }
  .notice-inner {
    max-width: 980px;
    margin: 0 auto;
    padding: 14px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  .notice-label {
    color: var(--gold);
    font-weight: 500;
  }
  .notice-text {
    color: rgba(255,255,255,0.78);
  }
  .notice-text strong { color: var(--paper); font-weight: 500; }
  .notice-actions {
    display: inline-flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .notice-cta {
    color: var(--paper);
    text-decoration: none;
    border-bottom: 1px solid rgba(255,255,255,0.6);
    padding-bottom: 1px;
    white-space: nowrap;
  }
  .notice-cta:hover { border-color: var(--gold); }
  .notice-cta + .notice-cta {
    color: rgba(255,255,255,0.7);
    border-bottom-color: rgba(255,255,255,0.2);
  }
  .notice-cta + .notice-cta:hover {
    color: var(--paper);
    border-bottom-color: var(--gold);
  }

  /* ─── HERO ──────────────────────────────────────────── */
  .hero {
    background: linear-gradient(135deg, var(--ink), var(--navy));
    color: var(--paper);
    padding: 80px 0 80px;
    position: relative;
    overflow: hidden;
  }

  .hero::before {
    content: '';
    position: absolute;
    top: -200px;
    right: -200px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(255,255,255,0.08), transparent 60%);
    pointer-events: none;
  }

  .hero-inner {
    position: relative;
    max-width: 980px;
    margin: 0 auto;
    padding: 0 24px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 40px;
    align-items: center;
  }

  .hero-portrait {
    position: relative;
    border-radius: 24px;
    overflow: hidden;
    aspect-ratio: 4 / 5;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .hero-portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .hero-portrait-tag {
    position: absolute;
    bottom: 16px;
    left: 16px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--paper);
    background: rgba(10,10,10,0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 6px 10px;
    border-radius: 999px;
    text-transform: uppercase;
  }

  .hero h1 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: clamp(40px, 8.5vw, 72px);
    line-height: 1.02;
    letter-spacing: -0.025em;
    color: var(--paper);
    max-width: 12ch;
  }
  .hero h1 .dim {
    color: rgba(255,255,255,0.45);
    font-weight: 700;
  }

  .hero-lede {
    margin-top: 28px;
    max-width: 52ch;
    font-size: 16px;
    line-height: 1.6;
    color: rgba(255,255,255,0.78);
    font-weight: 400;
  }

  .hero-ctas {
    display: flex;
    gap: 10px;
    margin-top: 36px;
    flex-wrap: wrap;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 700;
    border-radius: 999px;
    padding: 12px 22px;
    text-decoration: none;
    transition: transform 180ms, opacity 180ms, background 180ms;
  }
  .pill-gold { background: var(--gold); color: var(--ink); }
  .pill-gold:hover { transform: translateY(-1px); opacity: 0.92; }
  .pill-ghost {
    background: transparent;
    color: var(--paper);
    border: 1px solid rgba(255,255,255,0.20);
  }
  .pill-ghost:hover { background: rgba(255,255,255,0.08); }

  /* ─── SECTIONS ──────────────────────────────────────── */
  section {
    padding: 88px 0;
    border-top: 1px solid var(--rule);
  }
  section.no-border { border-top: none; }
  section.soft { background: var(--paper-soft); }

  .section-head { margin-bottom: 40px; }

  h2 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: clamp(30px, 5vw, 44px);
    line-height: 1.08;
    letter-spacing: -0.02em;
    color: var(--ink);
    max-width: 18ch;
  }
  h2 .dim { color: var(--muted); font-weight: 700; }
  h2.on-dark { color: var(--paper); }
  h2.on-dark .dim { color: rgba(255,255,255,0.45); }

  /* ─── ABOUT ─────────────────────────────────────────── */
  .about-body {
    font-size: 17px;
    line-height: 1.65;
    color: var(--ink-3);
    max-width: 60ch;
  }

  /* ─── SUSTAINABILITY ───────────────────────────────── */
  .essay {
    font-size: 17px;
    line-height: 1.7;
    color: var(--ink-3);
    max-width: 64ch;
  }
  .essay p + p { margin-top: 16px; }
  .essay strong { color: var(--ink); font-weight: 600; }
  .essay q::before { content: '\\201C'; }
  .essay q::after { content: '\\201D'; }

  .cup-compare {
    margin-top: 40px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .cup-card {
    border-radius: 24px;
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .cup-card--standard {
    background: var(--paper-soft);
    border: 1px solid var(--rule);
    color: var(--ink-3);
  }
  .cup-card--good {
    background: var(--ink);
    border: 1px solid var(--ink);
    color: var(--paper);
  }
  .cup-tag {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: 999px;
  }
  .cup-card--standard .cup-tag {
    color: var(--muted);
    border: 1px solid var(--rule-2);
    background: var(--paper);
  }
  .cup-card--good .cup-tag {
    color: var(--paper);
    border: 1px solid rgba(255,255,255,0.4);
    background: rgba(255,255,255,0.06);
  }
  .cup-name {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: 22px;
    letter-spacing: -0.015em;
  }
  .cup-card--standard .cup-name { color: var(--ink); }
  .cup-card--good .cup-name { color: var(--paper); }
  .cup-stats {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid var(--rule);
  }
  .cup-card--good .cup-stats {
    border-top-color: rgba(255,255,255,0.12);
  }
  .cup-stats > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .cup-lbl {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .cup-card--standard .cup-lbl { color: var(--muted); }
  .cup-card--good .cup-lbl { color: rgba(255,255,255,0.55); }
  .cup-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px;
    font-weight: 500;
    text-align: right;
  }
  .cup-card--standard .cup-val { color: var(--ink); }
  .cup-card--good .cup-val { color: var(--paper); }

  /* ─── ATHLETIC ──────────────────────────────────────── */
  .race-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .race-card {
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 24px;
    padding: 28px;
    box-shadow: 0 1px 2px rgba(10,15,46,0.04);
    display: flex;
    flex-direction: column;
    gap: 16px;
    text-decoration: none;
    color: inherit;
    transition: border-color 200ms, transform 200ms;
  }
  .race-card:hover { border-color: var(--ink); transform: translateY(-1px); }
  .race-link {
    margin-top: 4px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.04em;
    transition: color 200ms;
  }
  .race-card:hover .race-link { color: var(--ink); }
  .race-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .race-name {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: 20px;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .badge {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 4px 10px;
    border-radius: 999px;
  }
  .badge-done { background: var(--ink); color: var(--paper); }
  .badge-up { background: var(--paper); color: var(--ink); border: 1px solid var(--rule-2); }

  .race-meta {
    font-size: 14px;
    color: var(--muted);
  }
  .race-stats {
    display: flex;
    gap: 28px;
    flex-wrap: wrap;
    padding-top: 16px;
    border-top: 1px solid var(--rule);
  }
  .race-stats .stat { display: flex; flex-direction: column; gap: 4px; }
  .race-stats .lbl {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .race-stats .val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 18px;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: -0.01em;
  }

  /* ─── STRAVA CALLOUT ───────────────────────────────── */
  .strava-cta {
    margin-top: 32px;
    background: var(--ink);
    color: var(--paper);
    border-radius: 24px;
    padding: 28px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
    align-items: center;
  }
  .strava-cta .eyebrow {
    color: rgba(255,255,255,0.55);
    margin-bottom: 12px;
  }
  .strava-cta .eyebrow::before { color: rgba(255,255,255,0.55); }
  .strava-cta-title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: 20px;
    letter-spacing: -0.01em;
    color: var(--paper);
    margin-bottom: 8px;
  }
  .strava-cta p {
    font-size: 14px;
    line-height: 1.55;
    color: rgba(255,255,255,0.7);
    max-width: 48ch;
  }
  .strava-cta a {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: var(--paper);
    color: var(--ink);
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 700;
    padding: 12px 22px;
    border-radius: 999px;
    text-decoration: none;
    justify-self: start;
    transition: transform 180ms;
    white-space: nowrap;
  }
  .strava-cta a:hover { transform: translateY(-1px); }

  /* ─── STRAVA FEED (live, when env vars set) ────────── */
  .strava-feed {
    margin-top: 32px;
    background: var(--ink);
    color: var(--paper);
    border-radius: 24px;
    padding: 28px;
  }
  .strava-feed-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    padding-bottom: 20px;
    margin-bottom: 16px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }
  .strava-feed-head .eyebrow {
    color: rgba(255,255,255,0.55);
    margin-bottom: 12px;
  }
  .strava-feed-head .eyebrow::before { color: rgba(255,255,255,0.55); }
  .strava-feed-head a {
    color: var(--paper);
    text-decoration: none;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    border-bottom: 1px solid rgba(255,255,255,0.4);
    padding-bottom: 1px;
    white-space: nowrap;
  }
  .strava-feed-head a:hover { border-color: var(--paper); }
  .strava-feed-list { display: flex; flex-direction: column; }

  /* YTD stats inside the feed block — running totals from /athletes/{id}/stats */
  .strava-stats {
    margin-bottom: 20px;
    padding: 18px 20px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
  }
  .strava-stats-eyebrow {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.55);
    display: block;
    margin-bottom: 12px;
  }
  .strava-stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .strava-stat-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 22px;
    font-weight: 600;
    color: var(--paper);
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .strava-stat-unit {
    color: rgba(255,255,255,0.55);
    font-size: 13px;
    font-weight: 500;
    margin-left: 2px;
  }
  .strava-stat-lbl {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.55);
    margin-top: 6px;
  }
  .strava-act {
    padding: 14px 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .strava-act:last-child { border-bottom: none; padding-bottom: 0; }
  .strava-act:first-child { padding-top: 0; }
  .strava-act-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .strava-act-type, .strava-act-when {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    color: rgba(255,255,255,0.55);
    text-transform: uppercase;
  }
  .strava-act-when { text-transform: none; letter-spacing: 0.04em; }
  .strava-act-name {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 600;
    font-size: 16px;
    color: var(--paper);
    letter-spacing: -0.01em;
  }
  .strava-act-stats {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    color: rgba(255,255,255,0.7);
    letter-spacing: 0.02em;
  }

  /* ─── WHOOP STATS (live, when env + supabase token set) ── */
  .whoop-block {
    margin-top: 16px;
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--rule);
    border-radius: 24px;
    padding: 28px;
  }

  /* Customer-readable mood signal at the top of the Whoop block. The dot
     uses traffic-light semantics (green/yellow/red) — the only place on the
     site that breaks the monochrome palette, because body-state needs the
     instant visual read. */
  .vibe {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    padding-bottom: 22px;
    margin-bottom: 22px;
    border-bottom: 1px solid var(--rule);
  }
  .vibe-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    flex-shrink: 0;
    margin-top: 14px;
  }
  .vibe--green .vibe-dot {
    background: #16A34A;
    box-shadow: 0 0 0 4px rgba(22,163,74,0.12);
  }
  .vibe--yellow .vibe-dot {
    background: #D97706;
    box-shadow: 0 0 0 4px rgba(217,119,6,0.12);
  }
  .vibe--red .vibe-dot {
    background: #DC2626;
    box-shadow: 0 0 0 4px rgba(220,38,38,0.12);
  }
  .vibe-content { flex: 1; min-width: 0; }
  .vibe-eyebrow {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .vibe-eyebrow::before { content: '/ '; color: var(--muted); }
  .vibe-label {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: clamp(24px, 4vw, 30px);
    letter-spacing: -0.02em;
    line-height: 1.1;
    color: var(--ink);
    margin-bottom: 6px;
  }
  .vibe-sub {
    font-size: 14px;
    line-height: 1.5;
    color: var(--ink-3);
    max-width: 52ch;
  }
  .whoop-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding-bottom: 20px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--rule);
  }
  .whoop-head .eyebrow { margin-bottom: 12px; }
  .whoop-head .strava-cta-title { color: var(--ink); }
  .whoop-tag {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    border: 1px solid var(--rule);
    padding: 4px 10px;
    border-radius: 999px;
    align-self: flex-start;
  }
  .whoop-tag::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #16A34A;
    margin-right: 6px;
    transform: translateY(-1px);
  }
  .whoop-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .whoop-stat {
    background: var(--paper-soft);
    border: 1px solid var(--rule);
    border-radius: 16px;
    padding: 18px 20px;
  }
  .whoop-lbl {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .whoop-val {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: 32px;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .whoop-unit {
    font-size: 18px;
    font-weight: 600;
    color: var(--muted);
    margin-left: 2px;
  }
  .whoop-sub {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.02em;
    margin-top: 6px;
  }

  /* ─── OFF THE CLOCK ────────────────────────────────── */
  .off-card {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 24px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(10,15,46,0.04);
  }
  .off-photo {
    aspect-ratio: 4 / 3;
    background: var(--paper-soft);
    overflow: hidden;
  }
  .off-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .off-body {
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    justify-content: center;
  }
  .off-title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: 24px;
    letter-spacing: -0.015em;
    color: var(--ink);
  }
  .off-body p {
    font-size: 15px;
    line-height: 1.6;
    color: var(--ink-3);
  }
  .off-meta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* ─── NOW ───────────────────────────────────────────── */
  .now-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .now-card {
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 24px;
    padding: 28px;
    box-shadow: 0 1px 2px rgba(10,15,46,0.04);
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 200px;
  }
  .now-num {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    color: var(--muted);
    letter-spacing: 0.06em;
  }
  .now-title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: 22px;
    letter-spacing: -0.015em;
    color: var(--ink);
  }
  .now-desc {
    font-size: 14px;
    line-height: 1.6;
    color: var(--ink-3);
    flex: 1;
  }
  .now-link {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    text-decoration: none;
    margin-top: auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: gap 180ms;
  }
  .now-link:hover { gap: 10px; }
  .now-link .arrow { color: var(--ink); }
  .now-links {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: auto;
  }

  /* ─── REACH (dark) ──────────────────────────────────── */
  .reach {
    background: linear-gradient(135deg, var(--ink), var(--navy));
    color: var(--paper);
    border-top: 1px solid var(--ink-2);
  }
  .reach-availability {
    margin-top: 24px;
    margin-bottom: 8px;
    padding: 14px 18px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.25);
    border-radius: 12px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    color: rgba(255,255,255,0.85);
    letter-spacing: 0.02em;
    line-height: 1.55;
  }
  .reach-availability strong { color: var(--gold); font-weight: 500; }

  .reach-subhead {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 32px;
    margin-bottom: 12px;
  }

  .reach-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .reach-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 14px;
    color: var(--paper);
    text-decoration: none;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 15px;
    font-weight: 500;
    transition: background 200ms, border-color 200ms;
  }
  .reach-btn:hover {
    background: rgba(255,255,255,0.08);
    border-color: rgba(255,255,255,0.40);
  }
  .reach-btn.featured {
    background: rgba(255,255,255,0.10);
    border-color: rgba(255,255,255,0.35);
  }
  .reach-btn.featured:hover {
    background: rgba(255,255,255,0.16);
    border-color: rgba(255,255,255,0.55);
  }
  .reach-btn-label { display: flex; align-items: center; gap: 14px; }
  .reach-btn-icon { width: 18px; height: 18px; color: var(--gold); }
  .reach-btn-arrow {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 14px;
    color: rgba(255,255,255,0.40);
    transition: color 200ms, transform 200ms;
  }
  .reach-btn:hover .reach-btn-arrow { color: var(--gold); transform: translateX(3px); }

  /* ─── FOOTER ────────────────────────────────────────── */
  footer {
    background: var(--ink);
    color: var(--paper);
    padding: 48px 0 32px;
  }
  .footer-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
    align-items: end;
  }
  .footer-mark {
    font-family: 'Nunito Sans', sans-serif;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 14px;
    color: var(--paper);
  }
  .footer-mark span { color: rgba(255,255,255,0.5); }
  .footer-meta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: rgba(255,255,255,0.50);
    letter-spacing: 0.04em;
    line-height: 1.7;
  }

  /* ─── BACK TO TOP ───────────────────────────────────── */
  .to-top {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 60;
    width: 48px;
    height: 48px;
    border-radius: 999px;
    background: var(--ink);
    color: var(--paper);
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 8px 24px rgba(10,15,46,0.25), 0 2px 6px rgba(10,15,46,0.18);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transform: translateY(8px);
    pointer-events: none;
    transition: opacity 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
                transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
                background 200ms;
    -webkit-tap-highlight-color: transparent;
  }
  .to-top.is-visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  .to-top:hover { background: var(--ink-2); }
  .to-top:active { transform: translateY(0) scale(0.96); }
  .to-top svg { width: 20px; height: 20px; }
  @media (min-width: 720px) {
    .to-top { bottom: 28px; right: 28px; width: 52px; height: 52px; }
  }

  /* ─── ANIMATION ─────────────────────────────────────── */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .hero .eyebrow { animation: fadeUp 700ms 100ms both cubic-bezier(0.2, 0.8, 0.2, 1); }
  .hero h1       { animation: fadeUp 800ms 220ms both cubic-bezier(0.2, 0.8, 0.2, 1); }
  .hero-lede     { animation: fadeUp 700ms 420ms both cubic-bezier(0.2, 0.8, 0.2, 1); }
  .hero-ctas     { animation: fadeUp 700ms 560ms both cubic-bezier(0.2, 0.8, 0.2, 1); }

  /* ─── DESKTOP ───────────────────────────────────────── */
  @media (min-width: 720px) {
    .race-grid { grid-template-columns: 1fr 1fr 1fr; }
    .now-grid  { grid-template-columns: 1fr 1fr 1fr; }
    .reach-grid { grid-template-columns: 1fr 1fr; }
    .footer-grid { grid-template-columns: 1fr auto; }
    section { padding: 112px 0; }
    .hero { padding: 112px 0 104px; }
    .hero-inner {
      grid-template-columns: 1.3fr 1fr;
      gap: 64px;
    }
    .hero-portrait { aspect-ratio: 4 / 5; }
    .off-card { grid-template-columns: 1fr 1fr; }
    .off-photo { aspect-ratio: auto; }
    .off-body { padding: 48px; }
    .strava-cta { grid-template-columns: 1fr auto; gap: 32px; padding: 32px 36px; }
    .whoop-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .cup-compare { grid-template-columns: 1fr 1fr; gap: 20px; }
    .cup-card { padding: 32px; }
    .strava-stats-grid { grid-template-columns: repeat(4, 1fr); gap: 24px; }
  }
</style>
</head>
<body>

<!-- ─── TOP BAR ──────────────────────────────────────── -->
<header class="topbar">
  <div class="topbar-inner">
    <a href="#" class="wordmark">Arjun Panchal</a>
    <a href="https://wa.me/918433536369" class="topbar-cta" target="_blank" rel="noopener">WhatsApp →</a>
  </div>
</header>

<!-- ─── NRA / TRAVEL NOTICE ─────────────────────────── -->
<div class="notice">
  <div class="notice-inner">
    <span class="notice-text"><span class="notice-label">/ NRA SHOW 2026 · WRAPPED</span> &nbsp;·&nbsp; Thanks if we met at <strong>Booth 12937</strong> &nbsp;·&nbsp; See you 2027 · <strong>Booth 5549 North</strong></span>
    <span class="notice-actions">
      <a class="notice-cta" href="https://calendly.com/arjunspanchal/30min" target="_blank" rel="noopener">Book a follow-up →</a>
    </span>
  </div>
</div>

<!-- ─── HERO ─────────────────────────────────────────── -->
<section class="hero no-border">
  <div class="hero-inner">
    <div>
      <div class="eyebrow on-dark">Mumbai · 2026</div>
      <h1>Co-founder.<br><span class="dim">Athlete.</span></h1>
      <p class="hero-lede">
        Building Aeros — a tech company out of Mumbai, rebuilding paper packaging from
        quote to dock. Off the floor, I run long distances. HYROX in Bengaluru this
        year, the Ladakh half in September.
      </p>
      <div class="hero-ctas">
        <a class="pill pill-gold" href="https://calendly.com/arjunspanchal/30min" target="_blank" rel="noopener">Book a call →</a>
        <a class="pill pill-ghost" href="#reach">Reach me</a>
      </div>
    </div>
    <div class="hero-portrait">
      <img src="/arjunpanchal/hero.jpg" alt="Arjun Panchal" loading="eager">
      <span class="hero-portrait-tag">Los Angeles · 2026</span>
    </div>
  </div>
</section>

<!-- ─── ABOUT ────────────────────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">About</div>
      <h2>Operator. <span class="dim">By trade and by training.</span></h2>
    </div>
    <p class="about-body">
      Mumbai, India. My brother
      <a href="https://webapp.aeros-x.com/parthpanchal" style="color: var(--ink); font-weight: 600; text-decoration: none; border-bottom: 1px solid var(--rule-2);">Parth Panchal</a>
      and I co-founded Aeros — a tech company turning paper packaging into a software
      business. The platform runs the supply chain end to end: buyers quote and design,
      the factory plans and ships, the customer tracks and pays. One stack, one source
      of truth. Parth runs operations, I run product. Indian Aisle on the side —
      wedding planning for NRI couples. Training daily. Live with my wife,
      <a href="https://webapp.aeros-x.com/kashikawanchoo" style="color: var(--ink); font-weight: 600; text-decoration: none; border-bottom: 1px solid var(--rule-2);">Kashika Wanchoo</a>.
      Reachable on most reasonable channels below.
    </p>
  </div>
</section>

<!-- ─── SUSTAINABILITY ───────────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">Sustainability</div>
      <h2>Most paper cups aren't compostable. <span class="dim">Most people don't know.</span></h2>
    </div>

    <div class="essay">
      <p>Open any "paper cup" and you'll find a thin plastic lining. That's <strong>polyethylene (PE)</strong> — it's what stops your coffee from soaking through, and it's also what stops the cup from composting. To the eye it's paper. To a composter or a recycler, it's a problem.</p>
      <p>Real compostable cups exist, but they need a different lining: plant-based <strong>PLA</strong> or a water-based <strong>aqueous coating</strong> instead of PE. They break down in industrial composting in 90–180 days. They cost roughly 10–15% more. Most brands still buy PE because nobody asked them for the alternative.</p>
      <p>At Aeros we make <strong>all three</strong> — PE-lined, PLA-lined, and aqueous-coated. We label clearly which is which, and we tell our customers what each actually does to the planet. If you want compostable, ask for PLA or aqueous. Don't just trust "paper."</p>
    </div>

    <div class="cup-compare">
      <div class="cup-card cup-card--standard">
        <span class="cup-tag">Standard</span>
        <div class="cup-name">PE-lined paper cup</div>
        <div class="cup-stats">
          <div><span class="cup-lbl">Lining</span><span class="cup-val">Polyethylene</span></div>
          <div><span class="cup-lbl">Compostable</span><span class="cup-val">No</span></div>
          <div><span class="cup-lbl">Recyclable</span><span class="cup-val">Rarely</span></div>
          <div><span class="cup-lbl">Breakdown</span><span class="cup-val">20+ years</span></div>
        </div>
      </div>
      <div class="cup-card cup-card--good">
        <span class="cup-tag">Truly compostable</span>
        <div class="cup-name">PLA / aqueous-coated cup</div>
        <div class="cup-stats">
          <div><span class="cup-lbl">Lining</span><span class="cup-val">PLA or water-based</span></div>
          <div><span class="cup-lbl">Compostable</span><span class="cup-val">Yes (industrial)</span></div>
          <div><span class="cup-lbl">Recyclable</span><span class="cup-val">With care</span></div>
          <div><span class="cup-lbl">Breakdown</span><span class="cup-val">90–180 days</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ─── ATHLETIC ─────────────────────────────────────── -->
<section class="soft">
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">On the start line</div>
      <h2>Six races. <span class="dim">Four done, two ahead.</span></h2>
    </div>

    <div class="race-grid">
      <a class="race-card" href="https://hyrox.co.in" target="_blank" rel="noopener">
        <div class="race-head">
          <div class="race-name">HYROX Bengaluru</div>
          <span class="badge badge-done">Finished</span>
        </div>
        <div class="race-meta">PRO Men · Age Group 30–34 · Feb 2026</div>
        <div class="race-stats">
          <div class="stat"><span class="lbl">Time</span><span class="val">2:47:18</span></div>
          <div class="stat"><span class="lbl">AG Rank</span><span class="val">#72</span></div>
        </div>
        <div class="race-link">hyrox.co.in →</div>
      </a>

      <a class="race-card" href="https://procam.in/event/tatamumbaimarathon" target="_blank" rel="noopener">
        <div class="race-head">
          <div class="race-name">Tata Mumbai Half Marathon</div>
          <span class="badge badge-done">Finished</span>
        </div>
        <div class="race-meta">Half Marathon · 18 January 2026</div>
        <div class="race-stats">
          <div class="stat"><span class="lbl">Time</span><span class="val">2:29:33</span></div>
          <div class="stat"><span class="lbl">Distance</span><span class="val">21.1 KM</span></div>
        </div>
        <div class="race-link">procam.in →</div>
      </a>

      <a class="race-card" href="#" target="_blank" rel="noopener">
        <div class="race-head">
          <div class="race-name">Burj2Burj Half Marathon</div>
          <span class="badge badge-done">Finished</span>
        </div>
        <div class="race-meta">Half Marathon · February 2026</div>
        <div class="race-stats">
          <div class="stat"><span class="lbl">Distance</span><span class="val">21.1 KM</span></div>
          <div class="stat"><span class="lbl">City</span><span class="val">DUBAI</span></div>
        </div>
      </a>

      <a class="race-card" href="#" target="_blank" rel="noopener">
        <div class="race-head">
          <div class="race-name">Lotus Juhu Half Marathon</div>
          <span class="badge badge-done">Finished</span>
        </div>
        <div class="race-meta">Half Marathon · 1 March 2026</div>
        <div class="race-stats">
          <div class="stat"><span class="lbl">Time</span><span class="val">2:17:21</span></div>
          <div class="stat"><span class="lbl">Distance</span><span class="val">21.1 KM</span></div>
        </div>
      </a>

      <a class="race-card" href="https://hyrox.co.in" target="_blank" rel="noopener">
        <div class="race-head">
          <div class="race-name">HYROX Doubles · Delhi</div>
          <span class="badge badge-up">Upcoming</span>
        </div>
        <div class="race-meta">Open Doubles · 26 July 2026</div>
        <div class="race-stats">
          <div class="stat"><span class="lbl">Format</span><span class="val">DOUBLES</span></div>
          <div class="stat"><span class="lbl">City</span><span class="val">DELHI</span></div>
        </div>
        <div class="race-link">hyrox.co.in →</div>
      </a>

      <a class="race-card" href="https://ladakhmarathon.com" target="_blank" rel="noopener">
        <div class="race-head">
          <div class="race-name">Ladakh Half Marathon</div>
          <span class="badge badge-up">Upcoming</span>
        </div>
        <div class="race-meta">Leh · 13 September 2026</div>
        <div class="race-stats">
          <div class="stat"><span class="lbl">Distance</span><span class="val">21 KM</span></div>
          <div class="stat"><span class="lbl">Altitude</span><span class="val">3,500 M</span></div>
        </div>
        <div class="race-link">ladakhmarathon.com →</div>
      </a>
    </div>

    <!--STRAVA_FEED-->
    <!--WHOOP_STATS-->
  </div>
</section>

<!-- ─── OFF THE CLOCK ────────────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">Off the clock</div>
      <h2>At the range, <span class="dim">when I'm stateside.</span></h2>
    </div>
    <div class="off-card">
      <div class="off-photo">
        <img src="/arjunpanchal/shooting.jpg" alt="At the range" loading="lazy">
      </div>
      <div class="off-body">
        <div class="off-meta">Pursuit · Marksmanship</div>
        <div class="off-title">I like shooting guns.</div>
        <p>
          Rifles mostly. India makes this difficult, so it's a US-only thing — booked
          range time on every trip. Steady hands, ear pro on, watching the group tighten
          over a session. Same loop as endurance training — repetition, feedback,
          small corrections.
        </p>
      </div>
    </div>
  </div>
</section>

<!-- ─── NOW ──────────────────────────────────────────── -->
<section class="soft">
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">What I'm working on</div>
      <h2>Three things <span class="dim">on the desk.</span></h2>
    </div>

    <div class="now-grid">
      <div class="now-card">
        <div class="now-num">01</div>
        <div class="now-title">Aeros</div>
        <div class="now-desc">Onboarding US accounts onto the Aeros stack — quote to delivery, all in one place. Priced in INR.</div>
        <div class="now-links">
          <a class="now-link" href="https://webapp.aeros-x.com" target="_blank" rel="noopener">aeros-x.com <span class="arrow">→</span></a>
          <a class="now-link" href="https://wa.me/message/6Z4KO3ZWHQBMC1" target="_blank" rel="noopener">Talk to the team <span class="arrow">→</span></a>
        </div>
      </div>
      <div class="now-card">
        <div class="now-num">02</div>
        <div class="now-title">Indian Aisle</div>
        <div class="now-desc">A wedding-planning platform for NRI couples — vendor curation, venue shortlists, end-to-end coordination from abroad.</div>
        <a class="now-link" href="https://www.indianaisle.com" target="_blank" rel="noopener">indianaisle.com <span class="arrow">→</span></a>
      </div>
      <div class="now-card">
        <div class="now-num">03</div>
        <div class="now-title">Training for altitude</div>
        <div class="now-desc">Building base for Ladakh — long Z2 runs, threshold work, and learning to suffer slowly at 3,500m.</div>
        <span class="now-link" style="color: var(--muted); cursor: default;">In progress <span class="arrow">·</span></span>
      </div>
    </div>

    <div class="strava-cta">
      <div>
        <div class="eyebrow">For buyers</div>
        <div class="strava-cta-title">Wanna buy something off Aeros directly?</div>
        <p>All on the Aeros platform — spec, quote, design, ship. Reach my team on WhatsApp and we'll get it priced.</p>
      </div>
      <a href="https://wa.me/message/6Z4KO3ZWHQBMC1" target="_blank" rel="noopener">Reach my team →</a>
    </div>
  </div>
</section>

<!-- ─── ON THE ROAD ──────────────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">On the road</div>
      <h2>Out of Mumbai. <span class="dim">Here's where, if you want to meet.</span></h2>
    </div>
    <div class="race-grid">
      <div class="race-card">
        <div class="race-head">
          <div class="race-name">Delhi</div>
          <span class="badge badge-up">Jul</span>
        </div>
        <div class="race-meta">3–4 days around HYROX Doubles · race day 26 Jul</div>
      </div>
      <div class="race-card">
        <div class="race-head">
          <div class="race-name">Sri Lanka</div>
          <span class="badge badge-up">Aug</span>
        </div>
        <div class="race-meta">Friend's wedding · 22–27 August</div>
      </div>
      <div class="race-card">
        <div class="race-head">
          <div class="race-name">Ladakh</div>
          <span class="badge badge-up">Sep</span>
        </div>
        <div class="race-meta">5–14 September · Ladakh Half on 13 Sept</div>
      </div>
    </div>
  </div>
</section>

<!-- ─── REACH ME (dark) ──────────────────────────────── -->
<section class="reach no-border" id="reach">
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow on-dark">Reach me</div>
      <h2 class="on-dark">Text me. <span class="dim">I never pick up calls.</span></h2>
    </div>

    <div class="reach-availability">
      <strong>Heads up:</strong> I'm allergic to phone calls. WhatsApp / iMessage / email
      are all good — usually a reply within a day. If I'm dark, my Aeros team has you:
      <a href="https://wa.me/message/6Z4KO3ZWHQBMC1" target="_blank" rel="noopener" style="color: var(--paper); border-bottom: 1px solid rgba(255,255,255,0.5);">team WhatsApp</a>.
      &nbsp;Back in Mumbai after <strong>NRA Show 2026</strong> — thanks if we connected at Booth 12937.
    </div>

    <div class="reach-subhead">Text first</div>
    <div class="reach-grid">

      <a class="reach-btn featured" href="https://wa.me/918433536369" target="_blank" rel="noopener">
        <span class="reach-btn-label">
          <svg class="reach-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          WhatsApp · +91 84335 36369
        </span>
        <span class="reach-btn-arrow">→</span>
      </a>

      <a class="reach-btn" href="mailto:arjun@aeros-x.com">
        <span class="reach-btn-label">
          <svg class="reach-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          arjun@aeros-x.com
        </span>
        <span class="reach-btn-arrow">→</span>
      </a>

    </div>

    <div class="reach-subhead">Schedule a call <span style="color: rgba(255,255,255,0.35); text-transform: none; letter-spacing: 0.02em; font-size: 11px;">(better than ringing me)</span></div>
    <div class="reach-grid">

      <a class="reach-btn featured" href="https://calendly.com/arjunspanchal/30min" target="_blank" rel="noopener" style="grid-column: 1 / -1;">
        <span class="reach-btn-label">
          <svg class="reach-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          30-minute call
        </span>
        <span class="reach-btn-arrow">→</span>
      </a>

    </div>

    <div class="reach-subhead">Backup — if I'm slow</div>
    <div class="reach-grid">

      <a class="reach-btn" href="https://wa.me/message/6Z4KO3ZWHQBMC1" target="_blank" rel="noopener" style="grid-column: 1 / -1;">
        <span class="reach-btn-label">
          <svg class="reach-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Aeros team — quotes, orders, anything Aeros
        </span>
        <span class="reach-btn-arrow">→</span>
      </a>

    </div>
  </div>
</section>

<!-- ─── FOOTER ───────────────────────────────────────── -->
<footer>
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <div class="footer-mark">Arjun <span>·</span> Panchal</div>
        <div class="footer-meta" style="margin-top: 8px;">
          Mumbai, India · Open to inbound<br>
          © 2026 · A personal site
        </div>
      </div>
      <div class="footer-meta">
        <a href="https://webapp.aeros-x.com" target="_blank" rel="noopener" style="color: rgba(255,255,255,0.7); text-decoration: none;">aeros-x.com</a><br>
        <span style="color: rgba(255,255,255,0.4);">A Boson Machines OPC Pvt Ltd brand</span>
      </div>
    </div>
  </div>
</footer>

<!-- ─── BACK TO TOP ──────────────────────────────────── -->
<button class="to-top" id="toTop" aria-label="Back to top">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="12" y1="19" x2="12" y2="5"/>
    <polyline points="5 12 12 5 19 12"/>
  </svg>
</button>

<script>
  (function () {
    // Strip hash on load so refresh doesn't auto-scroll to #reach.
    // Runs as early as possible to beat the browser's anchor-jump on first
    // paint; combined with the click handler below, the URL never carries a
    // hash for in-page anchors.
    if (window.location.hash) {
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
    }
    // Smooth in-page anchor links without polluting the URL.
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href').slice(1);
        if (!id) return;
        var target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    var btn = document.getElementById('toTop');
    if (!btn) return;
    var threshold = 600;
    var ticking = false;
    function update() {
      var y = window.pageYOffset || document.documentElement.scrollTop;
      btn.classList.toggle('is-visible', y > threshold);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    update();
  })();
</script>

</body>
</html>`;

export async function GET() {
  const [stravaData, whoopStats] = await Promise.all([
    fetchStravaData(),
    fetchWhoopStats(),
  ]);
  const body = html
    .replace("<!--STRAVA_FEED-->", renderStravaFeed(stravaData))
    .replace("<!--WHOOP_STATS-->", renderWhoopStats(whoopStats));
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
