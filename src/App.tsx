import { LanguageProvider } from './context/LanguageContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Services } from './components/Services';
import { TrustBadges } from './components/TrustBadges';
import { Booking } from './components/Booking';
import { Schedule } from './components/Schedule';

function App() {
  return (
    <LanguageProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Hero />
          <TrustBadges />
          <Services />
          <Booking />
          <Schedule />
        </main>
        <Footer />
      </div>
    </LanguageProvider>
  );
}

export default App;
