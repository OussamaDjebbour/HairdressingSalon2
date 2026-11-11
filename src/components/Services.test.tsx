import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const service = {
  id: 'new-soin', category: 'beaute', icon: 'sparkles', image: '', price: 3000, duration: 45,
  name: { fr: 'Soin éclat', ar: 'عناية' }, description: { fr: 'd', ar: 'd' }, active: true, sortOrder: 0,
};
vi.mock('../data/queries', () => ({
  useServices: () => ({ data: [service], isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { LanguageProvider } from '../context/LanguageContext';
import { Services } from './Services';

describe('Services', () => {
  it('shows the category icon tile, not an endless shimmer, for a service without a photo', () => {
    const { container } = render(
      <LanguageProvider>
        <Services />
      </LanguageProvider>
    );
    expect(screen.getByRole('img', { name: 'Soin éclat' })).toBeInTheDocument();
    expect(container.querySelector('.img-placeholder')).toBeNull();
  });
});
