// Personal profile page for Kashika Wanchoo. Same isolation pattern as
// /arjunpanchal — raw HTML response, bypasses the app's root layout, fonts,
// global CSS, and middleware. No DB, no cookies, no auth, no third-party
// data fetches (Strava/Whoop intentionally skipped).

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Kashika Wanchoo — Data Scientist · NRA Show 2026, Booth 12937">
<meta name="theme-color" content="#0A0A0A">
<title>Kashika Wanchoo — Data Scientist.</title>

<meta property="og:title" content="Kashika Wanchoo">
<meta property="og:description" content="Data Scientist · At the NRA Show 2026, Booth 12937">
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
    --gold: #FFFFFF;
    --navy: #1A1A1A;
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

  .eyebrow {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    font-weight: 400;
    color: var(--muted);
    line-height: 1;
    margin-bottom: 24px;
  }
  .eyebrow::before { content: '/ '; color: var(--muted); }
  .eyebrow.on-dark { color: rgba(255,255,255,0.6); }
  .eyebrow.on-dark::before { color: rgba(255,255,255,0.6); }

  /* ─── NRA NOTICE ───────────────────────────────────── */
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
  .notice-label { color: var(--paper); font-weight: 500; }
  .notice-text { color: rgba(255,255,255,0.78); }
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
  .notice-cta:hover { border-color: var(--paper); }
  .notice-cta + .notice-cta {
    color: rgba(255,255,255,0.7);
    border-bottom-color: rgba(255,255,255,0.2);
  }
  .notice-cta + .notice-cta:hover {
    color: var(--paper);
    border-bottom-color: var(--paper);
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
    max-width: 13ch;
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
  .pill-gold { background: var(--paper); color: var(--ink); }
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

  /* ─── NRA CALLOUT ──────────────────────────────────── */
  .nra-cta {
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
  .nra-cta .eyebrow { color: rgba(255,255,255,0.55); margin-bottom: 12px; }
  .nra-cta .eyebrow::before { color: rgba(255,255,255,0.55); }
  .nra-cta-title {
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-weight: 700;
    font-size: 20px;
    letter-spacing: -0.01em;
    color: var(--paper);
    margin-bottom: 8px;
  }
  .nra-cta p {
    font-size: 14px;
    line-height: 1.55;
    color: rgba(255,255,255,0.7);
    max-width: 48ch;
  }
  .nra-cta-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-self: flex-start;
  }
  .nra-cta-actions a {
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
    text-align: center;
    justify-content: center;
  }
  .nra-cta-actions a.ghost {
    background: transparent;
    color: var(--paper);
    border: 1px solid rgba(255,255,255,0.25);
  }
  .nra-cta-actions a:hover { transform: translateY(-1px); }
  .nra-cta-actions a.ghost:hover { background: rgba(255,255,255,0.08); }

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

  /* ─── REACH ─────────────────────────────────────────── */
  .reach {
    background: linear-gradient(135deg, var(--ink), var(--navy));
    color: var(--paper);
    border-top: 1px solid var(--ink-2);
  }
  .reach-availability {
    margin-top: 24px;
    margin-bottom: 8px;
    padding: 14px 18px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    color: rgba(255,255,255,0.85);
    letter-spacing: 0.02em;
    line-height: 1.55;
  }
  .reach-availability strong { color: var(--paper); font-weight: 500; }

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
    border-color: rgba(255,255,255,0.4);
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
  .reach-btn-icon { width: 18px; height: 18px; color: var(--paper); }
  .reach-btn-arrow {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 14px;
    color: rgba(255,255,255,0.40);
    transition: color 200ms, transform 200ms;
  }
  .reach-btn:hover .reach-btn-arrow { color: var(--paper); transform: translateX(3px); }

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
    .now-grid  { grid-template-columns: 1fr 1fr; }
    .reach-grid { grid-template-columns: 1fr 1fr; }
    .footer-grid { grid-template-columns: 1fr auto; }
    section { padding: 112px 0; }
    .hero { padding: 112px 0 104px; }
    .hero-inner {
      grid-template-columns: 1.3fr 1fr;
      gap: 64px;
    }
    .nra-cta { grid-template-columns: 1fr auto; gap: 32px; padding: 32px 36px; }
  }
</style>
</head>
<body>

<!-- ─── TOP BAR ──────────────────────────────────────── -->
<header class="topbar">
  <div class="topbar-inner">
    <a href="#" class="wordmark">Kashika Wanchoo</a>
    <a href="https://wa.me/919769658815" class="topbar-cta" target="_blank" rel="noopener">WhatsApp →</a>
  </div>
</header>

<!-- ─── NRA / TRAVEL NOTICE ─────────────────────────── -->
<div class="notice">
  <div class="notice-inner">
    <span class="notice-text"><span class="notice-label">/ NRA SHOW 2026</span> &nbsp;·&nbsp; <strong>Booth 12937</strong> &nbsp;·&nbsp; In the US 13–24 May, helping the Aeros team</span>
    <span class="notice-actions">
      <a class="notice-cta" href="https://www.aeros-x.com/nra" target="_blank" rel="noopener">Get the app →</a>
      <a class="notice-cta" href="https://calendly.com/arjunspanchal/nra-show-aeros-discussion-with-arjun" target="_blank" rel="noopener">Book a meeting →</a>
    </span>
  </div>
</div>

<!-- ─── HERO ─────────────────────────────────────────── -->
<section class="hero no-border">
  <div class="hero-inner">
    <div>
      <div class="eyebrow on-dark">Mumbai · Chicago · 2026</div>
      <h1>Data scientist.<br><span class="dim">On the floor at NRA.</span></h1>
      <p class="hero-lede">
        Data Scientist at Deloitte by day. This week I'm in Chicago, helping the
        Aeros team work the NRA Show floor at Booth 12937 — alongside my husband,
        Arjun.
      </p>
      <div class="hero-ctas">
        <a class="pill pill-gold" href="https://www.aeros-x.com/nra" target="_blank" rel="noopener">See the booth →</a>
        <a class="pill pill-ghost" href="#reach">Reach me</a>
      </div>
    </div>
    <div class="hero-portrait">
      <img src="/kashikawanchoo/hero.jpg" alt="Kashika Wanchoo" loading="eager">
      <span class="hero-portrait-tag">Iceland · 2025</span>
    </div>
  </div>
</section>

<!-- ─── ABOUT ────────────────────────────────────────── -->
<section>
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">About</div>
      <h2>Modeller. <span class="dim">Day job and weekends.</span></h2>
    </div>
    <p class="about-body">
      Mumbai, India. I work as a Data Scientist at
      <strong style="color: var(--ink); font-weight: 600;">Deloitte</strong> —
      models, analytics, and the unglamorous work of turning messy data into
      something people can actually decide on. Took my leaves this fortnight to
      fly to Chicago and help my husband
      <a href="https://webapp.aeros-x.com/arjunpanchal" style="color: var(--ink); font-weight: 600; text-decoration: none; border-bottom: 1px solid var(--rule-2);">Arjun Panchal</a>
      and the Aeros team work the NRA Show floor. If you're at the show, come find
      us at Booth 12937.
    </p>

    <div class="nra-cta">
      <div>
        <div class="eyebrow">NRA Show 2026</div>
        <div class="nra-cta-title">Booth 12937 · McCormick Place, Chicago</div>
        <p>Aeros is showing the full lineup — paper cups, lids, kraft bags, SBS cartons. Get the app, book a meeting, or just walk up and say hi.</p>
      </div>
      <div class="nra-cta-actions">
        <a href="https://www.aeros-x.com/nra" target="_blank" rel="noopener">Get the app →</a>
        <a class="ghost" href="https://calendly.com/arjunspanchal/nra-show-aeros-discussion-with-arjun" target="_blank" rel="noopener">Book a meeting →</a>
      </div>
    </div>
  </div>
</section>

<!-- ─── NOW ──────────────────────────────────────────── -->
<section class="soft">
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow">What I'm doing right now</div>
      <h2>Two things <span class="dim">on the desk.</span></h2>
    </div>

    <div class="now-grid">
      <div class="now-card">
        <div class="now-num">01</div>
        <div class="now-title">Deloitte</div>
        <div class="now-desc">Data science engagements — building models and analytics for clients. Day-job and the work I came up doing.</div>
        <span class="now-link" style="color: var(--muted); cursor: default;">Day job <span class="arrow">·</span></span>
      </div>
      <div class="now-card">
        <div class="now-num">02</div>
        <div class="now-title">NRA Show 2026</div>
        <div class="now-desc">Helping Aeros run Booth 12937 in Chicago, 13–24 May. Demos, conversations, late nights, the full thing.</div>
        <a class="now-link" href="https://www.aeros-x.com/nra" target="_blank" rel="noopener">aeros-x.com/nra <span class="arrow">→</span></a>
      </div>
    </div>
  </div>
</section>

<!-- ─── REACH ME (dark) ──────────────────────────────── -->
<section class="reach no-border" id="reach">
  <div class="wrap">
    <div class="section-head">
      <div class="eyebrow on-dark">Reach me</div>
      <h2 class="on-dark">Text or email <span class="dim">works best.</span></h2>
    </div>

    <div class="reach-availability">
      <strong>Where I am:</strong> in the US <strong>13–24 May 2026</strong> for NRA
      Show. Time-zoned to CT for the duration. Texting / WhatsApp is fastest. If
      you can't reach me, the Aeros team has you:
      <a href="https://wa.me/message/6Z4KO3ZWHQBMC1" target="_blank" rel="noopener" style="color: var(--paper); border-bottom: 1px solid rgba(255,255,255,0.5);">team WhatsApp</a>.
    </div>

    <div class="reach-subhead">Text first</div>
    <div class="reach-grid">

      <a class="reach-btn featured" href="https://wa.me/919769658815" target="_blank" rel="noopener">
        <span class="reach-btn-label">
          <svg class="reach-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          WhatsApp · +91 97696 58815
        </span>
        <span class="reach-btn-arrow">→</span>
      </a>

      <a class="reach-btn" href="mailto:kashika@aeros-x.com">
        <span class="reach-btn-label">
          <svg class="reach-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          kashika@aeros-x.com
        </span>
        <span class="reach-btn-arrow">→</span>
      </a>

    </div>

    <div class="reach-subhead">For Aeros sales / quotes</div>
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
        <div class="footer-mark">Kashika <span>·</span> Wanchoo</div>
        <div class="footer-meta" style="margin-top: 8px;">
          Mumbai, India · Currently in Chicago<br>
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
    if (window.location.hash) {
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
    }
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
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
