'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const C = {
  ink50: '#F5F5F5',
  ink100: '#E5E5E5',
  ink200: '#C2C2C2',
  ink400: '#737373',
  ink600: '#404040',
  ink800: '#1A1A1A',
  ink900: '#0A0A0A',
  slate900: '#0A0F2E',
  white: '#FFFFFF',
  gold: '#C9A84C',
  goldDim: 'rgba(201,168,76,0.20)',
  success: '#16A34A',
};

const FONT_SANS = '"Plus Jakarta Sans", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, monospace';
const FONT_LOGO = '"Nunito Sans", system-ui, sans-serif';

const ArrowRight = ({ size = 14, strokeWidth = 2.5, className = '', style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const ArrowUpRight = ({ size = 18, strokeWidth = 2, className = '', style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    <line x1="7" y1="17" x2="17" y2="7" />
    <polyline points="7 7 17 7 17 17" />
  </svg>
);

const Eyebrow = ({ children, dark = false, className = '' }) => (
  <p
    className={`uppercase ${className}`}
    style={{
      fontFamily: FONT_MONO,
      fontSize: '11px',
      letterSpacing: '0.08em',
      color: dark ? 'rgba(255,255,255,0.40)' : C.ink400,
      fontWeight: 500,
    }}
  >
    / {children}
  </p>
);

const Wordmark = ({ size = 'md', color = C.ink900 }) => {
  const sizes = {
    sm: { fontSize: '18px' },
    md: { fontSize: '24px' },
    lg: { fontSize: '44px' },
    xl: { fontSize: 'clamp(64px, 9vw, 96px)' },
  };
  return (
    <span
      style={{
        fontFamily: FONT_LOGO,
        fontWeight: 600,
        letterSpacing: '0.08em',
        color,
        ...sizes[size],
        lineHeight: 1,
      }}
    >
      Aeros
    </span>
  );
};

const MonoStat = ({ value, suffix, label, dark = false }) => (
  <div>
    <p
      style={{
        fontFamily: FONT_MONO,
        fontWeight: 700,
        fontSize: 'clamp(28px, 3.6vw, 56px)',
        letterSpacing: '-0.03em',
        lineHeight: 1,
        color: dark ? C.white : C.ink900,
      }}
    >
      {value}
      {suffix && (
        <span
          style={{
            color: dark ? 'rgba(255,255,255,0.40)' : C.ink400,
            fontSize: '0.5em',
            fontWeight: 700,
            marginLeft: '0.05em',
          }}
        >
          {suffix}
        </span>
      )}
    </p>
    <p
      style={{
        fontFamily: FONT_MONO,
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: dark ? 'rgba(255,255,255,0.40)' : C.ink400,
        marginTop: '8px',
        fontWeight: 500,
      }}
    >
      {label}
    </p>
  </div>
);

function useReveal() {
  const ref = useRef(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const o = new IntersectionObserver(
      ([e]) => e.isIntersecting && setV(true),
      { threshold: 0.15 }
    );
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return { ref, visible: v };
}

const NAV_LINKS = [
  { label: 'Catalog', href: '/catalog' },
  { label: 'Calculator', href: '/calculator' },
  { label: 'Clearance', href: '/warehouse/clearance' },
  { label: 'Sign in', href: '/login' },
];

const Nav = () => (
  <nav
    className="sticky top-0 z-30"
    style={{
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'saturate(180%) blur(12px)',
      WebkitBackdropFilter: 'saturate(180%) blur(12px)',
      borderBottom: `1px solid ${C.ink100}`,
    }}
  >
    <div className="max-w-[1280px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
      <Link href="/" aria-label="Aeros home">
        <Wordmark size="md" />
      </Link>
      <div className="hidden md:flex items-center gap-8">
        {NAV_LINKS.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="transition-opacity hover:opacity-60"
            style={{
              fontFamily: FONT_SANS,
              fontSize: '13px',
              fontWeight: 600,
              color: C.ink800,
            }}
          >
            {item.label}
          </Link>
        ))}
        <a
          href="https://wa.me/message/6Z4KO3ZWHQBMC1"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 transition-opacity hover:opacity-90"
          style={{
            fontFamily: FONT_SANS,
            fontSize: '13px',
            fontWeight: 600,
            color: C.white,
            background: C.ink900,
            borderRadius: '999px',
            padding: '7px 14px',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '999px',
              background: C.success,
              display: 'inline-block',
            }}
          />
          WhatsApp
        </a>
      </div>
    </div>
  </nav>
);

const Hero = () => {
  const [m, setM] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setM(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${C.ink900}, ${C.slate900})`,
        color: C.white,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-6 md:inset-10 pointer-events-none rounded-3xl"
        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
      />

      <div className="relative max-w-[1280px] mx-auto px-6 lg:px-10 pt-20 md:pt-28 pb-20 md:pb-28">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8">
            <div
              className={`transition-all duration-700 ${
                m ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
            >
              <Eyebrow dark>Packaging, engineered for operators</Eyebrow>
            </div>

            <h1
              className={`mt-7 transition-all duration-700 ${
                m ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
              style={{
                fontFamily: FONT_SANS,
                fontWeight: 800,
                fontSize: 'clamp(44px, 7vw, 80px)',
                letterSpacing: '-0.04em',
                lineHeight: 0.95,
                color: C.white,
                transitionDelay: '120ms',
              }}
            >
              Cups, bags, boxes.
              <br />
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>
                Costed, quoted, shipped.
              </span>
            </h1>

            <div
              className={`mt-10 transition-all duration-700 ${
                m ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                height: '1px',
                width: '64px',
                background: 'rgba(255,255,255,0.20)',
                transitionDelay: '240ms',
              }}
            />

            <p
              className={`mt-8 max-w-xl transition-all duration-700 ${
                m ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                fontFamily: FONT_SANS,
                fontWeight: 400,
                fontSize: 'clamp(15px, 1.4vw, 18px)',
                lineHeight: 1.55,
                color: 'rgba(255,255,255,0.65)',
                transitionDelay: '320ms',
              }}
            >
              Aeros is a paper-packaging manufacturer. Food-grade cups, tubs,
              bowls, lids, kraft bags, and SBS &amp; corrugated boxes — costed
              live, quoted in INR, shipped from Mumbai.
            </p>

            <div
              className={`mt-10 flex flex-wrap items-center gap-3 transition-all duration-700 ${
                m ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
              style={{ transitionDelay: '420ms' }}
            >
              <Link
                href="/catalog"
                className="group inline-flex items-center gap-2 transition-colors"
                style={{
                  background: C.white,
                  color: C.ink900,
                  fontFamily: FONT_SANS,
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '999px',
                  padding: '12px 22px',
                }}
              >
                Browse the catalog
                <ArrowRight
                  size={14}
                  strokeWidth={2.5}
                  className="group-hover:translate-x-0.5 transition-transform"
                />
              </Link>
              <Link
                href="/calculator"
                className="group inline-flex items-center gap-2 transition-colors hover:bg-white/10"
                style={{
                  color: C.white,
                  fontFamily: FONT_SANS,
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '999px',
                  padding: '11px 21px',
                  border: '1px solid rgba(255,255,255,0.20)',
                }}
              >
                Get a live quote
                <ArrowRight
                  size={14}
                  strokeWidth={2.5}
                  className="group-hover:translate-x-0.5 transition-transform"
                />
              </Link>
            </div>
          </div>

          <div
            className={`col-span-12 lg:col-span-4 lg:pl-6 mt-10 lg:mt-0 transition-all duration-1000 ${
              m ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '500ms' }}
          >
            <div
              className="relative aspect-square rounded-3xl overflow-hidden flex flex-col"
              style={{
                background: C.white,
                color: C.ink900,
                border: `1px solid ${C.ink100}`,
              }}
            >
              <div className="px-6 pt-6 pb-3 flex items-start justify-between">
                <div>
                  <Eyebrow>Product</Eyebrow>
                  <p
                    style={{
                      fontFamily: FONT_SANS,
                      fontWeight: 700,
                      fontSize: '17px',
                      letterSpacing: '-0.02em',
                      marginTop: '6px',
                    }}
                  >
                    260ml Paper Cup
                  </p>
                </div>
                <span
                  style={{
                    background: C.ink900,
                    color: C.white,
                    fontFamily: FONT_SANS,
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px',
                  }}
                >
                  New
                </span>
              </div>
              <div
                className="flex-1 mx-6 rounded-2xl flex items-center justify-center"
                style={{
                  background: C.ink50,
                  border: `1px solid ${C.ink100}`,
                }}
              >
                <div className="relative">
                  <div
                    className="w-24 h-28"
                    style={{
                      background: `linear-gradient(180deg, ${C.white}, ${C.ink50})`,
                      border: `1px solid ${C.ink200}`,
                      borderTopLeftRadius: '4px',
                      borderTopRightRadius: '4px',
                      borderBottomLeftRadius: '38% / 12px',
                      borderBottomRightRadius: '38% / 12px',
                      boxShadow: '0 1px 3px rgba(10,15,46,0.07)',
                    }}
                  />
                  <span
                    className="absolute top-4 left-1/2 -translate-x-1/2"
                    style={{
                      fontFamily: FONT_LOGO,
                      fontWeight: 600,
                      fontSize: '9px',
                      letterSpacing: '0.12em',
                      color: C.ink400,
                    }}
                  >
                    Aeros
                  </span>
                </div>
              </div>
              <div
                className="px-6 py-5 grid grid-cols-3 gap-2"
                style={{ borderTop: `1px solid ${C.ink100}` }}
              >
                {[
                  ['Volume', '260ml'],
                  ['GSM', '240'],
                  ['MOQ', '500'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: '9px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: C.ink400,
                      }}
                    >
                      {k}
                    </p>
                    <p
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: '13px',
                        fontWeight: 700,
                        color: C.ink900,
                        marginTop: '2px',
                      }}
                    >
                      {v}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative max-w-[1280px] mx-auto px-6 lg:px-10 pb-6 flex items-center justify-between"
        style={{ color: 'rgba(255,255,255,0.30)' }}
      >
        <span style={{ fontFamily: FONT_MONO, fontSize: '11px', letterSpacing: '0.08em' }}>
          aeros-x.com
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: '11px', letterSpacing: '0.08em' }}>
          @aeros_x_
        </span>
      </div>
    </section>
  );
};

const SocialProof = () => {
  const { ref, visible } = useReveal();
  return (
    <section
      ref={ref}
      style={{
        background: C.ink900,
        color: C.white,
        borderTop: '1px solid #1a1a1a',
      }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20 md:py-28">
        <div className="mb-14">
          <Eyebrow dark>By the numbers</Eyebrow>
          <h2
            className={`mt-4 max-w-3xl transition-all duration-700 ${
              visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
            style={{
              fontFamily: FONT_SANS,
              fontWeight: 700,
              fontSize: 'clamp(32px, 4.5vw, 48px)',
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              color: C.white,
            }}
          >
            One partner.
            <br />
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>
              Paper, plastic, compostables.
            </span>
          </h2>
        </div>

        <div
          className={`pb-10 transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            transitionDelay: '120ms',
          }}
        >
          <p
            style={{
              fontFamily: FONT_MONO,
              fontWeight: 800,
              fontSize: 'clamp(64px, 11vw, 144px)',
              letterSpacing: '-0.05em',
              lineHeight: 0.9,
              color: C.white,
            }}
          >
            2,400
            <span style={{ color: 'rgba(255,255,255,0.40)' }}>+</span>
          </p>
          <p
            style={{
              fontFamily: FONT_SANS,
              fontWeight: 600,
              fontSize: '18px',
              color: C.white,
              marginTop: '12px',
            }}
          >
            Products in catalogue
          </p>
          <p
            style={{
              fontFamily: FONT_SANS,
              fontSize: '14px',
              color: 'rgba(255,255,255,0.45)',
              marginTop: '4px',
            }}
          >
            Cups, bags, boxes, lids, straws, cartons — one quote, one PO, one delivery.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-6">
          {[
            { v: '500', s: '+', l: 'Active clients' },
            { v: '15', s: 'M', l: 'Units / month' },
            { v: '98.7', s: '%', l: 'On-time dispatch' },
            { v: '06', s: '', l: 'Cities served' },
          ].map((s, i) => (
            <div
              key={s.l}
              className={`transition-all duration-700 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
              style={{ transitionDelay: `${200 + i * 80}ms` }}
            >
              <MonoStat value={s.v} suffix={s.s} label={s.l} dark />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Surfaces = () => {
  const { ref, visible } = useReveal();

  const surfaces = [
    {
      id: 'catalog',
      href: '/catalog',
      eyebrow: 'For browsers',
      title: 'Catalog',
      desc: 'The full Aeros range. Filter by category, GSM, dimensions. Request a sample, drop into a quote.',
      cta: 'Open catalog',
      meta: '2,400+ SKUs',
    },
    {
      id: 'calculator',
      href: '/calculator',
      eyebrow: 'For buyers',
      title: 'Live calculator',
      desc: 'Enter spec — paper, dimensions, quantity. Margin-adjusted ₹ quote in seconds. Login for repeat clients.',
      cta: 'Get a quote',
      meta: 'Quote in <60s',
    },
    {
      id: 'clearance',
      href: '/warehouse/clearance',
      eyebrow: 'For value-hunters',
      title: 'Warehouse',
      desc: 'Overstock and slow-moving SKUs at sharper rates. First-come basis. Lots move quickly.',
      cta: "See what's on",
      meta: 'Updated daily',
    },
  ];

  return (
    <section
      ref={ref}
      style={{ background: C.white, borderTop: `1px solid ${C.ink100}` }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20 md:py-28">
        <div className="grid grid-cols-12 gap-6 mb-14">
          <div className="col-span-12 md:col-span-7">
            <Eyebrow>The catalogue</Eyebrow>
            <h2
              className="mt-4"
              style={{
                fontFamily: FONT_SANS,
                fontWeight: 700,
                fontSize: 'clamp(32px, 4.5vw, 48px)',
                letterSpacing: '-0.02em',
                lineHeight: 1.05,
                color: C.ink900,
              }}
            >
              Three doors in.
            </h2>
          </div>
          <div className="col-span-12 md:col-span-5 flex items-end">
            <p
              style={{
                fontFamily: FONT_SANS,
                fontSize: '15px',
                lineHeight: 1.6,
                color: C.ink600,
                maxWidth: '420px',
              }}
            >
              Sourcing for a coffee chain, costing a packaging line, or hunting
              overstock at a sharper rate — pick a door.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {surfaces.map((s, i) => (
            <Link
              key={s.id}
              href={s.href}
              className={`group col-span-12 md:col-span-4 transition-all duration-700 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div
                className="h-full transition-all hover:-translate-y-0.5"
                style={{
                  background: C.white,
                  border: `1px solid ${C.ink100}`,
                  borderRadius: '24px',
                  padding: '28px 28px 24px',
                  minHeight: '320px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 1px 2px rgba(10,15,46,0.04)',
                }}
              >
                <div>
                  <div className="flex items-start justify-between mb-10">
                    <Eyebrow>{s.eyebrow}</Eyebrow>
                    <ArrowUpRight
                      size={18}
                      strokeWidth={2}
                      className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                      style={{ color: C.ink400 }}
                    />
                  </div>
                  <h3
                    style={{
                      fontFamily: FONT_SANS,
                      fontWeight: 800,
                      fontSize: '28px',
                      letterSpacing: '-0.025em',
                      lineHeight: 1.05,
                      color: C.ink900,
                    }}
                  >
                    {s.title}
                  </h3>
                  <p
                    style={{
                      fontFamily: FONT_SANS,
                      fontSize: '14px',
                      lineHeight: 1.55,
                      color: C.ink600,
                      marginTop: '12px',
                    }}
                  >
                    {s.desc}
                  </p>
                </div>
                <div
                  className="flex items-center justify-between mt-8 pt-5"
                  style={{ borderTop: `1px solid ${C.ink100}` }}
                >
                  <span
                    style={{
                      fontFamily: FONT_SANS,
                      fontWeight: 600,
                      fontSize: '13px',
                      color: C.ink900,
                    }}
                  >
                    {s.cta} →
                  </span>
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: C.ink400,
                    }}
                  >
                    {s.meta}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

const Knowledge = () => {
  const { ref, visible } = useReveal();
  const articles = [
    {
      n: '01',
      title: 'What makes a paper cup food-safe?',
      desc: 'PE vs PLA coatings, virgin stock, heat-seal integrity, FSSAI compliance.',
    },
    {
      n: '02',
      title: 'Same unit cost. Half the waste.',
      desc: 'Why right-sizing GSM (240 → 180) cuts material 25% with no drop in strength.',
    },
    {
      n: '03',
      title: 'Anatomy of a leak-proof lid',
      desc: 'Double-ring seal, CPLA stack lip, 90-degree drink slot — what to ask for.',
    },
  ];

  return (
    <section
      ref={ref}
      id="knowledge"
      style={{ background: C.ink50, borderTop: `1px solid ${C.ink100}` }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20 md:py-28">
        <div className="flex items-end justify-between mb-12">
          <div>
            <Eyebrow>Under the spec</Eyebrow>
            <h2
              className="mt-4 max-w-2xl"
              style={{
                fontFamily: FONT_SANS,
                fontWeight: 700,
                fontSize: 'clamp(32px, 4.5vw, 48px)',
                letterSpacing: '-0.02em',
                lineHeight: 1.05,
                color: C.ink900,
              }}
            >
              Operator knowledge,
              <br />
              <span style={{ color: C.ink400 }}>plainly written.</span>
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {articles.map((a, i) => (
            <div
              key={a.n}
              className={`block transition-all duration-700 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
              style={{
                background: C.white,
                border: `1px solid ${C.ink100}`,
                borderRadius: '24px',
                padding: '28px',
                transitionDelay: `${i * 100}ms`,
              }}
            >
              <div className="flex items-baseline justify-between mb-6">
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontWeight: 700,
                    fontSize: '14px',
                    color: C.ink900,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {a.n}
                </span>
                <Eyebrow>Knowledge</Eyebrow>
              </div>
              <h3
                style={{
                  fontFamily: FONT_SANS,
                  fontWeight: 800,
                  fontSize: '20px',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                  color: C.ink900,
                }}
              >
                {a.title}
              </h3>
              <div
                style={{
                  height: '1px',
                  width: '100%',
                  background: C.ink100,
                  margin: '16px 0',
                }}
              />
              <p
                style={{
                  fontFamily: FONT_SANS,
                  fontSize: '13px',
                  lineHeight: 1.55,
                  color: C.ink600,
                }}
              >
                {a.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Select = () => {
  const { ref, visible } = useReveal();
  return (
    <section
      ref={ref}
      style={{
        background: C.ink900,
        color: C.white,
        borderTop: `1px solid ${C.ink800}`,
      }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20 md:py-28">
        <div className="grid grid-cols-12 gap-6 items-center">
          <div className="col-span-12 md:col-span-7">
            <div
              className={`inline-flex items-center gap-2 transition-all duration-700 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
              style={{
                background: 'rgba(201,168,76,0.10)',
                border: `1px solid ${C.goldDim}`,
                padding: '6px 12px',
                borderRadius: '999px',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill={C.gold} aria-hidden="true">
                <path d="M8 0L10.2 5.4L16 6.2L11.8 10.1L12.9 16L8 13.1L3.1 16L4.2 10.1L0 6.2L5.8 5.4L8 0Z" />
              </svg>
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: C.gold,
                }}
              >
                Aeros Select
              </span>
            </div>

            <h2
              className={`mt-7 transition-all duration-700 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
              style={{
                fontFamily: FONT_SANS,
                fontWeight: 800,
                fontSize: 'clamp(36px, 5vw, 56px)',
                letterSpacing: '-0.03em',
                lineHeight: 0.98,
                color: C.white,
                transitionDelay: '120ms',
              }}
            >
              Curated.
              <br />
              <span style={{ color: C.gold }}>Tested.</span>
              <br />
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>Traceable.</span>
            </h2>

            <p
              className={`mt-8 max-w-md transition-all duration-700 ${
                visible ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                fontFamily: FONT_SANS,
                fontSize: '15px',
                lineHeight: 1.6,
                color: 'rgba(255,255,255,0.55)',
                transitionDelay: '240ms',
              }}
            >
              Our premium line. A short list of products we&rsquo;ve tested end-to-end —
              full traceability on stock, coating, and lot. For operators who want
              fewer SKU decisions, not more.
            </p>

            <Link
              href="/catalog"
              className={`group mt-10 inline-flex items-center gap-2 transition-all duration-700 hover:opacity-90 ${
                visible ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                background: C.gold,
                color: C.ink900,
                fontFamily: FONT_SANS,
                fontSize: '13px',
                fontWeight: 700,
                borderRadius: '999px',
                padding: '12px 22px',
                transitionDelay: '320ms',
              }}
            >
              See the Select line
              <ArrowRight size={14} strokeWidth={2.5} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div
            className={`col-span-12 md:col-span-5 transition-all duration-1000 ${
              visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{ transitionDelay: '300ms' }}
          >
            <div
              className="relative aspect-square rounded-3xl overflow-hidden flex flex-col justify-between p-7 max-w-[420px] mx-auto"
              style={{
                background: C.ink900,
                border: `1px solid ${C.goldDim}`,
              }}
            >
              <div
                className="absolute top-0 right-0 pointer-events-none"
                style={{
                  width: '64px',
                  height: '64px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 0,
                    height: 0,
                    borderTop: `64px solid ${C.gold}`,
                    borderLeft: '64px solid transparent',
                  }}
                />
                <svg
                  className="absolute top-2.5 right-2.5"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke={C.ink900}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 8l3.5 3.5L13 5" />
                </svg>
              </div>

              <div className="flex items-center gap-2">
                <svg width="11" height="11" viewBox="0 0 16 16" fill={C.gold} aria-hidden="true">
                  <path d="M8 0L10.2 5.4L16 6.2L11.8 10.1L12.9 16L8 13.1L3.1 16L4.2 10.1L0 6.2L5.8 5.4L8 0Z" />
                </svg>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: C.gold,
                  }}
                >
                  Aeros Select
                </span>
              </div>

              <div className="flex-1 flex items-center justify-center my-5">
                <div
                  className="w-32 h-36 flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.05), transparent)',
                    border: `1px solid ${C.goldDim}`,
                    borderRadius: '14px',
                  }}
                >
                  <div
                    className="w-20 h-24"
                    style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '6px' }}
                  />
                </div>
              </div>

              <div>
                <h3
                  style={{
                    fontFamily: FONT_SANS,
                    fontWeight: 800,
                    fontSize: '22px',
                    letterSpacing: '-0.02em',
                    color: C.white,
                  }}
                >
                  Kraft Deli Container
                </h3>
                <p
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.50)',
                    marginTop: '4px',
                  }}
                >
                  Curated. Tested. Traceable.
                </p>
                <div
                  style={{
                    height: '1px',
                    width: '40px',
                    background: 'rgba(201,168,76,0.60)',
                    marginTop: '14px',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const PackAI = () => {
  const { ref, visible } = useReveal();
  const ask = (question) =>
    window.dispatchEvent(new CustomEvent('aeros:open-chat', { detail: { question } }));
  const steps = [
    {
      n: '01',
      title: 'Ask in plain language',
      desc: 'Type what you serve or what you need — English, Hindi or Hinglish. "12oz double wall cups?" works. So does "burger box chahiye".',
    },
    {
      n: '02',
      title: 'It reads the live catalog',
      desc: 'PackAI searches 700+ SKUs and current clearance stock in real time — sizes, materials, GSM, case packs, stock status.',
    },
    {
      n: '03',
      title: 'Get specs, prices & links',
      desc: 'Straight answers with product links you can open, share and order from. FCL pricing in ₹. No login, no forms.',
    },
  ];
  const samples = [
    'Do you have 12oz double wall paper cups?',
    'Leak-proof containers for biryani delivery?',
    'What is in clearance stock right now?',
  ];
  return (
    <section
      ref={ref}
      id="packai"
      style={{ background: C.ink900, color: C.white, borderTop: '1px solid #1a1a1a' }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20 md:py-28">
        <div className="mb-12">
          <Eyebrow dark>Aeros PackAI</Eyebrow>
          <h2
            className={`mt-4 max-w-3xl transition-all duration-700 ${
              visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
            style={{
              fontFamily: FONT_SANS,
              fontWeight: 700,
              fontSize: 'clamp(32px, 4.5vw, 48px)',
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
              color: C.white,
            }}
          >
            Ask the catalog anything.
            <br />
            <span style={{ color: C.ink400 }}>It answers like an operator.</span>
          </h2>
          <p
            className="mt-6 max-w-2xl"
            style={{
              fontFamily: FONT_SANS,
              fontSize: '17px',
              lineHeight: 1.65,
              color: C.ink200,
            }}
          >
            PackAI is our free AI packaging assistant for cafés, restaurants, cloud
            kitchens and hotels. It knows every paper cup, lid, bag and take-out
            container we make — and answers with real specifications, full-container
            pricing and direct product links from the live Aeros catalog.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {steps.map((st, i) => (
            <div
              key={st.n}
              className={`transition-all duration-700 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
              style={{
                background: '#111110',
                border: '1px solid #262624',
                borderRadius: '24px',
                padding: '28px',
                transitionDelay: `${i * 100}ms`,
              }}
            >
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontWeight: 700,
                  fontSize: '14px',
                  color: C.ink400,
                  letterSpacing: '-0.02em',
                }}
              >
                {st.n}
              </span>
              <h3
                className="mt-5"
                style={{
                  fontFamily: FONT_SANS,
                  fontWeight: 700,
                  fontSize: '19px',
                  letterSpacing: '-0.01em',
                  color: C.white,
                }}
              >
                {st.title}
              </h3>
              <p
                className="mt-2"
                style={{
                  fontFamily: FONT_SANS,
                  fontSize: '14.5px',
                  lineHeight: 1.6,
                  color: C.ink400,
                }}
              >
                {st.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: '12px',
              color: C.ink400,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Try it
          </span>
          {samples.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              className="transition hover:bg-white hover:text-black"
              style={{
                fontFamily: FONT_SANS,
                fontSize: '13.5px',
                color: C.ink100,
                background: 'transparent',
                border: '1px solid #3a3a38',
                borderRadius: '999px',
                padding: '8px 16px',
                cursor: 'pointer',
              }}
            >
              {q}
            </button>
          ))}
        </div>

        <p
          className="mt-10"
          style={{
            fontFamily: FONT_MONO,
            fontSize: '12.5px',
            color: C.ink600,
            letterSpacing: '0.02em',
          }}
        >
          Coming soon — full consultations: share your menu, get a complete packaging
          blueprint for your café, priced and ready to order.
        </p>
      </div>
    </section>
  );
};

const CTA = () => {
  const { ref, visible } = useReveal();
  return (
    <section
      ref={ref}
      style={{
        background: `linear-gradient(135deg, ${C.ink900}, ${C.slate900})`,
        color: C.white,
        borderTop: `1px solid ${C.ink800}`,
      }}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-24 md:py-36 text-center">
        <div
          className={`transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          <Eyebrow dark className="inline-block">
            Get started
          </Eyebrow>
        </div>

        <h2
          className={`mt-6 transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
          style={{
            fontFamily: FONT_SANS,
            fontWeight: 800,
            fontSize: 'clamp(48px, 8vw, 96px)',
            letterSpacing: '-0.04em',
            lineHeight: 0.92,
            color: C.white,
            transitionDelay: '120ms',
          }}
        >
          Quote in
          <br />
          under 24&nbsp;hrs.
        </h2>

        <p
          className={`mt-8 max-w-md mx-auto transition-all duration-700 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            fontFamily: FONT_SANS,
            fontSize: '15px',
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.55)',
            transitionDelay: '240ms',
          }}
        >
          Send specs on WhatsApp. We reply with MOQ, price, and lead time.
        </p>

        <div
          className={`mt-10 flex flex-wrap items-center justify-center gap-3 transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
          style={{ transitionDelay: '320ms' }}
        >
          <a
            href="https://wa.me/message/6Z4KO3ZWHQBMC1"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
            style={{
              background: C.white,
              color: C.ink900,
              fontFamily: FONT_SANS,
              fontSize: '14px',
              fontWeight: 700,
              borderRadius: '999px',
              padding: '14px 26px',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '999px',
                background: C.success,
                display: 'inline-block',
              }}
            />
            WhatsApp us
          </a>
          <Link
            href="/calculator"
            className="group inline-flex items-center gap-2 transition-colors hover:bg-white/10"
            style={{
              color: C.white,
              fontFamily: FONT_SANS,
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '999px',
              padding: '13px 25px',
              border: '1px solid rgba(255,255,255,0.20)',
            }}
          >
            Or use the calculator
            <ArrowRight size={14} strokeWidth={2.5} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        <p
          className={`mt-8 transition-all duration-700 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            fontFamily: FONT_MONO,
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'rgba(255,255,255,0.30)',
            transitionDelay: '420ms',
          }}
        >
          aeros-x.com
        </p>
      </div>
    </section>
  );
};

const Footer = () => (
  <footer style={{ background: C.ink900, color: C.white, borderTop: `1px solid ${C.ink800}` }}>
    <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-16">
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-5">
          <Wordmark size="lg" color={C.white} />
          <p
            className="mt-5 max-w-sm"
            style={{
              fontFamily: FONT_SANS,
              fontSize: '13px',
              lineHeight: 1.6,
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            Paper packaging — designed, costed, and shipped from Mumbai,
            Maharashtra.
          </p>
          <div
            className="mt-6 inline-flex items-center gap-2"
            style={{ color: 'rgba(255,255,255,0.40)' }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '999px',
                background: C.success,
                display: 'inline-block',
              }}
            />
            <span style={{ fontFamily: FONT_MONO, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Open for orders · Priced in ₹
            </span>
          </div>
        </div>

        <div className="col-span-6 md:col-span-3">
          <Eyebrow dark>Visit</Eyebrow>
          <ul className="space-y-2.5 mt-4">
            {NAV_LINKS.map((l) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  className="hover:text-white transition-colors"
                  style={{
                    fontFamily: FONT_SANS,
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.65)',
                  }}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-6 md:col-span-4">
          <Eyebrow dark>Reach us</Eyebrow>
          <ul
            className="space-y-2.5 mt-4"
            style={{
              fontFamily: FONT_SANS,
              fontSize: '13px',
              color: 'rgba(255,255,255,0.65)',
            }}
          >
            <li>
              <a
                href="mailto:arjun@aeros-x.com"
                className="hover:text-white transition-colors"
                style={{ color: 'rgba(255,255,255,0.65)' }}
              >
                arjun@aeros-x.com
              </a>
            </li>
            <li>
              <a
                href="https://wa.me/918433536369"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
                style={{ color: 'rgba(255,255,255,0.65)' }}
              >
                +91 84335 36369
              </a>
              <span
                style={{
                  color: 'rgba(255,255,255,0.40)',
                  fontSize: '11px',
                  marginLeft: '6px',
                }}
              >
                (WhatsApp)
              </span>
            </li>
            <li className="pt-1" style={{ color: 'rgba(255,255,255,0.40)' }}>
              Mumbai, Maharashtra
              <br />
              India
            </li>
          </ul>
        </div>
      </div>

      <div
        className="mt-14 pt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'rgba(255,255,255,0.30)',
          }}
        >
          © {new Date().getFullYear()} Aeros · A Boson Machines OPC Pvt Ltd brand
        </span>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'rgba(255,255,255,0.30)',
          }}
        >
          @aeros_x_
        </span>
      </div>
    </div>
  </footer>
);

export default function LandingClient() {
  return (
    <div
      style={{
        background: C.white,
        fontFamily: FONT_SANS,
        color: C.ink900,
        minHeight: '100vh',
      }}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;700&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700;6..12,800&display=swap"
      />
      <Nav />
      <Hero />
      <SocialProof />
      <Surfaces />
      <Knowledge />
      <PackAI />
      <Select />
      <CTA />
      <Footer />
    </div>
  );
}
