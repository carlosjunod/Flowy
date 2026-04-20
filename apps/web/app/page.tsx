import type { Metadata } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';

import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { AICapabilities } from '@/components/landing/AICapabilities';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { GetStarted } from '@/components/landing/GetStarted';
import { FAQ } from '@/components/landing/FAQ';
import { Footer } from '@/components/landing/Footer';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const serif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Tryflowy — Save everything. Find anything.',
  description:
    'Tryflowy is the universal AI inbox. Share anything from your phone or Mac, and ask for it back in plain English.',
  openGraph: {
    title: 'Tryflowy — Save everything. Find anything.',
    description:
      'Share anything from your phone or Mac. Tryflowy\u2019s AI organizes it instantly. Just ask when you need it back.',
    type: 'website',
    url: 'https://tryflowy.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tryflowy — Save everything. Find anything.',
    description:
      'The universal AI inbox. Share from anywhere, ask in plain English.',
  },
};

export default function LandingPage() {
  return (
    <div
      className={`${inter.variable} ${serif.variable} landing-scope min-h-screen bg-neutral-950 text-neutral-50`}
    >
      <Nav />
      <main id="main">
        <Hero />
        <Features />
        <AICapabilities />
        <HowItWorks />
        <GetStarted />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
