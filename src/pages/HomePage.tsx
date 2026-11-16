import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Hero } from '../components/Hero';
import { Services } from '../components/Services';
import { Philosophy } from '../components/Philosophy';
import { Booking } from '../components/Booking';
import { BookingIntentProvider } from '../context/BookingIntentContext';
import { useSiteScope } from '../lib/useSiteScope';

export function HomePage() {
  useSiteScope();
  return (
    <BookingIntentProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Hero />
          <Services />
          <Philosophy />
          <Booking />
        </main>
        <Footer />
      </div>
    </BookingIntentProvider>
  );
}
