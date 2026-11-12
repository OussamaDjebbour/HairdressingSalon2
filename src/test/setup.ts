import '@testing-library/jest-dom';
import { setCurrentSalon } from '../data/salon';
import { ELEGANCE } from './salon';

// main.tsx resolves the salon from the web address before rendering; tests render components
// directly, so they serve Élégance unless a test sets another salon.
setCurrentSalon(ELEGANCE);
