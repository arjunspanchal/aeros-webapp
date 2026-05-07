import { redirect } from 'next/navigation';
import HomeClient from '../HomeClient';
import Footer from '../components/Footer';
import { getSession, hasAnyAccess } from '@/lib/hub/session';

export const metadata = {
  title: 'Aeros',
  description: 'Paper packaging — warehouse stock, product catalog, and rate calculator.',
};

export default function HubPage() {
  const session = getSession();
  if (!hasAnyAccess(session)) redirect('/login');
  return (
    <HomeClient
      session={session}
      footer={<Footer />}
    />
  );
}
