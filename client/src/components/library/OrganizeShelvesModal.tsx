import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CollectionFacets,
  OrganizationPreview,
  ShelfBlockFilterRules,
  ShelfBlockSortBy,
  ShelfGroup,
  ShelfOrganizationBlock,
} from '../../types';
import { apiService } from '../../services/api.service';
import { useFacets } from '../../hooks/useFacets';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Spinner } from '../ui/Spinner';

const BLOCK_COLORS = [
  '#6366f1',
  '#f59e0b',
  '#14b8a6',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#22c55e',
  '#0ea5e9',
];

const SORT_OPTIONS: { value: ShelfBlockSortBy; label: string }[] = [
  { value: 'title', label: 'Title (A–Z)' },
  { value: 'series_sort', label: 'Series Name' },
  { value: 'tv_show_season', label: 'TV Show + Season #' },
  { value: 'director_last_name', label: 'Director Last Name' },
  { value: 'release_date', label: 'Release Year' },
  { value: 'created_at', label: 'Date Added' },
  { value: 'physical_format', label: 'Format' },
];

const COLLAPSE_SHELF_THRESHOLD = 12;

let nextDraftId = -1;
function makeDraftBlock(partial: Partial<ShelfOrganizationBlock> = {}): ShelfOrganizationBlock {
  return {
    id: nextDraftId--,
    name: 'New Block',
    color: BLOCK_COLORS[Math.abs(nextDraftId) % BLOCK_COLORS.length],
    sort_order: 0,
    enabled: true,
    target_scope: 'library',
    target_group_id: null,
    start_on_fresh_shelf: true,
    headroom_units_override: null,
    filter_rules: { match_all: true },
    sort_by: 'title',
    sort_direction: 'asc',
    ...partial,
  };
}

const TEMPLATES: { label: string; description: string; make: () => ShelfOrganizationBlock[] }[] = [
  {
    label: 'TV Shows → Movies by Series',
    description: 'TV seasons alphabetically by show & season, then movies by series name.',
    make: () => [
      makeDraftBlock({
        name: 'TV Shows',
        color: '#f59e0b',
        filter_rules: { media_type: 'tv_season' },
        sort_by: 'tv_show_season',
      }),
      makeDraftBlock({
        name: 'Movies',
        color: '#14b8a6',
        filter_rules: { match_all: true },
        sort_by: 'series_sort',
      }),
    ],
  },
  {
    label: 'All Alphabetical',
    description: 'Everything in one continuous A–Z flow across all shelves.',
    make: () => [
      makeDraftBlock({
        name: 'All Items A–Z',
        color: '#6366f1',
        filter_rules: { match_all: true },
        sort_by: 'title',
      }),
    ],
  },
  {
    label: '4K UHD First → Rest by Series',
    description: 'Your 4K discs first, then everything else sorted by series.',
    make: () => [
      makeDraftBlock({
        name: '4K UHD',
        color: '#8b5cf6',
        filter_rules: { formats: ['4K UHD'] },
        sort_by: 'title',
      }),
      makeDraftBlock({
        name: 'Everything Else',
        color: '#14b8a6',
        filter_rules: { match_all: true },
        sort_by: 'series_sort',
      }),
    ],
  },
  {
    label: 'Boutique → Rest of Collection',
    description: 'Criterion, Arrow and other boutique labels first, then everything else.',
    make: () => [
      makeDraftBlock({
        name: 'Boutique Labels',
        color: '#ec4899',
        filter_rules: {
          edition_tags: [
            'Criterion Collection',
            'Arrow Video',
            'Indicator',
            'Shout Select',
            'Vinegar Syndrome',
            'Eureka',
            'BFI',
          ],
        },
        sort_by: 'title',
      }),
      makeDraftBlock({
        name: 'Everything Else',
        color: '#14b8a6',
        filter_rules: { match_all: true },
        sort_by: 'series_sort',
      }),
    ],
  },
];

interface OrganizeShelvesModalProps {
  isOpen: boolean;
  groups: ShelfGroup[];
  onClose: () => void;
  onApplied: () => void;
}

function toggleInList<T>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

const GripIcon: React.FC = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="5" r="1.5" />
    <circle cx="15" cy="5" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="19" r="1.5" />
    <circle cx="15" cy="19" r="1.5" />
  </svg>
);

/** Compact multi-select chip row for a facet. */
const FacetChips: React.FC<{
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}> = ({ label, options, selected, onToggle }) => {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-content-muted">{label}</p>
      <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
        {options.map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            selected={selected.includes(opt.value)}
            onClick={() => onToggle(opt.value)}
          />
        ))}
      </div>
    </div>
  );
};

interface BlockCardProps {
  block: ShelfOrganizationBlock;
  index: number;
  groups: ShelfGroup[];
  facets: CollectionFacets | null;
  summary?: { item_count: number; unit_count: number };
  onChange: (block: ShelfOrganizationBlock) => void;
  onDelete: () => void;
}

const BlockCard: React.FC<BlockCardProps> = ({
  block,
  index,
  groups,
  facets,
  summary,
  onChange,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `block-${block.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const rules = block.filter_rules;
  const isCatchAll = rules.match_all === true;
  const setRules = (patch: Partial<ShelfBlockFilterRules>) =>
    onChange({ ...block, filter_rules: { ...rules, ...patch } });

  const summaryText = useMemo(() => {
    if (isCatchAll) return 'Matches every remaining item';
    const parts: string[] = [];
    if (rules.media_type) parts.push(rules.media_type === 'tv_season' ? 'TV Shows' : 'Movies');
    if (rules.formats?.length) parts.push(rules.formats.join(', '));
    if (rules.edition_tags?.length) parts.push(`${rules.edition_tags.length} edition tag${rules.edition_tags.length > 1 ? 's' : ''}`);
    if (rules.series_ids?.length) parts.push(`${rules.series_ids.length} series`);
    if (rules.has_series) parts.push('in any series');
    if (rules.genre_names?.length) parts.push(rules.genre_names.join(', '));
    if (rules.directors?.length) parts.push(`by ${rules.directors.join(', ')}`);
    if (rules.decades?.length) parts.push(rules.decades.map((d) => `${d}s`).join(', '));
    return parts.length > 0 ? parts.join(' · ') : 'No filters set — matches nothing';
  }, [isCatchAll, rules]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-[--radius-card] border border-subtle bg-surface-raised transition-shadow ${
        isDragging ? 'shadow-lg ring-2 ring-ring' : 'shadow-sm'
      } ${block.enabled ? '' : 'opacity-60'}`}
    >
      {/* Card header */}
      <div className="flex items-center gap-2 border-b border-subtle px-3 py-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-0.5 text-content-muted hover:bg-surface-sunken hover:text-content active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Drag to reorder ${block.name}`}
          title="Drag to reorder"
        >
          <GripIcon />
        </button>
        <span
          className="h-3.5 w-3.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: block.color }}
          aria-hidden="true"
        />
        <input
          type="text"
          value={block.name}
          onChange={(e) => onChange({ ...block, name: e.target.value })}
          aria-label={`Block ${index + 1} name`}
          className="min-w-0 flex-1 rounded border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-content focus:border-subtle focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {summary && (
          <span className="flex-shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-content-muted">
            {summary.item_count} {summary.item_count === 1 ? 'item' : 'items'} · {summary.unit_count}u
          </span>
        )}
        <label className="flex flex-shrink-0 items-center gap-1 text-[11px] text-content-muted" title="Enabled">
          <input
            type="checkbox"
            checked={block.enabled}
            onChange={(e) => onChange({ ...block, enabled: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-subtle text-primary-600 focus:ring-ring"
          />
          On
        </label>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete block ${block.name}`}
          title="Delete block"
          className="flex-shrink-0 rounded p-1 text-content-muted hover:bg-surface-sunken hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3 px-3 py-3">
        {/* Color swatches */}
        <div className="flex items-center gap-1.5">
          {BLOCK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ ...block, color: c })}
              aria-label={`Set color ${c}`}
              className={`h-5 w-5 rounded-full transition-transform ${
                block.color === c ? 'scale-110 ring-2 ring-ring ring-offset-1 ring-offset-surface' : 'hover:scale-110'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Match criteria */}
        <div>
          <SegmentedControl
            name={`Match criteria for ${block.name}`}
            value={isCatchAll ? 'all' : 'filtered'}
            onChange={(v) =>
              setRules(v === 'all' ? { match_all: true } : { match_all: false })
            }
            options={[
              { value: 'filtered', label: 'Filtered Items' },
              { value: 'all', label: 'All Remaining Items' },
            ]}
          />
        </div>

        {!isCatchAll && (
          <div className="space-y-2.5 rounded-[--radius-control] border border-subtle bg-surface-sunken/50 p-2.5">
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-content-muted">Media Type</p>
              <SegmentedControl
                name={`Media type for ${block.name}`}
                value={rules.media_type ?? 'any'}
                onChange={(v) => setRules({ media_type: v === 'any' ? undefined : (v as 'movie' | 'tv_season') })}
                options={[
                  { value: 'any', label: 'Any' },
                  { value: 'movie', label: 'Movies' },
                  { value: 'tv_season', label: 'TV Shows' },
                ]}
              />
            </div>
            <FacetChips
              label="Formats"
              options={(facets?.formats ?? []).map((f) => ({ value: f.format, label: f.format }))}
              selected={rules.formats ?? []}
              onToggle={(v) => setRules({ formats: toggleInList(rules.formats, v) })}
            />
            <FacetChips
              label="Edition Tags"
              options={(facets?.editions ?? []).map((e) => ({ value: e.tag, label: e.tag }))}
              selected={rules.edition_tags ?? []}
              onToggle={(v) => setRules({ edition_tags: toggleInList(rules.edition_tags, v) })}
            />
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-wide text-content-muted">Series</p>
                <label className="flex items-center gap-1 text-[11px] text-content-muted">
                  <input
                    type="checkbox"
                    checked={rules.has_series === true}
                    onChange={(e) => setRules({ has_series: e.target.checked ? true : undefined })}
                    className="h-3 w-3 rounded border-subtle text-primary-600 focus:ring-ring"
                  />
                  Belongs to any series
                </label>
              </div>
              <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                {(facets?.series ?? []).map((s) => (
                  <Chip
                    key={s.id}
                    label={s.name}
                    selected={(rules.series_ids ?? []).includes(s.id)}
                    onClick={() => setRules({ series_ids: toggleInList(rules.series_ids, s.id) })}
                  />
                ))}
              </div>
            </div>
            <FacetChips
              label="Genres"
              options={(facets?.genres ?? []).map((g) => ({ value: g.name, label: g.name }))}
              selected={rules.genre_names ?? []}
              onToggle={(v) => setRules({ genre_names: toggleInList(rules.genre_names, v) })}
            />
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-content-muted">
                Directors (comma-separated)
              </p>
              <input
                type="text"
                value={(rules.directors ?? []).join(', ')}
                onChange={(e) =>
                  setRules({
                    directors: e.target.value
                      .split(',')
                      .map((d) => d.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="e.g., Christopher Nolan, Denis Villeneuve"
                aria-label={`Directors for ${block.name}`}
                className="w-full rounded-[--radius-control] border border-subtle bg-surface px-2 py-1 text-xs text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <FacetChips
              label="Decades"
              options={(facets?.decades ?? []).map((d) => ({ value: d.decade, label: `${d.decade}s` }))}
              selected={rules.decades ?? []}
              onToggle={(v) => setRules({ decades: toggleInList(rules.decades, v) })}
            />
          </div>
        )}

        <p className="text-xs italic text-content-muted">{summaryText}</p>

        {/* Sort + target */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-content-muted">Sort Order</p>
            <div className="flex items-center gap-1.5">
              <select
                value={block.sort_by}
                onChange={(e) => onChange({ ...block, sort_by: e.target.value as ShelfBlockSortBy })}
                aria-label={`Sort by for ${block.name}`}
                className="min-w-0 flex-1 rounded-[--radius-control] border border-subtle bg-surface px-2 py-1.5 text-xs text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  onChange({ ...block, sort_direction: block.sort_direction === 'desc' ? 'asc' : 'desc' })
                }
                aria-label={`Sort direction ${block.sort_direction === 'asc' ? 'ascending' : 'descending'}`}
                title={block.sort_direction === 'asc' ? 'Ascending' : 'Descending'}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[--radius-control] border border-subtle bg-surface text-content hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {block.sort_direction === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-content-muted">Target</p>
            <select
              value={block.target_scope === 'group' ? `group-${block.target_group_id}` : 'library'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'library') {
                  onChange({ ...block, target_scope: 'library', target_group_id: null });
                } else {
                  onChange({
                    ...block,
                    target_scope: 'group',
                    target_group_id: Number(v.slice(6)),
                  });
                }
              }}
              aria-label={`Target scope for ${block.name}`}
              className="w-full rounded-[--radius-control] border border-subtle bg-surface px-2 py-1.5 text-xs text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="library">Entire Library (Continuous)</option>
              {groups.map((g) => (
                <option key={g.id} value={`group-${g.id}`}>
                  {g.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-content">
          <input
            type="checkbox"
            checked={block.start_on_fresh_shelf}
            onChange={(e) => onChange({ ...block, start_on_fresh_shelf: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-subtle text-primary-600 focus:ring-ring"
          />
          Start on a fresh shelf
          <span className="text-content-muted">(otherwise continues on the previous block's last shelf)</span>
        </label>
      </div>
    </div>
  );
};

const OrganizeShelvesModal: React.FC<OrganizeShelvesModalProps> = ({
  isOpen,
  groups,
  onClose,
  onApplied,
}) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { facets } = useFacets();

  const [blocks, setBlocks] = useState<ShelfOrganizationBlock[]>([]);
  const [headroomUnits, setHeadroomUnits] = useState(2);
  const [preview, setPreview] = useState<OrganizationPreview | null>(null);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [collapseOverrides, setCollapseOverrides] = useState<Map<number, boolean>>(new Map());
  const previewTimer = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Load saved rules on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoadingRules(true);
    apiService
      .getOrganization()
      .then((org) => {
        if (cancelled) return;
        setBlocks(org.blocks.map((b) => ({ ...b })));
        setHeadroomUnits(org.headroom_units);
      })
      .catch(() => {
        if (!cancelled) {
          toast({ message: 'Could not load organization rules.', type: 'error' });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRules(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, toast]);

  // Debounced live preview
  useEffect(() => {
    if (!isOpen || isLoadingRules) return;
    if (previewTimer.current !== null) {
      window.clearTimeout(previewTimer.current);
    }
    previewTimer.current = window.setTimeout(() => {
      setIsLoadingPreview(true);
      setPreviewError(null);
      apiService
        .previewOrganization(blocks, headroomUnits)
        .then(setPreview)
        .catch(() => setPreviewError('Preview failed — check your rules.'))
        .finally(() => setIsLoadingPreview(false));
    }, 350);
    return () => {
      if (previewTimer.current !== null) {
        window.clearTimeout(previewTimer.current);
      }
    };
  }, [blocks, headroomUnits, isOpen, isLoadingRules]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => `block-${b.id}` === String(active.id));
    const newIndex = blocks.findIndex((b) => `block-${b.id}` === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = [...blocks];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    setBlocks(next);
  };

  const handleSaveOnly = async () => {
    setIsSaving(true);
    try {
      const saved = await apiService.saveOrganization(blocks, headroomUnits);
      setBlocks(saved.blocks.map((b) => ({ ...b })));
      toast({ message: 'Organization rules saved.', type: 'success' });
    } catch {
      toast({ message: 'Failed to save rules.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApply = async () => {
    const confirmed = await confirm({
      title: 'Organize all shelves?',
      message:
        'This rewrites every shelf placement to match your rules. Pinned items stay where they are. Continue?',
      confirmLabel: 'Organize Shelves',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    setIsApplying(true);
    try {
      await apiService.applyOrganization(blocks, headroomUnits);
      toast({ message: 'Shelves organized by your rules.', type: 'success' });
      onApplied();
      onClose();
    } catch {
      toast({ message: 'Failed to organize shelves.', type: 'error' });
    } finally {
      setIsApplying(false);
    }
  };

  const blockSummaries = useMemo(() => {
    const map = new Map<number | string, { item_count: number; unit_count: number }>();
    preview?.blocks.forEach((b) => map.set(b.block_id, { item_count: b.item_count, unit_count: b.unit_count }));
    return map;
  }, [preview]);

  const blockColor = (blockId: number | null | undefined) =>
    blocks.find((b) => b.id === blockId)?.color ?? '#9ca3af';

  const previewByGroup = useMemo(() => {
    if (!preview) return [];
    const grouped = new Map<number, { groupName: string; shelves: OrganizationPreview['shelves'] }>();
    preview.shelves.forEach((s) => {
      if (!grouped.has(s.group_id)) {
        grouped.set(s.group_id, { groupName: s.group_display_name, shelves: [] });
      }
      grouped.get(s.group_id)!.shelves.push(s);
    });
    return Array.from(grouped.entries()).map(([gid, v]) => {
      const totalCapacity = v.shelves.reduce((sum, s) => sum + s.effective_capacity_units, 0);
      const totalUsed = v.shelves.reduce((sum, s) => sum + s.used_units, 0);
      const hasOverflow = v.shelves.some((s) => s.overflow);
      // Compress items into contiguous same-color runs so the collapsed
      // mini-map bar stays cheap to render even for very large collections.
      const runs: { color: string; units: number }[] = [];
      v.shelves.forEach((shelf) => {
        shelf.items.forEach((item) => {
          const color = item.is_pinned ? '#64748b' : blockColor(item.block_id);
          const last = runs[runs.length - 1];
          if (last && last.color === color) {
            last.units += item.thickness_units;
          } else {
            runs.push({ color, units: item.thickness_units });
          }
        });
      });
      return { groupId: gid, ...v, totalCapacity, totalUsed, hasOverflow, runs };
    });
  }, [preview, blocks]);

  // Groups start collapsed when the collection is large enough that scrolling
  // the full shelf list becomes unwieldy; explicit user toggles always win.
  const totalPreviewShelves = preview?.shelves.length ?? 0;
  const isGroupCollapsed = (groupId: number) =>
    collapseOverrides.get(groupId) ?? totalPreviewShelves > COLLAPSE_SHELF_THRESHOLD;
  const toggleGroupCollapsed = (groupId: number) =>
    setCollapseOverrides((prev) => new Map(prev).set(groupId, !isGroupCollapsed(groupId)));
  const setAllGroupsCollapsed = (collapsed: boolean) =>
    setCollapseOverrides(new Map(previewByGroup.map((g) => [g.groupId, collapsed])));

  const footerActions = (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onClose} disabled={isApplying || isSaving}>
        Cancel
      </Button>
      <Button
        variant="secondary"
        onClick={handleSaveOnly}
        isLoading={isSaving}
        disabled={isApplying || isLoadingRules}
      >
        Save Rules Only
      </Button>
      <Button onClick={handleApply} isLoading={isApplying} disabled={isSaving || isLoadingRules}>
        Save &amp; Organize All Shelves
      </Button>
    </div>
  );

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Organize Shelves"
      description="Define ordered rule blocks — first match wins — then watch the live preview of how items flow onto your shelves."
      position="center"
      size="lg"
      className="h-[85dvh] max-w-7xl overflow-hidden"
      bodyClassName="lg:overflow-y-hidden"
      footer={footerActions}
    >
      {isLoadingRules ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* ── Left: rule blocks ── */}
          <div className="min-w-0 space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
            {/* Headroom stepper */}
            <div className="rounded-[--radius-card] border border-subtle bg-surface-raised p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-content">Breathing room per shelf</p>
                  <p className="text-xs text-content-muted">
                    Leave spare case slots so new pickups slot in without reshuffling.
                  </p>
                </div>
                <div className="inline-flex items-center rounded-[--radius-control] border border-subtle bg-surface">
                  <button
                    type="button"
                    aria-label="Decrease headroom"
                    onClick={() => setHeadroomUnits((h) => Math.max(0, h - 1))}
                    disabled={headroomUnits <= 0}
                    className="px-2.5 py-1.5 text-content-muted hover:bg-surface-sunken hover:text-content disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-sm font-semibold text-content" aria-live="polite">
                    {headroomUnits}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase headroom"
                    onClick={() => setHeadroomUnits((h) => Math.min(5, h + 1))}
                    disabled={headroomUnits >= 5}
                    className="px-2.5 py-1.5 text-content-muted hover:bg-surface-sunken hover:text-content disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Quick-start templates (only when no blocks yet) */}
            {blocks.length === 0 && (
              <div className="space-y-2 rounded-[--radius-card] border border-dashed border-subtle p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
                  Start from a template
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => setBlocks(t.make())}
                      className="rounded-[--radius-control] border border-subtle bg-surface p-2.5 text-left transition-colors hover:border-primary-400 hover:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-primary-900/20"
                    >
                      <p className="text-xs font-semibold text-content">{t.label}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-content-muted">{t.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Blocks list */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={blocks.map((b) => `block-${b.id}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {blocks.map((block, idx) => (
                    <BlockCard
                      key={block.id}
                      block={block}
                      index={idx}
                      groups={groups}
                      facets={facets}
                      summary={blockSummaries.get(block.id)}
                      onChange={(next) =>
                        setBlocks((prev) => prev.map((b) => (b.id === next.id ? next : b)))
                      }
                      onDelete={() => setBlocks((prev) => prev.filter((b) => b.id !== block.id))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <Button variant="secondary" size="sm" onClick={() => setBlocks((prev) => [...prev, makeDraftBlock()])}>
              + Add Block
            </Button>
          </div>

          {/* ── Right: live shelf-map preview ── */}
          <aside
            aria-label="Shelf map preview"
            className="min-w-0 rounded-[--radius-card] border border-subtle bg-surface-sunken/40 p-3 lg:min-h-0 lg:overflow-y-auto"
          >
            <div className="space-y-3">
              <div className="z-10 -mx-3 -mt-3 flex items-center justify-between border-b border-subtle bg-surface-raised/95 px-3 py-2 backdrop-blur lg:sticky lg:top-0">
                <h3 className="text-sm font-semibold text-content">Shelf Map Preview</h3>
                <div className="flex items-center gap-2">
                  {previewByGroup.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setAllGroupsCollapsed(false)}
                        className="text-[11px] font-medium text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-primary-400"
                      >
                        Expand all
                      </button>
                      <span className="text-content-muted" aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => setAllGroupsCollapsed(true)}
                        className="text-[11px] font-medium text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-primary-400"
                      >
                        Collapse all
                      </button>
                    </>
                  )}
                  {isLoadingPreview && <Spinner size="sm" />}
                </div>
              </div>

              {previewError && (
                <div className="rounded-[--radius-control] border border-red-300 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  {previewError}
                </div>
              )}

              {/* Alerts */}
              {preview && preview.unmatched_items.length > 0 && (
                <div className="rounded-[--radius-control] border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  {preview.unmatched_items.length} item{preview.unmatched_items.length !== 1 ? 's' : ''} match no
                  block ({preview.unmatched_items.slice(0, 3).map((i) => i.name).join(', ')}
                  {preview.unmatched_items.length > 3 ? '…' : ''}) — add a catch-all block or they'll stay
                  unassigned.
                </div>
              )}
              {preview && preview.unplaceable_items.length > 0 && (
                <div className="rounded-[--radius-control] border border-red-300 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  Not enough shelf space: {preview.unplaceable_items.length} item
                  {preview.unplaceable_items.length !== 1 ? 's' : ''} don't fit. Add shelves or lower headroom.
                </div>
              )}

              <div className="space-y-4">
                {previewByGroup.map(({ groupId, groupName, shelves, totalCapacity, totalUsed, hasOverflow, runs }) => {
                  const collapsed = isGroupCollapsed(groupId);
                  return (
                    <div key={groupId}>
                      <button
                        type="button"
                        aria-expanded={!collapsed}
                        aria-controls={`preview-group-${groupId}`}
                        onClick={() => toggleGroupCollapsed(groupId)}
                        className="z-[5] w-full rounded-[--radius-control] border border-subtle bg-surface-raised px-2.5 py-2 text-left hover:border-primary-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:sticky lg:top-[38px] dark:hover:border-primary-700"
                      >
                        <span className="flex items-center gap-2">
                          <svg
                            className={`h-3.5 w-3.5 flex-shrink-0 text-content-muted transition-transform ${collapsed ? '' : 'rotate-90'}`}
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-content">
                            {groupName}
                          </span>
                          <span className={`flex-shrink-0 text-[11px] ${hasOverflow ? 'font-semibold text-red-600' : 'text-content-muted'}`}>
                            {shelves.length} shelf{shelves.length !== 1 ? 'ves' : ''} · {totalUsed}/{totalCapacity}u
                            {hasOverflow && ' · overflow'}
                          </span>
                        </span>
                        {collapsed && totalCapacity > 0 && (
                          <span
                            className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
                            role="img"
                            aria-label={`${groupName} fill overview`}
                          >
                            {runs.map((run, runIdx) => (
                              <span
                                key={runIdx}
                                className="h-full"
                                style={{
                                  width: `${(run.units / totalCapacity) * 100}%`,
                                  backgroundColor: run.color,
                                }}
                              />
                            ))}
                          </span>
                        )}
                      </button>
                      {!collapsed && (
                        <div id={`preview-group-${groupId}`} className="mt-2 space-y-2">
                          {shelves.map((shelf) => {
                            const firstItem = shelf.items[0];
                            const lastItem = shelf.items[shelf.items.length - 1];
                            return (
                              <div key={shelf.shelf_id} className="rounded-[--radius-control] border border-subtle bg-surface-raised p-2">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <p className="truncate text-xs font-medium text-content">{shelf.shelf_display_name}</p>
                                  <p className={`flex-shrink-0 text-[11px] ${shelf.overflow ? 'font-semibold text-red-600' : 'text-content-muted'}`}>
                                    {shelf.used_units}/{shelf.effective_capacity_units}u
                                    {shelf.used_units < shelf.effective_capacity_units &&
                                      ` · ${shelf.effective_capacity_units - shelf.used_units} spare`}
                                  </p>
                                </div>
                                {/* Segmented fill bar */}
                                <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken" role="img"
                                  aria-label={`${shelf.shelf_display_name} fill preview`}>
                                  {shelf.items.map((item, itemIdx) => (
                                    <div
                                      key={`${item.physical_item_id}-${itemIdx}`}
                                      className="h-full"
                                      style={{
                                        width: `${(item.thickness_units / Math.max(1, shelf.effective_capacity_units)) * 100}%`,
                                        backgroundColor: item.is_pinned ? '#64748b' : blockColor(item.block_id),
                                      }}
                                      title={item.name}
                                    />
                                  ))}
                                </div>
                                {firstItem && (
                                  <p className="mt-1 truncate text-[11px] text-content-muted">
                                    {firstItem.name}
                                    {lastItem && lastItem.physical_item_id !== firstItem.physical_item_id
                                      ? ` — ${lastItem.name}`
                                      : ''}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {preview && preview.shelves.length === 0 && (
                  <p className="text-xs text-content-muted">No shelves yet — add shelves to see the layout.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </Sheet>
  );
};

export default OrganizeShelvesModal;
