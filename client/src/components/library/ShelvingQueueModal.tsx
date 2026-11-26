import React, { useEffect, useMemo, useState } from 'react';
import { PhysicalItem, ShelfDiff, ShelfDiffItem, ShelvingQueuePlan } from '../../types';
import { apiService } from '../../services/api.service';
import { useToast } from '../../context/ToastContext';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

interface ShelvingQueueModalProps {
  isOpen: boolean;
  items: PhysicalItem[];
  onClose: () => void;
  onApplied: () => void;
}

type BoundaryMode = 'share' | 'shift' | undefined;
type WizardStep = 'select' | 'preview';

interface InsertionRun {
  startPos: number; // 0-based
  endPos: number; // 0-based inclusive
  items: ShelfDiffItem[];
  beforeNeighbor: string | null;
  afterNeighbor: string | null;
}

/**
 * Groups adjacent newly-inserted items on a shelf into contiguous runs so
 * batch additions read as clear placement summaries instead of repetitive lines.
 */
function computeInsertionRuns(after: ShelfDiffItem[]): InsertionRun[] {
  const runs: InsertionRun[] = [];
  let idx = 0;
  while (idx < after.length) {
    if (after[idx].change !== 'new') {
      idx++;
      continue;
    }
    const start = idx;
    while (idx < after.length && after[idx].change === 'new') {
      idx++;
    }
    const end = idx - 1;
    runs.push({
      startPos: start,
      endPos: end,
      items: after.slice(start, end + 1),
      beforeNeighbor: start > 0 ? after[start - 1].name : null,
      afterNeighbor: end < after.length - 1 ? after[end + 1].name : null,
    });
  }
  return runs;
}

function formatInsertionRun(run: InsertionRun): string {
  const neighborHint = run.beforeNeighbor
    ? `after "${run.beforeNeighbor}"`
    : run.afterNeighbor
      ? `before "${run.afterNeighbor}"`
      : 'at start of shelf';

  if (run.items.length === 1) {
    return `Insert "${run.items[0].name}" at Pos ${run.startPos + 1} (${neighborHint})`;
  }

  const first = run.items[0].name;
  const last = run.items[run.items.length - 1].name;
  return `Insert ${run.items.length} items ("${first}" → "${last}") at Pos ${run.startPos + 1}–${run.endPos + 1} (${neighborHint})`;
}

const ShelvingQueueModal: React.FC<ShelvingQueueModalProps> = ({
  isOpen,
  items,
  onClose,
  onApplied,
}) => {
  const { toast } = useToast();

  const [wizardStep, setWizardStep] = useState<WizardStep>('select');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [boundaryMode, setBoundaryMode] = useState<BoundaryMode>(undefined);
  const [plan, setPlan] = useState<ShelvingQueuePlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllDiffs, setShowAllDiffs] = useState(false);
  const [focusedShelfId, setFocusedShelfId] = useState<number | null>(null);

  // Reset wizard when opened
  useEffect(() => {
    if (!isOpen) return;
    setWizardStep('select');
    setSelectedIds(new Set(items.map((i) => i.id)));
    setBoundaryMode(undefined);
    setPlan(null);
    setError(null);
    setShowAllDiffs(false);
    setFocusedShelfId(null);
  }, [isOpen, items]);

  const selectedList = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds]
  );

  // Compute plan in the background whenever selection or boundary choice changes
  useEffect(() => {
    if (!isOpen || selectedList.length === 0) {
      setPlan(null);
      return;
    }
    let cancelled = false;
    setIsPlanning(true);
    setError(null);
    apiService
      .planShelvingQueue(selectedList.map((i) => i.id), boundaryMode)
      .then((result) => {
        if (!cancelled) setPlan(result);
      })
      .catch(() => {
        if (!cancelled) setError('Could not compute a shelving plan.');
      })
      .finally(() => {
        if (!cancelled) setIsPlanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedList, boundaryMode]);

  const toggleItem = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await apiService.applyShelvingQueue(
        selectedList.map((i) => i.id),
        boundaryMode
      );
      toast({ message: 'Shelves updated — enjoy the newly organized spines.', type: 'success' });
      onApplied();
      onClose();
    } catch {
      toast({ message: 'Failed to update shelves.', type: 'error' });
    } finally {
      setIsApplying(false);
    }
  };

  const touchedDiffs = useMemo(
    () => plan?.shelf_diffs.filter((d) => d.touched) ?? [],
    [plan]
  );
  const visibleDiffs = showAllDiffs ? (plan?.shelf_diffs ?? []) : touchedDiffs;

  // Group shelves by bookcase for the left-hand Shelf Map (matching OrganizeShelvesModal)
  const diffsByGroup = useMemo(() => {
    const groups: { groupId: number; groupName: string; shelves: ShelfDiff[] }[] = [];
    const byId = new Map<number, { groupId: number; groupName: string; shelves: ShelfDiff[] }>();
    visibleDiffs.forEach((diff) => {
      let entry = byId.get(diff.group_id);
      if (!entry) {
        entry = { groupId: diff.group_id, groupName: diff.group_display_name, shelves: [] };
        byId.set(diff.group_id, entry);
        groups.push(entry);
      }
      entry.shelves.push(diff);
    });
    return groups;
  }, [visibleDiffs]);

  // Outgoing & incoming cross-shelf moves indexed by shelf_id
  const movesOutByShelf = useMemo(() => {
    const map = new Map<number, ShelvingQueuePlan['steps']>();
    (plan?.steps ?? []).forEach((s) => {
      if (s.kind === 'move' && s.from_shelf_id !== undefined) {
        if (!map.has(s.from_shelf_id)) map.set(s.from_shelf_id, []);
        map.get(s.from_shelf_id)!.push(s);
      }
    });
    return map;
  }, [plan]);

  const movesInByShelf = useMemo(() => {
    const map = new Map<number, ShelvingQueuePlan['steps']>();
    (plan?.steps ?? []).forEach((s) => {
      if (s.kind === 'move') {
        if (!map.has(s.to_shelf_id)) map.set(s.to_shelf_id, []);
        map.get(s.to_shelf_id)!.push(s);
      }
    });
    return map;
  }, [plan]);

  const okCount = plan?.assignments.filter((a) => a.status === 'ok').length ?? 0;
  const unmatched = plan?.assignments.filter((a) => a.status === 'unmatched') ?? [];
  const moveSteps = plan?.steps.filter((s) => s.kind === 'move') ?? [];
  const totalSelectedUnits = useMemo(
    () => selectedList.reduce((sum, i) => sum + (i.thickness_units || 1), 0),
    [selectedList]
  );

  const handleSelectShelfInMap = (shelfId: number) => {
    setFocusedShelfId(shelfId);
    const el = document.getElementById(`shelf-diff-detail-${shelfId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Add to Shelves"
      description={
        wizardStep === 'select'
          ? 'Choose which unassigned items to place onto your shelves.'
          : 'Review where new items slot in and how existing shelves adjust before saving.'
      }
      position="center"
      size="lg"
      className={wizardStep === 'preview' ? 'max-w-5xl' : 'max-w-2xl'}
    >
      {/* ── Wizard Step Indicator ── */}
      <nav aria-label="Shelving wizard steps" className="mb-4 flex items-center gap-2 border-b border-subtle pb-3">
        <button
          type="button"
          onClick={() => setWizardStep('select')}
          aria-current={wizardStep === 'select' ? 'step' : undefined}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            wizardStep === 'select'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-surface-sunken text-content-muted hover:text-content'
          }`}
        >
          <span
            className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] ${
              wizardStep === 'select'
                ? 'bg-white/20 text-white'
                : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {wizardStep === 'select' ? '1' : '✓'}
          </span>
          Select Items ({selectedList.length}/{items.length})
        </button>

        <svg
          className="h-4 w-4 flex-shrink-0 text-content-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        <button
          type="button"
          disabled={selectedList.length === 0}
          onClick={() => setWizardStep('preview')}
          aria-current={wizardStep === 'preview' ? 'step' : undefined}
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            wizardStep === 'preview'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-surface-sunken text-content-muted hover:text-content'
          }`}
        >
          <span
            className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] ${
              wizardStep === 'preview' ? 'bg-white/20 text-white' : 'bg-surface text-content-muted'
            }`}
          >
            2
          </span>
          Preview Shelf Changes
        </button>
      </nav>

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 1: Select which items to shelve
          ══════════════════════════════════════════════════════════════════════ */}
      {wizardStep === 'select' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-content">
                Items to shelve ({selectedList.length}/{items.length})
              </h3>
              <p className="text-xs text-content-muted">
                {totalSelectedUnits} {totalSelectedUnits === 1 ? 'case unit' : 'case units'} selected
              </p>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
              onClick={() =>
                setSelectedIds(
                  selectedIds.size === items.length ? new Set() : new Set(items.map((i) => i.id))
                )
              }
            >
              {selectedIds.size === items.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="max-h-80 space-y-1 overflow-y-auto rounded-[--radius-control] border border-subtle bg-surface-sunken/30 p-2">
            {items.map((item) => {
              const checked = selectedIds.has(item.id);
              return (
                <label
                  key={item.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-1.5 transition-colors ${
                    checked ? 'hover:bg-surface-sunken' : 'opacity-60 hover:bg-surface-sunken'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(item.id)}
                    className="h-4 w-4 rounded border-subtle text-primary-600 focus:ring-ring"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-content">{item.name}</span>
                  <span className="flex-shrink-0 text-[11px] text-content-muted">
                    {item.thickness_units || 1}u
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-subtle pt-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => setWizardStep('preview')}
              disabled={selectedList.length === 0}
            >
              Next: Preview Changes →
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          STEP 2: Graphical Shelf Map + Detailed Shelf Changes
          ══════════════════════════════════════════════════════════════════════ */}
      {wizardStep === 'preview' && (
        <div className="space-y-4">
          {isPlanning && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-content-muted">
              <Spinner size="sm" /> Computing shelf layout…
            </div>
          )}

          {error && (
            <div className="rounded-[--radius-control] border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          {plan && !isPlanning && (
            <>
              {/* Boundary conflict choice */}
              {plan.boundary_conflicts.length > 0 && (
                <div className="rounded-[--radius-control] border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  <p className="mb-2 font-medium">
                    Overflow reaches a shelf reserved for &ldquo;{plan.boundary_conflicts[0].to_block_name}&rdquo;.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={boundaryMode === 'share' ? 'primary' : 'secondary'}
                      onClick={() => setBoundaryMode('share')}
                    >
                      Allow sharing boundary shelf
                    </Button>
                    <Button
                      size="sm"
                      variant={boundaryMode === 'shift' ? 'primary' : 'secondary'}
                      onClick={() => setBoundaryMode('shift')}
                    >
                      Shift next block to next shelf
                    </Button>
                  </div>
                </div>
              )}

              {/* Impact Summary Strip + Color Legend */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[--radius-control] border border-subtle bg-surface-sunken/50 px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    +{okCount} {okCount === 1 ? 'item' : 'items'} added
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold ${
                      moveSteps.length > 0
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-surface text-content-muted'
                    }`}
                  >
                    {moveSteps.length > 0
                      ? `↳ ${moveSteps.length} ${moveSteps.length === 1 ? 'item' : 'items'} shifted`
                      : '0 items shifted'}
                  </span>
                  <span className="text-xs text-content-muted">
                    across <span className="font-semibold text-content">{touchedDiffs.length}</span>{' '}
                    {touchedDiffs.length === 1 ? 'shelf' : 'shelves'}
                  </span>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-content-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden="true" />
                    Inserted
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" aria-hidden="true" />
                    Shifted
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-400/60 dark:bg-slate-500/60" aria-hidden="true" />
                    Unchanged
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm border border-subtle bg-surface-sunken" aria-hidden="true" />
                    Spare space
                  </span>
                </div>
              </div>

              {unmatched.length > 0 && (
                <div className="rounded-[--radius-control] border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  {unmatched.length} item{unmatched.length !== 1 ? 's' : ''} match no rule block and were
                  skipped: {unmatched.map((a) => a.physical_item_name).join(', ')}
                </div>
              )}

              {visibleDiffs.length === 0 ? (
                <div className="rounded-[--radius-control] border border-subtle bg-surface-sunken/40 py-10 text-center text-sm text-content-muted">
                  No shelf changes to apply for the current selection.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  {/* ── Left: Simplified Graphical Shelf Map (matches Organize Rules) ── */}
                  <div className="min-w-0 lg:col-span-5">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-content">Shelf Map</h3>
                      {plan.shelf_diffs.length > touchedDiffs.length && (
                        <button
                          type="button"
                          onClick={() => setShowAllDiffs((v) => !v)}
                          className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                        >
                          {showAllDiffs
                            ? `Show touched only (${touchedDiffs.length})`
                            : `Show all shelves (${plan.shelf_diffs.length})`}
                        </button>
                      )}
                    </div>

                    <div className="max-h-[52dvh] space-y-4 overflow-y-auto pr-1">
                      {diffsByGroup.map(({ groupId, groupName, shelves }) => (
                        <div key={groupId}>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-content-muted">
                            {groupName}
                          </p>
                          <div className="space-y-2">
                            {shelves.map((diff) => {
                              const usedUnits =
                                diff.used_units ??
                                diff.after.reduce((s, i) => s + (i.thickness_units || 1), 0);
                              const capUnits = Math.max(diff.capacity_units ?? usedUnits, 1);
                              const barScale = Math.max(capUnits, usedUnits, 1);
                              const overflow =
                                diff.capacity_units !== undefined && usedUnits > diff.capacity_units;
                              const firstItem = diff.after[0];
                              const lastItem = diff.after[diff.after.length - 1];
                              const outgoing = movesOutByShelf.get(diff.shelf_id) ?? [];
                              const isFocused = focusedShelfId === diff.shelf_id;

                              return (
                                <div key={diff.shelf_id}>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectShelfInMap(diff.shelf_id)}
                                    className={`w-full rounded-[--radius-control] border bg-surface-raised p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                      isFocused
                                        ? 'border-primary-500 ring-1 ring-primary-500/40'
                                        : diff.touched
                                          ? 'border-subtle hover:border-primary-400'
                                          : 'border-subtle/60 opacity-75 hover:opacity-100'
                                    }`}
                                  >
                                    <div className="mb-1.5 flex items-center justify-between gap-2">
                                      <p className="truncate text-xs font-medium text-content">
                                        {diff.shelf_display_name}
                                      </p>
                                      <p
                                        className={`flex-shrink-0 text-[11px] ${
                                          overflow ? 'font-semibold text-red-600' : 'text-content-muted'
                                        }`}
                                      >
                                        {diff.capacity_units !== undefined ? (
                                          <>
                                            {usedUnits}/{diff.capacity_units}u
                                            {usedUnits < diff.capacity_units &&
                                              ` · ${diff.capacity_units - usedUnits} spare`}
                                          </>
                                        ) : (
                                          `${usedUnits}u`
                                        )}
                                      </p>
                                    </div>

                                    {/* Segmented graphical shelf bar */}
                                    <div
                                      className="flex h-3.5 w-full overflow-hidden rounded-full bg-surface-sunken"
                                      role="img"
                                      aria-label={`${diff.shelf_display_name} placement diagram`}
                                    >
                                      {diff.after.map((item) => {
                                        const segmentColor =
                                          item.change === 'new'
                                            ? '#10b981'
                                            : item.change === 'shifted'
                                              ? '#f59e0b'
                                              : 'rgba(148, 163, 184, 0.48)';
                                        const statusLabel =
                                          item.change === 'new'
                                            ? '+ Added'
                                            : item.change === 'shifted'
                                              ? '↳ Shifted'
                                              : 'Unchanged';
                                        return (
                                          <div
                                            key={`${item.physical_item_id}-${item.position}`}
                                            className="h-full border-r border-black/10 last:border-r-0 dark:border-white/10"
                                            style={{
                                              width: `${((item.thickness_units || 1) / barScale) * 100}%`,
                                              backgroundColor: segmentColor,
                                            }}
                                            title={`${statusLabel} · Pos ${item.position + 1}: ${item.name}`}
                                          />
                                        );
                                      })}
                                    </div>

                                    {firstItem ? (
                                      <p className="mt-1 truncate text-[11px] text-content-muted">
                                        {firstItem.name}
                                        {lastItem && lastItem.physical_item_id !== firstItem.physical_item_id
                                          ? ` — ${lastItem.name}`
                                          : ''}
                                      </p>
                                    ) : (
                                      <p className="mt-1 text-[11px] italic text-content-muted">Empty shelf</p>
                                    )}
                                  </button>

                                  {/* Graphic cross-shelf overflow indicator */}
                                  {outgoing.length > 0 && (
                                    <div className="ml-3 mt-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                      <span aria-hidden="true">↳</span>
                                      <span className="truncate">
                                        {outgoing.length === 1
                                          ? `"${outgoing[0].physical_item_name}" shifts to ${outgoing[0].to_shelf_name}`
                                          : `${outgoing.length} items shift to ${outgoing[0].to_shelf_name}`}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Right: Detailed Shelf Changes (Placement Summary + Spine Diagram) ── */}
                  <div className="min-w-0 lg:col-span-7">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-content">Shelf Changes</h3>
                      <span className="text-xs text-content-muted">
                        {visibleDiffs.length} {visibleDiffs.length === 1 ? 'shelf' : 'shelves'} shown
                      </span>
                    </div>

                    <div className="max-h-[52dvh] space-y-3 overflow-y-auto pr-1">
                      {visibleDiffs.map((diff) => {
                        const newItems = diff.after.filter((i) => i.change === 'new');
                        const shiftedIn = movesInByShelf.get(diff.shelf_id) ?? [];
                        const shiftedOut = movesOutByShelf.get(diff.shelf_id) ?? [];
                        const insertionRuns = computeInsertionRuns(diff.after);
                        const isFocused = focusedShelfId === diff.shelf_id;

                        return (
                          <div
                            key={diff.shelf_id}
                            id={`shelf-diff-detail-${diff.shelf_id}`}
                            className={`rounded-[--radius-control] border bg-surface-raised p-3 transition-colors ${
                              isFocused
                                ? 'border-primary-500 ring-1 ring-primary-500/40'
                                : 'border-subtle'
                            }`}
                          >
                            {/* Card header */}
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-content">
                                {diff.group_display_name} · {diff.shelf_display_name}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                {newItems.length > 0 && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    +{newItems.length} new
                                  </span>
                                )}
                                {shiftedIn.length > 0 && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                    ↳ {shiftedIn.length} shifted in
                                  </span>
                                )}
                                {shiftedOut.length > 0 && (
                                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-medium text-content-muted">
                                    {shiftedOut.length} shifted out
                                  </span>
                                )}
                                {!diff.touched && (
                                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-content-muted">
                                    Unchanged
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Read-only placement summary (no busy-work checkboxes) */}
                            {(shiftedIn.length > 0 || shiftedOut.length > 0 || insertionRuns.length > 0) && (
                              <ul className="mb-2.5 space-y-1 rounded-[--radius-control] bg-surface-sunken/60 px-2.5 py-2 text-xs">
                                {shiftedOut.map((step) => (
                                  <li
                                    key={`out-${step.physical_item_id}`}
                                    className="flex items-start gap-1.5 text-amber-800 dark:text-amber-300"
                                  >
                                    <span className="font-semibold" aria-hidden="true">↳</span>
                                    <span>
                                      Move <span className="font-medium">&ldquo;{step.physical_item_name}&rdquo;</span> off end of shelf →{' '}
                                      <span className="font-medium">{step.to_shelf_name}</span> (Pos {step.to_position + 1})
                                    </span>
                                  </li>
                                ))}
                                {shiftedIn.map((step) => (
                                  <li
                                    key={`in-${step.physical_item_id}`}
                                    className="flex items-start gap-1.5 text-amber-800 dark:text-amber-300"
                                  >
                                    <span className="font-semibold" aria-hidden="true">↳</span>
                                    <span>
                                      Receive <span className="font-medium">&ldquo;{step.physical_item_name}&rdquo;</span> from{' '}
                                      <span className="font-medium">{step.from_shelf_name}</span> at Pos {step.to_position + 1}
                                      {step.after_item_name ? ` (before "${step.after_item_name}")` : ''}
                                    </span>
                                  </li>
                                ))}
                                {insertionRuns.map((run) => (
                                  <li
                                    key={`ins-${run.startPos}`}
                                    className="flex items-start gap-1.5 text-emerald-800 dark:text-emerald-300"
                                  >
                                    <span className="font-semibold" aria-hidden="true">+</span>
                                    <span>{formatInsertionRun(run)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}

                            {/* Detailed spine diff diagram */}
                            <div className="flex flex-wrap gap-1">
                              {diff.after.map((item) => (
                                <span
                                  key={`${item.physical_item_id}-${item.position}`}
                                  title={`Pos ${item.position + 1}: ${item.name}`}
                                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                    item.change === 'new'
                                      ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-700'
                                      : item.change === 'shifted'
                                        ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-700'
                                        : 'bg-surface-sunken text-content-muted'
                                  }`}
                                >
                                  {item.change === 'new' && '+ '}
                                  {item.change === 'shifted' && '↳ '}
                                  {item.name}
                                </span>
                              ))}
                              {diff.after.length === 0 && (
                                <span className="text-[11px] text-content-muted">Empty</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step 2 Footer */}
          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="secondary"
              onClick={() => setWizardStep('select')}
              disabled={isApplying}
            >
              ← Back to Selection
            </Button>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button variant="secondary" onClick={onClose} disabled={isApplying}>
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                isLoading={isApplying}
                disabled={isPlanning || !plan || selectedList.length === 0 || okCount === 0}
              >
                Confirm &amp; Update Shelves
              </Button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
};

export default ShelvingQueueModal;
