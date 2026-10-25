import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import { renderWithProviders } from '../../test/utils';
import ShelfView from './ShelfView';
import type { Shelf } from '../../types';

const shelf: Shelf = {
  id: 1,
  group_id: 1,
  name: 'shelf-a',
  display_name: 'Shelf A',
  capacity_units: 20,
  sort_order: 0,
  used_units: 1,
  placements: [
    {
      id: 10,
      shelf_id: 1,
      physical_item_id: 42,
      position: 0,
      physical_item: {
        id: 42,
        name: 'Blade Runner',
        thickness_units: 1,
        media: [],
      } as any,
    },
  ],
};

function renderShelf(onItemClick: (id: number) => void, isEditMode = false) {
  return renderWithProviders(
    <DndContext>
      <ShelfView shelf={shelf} isEditMode={isEditMode} onItemClick={onItemClick} />
    </DndContext>
  );
}

/**
 * Regression coverage for ITS-28 (bug B4).
 *
 * Shelf spines must be reachable by pointer *and* keyboard. The spine was
 * previously a bare <div onClick>, so it was unreachable via Tab/Enter.
 */
describe('ShelfView spine interaction', () => {
  it('exposes each spine as a labelled, focusable button', () => {
    renderShelf(vi.fn());

    const spine = screen.getByRole('button', { name: /open details for blade runner/i });
    expect(spine).toBeInTheDocument();
    expect(spine).toHaveAttribute('tabIndex', '0');
  });

  it('fires onItemClick when the spine is clicked', async () => {
    const onItemClick = vi.fn();
    const user = userEvent.setup();
    renderShelf(onItemClick);

    await user.click(screen.getByRole('button', { name: /open details for blade runner/i }));

    expect(onItemClick).toHaveBeenCalledWith(42);
  });

  it('fires onItemClick on Enter and Space', async () => {
    const onItemClick = vi.fn();
    const user = userEvent.setup();
    renderShelf(onItemClick);

    screen.getByRole('button', { name: /open details for blade runner/i }).focus();

    await user.keyboard('{Enter}');
    expect(onItemClick).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(onItemClick).toHaveBeenCalledTimes(2);
    expect(onItemClick).toHaveBeenLastCalledWith(42);
  });

  it('applies touch-action none to the draggable wrapper in edit mode', () => {
    const { container } = renderShelf(vi.fn(), true);

    // Guards ITS-29: without touch-none a touch-drag scrolls the page instead.
    expect(container.querySelector('.touch-none')).not.toBeNull();
  });

  it('dims non-matching spines in-place and shows match count when matchingItemIds is provided', () => {
    const { container, rerender } = renderWithProviders(
      <DndContext>
        <ShelfView
          shelf={shelf}
          isEditMode={false}
          matchingItemIds={new Set([999])}
          onItemClick={vi.fn()}
        />
      </DndContext>
    );

    expect(screen.getByText('0 matches')).toBeInTheDocument();
    expect(container.querySelector('[data-filter-state="dimmed"]')).not.toBeNull();

    rerender(
      <DndContext>
        <ShelfView
          shelf={shelf}
          isEditMode={false}
          matchingItemIds={new Set([42])}
          onItemClick={vi.fn()}
        />
      </DndContext>
    );

    expect(screen.getByText('1 match')).toBeInTheDocument();
    expect(container.querySelector('[data-filter-state="matched"]')).not.toBeNull();
  });
});
