import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '../context/LanguageContext';
import { Navbar } from './Navbar';

const renderBar = () => render(<LanguageProvider><Navbar /></LanguageProvider>);
const wordmark = () => screen.getByText('Élégance').closest('a') as HTMLElement;
const scrollTo = (y: number) =>
  act(() => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    window.dispatchEvent(new Event('scroll'));
  });

afterEach(() => scrollTo(0));

describe('Navbar', () => {
  it('hides the salon name while over the hero', () => {
    renderBar();
    expect(wordmark()).toHaveAttribute('tabindex', '-1');
    expect(wordmark()).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows it after scrolling past the hero', () => {
    renderBar();
    scrollTo(window.innerHeight);
    expect(wordmark()).not.toHaveAttribute('aria-hidden');
    expect(wordmark()).not.toHaveAttribute('tabindex', '-1');
  });

  it('the language button switches language', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le site en arabe' }));
    expect(document.documentElement.lang).toBe('ar');
  });

  it('Réserver links to #booking and is at least 44 px tall', () => {
    renderBar();
    const book = screen.getByRole('link', { name: 'Réserver' });
    expect(book).toHaveAttribute('href', '#booking');
    expect(book).toHaveClass('min-h-[44px]');
  });
});
