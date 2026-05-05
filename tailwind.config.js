/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Existing gold token — preserved exactly.
        brand: {
          50: '#fef7ee',
          100: '#fdecd3',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        // Editorial-utilitarian register. Cream-paper grays for default
        // surfaces and ink-heavy text. Used app-wide as the new aesthetic
        // rolls out cluster-by-cluster.
        ink: {
          50:  '#FAFAF7',  // default page bg (slight cream)
          100: '#F1F1ED',  // subdued surface
          200: '#E2E2DC',  // borders, dividers
          400: '#9A9A92',  // muted text, secondary labels
          600: '#56564F',  // body on subdued surfaces
          800: '#262622',  // primary body text
          900: '#0F0F0D',  // headings, emphasis
        },
        // FactoryOS register — cooler than ink, used on internal ops surfaces.
        // Extends Tailwind's default `slate.*` (zero existing usage in this
        // codebase, verified). Default keys we don't define remain Tailwind's.
        slate: {
          50:  '#F5F6F8',
          100: '#E8EAEF',
          200: '#CFD3DC',
          400: '#7C8294',
          600: '#454B5C',
          800: '#1F2330',
          900: '#0E1018',
        },
        // Royal blue — the workhorse functional color: primary CTAs, focus
        // rings, active links. 700/800 are the hover/active darker shades.
        // HSL-darkened from 600 (228° hue, ~50% → ~40% → ~32% lightness).
        royal: {
          600: '#2347D9',
          700: '#1A37B3',  // hover
          800: '#142890',  // active
        },
      },
      fontFamily: {
        // Plus Jakarta Sans for UI/display. next/font wiring lands in the
        // shell prompt — until then this list resolves to system stacks.
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        // IBM Plex Mono for codes, IDs, numerics. Falls back to the platform
        // monospace until next/font is wired.
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // Nunito Sans for the brand wordmark only. Logo uses `font-logo`.
        logo: ['"Nunito Sans"', 'system-ui', 'sans-serif'],
      },
      // Display scale for headlines on marketing-grade surfaces. Ops surfaces
      // use Tailwind's default text-xl/2xl/3xl/4xl. Negative tracking baked in
      // at the token so headlines tighten naturally without per-instance code.
      // Defaults for xs/sm/base/lg/xl/2xl/3xl/4xl/5xl are intentionally NOT
      // overridden — would resize 71+ existing render sites.
      fontSize: {
        'display-sm':  ['24px', { lineHeight: '32px',  letterSpacing: '-0.01em'  }],
        'display-md':  ['32px', { lineHeight: '40px',  letterSpacing: '-0.015em' }],
        'display-lg':  ['48px', { lineHeight: '56px',  letterSpacing: '-0.02em'  }],
        'display-xl':  ['64px', { lineHeight: '72px',  letterSpacing: '-0.025em' }],
        'display-2xl': ['96px', { lineHeight: '100px', letterSpacing: '-0.03em'  }],
      },
      // Editorial discipline — small radii only. Values match Tailwind defaults
      // exactly; declaring them here is policy documentation, not a render
      // change. New surfaces should never use rounded-xl, rounded-2xl, or
      // rounded-full (existing pages keep theirs until rewritten).
      borderRadius: {
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
      // Borders carry the work. One subtle ink-tinted shadow for floating
      // elements. Alpha shift from black (0.05) to ink-tinted is below
      // human-discriminable threshold so existing `shadow-sm` sites are
      // visually unchanged.
      boxShadow: {
        sm: '0 1px 2px 0 rgb(15 15 13 / 0.05), 0 1px 3px 0 rgb(15 15 13 / 0.04)',
      },
    },
  },
  plugins: [],
};
