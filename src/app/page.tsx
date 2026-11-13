import React from 'react';
import type { Metadata } from 'next';
import MecmLandingPage from '@/components/landing/MecmLandingPage';

export const metadata: Metadata = {
  title: 'MECM — Multi-Event CRM Platform | For Temples, Communities & Organizations',
  description:
    'A unified, scalable platform to plan, run and manage multiple events, volunteers and visitors with ease. Purpose-built for temples, communities, and high-touch cultural organizations.',
  keywords: [
    'MECM',
    'Multi-Event CRM',
    'Temple Management System',
    'Volunteer Management',
    'Event CRM',
    'QR Gate Check-in',
    'Devotee Management',
    'Festival Management Platform',
  ],
  openGraph: {
    title: 'MECM — Multi-Event CRM Platform',
    description:
      'A unified, scalable platform to plan, run and manage multiple events, volunteers and visitors with ease.',
    url: 'https://mecm.vercel.app',
    siteName: 'MECM Platform',
    locale: 'en_US',
    type: 'website',
  },
};

export default function HomePage() {
  return <MecmLandingPage />;
}
