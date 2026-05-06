import LandingClient from './LandingClient';

export const metadata = {
  title: 'Aeros — Paper packaging, costed, quoted, shipped',
  description:
    'Aeros is a Mumbai-based paper packaging manufacturer. Food-grade cups, tubs, bowls, lids, kraft bags, and SBS & corrugated boxes — costed live, quoted in INR, shipped fast.',
};

// `/` is the public marketing landing. The authed module-picker (HomeClient)
// lives at `/hub`. Middleware lets / through unauthenticated and gates /hub.
export default function LandingPage() {
  return <LandingClient />;
}
