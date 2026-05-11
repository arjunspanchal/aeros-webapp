// Travel coordination page for the Aeros NRA Show 2026 trip.
// Three travelers — Arjun, Parth, Kashika — flying to Chicago 13–24 May 2026.
// Designed for iPhone use during the trip. Same isolation pattern as the
// /arjunpanchal route — raw HTML, no DB, no cookies, no app layout, no
// auth gate. Sensitive identifiers (passport numbers, booking codes,
// CC numbers) stay OUT of this page on purpose.

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Aeros · NRA Show 2026 trip — itinerary, accommodation, daily plan">
<meta name="theme-color" content="#0A0A0A">
<title>Travel · Aeros NRA 2026</title>
<meta name="robots" content="noindex, nofollow">

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
    padding: 0 20px;
  }

  /* ─── HEADER ────────────────────────────────────────── */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 50;
    background: rgba(255,255,255,0.92);
    backdrop-filter: saturate(180%) blur(12px);
    -webkit-backdrop-filter: saturate(180%) blur(12px);
    border-bottom: 1px solid var(--rule);
  }
  .topbar-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 60px;
    max-width: 980px;
    margin: 0 auto;
    padding: 0 20px;
  }
  .wordmark {
    font-family: 'Nunito Sans', system-ui, sans-serif;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--ink);
    font-size: 14px;
    text-transform: uppercase;
    text-decoration: none;
  }
  .wordmark .slash { color: var(--muted); }
  .topbar-meta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.04em;
  }

  .privacy-banner {
    background: var(--ink);
    color: var(--paper);
    padding: 10px 20px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-align: center;
  }
  .privacy-banner strong { color: var(--paper); }

  .eyebrow {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    line-height: 1;
    margin-bottom: 16px;
    letter-spacing: 0.04em;
  }
  .eyebrow::before { content: '/ '; color: var(--muted); }

  /* ─── HERO ──────────────────────────────────────────── */
  .hero {
    padding: 56px 0 40px;
    border-bottom: 1px solid var(--rule);
  }
  .hero h1 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: clamp(36px, 7vw, 56px);
    line-height: 1.05;
    letter-spacing: -0.025em;
    color: var(--ink);
    margin-bottom: 14px;
  }
  .hero h1 .dim { color: var(--muted); font-weight: 700; }
  .hero-meta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px;
    color: var(--ink-3);
    letter-spacing: 0.02em;
  }
  .hero-meta strong { color: var(--ink); font-weight: 500; }

  /* ─── SECTIONS ──────────────────────────────────────── */
  section {
    padding: 48px 0;
    border-bottom: 1px solid var(--rule);
  }
  section:last-of-type { border-bottom: none; }
  .section-head { margin-bottom: 28px; }
  h2 {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: clamp(24px, 4vw, 32px);
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--ink);
  }

  /* ─── SHARED CARD ──────────────────────────────────── */
  .card {
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 12px;
  }
  .card.dark {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .card-title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: 17px;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .card.dark .card-title { color: var(--paper); }
  .card-tag {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid var(--rule-2);
    color: var(--muted);
  }
  .card.dark .card-tag { border-color: rgba(255,255,255,0.25); color: rgba(255,255,255,0.6); }
  .card-tag.alert { color: var(--paper); background: var(--ink); border-color: var(--ink); }

  .card-row {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 10px;
    padding: 8px 0;
    border-top: 1px dashed var(--rule);
    font-size: 14px;
  }
  .card.dark .card-row { border-top-color: rgba(255,255,255,0.1); }
  .card-row:first-of-type { border-top: none; padding-top: 0; }
  .card-row .lbl {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    padding-top: 3px;
  }
  .card.dark .card-row .lbl { color: rgba(255,255,255,0.5); }
  .card-row .val { color: var(--ink); }
  .card.dark .card-row .val { color: var(--paper); }
  .placeholder {
    display: inline-block;
    background: var(--paper-soft);
    border: 1px dashed var(--rule-2);
    padding: 1px 8px;
    border-radius: 4px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.04em;
  }
  .card.dark .placeholder {
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.2);
    color: rgba(255,255,255,0.55);
  }

  /* ─── TRAVELER CARDS GRID ─────────────────────────── */
  .traveler-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }

  /* ─── TIMELINE (deadlines list) ───────────────────── */
  .timeline {
    border-left: 2px solid var(--rule);
    margin-left: 8px;
    padding-left: 24px;
  }
  .timeline-item {
    position: relative;
    padding-bottom: 24px;
  }
  .timeline-item::before {
    content: '';
    position: absolute;
    left: -33px;
    top: 6px;
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: var(--paper);
    border: 2px solid var(--ink);
  }
  .timeline-item:last-child { padding-bottom: 0; }
  .timeline-time {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .timeline-title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 600;
    font-size: 15px;
    color: var(--ink);
    margin-bottom: 4px;
  }
  .timeline-sub {
    font-size: 13px;
    color: var(--ink-3);
    line-height: 1.5;
  }

  /* ─── DAY PLAN ─────────────────────────────────────── */
  .day-card {
    background: var(--paper-soft);
    border: 1px solid var(--rule);
    border-radius: 16px;
    padding: 18px 20px;
    margin-bottom: 12px;
  }
  .day-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .day-title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: 18px;
    letter-spacing: -0.01em;
    color: var(--ink);
  }
  .day-date {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.04em;
  }
  .task-list { list-style: none; padding: 0; margin: 0; }
  .task-list li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 7px 0;
    font-size: 14px;
    color: var(--ink-3);
    line-height: 1.5;
    border-top: 1px dashed var(--rule);
  }
  .task-list li:first-child { border-top: none; }
  .task-time {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.04em;
    flex-shrink: 0;
    min-width: 60px;
    padding-top: 2px;
  }

  /* ─── TICKETS DOWNLOAD GROUP ──────────────────────── */
  .tickets-card {
    margin-top: 16px;
    background: var(--paper-soft);
    border: 1px solid var(--rule);
    border-radius: 16px;
    padding: 18px 20px;
  }
  .tickets-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .tickets-title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: 15px;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .tickets-sub {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.04em;
  }
  .tickets-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .ticket-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 10px;
    text-decoration: none;
    color: var(--ink);
    transition: border-color 180ms, transform 180ms;
  }
  .ticket-link:hover {
    border-color: var(--ink);
    transform: translateY(-1px);
  }
  .ticket-link-name {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 600;
    font-size: 14px;
  }
  .ticket-link-meta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 0.04em;
    margin-top: 2px;
  }
  .ticket-link-icon {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .ticket-link:hover .ticket-link-icon { color: var(--ink); }
  @media (min-width: 720px) {
    .tickets-grid { grid-template-columns: 1fr 1fr 1fr; }
  }

  /* ─── BUTTONS / LINKS ─────────────────────────────── */
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    background: var(--ink);
    color: var(--paper);
    padding: 10px 16px;
    border-radius: 999px;
    text-decoration: none;
    transition: opacity 180ms;
  }
  .pill:hover { opacity: 0.88; }
  .pill.ghost {
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--rule-2);
  }
  .pill.ghost:hover { background: var(--paper-soft); }
  .button-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }

  /* ─── EMERGENCY ────────────────────────────────────── */
  .contacts-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .contact-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 12px;
    text-decoration: none;
    color: var(--ink);
    font-size: 14px;
  }
  .contact-row .lbl {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .contact-row .val {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 600;
  }

  /* ─── FOOTER ───────────────────────────────────────── */
  footer {
    background: var(--ink);
    color: var(--paper);
    padding: 32px 20px;
    text-align: center;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    letter-spacing: 0.04em;
  }
  footer strong { color: var(--paper); font-weight: 500; }

  /* ─── DESKTOP ──────────────────────────────────────── */
  @media (min-width: 720px) {
    section { padding: 64px 0; }
    .hero { padding: 72px 0 56px; }
    .traveler-grid { grid-template-columns: 1fr 1fr 1fr; }
    .contacts-grid { grid-template-columns: 1fr 1fr; }
  }
</style>
</head>
<body>

<header class="topbar">
  <div class="topbar-inner">
    <a href="#" class="wordmark"><span class="slash">/</span> AEROS · TRAVEL</a>
    <span class="topbar-meta">NRA Show 2026 · Booth 12937</span>
  </div>
</header>

<div class="privacy-banner">
  <strong>Private link</strong> — don't share. Sensitive IDs (passports, booking codes) live in iMessage, not here.
</div>

<!-- ─── HERO ─────────────────────────────────────────── -->
<section class="hero" style="border-top: none;">
  <div class="wrap">
    <div class="eyebrow">Trip dossier</div>
    <h1>Chicago run.<br><span class="dim">13 – 24 May 2026.</span></h1>
    <p class="hero-meta">
      <strong>NRA Show</strong> 16–19 May · Booth <strong>12937</strong> · McCormick Place
      <br>
      Arjun · Parth · Kashika · all on iPhone
    </p>
  </div>
</section>

<!-- ─── TRAVELERS ────────────────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">Travelers</div>
      <h2>Three of us.</h2>
    </div>
    <div class="traveler-grid">
      <div class="card">
        <div class="card-head">
          <div class="card-title">Arjun Panchal</div>
          <span class="card-tag">Co-founder</span>
        </div>
        <div class="card-row"><span class="lbl">Phone</span><span class="val">+91 84335 36369</span></div>
        <div class="card-row"><span class="lbl">Email</span><span class="val">arjun@aeros-x.com</span></div>
        <div class="card-row"><span class="lbl">Passport</span><span class="val"><span class="placeholder">last 4 — fill in</span></span></div>
        <div class="card-row"><span class="lbl">Visa</span><span class="val"><span class="placeholder">B1/B2 expiry — fill in</span></span></div>
      </div>
      <div class="card">
        <div class="card-head">
          <div class="card-title">Parth Panchal</div>
          <span class="card-tag">Co-founder</span>
        </div>
        <div class="card-row"><span class="lbl">Phone</span><span class="val"><span class="placeholder">fill in</span></span></div>
        <div class="card-row"><span class="lbl">Email</span><span class="val">parth@aeros-x.com</span></div>
        <div class="card-row"><span class="lbl">Passport</span><span class="val"><span class="placeholder">last 4 — fill in</span></span></div>
        <div class="card-row"><span class="lbl">Visa</span><span class="val"><span class="placeholder">B1/B2 expiry — fill in</span></span></div>
      </div>
      <div class="card">
        <div class="card-head">
          <div class="card-title">Kashika Wanchoo</div>
          <span class="card-tag">+1 spouse</span>
        </div>
        <div class="card-row"><span class="lbl">Phone</span><span class="val">+91 97696 58815</span></div>
        <div class="card-row"><span class="lbl">Email</span><span class="val">kashika@aeros-x.com</span></div>
        <div class="card-row"><span class="lbl">Passport</span><span class="val"><span class="placeholder">last 4 — fill in</span></span></div>
        <div class="card-row"><span class="lbl">Visa</span><span class="val"><span class="placeholder">B1/B2 expiry — fill in</span></span></div>
      </div>
    </div>
  </div>
</section>

<!-- ─── FLIGHTS ──────────────────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">Flights</div>
      <h2>Out and back.</h2>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">Outbound · BOM → ORD</div>
        <span class="card-tag">13–14 May 2026</span>
      </div>
      <div class="card-row"><span class="lbl">Carrier</span><span class="val">Etihad Airways · PNR <strong>8BT2D6</strong></span></div>
      <div class="card-row"><span class="lbl">Travelers</span><span class="val">Arjun · Parth · Kashika</span></div>
      <div class="card-row"><span class="lbl">Baggage</span><span class="val">2 × 23 kg checked, free</span></div>
      <div class="card-row"><span class="lbl">EY 203</span><span class="val"><strong>BOM 13:55</strong> → AUH 15:30 · 13 May · A321Neo · 3h 05m</span></div>
      <div class="card-row"><span class="lbl">Layover</span><span class="val">Abu Dhabi · 15:30 → 02:55 · <strong>11h 25m</strong> overnight</span></div>
      <div class="card-row"><span class="lbl">EY 9</span><span class="val">AUH 02:55 → <strong>ORD 08:35</strong> · 14 May · A350-1000 · 14h 40m</span></div>
      <div class="card-row"><span class="lbl">Terminals</span><span class="val">BOM T2 · AUH T A · ORD T5</span></div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">Return · ORD → BOM</div>
        <span class="card-tag">23–24 May 2026</span>
      </div>
      <div class="card-row"><span class="lbl">Carrier</span><span class="val">Etihad Airways · PNR <strong>8BT2D6</strong></span></div>
      <div class="card-row"><span class="lbl">Travelers</span><span class="val">Arjun · Parth · Kashika</span></div>
      <div class="card-row"><span class="lbl">EY 10</span><span class="val"><strong>ORD 14:00</strong> → AUH 12:30 · 23–24 May · A350-1000 · 13h 30m</span></div>
      <div class="card-row"><span class="lbl">Layover</span><span class="val">Abu Dhabi · 12:30 → 14:15 · <strong>1h 45m</strong> (tight — don't dawdle)</span></div>
      <div class="card-row"><span class="lbl">EY 204</span><span class="val">AUH 14:15 → <strong>BOM 19:00</strong> · 24 May · A350-1000 · 3h 15m</span></div>
      <div class="card-row"><span class="lbl">Terminals</span><span class="val">ORD T5 · AUH T A · BOM T2</span></div>
    </div>

    <div class="tickets-card">
      <div class="tickets-head">
        <div>
          <div class="tickets-title">E-tickets · Etihad PDFs</div>
          <div class="tickets-sub">Tap to open · long-press to save to Files</div>
        </div>
        <span class="tickets-sub">PNR 8BT2D6</span>
      </div>
      <div class="tickets-grid">
        <a class="ticket-link" href="/nra2026/tickets/arjun-ticket.pdf" download="arjun-etihad-8BT2D6.pdf" target="_blank" rel="noopener">
          <div>
            <div class="ticket-link-name">Arjun</div>
            <div class="ticket-link-meta">PDF · 87 KB</div>
          </div>
          <span class="ticket-link-icon">↓ PDF</span>
        </a>
        <a class="ticket-link" href="/nra2026/tickets/parth-ticket.pdf" download="parth-etihad-8BT2D6.pdf" target="_blank" rel="noopener">
          <div>
            <div class="ticket-link-name">Parth</div>
            <div class="ticket-link-meta">PDF · 87 KB</div>
          </div>
          <span class="ticket-link-icon">↓ PDF</span>
        </a>
        <a class="ticket-link" href="/nra2026/tickets/kashika-ticket.pdf" download="kashika-etihad-8BT2D6.pdf" target="_blank" rel="noopener">
          <div>
            <div class="ticket-link-name">Kashika</div>
            <div class="ticket-link-meta">PDF · 87 KB</div>
          </div>
          <span class="ticket-link-icon">↓ PDF</span>
        </a>
      </div>
    </div>

    <div class="tickets-card">
      <div class="tickets-head">
        <div>
          <div class="tickets-title">Passport · iCloud links</div>
          <div class="tickets-sub">Hosted on iCloud Drive · Apple-ID gated</div>
        </div>
        <span class="tickets-sub">3 of us</span>
      </div>
      <div class="tickets-grid">
        <a class="ticket-link" href="#" target="_blank" rel="noopener" data-doc="arjun-passport">
          <div>
            <div class="ticket-link-name">Arjun · Passport</div>
            <div class="ticket-link-meta"><span class="placeholder">paste iCloud link</span></div>
          </div>
          <span class="ticket-link-icon">↗</span>
        </a>
        <a class="ticket-link" href="#" target="_blank" rel="noopener" data-doc="parth-passport">
          <div>
            <div class="ticket-link-name">Parth · Passport</div>
            <div class="ticket-link-meta"><span class="placeholder">paste iCloud link</span></div>
          </div>
          <span class="ticket-link-icon">↗</span>
        </a>
        <a class="ticket-link" href="#" target="_blank" rel="noopener" data-doc="kashika-passport">
          <div>
            <div class="ticket-link-name">Kashika · Passport</div>
            <div class="ticket-link-meta"><span class="placeholder">paste iCloud link</span></div>
          </div>
          <span class="ticket-link-icon">↗</span>
        </a>
      </div>
    </div>
  </div>
</section>

<!-- ─── AIRPORT TIMELINE ─────────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">Departure day · 13 May</div>
      <h2>Mumbai → Airport.</h2>
    </div>
    <div class="timeline">
      <div class="timeline-item">
        <div class="timeline-time">06:30 IST · 13 May</div>
        <div class="timeline-title">Wake up · final pack</div>
        <div class="timeline-sub">Charge phones to 100%. Pack passport, wallet, charger, NRA badges (printed). Last toilet break.</div>
      </div>
      <div class="timeline-item">
        <div class="timeline-time">08:30 IST · T-5h 25m</div>
        <div class="timeline-title">Open Turo app · upload check-in photos</div>
        <div class="timeline-sub">Pickup is 24h away (10:00 AM CT on 14 May). Upload requested photos so Brothers Rental can verify and release the lockbox code.</div>
      </div>
      <div class="timeline-item">
        <div class="timeline-time">09:00 IST · T-4h 55m</div>
        <div class="timeline-title">Leave home · BOM T2</div>
        <div class="timeline-sub">Uber Premier (3 pax + bags). Mumbai airport traffic typically 60–90 min from town. Build buffer.</div>
      </div>
      <div class="timeline-item">
        <div class="timeline-time">10:55 IST · T-3h</div>
        <div class="timeline-title">Arrive BOM Terminal 2</div>
        <div class="timeline-sub">Etihad check-in opens 3h before international. Bag-drop, immigration, security can run 90+ min in peak.</div>
      </div>
      <div class="timeline-item">
        <div class="timeline-time">12:30 IST · T-1h 25m</div>
        <div class="timeline-title">Past security · at gate</div>
        <div class="timeline-sub">Eat. Hydrate. Buy water for cabin. Charge devices at the gate. Confirm gate hasn't moved.</div>
      </div>
      <div class="timeline-item">
        <div class="timeline-time">13:25 IST · T-30m</div>
        <div class="timeline-title">Boarding · EY 203</div>
        <div class="timeline-sub">All three at gate, phones in airplane mode after takeoff.</div>
      </div>
      <div class="timeline-item">
        <div class="timeline-time">13:55 IST</div>
        <div class="timeline-title">Wheels up · BOM → AUH</div>
        <div class="timeline-sub">3h 05m to Abu Dhabi. Long 11h 25m layover at AUH overnight before EY 9 to ORD.</div>
      </div>
      <div class="timeline-item">
        <div class="timeline-time">08:35 CT · 14 May</div>
        <div class="timeline-title">Land Chicago O'Hare T5</div>
        <div class="timeline-sub">Immigration → bags → walk to airport garage. Turo pickup 10:00 AM CT — 85 min buffer for ORD international arrival is normal.</div>
      </div>
    </div>
  </div>
</section>

<!-- ─── ACCOMMODATION ────────────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">Where we stay</div>
      <h2>Airbnb · Chicago.</h2>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">Airbnb · Woodlawn, Chicago</div>
        <span class="card-tag">14–23 May</span>
      </div>
      <div class="card-row"><span class="lbl">Address</span><span class="val"><strong>6115 South Langley Avenue, 2F</strong><br>Chicago, IL 60637</span></div>
      <div class="card-row"><span class="lbl">Host</span><span class="val"><span class="placeholder">name + phone — fill in</span></span></div>
      <div class="card-row"><span class="lbl">Check-in</span><span class="val"><span class="placeholder">time + door code</span></span></div>
      <div class="card-row"><span class="lbl">Wifi</span><span class="val"><span class="placeholder">SSID + password</span></span></div>
      <div class="button-row">
        <a class="pill" href="https://maps.app.goo.gl/GDh6PiXnFvoBDFWK7" target="_blank" rel="noopener">Open in Maps →</a>
        <a class="pill ghost" href="https://maps.apple.com/?address=6115%20S%20Langley%20Ave%2C%20Chicago%2C%20IL%2060637" target="_blank" rel="noopener">Apple Maps →</a>
      </div>
    </div>
  </div>
</section>

<!-- ─── RENTAL CAR ───────────────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">Wheels</div>
      <h2>Rental car.</h2>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">Turo · 2025 Ford F-150</div>
        <span class="card-tag">14–23 May</span>
      </div>
      <div class="card-row"><span class="lbl">Host</span><span class="val">Brothers Rental · 5.0 ★ · 1,984 trips · <a href="tel:+17084074864" style="color: var(--ink); text-decoration: underline;">+1 708-407-4864</a></span></div>
      <div class="card-row"><span class="lbl">Pickup</span><span class="val"><strong>14 May · 10:00 AM CT</strong> · ORD airport garage (host confirms which garage before pickup)</span></div>
      <div class="card-row"><span class="lbl">Return</span><span class="val"><span class="placeholder">23 May · before 14:00 ORD departure — confirm with host</span></span></div>
      <div class="card-row"><span class="lbl">Type</span><span class="val">Contactless · lockbox on window or remote unlock</span></div>
      <div class="card-row"><span class="lbl">Driver</span><span class="val">Arjun (primary) · carry IDP for backup</span></div>
      <div class="card-row" style="background: var(--paper-soft); margin: 8px -8px -8px; padding: 10px 12px; border-radius: 8px; border-top: none;">
        <span class="lbl">⚠ Day-of</span>
        <span class="val">Open Turo app <strong>24h before pickup</strong> (i.e. 13 May ~10:00 AM CT / 20:30 IST). Upload requested photos. Lockbox code will be released after verification.</span>
      </div>
    </div>
  </div>
</section>

<!-- ─── NRA SHOW DAILY PLAN ─────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">NRA Show</div>
      <h2>Booth 12937 · 16–19 May.</h2>
    </div>

    <div class="day-card">
      <div class="day-head">
        <div class="day-title">Day 1 · Saturday</div>
        <div class="day-date">16 May 2026</div>
      </div>
      <ul class="task-list">
        <li><span class="task-time">7:00</span><span>Breakfast at Airbnb · review day plan</span></li>
        <li><span class="task-time">8:30</span><span>Drive to McCormick Place · park · vendor entry</span></li>
        <li><span class="task-time">9:00</span><span>Booth setup — banners up, samples on table, QR codes facing aisle</span></li>
        <li><span class="task-time">9:30</span><span>Show opens · all 3 at booth, rotate breaks</span></li>
        <li><span class="task-time">12:00</span><span>Lunch in shifts (1 person stays)</span></li>
        <li><span class="task-time">17:00</span><span>Show closes · pack samples · log leads in WhatsApp</span></li>
        <li><span class="task-time">19:00</span><span>Dinner · debrief over leads</span></li>
      </ul>
    </div>

    <div class="day-card">
      <div class="day-head">
        <div class="day-title">Day 2 · Sunday</div>
        <div class="day-date">17 May 2026</div>
      </div>
      <ul class="task-list">
        <li><span class="task-time">8:00</span><span>Coffee + walkthrough of day-1 leads · prioritize follow-ups</span></li>
        <li><span class="task-time">9:30</span><span>Booth open · Calendly meetings start</span></li>
        <li><span class="task-time">12:00</span><span>Lunch in shifts</span></li>
        <li><span class="task-time">14:00</span><span>Walk competitor booths · note pricing / claims</span></li>
        <li><span class="task-time">17:00</span><span>Show closes · log leads</span></li>
        <li><span class="task-time">20:00</span><span>NRA networking event · go if invited</span></li>
      </ul>
    </div>

    <div class="day-card">
      <div class="day-head">
        <div class="day-title">Day 3 · Monday</div>
        <div class="day-date">18 May 2026</div>
      </div>
      <ul class="task-list">
        <li><span class="task-time">8:00</span><span>Restock samples (we lose ~30/day)</span></li>
        <li><span class="task-time">9:30</span><span>Booth open · meeting density highest today</span></li>
        <li><span class="task-time">12:00</span><span>Lunch · post-show recap photos for socials</span></li>
        <li><span class="task-time">17:00</span><span>Show closes · log leads · email next-steps to top 5</span></li>
      </ul>
    </div>

    <div class="day-card">
      <div class="day-head">
        <div class="day-title">Day 4 · Tuesday</div>
        <div class="day-date">19 May 2026 (final day)</div>
      </div>
      <ul class="task-list">
        <li><span class="task-time">9:30</span><span>Booth open · final-day energy is loose, focus on real buyers</span></li>
        <li><span class="task-time">15:00</span><span>Show closes early Tuesdays · start breakdown</span></li>
        <li><span class="task-time">16:00</span><span>Booth breakdown · pack banners · ship sample remainder if any</span></li>
        <li><span class="task-time">19:00</span><span>Team dinner · we earned it</span></li>
      </ul>
    </div>
  </div>
</section>

<!-- ─── AROUND THE AIRBNB ───────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">Around us</div>
      <h2>Daily essentials.</h2>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">Grocery · Walgreens · Pharmacy</div>
        <span class="card-tag">Walking distance</span>
      </div>
      <div class="card-row"><span class="lbl">Grocery</span><span class="val"><span class="placeholder">Whole Foods / Jewel-Osco — fill in name + walk time</span></span></div>
      <div class="card-row"><span class="lbl">Pharmacy</span><span class="val"><span class="placeholder">CVS / Walgreens — fill in</span></span></div>
      <div class="card-row"><span class="lbl">Coffee</span><span class="val"><span class="placeholder">good local spot — fill in</span></span></div>
      <div class="card-row"><span class="lbl">Late-night food</span><span class="val"><span class="placeholder">24/7 options nearby</span></span></div>
      <div class="button-row">
        <a class="pill" href="https://maps.app.goo.gl/GDh6PiXnFvoBDFWK7" target="_blank" rel="noopener">Airbnb on Maps →</a>
      </div>
    </div>
  </div>
</section>

<!-- ─── EMERGENCY ────────────────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">If something goes sideways</div>
      <h2>Emergency.</h2>
    </div>
    <div class="contacts-grid">
      <a class="contact-row" href="tel:911">
        <span><span class="lbl">US emergency</span><br><span class="val">911</span></span>
        <span>→</span>
      </a>
      <a class="contact-row" href="https://in.usembassy.gov/embassy-consulates/" target="_blank" rel="noopener">
        <span><span class="lbl">Indian Consulate · Chicago</span><br><span class="val">+1 312 595 0405</span></span>
        <span>→</span>
      </a>
      <div class="contact-row">
        <span><span class="lbl">Travel insurance</span><br><span class="val"><span class="placeholder">policy # + 24h support</span></span></span>
      </div>
      <div class="contact-row">
        <span><span class="lbl">Card lost · bank #</span><br><span class="val"><span class="placeholder">India bank international support</span></span></span>
      </div>
      <div class="contact-row">
        <span><span class="lbl">Airbnb support</span><br><span class="val">+1 415 800 5959</span></span>
      </div>
      <div class="contact-row">
        <span><span class="lbl">Aeros team back home</span><br><span class="val"><a href="https://wa.me/message/6Z4KO3ZWHQBMC1" style="color: var(--ink); text-decoration: underline;">Team WhatsApp</a></span></span>
      </div>
    </div>
  </div>
</section>

<footer>
  <strong>Aeros · NRA 2026</strong> · Trip dossier · <span style="color: rgba(255,255,255,0.4);">private link</span>
</footer>

</body>
</html>`;

export async function GET() {
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=60",
      // Search engines should NOT index a private trip page even if URL leaks.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
