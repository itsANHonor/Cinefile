import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/utils';
import ToShelveBanner from './ToShelveBanner';
import ShelvingQueueModal from './ShelvingQueueModal';
import ShelfPhotoGalleryModal from './ShelfPhotoGalleryModal';
import OrganizeShelvesModal from './OrganizeShelvesModal';
import { apiService } from '../../services/api.service';
import { resetFacetsCache } from '../../hooks/useFacets';
import type {
  OrganizationPreview,
  PhysicalItem,
  PhysicalLibrary,
  ShelfPhoto,
  ShelvingQueuePlan,
} from '../../types';

const makeItem = (id: number, name: string): PhysicalItem =>
  ({
    id,
    name,
    thickness_units: 1,
    spine_color: '#1e40af',
    spine_color_accent: '#ffffff',
  }) as unknown as PhysicalItem;

const sampleLibrary: PhysicalLibrary = {
  id: 1,
  name: 'default',
  display_name: 'My Physical Library',
  groups: [
    {
      id: 10,
      library_id: 1,
      name: 'living_room',
      display_name: 'Living Room',
      sort_order: 0,
      shelves: [
        {
          id: 100,
          group_id: 10,
          name: 'living_room_-_shelf_1',
          display_name: 'Living Room - Shelf 1',
          capacity_units: 20,
          sort_order: 0,
          placements: [],
          used_units: 0,
        },
      ],
    },
  ],
};

const emptyPreview: OrganizationPreview = {
  shelves: [
    {
      shelf_id: 100,
      shelf_display_name: 'Living Room - Shelf 1',
      group_id: 10,
      group_display_name: 'Living Room',
      capacity_units: 20,
      effective_capacity_units: 18,
      used_units: 0,
      items: [],
      overflow: false,
    },
  ],
  blocks: [],
  unmatched_items: [],
  unplaceable_items: [],
};

const makePreviewShelf = (
  shelfId: number,
  groupId: number,
  groupName: string,
  items: { id: number; name: string; blockId?: number | null; pinned?: boolean }[]
): OrganizationPreview['shelves'][number] => ({
  shelf_id: shelfId,
  shelf_display_name: `${groupName} - Shelf ${shelfId}`,
  group_id: groupId,
  group_display_name: groupName,
  capacity_units: 20,
  effective_capacity_units: 18,
  used_units: items.length,
  items: items.map((i) => ({
    physical_item_id: i.id,
    name: i.name,
    thickness_units: 1,
    block_id: i.blockId ?? null,
    is_pinned: i.pinned ?? false,
  })),
  overflow: false,
});

const samplePlan: ShelvingQueuePlan = {
  has_blocks: true,
  assignments: [
    {
      physical_item_id: 1,
      physical_item_name: 'Alien: Romulus',
      thickness_units: 1,
      status: 'ok',
      block_id: 1,
      block_name: 'Movies',
      target_shelf_id: 100,
      target_shelf_name: 'Living Room - Shelf 1',
      target_group_name: 'Living Room',
      position: 1,
      before_item_name: 'Alien',
      after_item_name: 'Dune',
    },
  ],
  steps: [
    {
      kind: 'insert',
      physical_item_id: 1,
      physical_item_name: 'Alien: Romulus',
      to_shelf_id: 100,
      to_shelf_name: 'Living Room - Shelf 1',
      to_group_name: 'Living Room',
      to_position: 1,
      before_item_name: 'Alien',
      after_item_name: 'Dune',
    },
  ],
  shelf_diffs: [
    {
      shelf_id: 100,
      shelf_display_name: 'Living Room - Shelf 1',
      group_id: 10,
      group_display_name: 'Living Room',
      touched: true,
      before: [
        { physical_item_id: 1, name: 'Alien', thickness_units: 1, position: 0, change: 'unchanged' },
        { physical_item_id: 2, name: 'Dune', thickness_units: 1, position: 1, change: 'unchanged' },
      ],
      after: [
        { physical_item_id: 1, name: 'Alien', thickness_units: 1, position: 0, change: 'unchanged' },
        { physical_item_id: 3, name: 'Alien: Romulus', thickness_units: 1, position: 1, change: 'new' },
        { physical_item_id: 2, name: 'Dune', thickness_units: 1, position: 2, change: 'unchanged' },
      ],
    },
  ],
  boundary_conflicts: [],
};

const samplePhotos: ShelfPhoto[] = [
  {
    id: 1,
    library_id: 1,
    group_id: 10,
    shelf_id: null,
    image_url: '/uploads/photo1.jpg',
    caption: 'Living room wall',
    sort_order: 0,
  },
  {
    id: 2,
    library_id: 1,
    group_id: null,
    shelf_id: null,
    image_url: '/uploads/photo2.jpg',
    caption: null,
    sort_order: 1,
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
  resetFacetsCache();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    json: async () => ({ mode: 'admin' }),
  } as Response);
  vi.spyOn(apiService, 'verifyAuth').mockResolvedValue(true);
  vi.spyOn(apiService, 'getFacets').mockResolvedValue({
    genres: [],
    decades: [],
    formats: [],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ToShelveBanner
// ─────────────────────────────────────────────────────────────────────────────

describe('ToShelveBanner', () => {
  it('renders nothing when there are no items', () => {
    const { container } = renderWithProviders(
      <ToShelveBanner items={[]} onPlanClick={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count and opens the queue on click', async () => {
    const user = userEvent.setup();
    const onPlan = vi.fn();
    renderWithProviders(
      <ToShelveBanner items={[makeItem(1, 'Alien'), makeItem(2, 'Dune')]} onPlanClick={onPlan} />
    );
    expect(screen.getByText(/2 new items/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add to shelves/i }));
    expect(onPlan).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShelvingQueueModal
// ─────────────────────────────────────────────────────────────────────────────

describe('ShelvingQueueModal', () => {
  it('walks through Step 1 (selection) to Step 2 (graphical Shelf Map + Shelf Changes without checklist)', async () => {
    const user = userEvent.setup();
    const planSpy = vi.spyOn(apiService, 'planShelvingQueue').mockResolvedValue(samplePlan);
    const items = [makeItem(1, 'Alien: Romulus'), makeItem(2, 'Dune: Part Two')];

    renderWithProviders(
      <ShelvingQueueModal isOpen items={items} onClose={vi.fn()} onApplied={vi.fn()} />
    );

    // Step 1: Select Items
    expect(screen.getByRole('dialog', { name: /Add to Shelves/i })).toBeInTheDocument();
    expect(screen.getByText(/Items to shelve \(2\/2\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Shelf Map$/i)).not.toBeInTheDocument();

    await waitFor(() => expect(planSpy).toHaveBeenCalledWith([1, 2], undefined));

    // Advance to Step 2: Preview Shelf Changes
    await user.click(screen.getByRole('button', { name: /Next: Preview Changes/i }));

    expect(await screen.findByText(/^Shelf Map$/i)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Living Room - Shelf 1 placement diagram/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/^Shelf Changes$/i)).toBeInTheDocument();
    expect(screen.getByText(/Insert "Alien: Romulus" at Pos 2 \(after "Alien"\)/i)).toBeInTheDocument();
    expect(screen.getByText('+ Alien: Romulus')).toBeInTheDocument();
    // No busy-work checkboxes on Step 2
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    // Can navigate back to Step 1
    await user.click(screen.getByRole('button', { name: /Back to Selection/i }));
    expect(screen.getByText(/Items to shelve \(2\/2\)/i)).toBeInTheDocument();
  });

  it('applies the plan on Step 2 via applyShelvingQueue and reports via onApplied', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'planShelvingQueue').mockResolvedValue(samplePlan);
    const applySpy = vi
      .spyOn(apiService, 'applyShelvingQueue')
      .mockResolvedValue(sampleLibrary);
    const onApplied = vi.fn();
    const onClose = vi.fn();
    const items = [makeItem(1, 'Alien: Romulus')];

    renderWithProviders(
      <ShelvingQueueModal isOpen items={items} onClose={onClose} onApplied={onApplied} />
    );

    await user.click(screen.getByRole('button', { name: /Next: Preview Changes/i }));
    await screen.findByText(/^Shelf Map$/i);
    await user.click(screen.getByRole('button', { name: /Confirm & Update Shelves/i }));

    await waitFor(() => expect(applySpy).toHaveBeenCalledWith([1], undefined));
    expect(onApplied).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShelfPhotoGalleryModal
// ─────────────────────────────────────────────────────────────────────────────

describe('ShelfPhotoGalleryModal', () => {
  it('loads photos and shows upload controls in admin mode', async () => {
    const getSpy = vi.spyOn(apiService, 'getShelfPhotos').mockResolvedValue(samplePhotos);
    renderWithProviders(
      <ShelfPhotoGalleryModal isOpen library={sampleLibrary} onClose={vi.fn()} />
    );

    await waitFor(() => expect(getSpy).toHaveBeenCalled());
    expect(await screen.findByText('Living room wall')).toBeInTheDocument();
    expect(screen.getByText('Shelf Photos (2)')).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop photos here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Living Room \(1\)/i })).toBeInTheDocument();
  });

  it('filters by group and opens the lightbox', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'getShelfPhotos').mockResolvedValue(samplePhotos);
    renderWithProviders(
      <ShelfPhotoGalleryModal
        isOpen
        library={sampleLibrary}
        onClose={vi.fn()}
        onJumpToGroup={vi.fn()}
      />
    );

    expect(await screen.findByText('Living room wall')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Living Room \(1\)/i }));
    expect(screen.queryByText('No caption')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Open photo: Living room wall/i }));
    expect(screen.getByRole('dialog', { name: /Shelf photo viewer/i })).toBeInTheDocument();
    // Jump to Virtual Shelf for group-tagged photo
    expect(screen.getByRole('button', { name: /Jump to Virtual Shelf/i })).toBeInTheDocument();
  });

  it('hides upload controls in read-only mode', async () => {
    vi.spyOn(apiService, 'getShelfPhotos').mockResolvedValue(samplePhotos);
    renderWithProviders(
      <ShelfPhotoGalleryModal isOpen library={sampleLibrary} readOnly onClose={vi.fn()} />
    );

    expect(await screen.findByText('Living room wall')).toBeInTheDocument();
    expect(screen.queryByText(/Drag & drop photos here/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OrganizeShelvesModal
// ─────────────────────────────────────────────────────────────────────────────

describe('OrganizeShelvesModal', () => {
  it('shows quick-start templates when no blocks exist', async () => {
    vi.spyOn(apiService, 'getOrganization').mockResolvedValue({
      headroom_units: 2,
      blocks: [],
    });
    vi.spyOn(apiService, 'previewOrganization').mockResolvedValue(emptyPreview);

    renderWithProviders(
      <OrganizeShelvesModal
        isOpen
        groups={sampleLibrary.groups}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />
    );

    expect(await screen.findByText(/Start from a template/i)).toBeInTheDocument();
    expect(screen.getByText('TV Shows → Movies by Series')).toBeInTheDocument();
    expect(screen.getByText('All Alphabetical')).toBeInTheDocument();
    expect(screen.getByText(/Breathing room per shelf/i)).toBeInTheDocument();
  });

  it('uses a split preview pane without nested preview scrolling and keeps actions in a fixed footer', async () => {
    vi.spyOn(apiService, 'getOrganization').mockResolvedValue({
      headroom_units: 2,
      blocks: [],
    });
    vi.spyOn(apiService, 'previewOrganization').mockResolvedValue(emptyPreview);

    renderWithProviders(
      <OrganizeShelvesModal
        isOpen
        groups={sampleLibrary.groups}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />
    );

    expect(await screen.findByText(/Start from a template/i)).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: /Organize Shelves/i });
    expect(dialog).toHaveClass('h-[85dvh]');

    const previewPane = screen.getByRole('complementary', { name: /shelf map preview/i });
    expect(previewPane).toHaveClass('lg:overflow-y-auto');
    const hasNestedPreviewScroll = Array.from(previewPane.querySelectorAll('*')).some((element) =>
      element.classList.contains('max-h-[55dvh]')
    );
    expect(hasNestedPreviewScroll).toBe(false);

    const applyButton = screen.getByRole('button', { name: /Save & Organize All Shelves/i });
    expect(applyButton.parentElement?.parentElement).toHaveClass('border-t');
  });

  it('collapses and expands preview groups, showing a minimap fill bar when collapsed', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'getOrganization').mockResolvedValue({
      headroom_units: 2,
      blocks: [],
    });
    vi.spyOn(apiService, 'previewOrganization').mockResolvedValue({
      shelves: [
        makePreviewShelf(100, 10, 'Living Room', [
          { id: 1, name: 'Alien' },
          { id: 2, name: 'Dune' },
        ]),
      ],
      blocks: [],
      unmatched_items: [],
      unplaceable_items: [],
    });

    renderWithProviders(
      <OrganizeShelvesModal
        isOpen
        groups={sampleLibrary.groups}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />
    );

    // Small collections start expanded: shelf rows are visible
    expect(await screen.findByText('Living Room - Shelf 100')).toBeInTheDocument();
    const accordion = screen.getByRole('button', { name: /Living Room/i });
    expect(accordion).toHaveAttribute('aria-expanded', 'true');

    // Collapse: shelf rows disappear, minimap overview appears
    await user.click(accordion);
    expect(accordion).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Living Room - Shelf 100')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Living Room fill overview/i })).toBeInTheDocument();

    // Expand again
    await user.click(accordion);
    expect(screen.getByText('Living Room - Shelf 100')).toBeInTheDocument();
  });

  it('defaults to collapsed groups for large collections and supports expand/collapse all', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'getOrganization').mockResolvedValue({
      headroom_units: 2,
      blocks: [],
    });
    const shelves = Array.from({ length: 13 }, (_, i) =>
      makePreviewShelf(200 + i, 10, 'Living Room', [{ id: i + 1, name: `Movie ${i}` }])
    );
    vi.spyOn(apiService, 'previewOrganization').mockResolvedValue({
      shelves,
      blocks: [],
      unmatched_items: [],
      unplaceable_items: [],
    });

    renderWithProviders(
      <OrganizeShelvesModal
        isOpen
        groups={sampleLibrary.groups}
        onClose={vi.fn()}
        onApplied={vi.fn()}
      />
    );

    // 13 shelves exceeds the threshold: group starts collapsed
    const accordion = await screen.findByRole('button', { name: /Living Room/i });
    expect(accordion).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Living Room - Shelf 200')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Living Room fill overview/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Expand all/i }));
    expect(screen.getByText('Living Room - Shelf 200')).toBeInTheDocument();
    expect(screen.getByText('Living Room - Shelf 212')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Collapse all/i }));
    expect(screen.queryByText('Living Room - Shelf 200')).not.toBeInTheDocument();
  });

  it('loads saved blocks and headroom, and applies organization', async () => {
    const user = userEvent.setup();
    vi.spyOn(apiService, 'getOrganization').mockResolvedValue({
      headroom_units: 3,
      blocks: [
        {
          id: 7,
          name: 'Movies A–Z',
          color: '#3b82f6',
          sort_order: 0,
          enabled: true,
          target_scope: 'library',
          target_group_id: null,
          start_on_fresh_shelf: true,
          headroom_units_override: null,
          filter_rules: { match_all: true },
          sort_by: 'title',
          sort_direction: 'asc',
        },
      ],
    });
    vi.spyOn(apiService, 'previewOrganization').mockResolvedValue(emptyPreview);
    const applySpy = vi
      .spyOn(apiService, 'applyOrganization')
      .mockResolvedValue({ library: sampleLibrary, preview: emptyPreview });
    const onApplied = vi.fn();

    renderWithProviders(
      <OrganizeShelvesModal
        isOpen
        groups={sampleLibrary.groups}
        onClose={vi.fn()}
        onApplied={onApplied}
      />
    );

    // Saved block is rendered with its name; headroom shows 3
    expect(await screen.findByDisplayValue('Movies A–Z')).toBeInTheDocument();
    expect(screen.getByText('3', { selector: 'span' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save & Organize All Shelves/i }));
    // Confirm the destructive reorganization dialog
    await user.click(await screen.findByRole('button', { name: /^Organize Shelves$/i }));
    await waitFor(() => expect(applySpy).toHaveBeenCalled());
    expect(onApplied).toHaveBeenCalled();
  });
});
