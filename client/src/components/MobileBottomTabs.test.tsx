import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import MobileBottomTabs from './MobileBottomTabs';

describe('MobileBottomTabs', () => {
  it('renders primary navigation tabs', () => {
    renderWithProviders(<MobileBottomTabs />, { initialRoute: '/' });
    expect(screen.getByRole('link', { name: /Collection/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Shelf View/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Stats/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /About/i })).toBeInTheDocument();
  });

  it('marks the current route as active', () => {
    renderWithProviders(<MobileBottomTabs />, { initialRoute: '/statistics' });
    const stats = screen.getByRole('link', { name: /Stats/i });
    expect(stats).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Collection/i })).not.toHaveAttribute('aria-current', 'page');
  });
});
