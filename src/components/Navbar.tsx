import { useState, useEffect } from 'react';
import { Menu, X, Scissors, CalendarPlus, Globe } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

export function Navbar() {
  const { lang, toggleLang, t } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { key: 'nav.home', href: '#home' },
    { key: 'nav.services', href: '#services' },
    { key: 'nav.contact', href: '#contact' },
  ];

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ease-silk ${
        scrolled
          ? 'bg-cream-50/90 backdrop-blur-md shadow-soft border-b border-cream-200'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <a href="#home" className="flex items-center gap-3 group">
            <span className="relative flex items-center justify-center w-10 h-10 rounded-full bg-rose-900 text-cream-50 shadow-soft ring-1 ring-gold-400/40 transition-transform duration-300 ease-silk group-hover:scale-105">
              <Scissors className="w-5 h-5" strokeWidth={1.6} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display italic text-xl font-semibold text-rose-900 tracking-tight">
                Élégance
              </span>
              <span className="text-[10px] uppercase tracking-[0.28em] text-gold-700 font-semibold mt-0.5">
                Alger
              </span>
            </span>
          </a>

          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.key}
                href={link.href}
                className="link-gilt py-1 text-sm font-medium text-rose-700 transition-colors duration-200 hover:text-rose-900"
              >
                {t(link.key)}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-rose-700 bg-cream-100 border border-cream-200 transition-all duration-200 ease-silk hover:bg-cream-200 hover:border-rose-200"
              aria-label="Toggle language"
            >
              <Globe className="w-4 h-4" strokeWidth={1.8} />
              <span className={lang === 'fr' ? 'font-semibold text-rose-800' : ''}>FR</span>
              <span className="text-cream-400">|</span>
              <span className={lang === 'ar' ? 'font-semibold text-rose-800' : ''}>AR</span>
            </button>

            <a href="#booking" className="hidden sm:inline-flex btn-primary btn-sm">
              <CalendarPlus className="w-4 h-4" strokeWidth={1.8} />
              {t('nav.booking')}
            </a>

            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg text-rose-700 hover:bg-rose-50 transition-colors"
              aria-label="Menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </nav>

      <div
        className={`lg:hidden overflow-hidden transition-all duration-300 ease-silk ${
          mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 pt-2 space-y-1 bg-cream-50/95 backdrop-blur-md border-b border-cream-200">
          {navLinks.map((link) => (
            <a
              key={link.key}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block px-4 py-3 rounded-xl text-sm font-medium text-rose-700 hover:bg-rose-50 transition-colors"
            >
              {t(link.key)}
            </a>
          ))}
          <a
            href="#booking"
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center gap-2 btn-primary mt-2"
          >
            <CalendarPlus className="w-4 h-4" strokeWidth={1.8} />
            {t('nav.booking')}
          </a>
        </div>
      </div>
    </header>
  );
}
