import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/utils';
import CollectionStatistics from './CollectionStatistics';
import type { CollectionStatistics as Stats } from '../types';

const stats: Stats = {
  totalPhysicalItems: 120,
  totalMovies: 100,
  totalTVSeasons: 20,
  formatCounts: {
    'Blu-ray': 70,
    'DVD': 50,
  },
} as Stats;

describe('CollectionStatistics', () => {
  it('renders a one-line summary instead of a full tile grid', () => {
    renderWithProviders(<CollectionStatistics statistics={stats} isLoading={false} />);

    expect(screen.getByText(/120 items/)).toBeInTheDocument();
    expect(screen.getByText(/100 movies/)).toBeInTheDocument();
    expect(screen.getByText(/20 TV seasons/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /full statistics/i })).toHaveAttribute(
      'href',
      '/statistics'
    );

    // The per-format breakdown is behind the sheet, not inline.
    expect(screen.queryByText('Blu-ray')).not.toBeInTheDocument();
  });

  it('opens the full breakdown in a dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CollectionStatistics statistics={stats} isLoading={false} />);

    await user.click(screen.getByRole('button', { name: /view breakdown/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Blu-ray')).toBeInTheDocument();
    expect(screen.getByText('DVD')).toBeInTheDocument();
  });

  it('reserves the same height while loading so the layout does not jump', () => {
    const { container } = renderWithProviders(
      <CollectionStatistics statistics={null} isLoading />
    );

    expect(container.querySelector('.h-10')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /view breakdown/i })).not.toBeInTheDocument();
  });
});
