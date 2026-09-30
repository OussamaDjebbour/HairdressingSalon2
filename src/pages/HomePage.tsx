import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Hero } from '../components/Hero';
import { Services } from '../components/Services';
import { TrustBadges } from '../components/TrustBadges';
import { Philosophy } from '../components/Philosophy';
import { Booking } from '../components/Booking';

export function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <TrustBadges />
        <Services />
        <Philosophy />
        <Booking />
      </main>
      <Footer />
    </div>
  );
}
