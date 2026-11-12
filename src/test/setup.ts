import '@testing-library/jest-dom';
import { setCurrentSalon } from '../data/salon';
import { ELEGANCE } from './salon';

// main.tsx resolves the salon from the web address before rendering; tests render components
// directly, so they serve Élégance unless a test sets another salon.
setCurrentSalon(ELEGANCE);

// jsdom lacks a few browser APIs that Radix UI relies on (some tests run in the node environment).
if (typeof Element !== 'undefined') {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
}
