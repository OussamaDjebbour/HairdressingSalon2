import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useInPageLinks } from './useInPageLinks';

function Page() {
  useInPageLinks();
  return (
    <>
      <a href="#home">home</a>
      <a href="https://example.com/">out</a>
      <section id="home">Home</section>
    </>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('useInPageLinks', () => {
  it('scrolls to the section without adding a history entry and keeps the history state', () => {
    history.replaceState({ bookingGuard: true, idx: 3 }, '', '/');
    const push = vi.spyOn(history, 'pushState');
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { getByText } = render(<Page />);
    const event = fireEvent.click(getByText('home'));
    expect(event).toBe(false); // default prevented
    expect(push).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenCalled();
    expect(location.hash).toBe('#home');
    expect(history.state).toEqual({ bookingGuard: true, idx: 3 });
  });

  it('leaves other links alone', () => {
    const { getByText } = render(<Page />);
    const anchor = getByText('out');
    anchor.addEventListener('click', (e) => e.preventDefault()); // jsdom can't navigate; we only check our handler
    const spy = vi.spyOn(history, 'replaceState');
    fireEvent.click(anchor);
    expect(spy).not.toHaveBeenCalled();
  });
});
