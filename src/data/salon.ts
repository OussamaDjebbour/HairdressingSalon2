// The salon this page serves, resolved once at startup from the web address (see
// currentSalon.ts and main.tsx) before anything renders. Kept free of the Supabase client so
// tests can set it in their setup file (src/test/setup.ts).
import type { Lang } from '../context/LanguageContext';
import type { Palette } from '../lib/palette';

export interface CurrentSalon {
  id: string;
  /** The Arabic name falls back to the French one. */
  name: Record<Lang, string>;
  palette: Palette;
  heroImage: string;
  /** Story and claims: null when the salon left them empty (hidden on the site). */
  founderName: Record<Lang, string> | null;
  founderRole: Record<Lang, string> | null;
  story: Record<Lang, string> | null;
  storyIntro: Record<Lang, string> | null;
  yearsOpen: number | null;
  clientCount: number | null;
  rating: number | null;
  reviewCount: number | null;
  /** A showcase salon prospects can try with the one-tap demo login. */
  demo: boolean;
}

let current: CurrentSalon | null = null;

export function setCurrentSalon(salon: CurrentSalon | null): void {
  current = salon;
}

/** The current salon outside React (message templates, etc.). */
export function currentSalon(): CurrentSalon {
  return getCurrentSalon();
}

function getCurrentSalon(): CurrentSalon {
  if (!current) throw new Error('The current salon is not set (resolveSalon must run before rendering).');
  return current;
}

/** The current salon's id, for queries and RPCs. Throws if no salon was resolved. */
export function currentSalonId(): string {
  return getCurrentSalon().id;
}

/** The current salon. It never changes while the page is open, so no React state is needed. */
export function useSalon(): CurrentSalon {
  return getCurrentSalon();
}
