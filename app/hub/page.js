import { redirect } from 'next/navigation';
import HomeClient from '../HomeClient';
import Footer from '../components/Footer';
import { getSession, hasAnyAccess } from '@/lib/hub/session';
import { canManageClearance } from '@/lib/clearance/admin';

export const metadata = {
  title: 'Aeros',
  description: 'Paper packaging — clearance stock, product catalog, and rate calculator.',
};

export default function HubPage() {
  const session = getSession();
  if (!hasAnyAccess(session)) redirect('/login');
  return (
    <HomeClient
      session={session}
      canManageClearance={canManageClearance(session)}
      footer={<Footer />}
    />
  );
}
