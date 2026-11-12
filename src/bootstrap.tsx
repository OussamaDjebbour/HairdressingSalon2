import { StrictMode, type ComponentType, type ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import { LanguageProvider } from './context/LanguageContext';
import { resolveSalon } from './data/currentSalon';
import { setCurrentSalon } from './data/salon';
import { applyPalette } from './lib/theme';
import { SalonLoadError, SalonNotFound } from './pages/SalonNotFound';

/**
 * Resolves the salon from the web address, then renders: the app when found (store set,
 * palette applied, tab title set); "salon introuvable" when the address belongs to no salon
 * (no data queries, no salon shown); a retry screen when the lookup itself failed.
 */
export async function startApp(
  root: Root,
  location: { host: string; search: string },
  App: ComponentType,
): Promise<void> {
  const screen = (node: ReactNode) =>
    root.render(
      <StrictMode>
        <LanguageProvider>{node}</LanguageProvider>
      </StrictMode>,
    );

  root.render(<div className="min-h-screen bg-cream-50" aria-busy="true" />);
  let salon;
  try {
    salon = await resolveSalon(location.host, location.search);
  } catch {
    screen(<SalonLoadError onRetry={() => void startApp(root, location, App)} />);
    return;
  }
  if (!salon) {
    setCurrentSalon(null);
    document.title = 'Salon introuvable';
    screen(<SalonNotFound />);
    return;
  }
  setCurrentSalon(salon);
  applyPalette(salon.palette);
  document.title = `${salon.name.fr} — Salon de beauté`;
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
