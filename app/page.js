import HomeClient from './HomeClient';
import Footer from './components/Footer';
import { getSession } from '@/lib/hub/session';
import { canManageClearance } from '@/lib/clearance/admin';

export const metadata = {
  title: 'Aeros',
  description: 'Paper packaging — clearance stock, product catalog, and rate calculator.',
};

// Render the home page regardless of session. HomeClient picks which tiles to
// show: public visitors see Clearance + a Sign-in CTA; authenticated users
// see every module they have access to.
export default function WelcomePage() {
  const session = getSession();
  return (
    <HomeClient
      session={session}
      canManageClearance={canManageClearance(session)}
      footer={<Footer />}
    />
  );
}
