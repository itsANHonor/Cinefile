import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import Navigation from './Navigation';

/**
 * Regression coverage for ITS-27 (bug B1).
 *
 * The desktop collapse flag must never make the mobile drawer icon-only. The
 * drawer keeps the expanded `w-72` width at phone widths, and the nav labels
 * stay in the accessibility tree regardless of `isCollapsed` — collapsing is
 * expressed with `lg:` variants so it only applies from the large breakpoint up.
 */
describe('Navigation', () => {
  it('keeps nav labels in the accessibility tree when the desktop sidebar is collapsed', () => {
    window.localStorage.setItem('sidebar_collapsed', 'true');

    renderWithProviders(<Navigation />);

    // Accessible names come from the label text, so these only resolve if the
    // labels are rendered rather than stripped by the collapse flag.
    expect(screen.getByRole('link', { name: 'Collection' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shelf View' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Statistics' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument();
  });

  it('hides collapsed labels only from the lg breakpoint up', () => {
    window.localStorage.setItem('sidebar_collapsed', 'true');

    renderWithProviders(<Navigation />);

    const link = screen.getByRole('link', { name: 'Collection' });
    // `lg:hidden` keeps the label visible on mobile; a bare `hidden` would not.
    expect(within(link).getByText('Collection')).toHaveClass('lg:hidden');
  });

  it('renders labels without a collapse class when expanded', () => {
    window.localStorage.setItem('sidebar_collapsed', 'false');

    renderWithProviders(<Navigation />);

    const link = screen.getByRole('link', { name: 'Collection' });
    expect(within(link).getByText('Collection')).not.toHaveClass('lg:hidden');
  });

  it('gives the drawer the expanded mobile width regardless of collapse state', () => {
    window.localStorage.setItem('sidebar_collapsed', 'true');

    const { container } = renderWithProviders(<Navigation />);

    const drawer = container.querySelector('.w-72');
    expect(drawer).not.toBeNull();
    // Collapsing narrows the rail only at lg and above.
    expect(drawer).toHaveClass('lg:w-16');
  });
});
