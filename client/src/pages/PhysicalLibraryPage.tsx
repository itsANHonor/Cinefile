import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  rectIntersection,
  CollisionDetection,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { PhysicalLibrary, ShelfGroup, Shelf, PhysicalItem, STANDARD_UNIT_MM } from '../types';
import { apiService } from '../services/api.service';
import { useAuth } from '../context/AuthContext';
import { useServerMode } from '../context/ServerModeContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import ShelfGroupCard from '../components/library/ShelfGroupCard';
import UnassignedItemsPanel from '../components/library/UnassignedItemsPanel';
import OrganizeShelvesModal from '../components/library/OrganizeShelvesModal';
import ShelfAdminPanel from '../components/library/ShelfAdminPanel';
import ShelvingQueueModal from '../components/library/ShelvingQueueModal';
import ShelfPhotoGalleryModal from '../components/library/ShelfPhotoGalleryModal';
import SpineColorPicker from '../components/library/SpineColorPicker';
import MediaDetailModal from '../components/MediaDetailModal';
import MediaForm from '../components/MediaForm';
import { ItemDragOverlay, ShelfDragOverlay, GroupDragOverlay } from '../components/library/DragOverlayItem';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';
import { Sheet } from '../components/ui/Sheet';

type ShelfWidthUnit = 'cases' | 'in' | 'cm';

const MM_PER_INCH = 25.4;
const MM_PER_CM = 10;

function formatDimensionValue(value: number, maxDecimals: number = 2): string {
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  return String(rounded);
}

function resolveShelfWidth(
  rawInput: string,
  unit: ShelfWidthUnit,
  exactWidthMmOverride: number | null
): { valid: boolean; capacityUnits: number; widthMm: number } {
  const trimmed = rawInput.trim();
  if (!trimmed || trimmed === '.') {
    return { valid: false, capacityUnits: 0, widthMm: 0 };
  }

  if (unit === 'cases') {
    const parsed = parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return { valid: false, capacityUnits: 0, widthMm: 0 };
    }
    const widthMm =
      exactWidthMmOverride !== null
        ? exactWidthMmOverride
        : Math.round(parsed * STANDARD_UNIT_MM * 100) / 100;
    return { valid: true, capacityUnits: parsed, widthMm };
  }

  const parsed = parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { valid: false, capacityUnits: 0, widthMm: 0 };
  }

  const computedMm =
    exactWidthMmOverride !== null
      ? exactWidthMmOverride
      : Math.round(parsed * (unit === 'in' ? MM_PER_INCH : MM_PER_CM) * 100) / 100;
  const capacityUnits = Math.max(1, Math.floor((computedMm + 1e-9) / STANDARD_UNIT_MM));
  return { valid: true, capacityUnits, widthMm: computedMm };
}

/** Move an element in an array from one index to another, returning a new array. */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [removed] = result.splice(from, 1);
  result.splice(to, 0, removed);
  return result;
}

/**
 * Custom collision detection for the library:
 * - For item drags (placement or unassigned-item), only consider item-compatible droppables
 *   (placements, shelves, and the unassigned container), preferring pointerWithin so large
 *   containers like the Unassigned Items panel can be reliably targeted.
 * - For shelf or group drags, filter to matching container types and use closestCenter.
 */
const libraryCollisionDetection: CollisionDetection = (args) => {
  const activeType = args.active.data.current?.type as string | undefined;

  if (activeType === 'placement' || activeType === 'unassigned-item') {
    const itemDroppables = args.droppableContainers.filter((container) => {
      const type = container.data.current?.type;
      const id = String(container.id);
      if (type === 'shelf' && id.startsWith('sortable-shelf-')) {
        return false;
      }
      return (
        type === 'placement' ||
        type === 'shelf' ||
        type === 'unassigned-container' ||
        id.startsWith('unassigned-')
      );
    });

    const pointerCollisions = pointerWithin({
      ...args,
      droppableContainers: itemDroppables,
    });
    if (pointerCollisions.length > 0) {
      // Prefer specific placement targets over their parent shelf container when both contain the pointer
      const placementCollision = pointerCollisions.find(
        (c) => String(c.id).startsWith('placement-')
      );
      return placementCollision ? [placementCollision, ...pointerCollisions.filter((c) => c !== placementCollision)] : pointerCollisions;
    }

    const rectCollisions = rectIntersection({
      ...args,
      droppableContainers: itemDroppables,
    });
    if (rectCollisions.length > 0) {
      return rectCollisions;
    }

    return closestCenter({
      ...args,
      droppableContainers: itemDroppables,
    });
  }

  if (activeType === 'shelf') {
    const shelfDroppables = args.droppableContainers.filter(
      (container) => container.data.current?.type === 'shelf' && String(container.id).startsWith('sortable-shelf-')
    );
    return closestCenter({
      ...args,
      droppableContainers: shelfDroppables,
    });
  }

  if (activeType === 'shelf-group') {
    const groupDroppables = args.droppableContainers.filter(
      (container) => container.data.current?.type === 'shelf-group'
    );
    return closestCenter({
      ...args,
      droppableContainers: groupDroppables,
    });
  }

  return closestCenter(args);
};

export interface PhysicalLibraryPageProps {
  embedded?: boolean;
  refreshKey?: number;
  matchingItemIds?: Set<number> | null;
  onDataChange?: () => void;
}

const PhysicalLibraryPage: React.FC<PhysicalLibraryPageProps> = ({
  embedded = false,
  refreshKey,
  matchingItemIds = null,
  onDataChange,
}) => {
  const { isAuthenticated } = useAuth();
  const { isReadOnly } = useServerMode();
  const canEdit = isAuthenticated && !isReadOnly;
  const confirm = useConfirm();
  const { toast } = useToast();

  const [library, setLibrary] = useState<PhysicalLibrary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Panel state
  const [isUnassignedOpen, setIsUnassignedOpen] = useState(false);
  const [unassignedRefreshKey, setUnassignedRefreshKey] = useState(0);
  const [unassignedItems, setUnassignedItems] = useState<PhysicalItem[]>([]);
  const [photoCount, setPhotoCount] = useState(0);

  // Modal state
  const [showOrganize, setShowOrganize] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [photosInitialGroup, setPhotosInitialGroup] = useState<number | null>(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddShelf, setShowAddShelf] = useState<number | null>(null); // group id
  const [editingGroup, setEditingGroup] = useState<ShelfGroup | null>(null);
  const [editingShelf, setEditingShelf] = useState<Shelf | null>(null);

  // Form state for inline modals
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [shelfWidthUnit, setShelfWidthUnit] = useState<ShelfWidthUnit>('cases');
  const [shelfWidthInput, setShelfWidthInput] = useState('10');
  const [exactWidthMm, setExactWidthMm] = useState<number | null>(null);
  const [addShelfMode, setAddShelfMode] = useState<'single' | 'bulk'>('single');
  const [bulkShelfCountInput, setBulkShelfCountInput] = useState('5');
  const [isSubmittingShelves, setIsSubmittingShelves] = useState(false);

  const resolvedShelfWidth = resolveShelfWidth(shelfWidthInput, shelfWidthUnit, exactWidthMm);
  const parsedBulkShelfCount = (() => {
    const trimmed = bulkShelfCountInput.trim();
    if (!trimmed) return null;
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) ? n : null;
  })();

  const resetShelfWidthState = () => {
    setShelfWidthUnit('cases');
    setShelfWidthInput('10');
    setExactWidthMm(null);
  };

  const handleShelfWidthUnitChange = (nextUnit: ShelfWidthUnit) => {
    if (nextUnit === shelfWidthUnit) return;
    const current = resolveShelfWidth(shelfWidthInput, shelfWidthUnit, exactWidthMm);
    setShelfWidthUnit(nextUnit);
    if (!current.valid) {
      setExactWidthMm(null);
      return;
    }
    const isExactCasesMultiple =
      Math.abs(current.widthMm - current.capacityUnits * STANDARD_UNIT_MM) < 0.05;
    setExactWidthMm(nextUnit === 'cases' && isExactCasesMultiple ? null : current.widthMm);
    if (nextUnit === 'cases') {
      setShelfWidthInput(String(current.capacityUnits));
    } else if (nextUnit === 'in') {
      setShelfWidthInput(formatDimensionValue(current.widthMm / MM_PER_INCH, 2));
    } else {
      setShelfWidthInput(formatDimensionValue(current.widthMm / MM_PER_CM, 2));
    }
  };

  const handleShelfWidthInputChange = (rawValue: string) => {
    setExactWidthMm(null);
    if (shelfWidthUnit === 'cases') {
      const digits = rawValue.replace(/[^\d]/g, '');
      if (digits === '') {
        setShelfWidthInput('');
        return;
      }
      setShelfWidthInput(String(parseInt(digits, 10)));
      return;
    }

    let cleaned = rawValue.replace(/[^0-9.]/g, '');
    const dotIndex = cleaned.indexOf('.');
    if (dotIndex !== -1) {
      cleaned = cleaned.slice(0, dotIndex + 1) + cleaned.slice(dotIndex + 1).replace(/\./g, '');
    }
    setShelfWidthInput(cleaned);
  };

  const stepShelfWidth = (delta: 1 | -1) => {
    setExactWidthMm(null);
    if (shelfWidthUnit === 'cases') {
      const current = parseInt(shelfWidthInput, 10);
      const next = Number.isFinite(current) ? Math.max(1, current + delta) : 1;
      setShelfWidthInput(String(next));
      return;
    }

    const minVal = shelfWidthUnit === 'in' ? 0.5 : 1;
    const current = parseFloat(shelfWidthInput);
    const next = Number.isFinite(current)
      ? Math.max(minVal, Math.round((current + delta) * 100) / 100)
      : 1;
    setShelfWidthInput(formatDimensionValue(next, 2));
  };

  // Library name editing
  const [isEditingLibraryName, setIsEditingLibraryName] = useState(false);
  const [libraryDisplayName, setLibraryDisplayName] = useState('');

  // Spine color editing
  const [editingSpineColorItemId, setEditingSpineColorItemId] = useState<number | null>(null);

  // Active drag tracking for DragOverlay
  const [activeDragData, setActiveDragData] = useState<{
    type: string;
    item?: PhysicalItem;
    shelf?: Shelf;
    group?: ShelfGroup;
  } | null>(null);

  // Detail modal state
  const [selectedDetailItem, setSelectedDetailItem] = useState<PhysicalItem | null>(null);
  const [editingPhysicalItem, setEditingPhysicalItem] = useState<PhysicalItem | null>(null);

  const handleItemClick = async (id: number) => {
    try {
      const item = await apiService.getPhysicalItemById(id);
      setSelectedDetailItem(item);
    } catch (err) {
      console.error('Failed to load item details:', err);
      toast({ message: 'Could not open item details. Please try again.', type: 'error' });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiService.getLibrary();
      setLibrary(data);
      setLibraryDisplayName(data.display_name);
      setError(null);
    } catch (err) {
      const message = 'Failed to load physical library';
      console.error('Failed to load library:', err);
      setError(message);
      toast({ message, type: 'error', persistent: true });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadLibrary();
    if (refreshKey !== undefined && refreshKey > 0) {
      setUnassignedRefreshKey((k) => k + 1);
    }
  }, [loadLibrary, refreshKey]);

  // Fetch unassigned items for the "To Shelve" banner
  useEffect(() => {
    if (!canEdit) {
      setUnassignedItems([]);
      return;
    }
    let cancelled = false;
    apiService
      .getUnassignedItems()
      .then((items) => {
        if (!cancelled) setUnassignedItems(items);
      })
      .catch(() => {
        if (!cancelled) setUnassignedItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canEdit, unassignedRefreshKey, library]);

  // Fetch photo count for the gallery button (works in public read-only too)
  useEffect(() => {
    if (!canEdit && !isReadOnly) {
      setPhotoCount(0);
      return;
    }
    let cancelled = false;
    apiService
      .getShelfPhotos()
      .then((photos) => {
        if (!cancelled) setPhotoCount(photos.length);
      })
      .catch(() => {
        if (!cancelled) setPhotoCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [canEdit, isReadOnly, library, showPhotos]);

  // =============================================
  // Drag handlers
  // =============================================
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const data = active.data.current;

    if (data?.type === 'unassigned-item') {
      setActiveDragData({ type: 'unassigned-item', item: data.item });
    } else if (data?.type === 'placement') {
      setActiveDragData({ type: 'placement', item: data.placement?.physical_item });
    } else if (data?.type === 'shelf') {
      setActiveDragData({ type: 'shelf', shelf: data.shelf });
    } else if (data?.type === 'shelf-group') {
      setActiveDragData({ type: 'shelf-group', group: data.group });
    }
  };

  const handleDragCancel = () => {
    setActiveDragData(null);
  };

  // Helper to find a shelf across all groups
  const findShelf = useCallback((shelfId: number): Shelf | null => {
    if (!library) return null;
    for (const group of library.groups) {
      for (const shelf of group.shelves) {
        if (shelf.id === shelfId) return shelf;
      }
    }
    return null;
  }, [library]);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragData(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (!activeData || !overData) return;
    const activeType = activeData.type as string;
    const overType = overData.type as string;

    // ─── Item-level drags (placement or unassigned-item) ───
    if (activeType === 'placement' || activeType === 'unassigned-item') {
      const sourceShelfId: number | null = activeType === 'placement'
        ? activeData.placement.shelf_id
        : null;

      // Determine destination
      let destShelfId: number | null = null;
      let destPosition: number | undefined;

      if (overType === 'shelf') {
        destShelfId = overData.shelfId;
      } else if (overType === 'placement') {
        destShelfId = overData.placement.shelf_id;
        destPosition = overData.placement.position;
      } else if (overType === 'unassigned-container' || String(over.id).startsWith('unassigned-')) {
        destShelfId = null; // dropping into unassigned
      }

      // Skip if no meaningful move
      if (sourceShelfId === destShelfId && destShelfId === null) return;

      try {
        // Same shelf → reorder
        if (sourceShelfId !== null && sourceShelfId === destShelfId && activeType === 'placement' && overType === 'placement') {
          const shelf = findShelf(sourceShelfId);
          if (shelf) {
            const activeId = String(active.id);
            const overId = String(over.id);
            const oldIndex = shelf.placements.findIndex(p => `placement-${p.id}` === activeId);
            const newIndex = shelf.placements.findIndex(p => `placement-${p.id}` === overId);
            if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
              const reordered = arrayMove(shelf.placements, oldIndex, newIndex);
              await apiService.reorderShelfItems(sourceShelfId, reordered.map((p, i) => ({
                physical_item_id: p.physical_item_id,
                position: i,
              })));
              await loadLibrary();
            }
          }
        }
        // Unassigned → shelf
        else if (sourceShelfId === null && destShelfId !== null) {
          const physicalItemId = activeData.physicalItemId || activeData.item?.id;
          if (physicalItemId) {
            await apiService.placeItemOnShelf(destShelfId, physicalItemId, destPosition);
            await loadLibrary();
            setUnassignedRefreshKey((k) => k + 1);
          }
        }
        // Shelf → different shelf
        else if (sourceShelfId !== null && destShelfId !== null && sourceShelfId !== destShelfId) {
          const placement = activeData.placement;
          await apiService.removePlacement(placement.id);
          await apiService.placeItemOnShelf(destShelfId, placement.physical_item_id, destPosition);
          await loadLibrary();
        }
        // Shelf → unassigned
        else if (sourceShelfId !== null && destShelfId === null) {
          const placement = activeData.placement;
          await apiService.removePlacement(placement.id);
          await loadLibrary();
          setUnassignedRefreshKey((k) => k + 1);
        }
      } catch (err) {
        console.error('Failed to move item:', err);
        await loadLibrary(); // Reload to ensure consistent state
      }
    }

    // ─── Shelf-level drags (reorder shelves) ───
    else if (activeType === 'shelf') {
      const activeShelf = activeData.shelf as Shelf;
      const activeShelfId = activeShelf.id;

      // Find source group
      const sourceGroup = library?.groups.find(g =>
        g.shelves.some(s => s.id === activeShelfId)
      );
      if (!sourceGroup || !library) return;

      // Determine target group and position
      let targetGroupId = sourceGroup.id;
      let targetIndex = -1;

      if (overType === 'shelf') {
        // Dropped on another shelf sortable
        const overShelf = overData.shelf as Shelf;
        const overGroup = library.groups.find(g =>
          g.shelves.some(s => s.id === overShelf.id)
        );
        if (overGroup) {
          targetGroupId = overGroup.id;
          targetIndex = overGroup.shelves.findIndex(s => s.id === overShelf.id);
        }
      }

      if (targetIndex === -1) return;

      try {
        if (sourceGroup.id === targetGroupId) {
          // Reorder within same group
          const shelves = [...sourceGroup.shelves];
          const oldIndex = shelves.findIndex(s => s.id === activeShelfId);
          const newIndex = targetIndex;
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const reordered = arrayMove(shelves, oldIndex, newIndex);
            await apiService.reorderShelves(reordered.map((s, i) => ({
              id: s.id,
              sort_order: i,
            })));
            await loadLibrary();
          }
        } else {
          // Move shelf to a different group
          const targetGroup = library.groups.find(g => g.id === targetGroupId);
          if (targetGroup) {
            // Build the new order with the moved shelf inserted at targetIndex
            const newOrder = targetGroup.shelves
              .filter(s => s.id !== activeShelfId) // remove if already there (shouldn't be)
              .map((s, i) => ({ id: s.id, sort_order: i, group_id: targetGroupId }));
            newOrder.splice(targetIndex, 0, { id: activeShelfId, sort_order: targetIndex, group_id: targetGroupId });
            // Re-index
            const finalOrder = newOrder.map((o, i) => ({ ...o, sort_order: i }));
            await apiService.reorderShelves(finalOrder);
            await loadLibrary();
          }
        }
      } catch (err) {
        console.error('Failed to reorder shelves:', err);
        await loadLibrary();
      }
    }

    // ─── Group-level drags (reorder groups) ───
    else if (activeType === 'shelf-group') {
      const activeGroup = activeData.group as ShelfGroup;
      if (!library) return;

      const oldIndex = library.groups.findIndex(g => g.id === activeGroup.id);
      let newIndex = -1;

      if (overType === 'shelf-group') {
        const overGroup = overData.group as ShelfGroup;
        newIndex = library.groups.findIndex(g => g.id === overGroup.id);
      }

      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      try {
        const reordered = arrayMove(library.groups, oldIndex, newIndex);
        await apiService.reorderShelfGroups(reordered.map((g, i) => ({
          id: g.id,
          sort_order: i,
        })));
        await loadLibrary();
      } catch (err) {
        console.error('Failed to reorder groups:', err);
        await loadLibrary();
      }
    }
  };

  // =============================================
  // CRUD handlers
  // =============================================
  const handleAddGroup = async () => {
    if (!formName.trim() || !formDisplayName.trim()) return;
    try {
      await apiService.createShelfGroup({
        name: formName.trim().toLowerCase().replace(/\s+/g, '_'),
        display_name: formDisplayName.trim(),
      });
      await loadLibrary();
      toast({ message: 'Group created.', type: 'success' });
      closeAddGroup();
      setFormName('');
      setFormDisplayName('');
    } catch (err) {
      toast({ message: 'Failed to create group.', type: 'error' });
      console.error('Failed to create group:', err);
    }
  };

  const handleEditGroup = async () => {
    if (!editingGroup || !formDisplayName.trim()) return;
    try {
      await apiService.updateShelfGroup(editingGroup.id, {
        display_name: formDisplayName.trim(),
        name: formName.trim().toLowerCase().replace(/\s+/g, '_'),
      });
      await loadLibrary();
      toast({ message: 'Group updated.', type: 'success' });
      setEditingGroup(null);
      setFormName('');
      setFormDisplayName('');
    } catch (err) {
      toast({ message: 'Failed to update group.', type: 'error' });
      console.error('Failed to update group:', err);
    }
  };

  const handleDeleteGroup = async (group: ShelfGroup) => {
    const confirmed = await confirm({
      title: 'Delete group?',
      message: `Delete "${group.display_name}"? All shelves and item placements in this group will be removed; items will become unassigned.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await apiService.deleteShelfGroup(group.id);
      await loadLibrary();
      setUnassignedRefreshKey((k) => k + 1);
    } catch (err) {
      toast({ message: 'Failed to delete group.', type: 'error' });
      console.error('Failed to delete group:', err);
    }
  };

  const handleAddShelf = async () => {
    if (
      showAddShelf === null ||
      !formName.trim() ||
      !formDisplayName.trim() ||
      !resolvedShelfWidth.valid
    ) {
      return;
    }
    setIsSubmittingShelves(true);
    try {
      const hasCustomWidth = shelfWidthUnit !== 'cases' || exactWidthMm !== null;
      await apiService.createShelf(showAddShelf, {
        name: formName.trim().toLowerCase().replace(/\s+/g, '_'),
        display_name: formDisplayName.trim(),
        capacity_units: resolvedShelfWidth.capacityUnits,
        width_source: hasCustomWidth ? 'manual' : 'cases',
        ...(hasCustomWidth ? { width_mm: resolvedShelfWidth.widthMm } : {}),
      });
      await loadLibrary();
      toast({ message: 'Shelf created.', type: 'success' });
      setShowAddShelf(null);
      setFormName('');
      setFormDisplayName('');
      resetShelfWidthState();
    } catch (err) {
      toast({ message: 'Failed to create shelf.', type: 'error' });
      console.error('Failed to create shelf:', err);
    } finally {
      setIsSubmittingShelves(false);
    }
  };

  const handleBulkAddShelves = async () => {
    if (
      showAddShelf === null ||
      parsedBulkShelfCount === null ||
      parsedBulkShelfCount < 1 ||
      parsedBulkShelfCount > 50 ||
      !resolvedShelfWidth.valid
    ) {
      return;
    }
    setIsSubmittingShelves(true);
    try {
      const count = Math.min(50, Math.max(1, parsedBulkShelfCount));
      const hasCustomWidth = shelfWidthUnit !== 'cases' || exactWidthMm !== null;
      await apiService.bulkCreateShelves(showAddShelf, {
        count,
        capacity_units: resolvedShelfWidth.capacityUnits,
        width_source: hasCustomWidth ? 'manual' : 'cases',
        ...(hasCustomWidth ? { width_mm: resolvedShelfWidth.widthMm } : {}),
      });
      await loadLibrary();
      toast({
        message: `Created ${count} ${count === 1 ? 'shelf' : 'shelves'}.`,
        type: 'success',
      });
      setShowAddShelf(null);
      setFormName('');
      setFormDisplayName('');
      resetShelfWidthState();
      setBulkShelfCountInput('5');
    } catch (err) {
      toast({ message: 'Failed to create shelves.', type: 'error' });
      console.error('Failed to bulk create shelves:', err);
    } finally {
      setIsSubmittingShelves(false);
    }
  };

  const handleEditShelf = async () => {
    if (!editingShelf || !formDisplayName.trim() || !resolvedShelfWidth.valid) return;
    try {
      const hasCustomWidth = shelfWidthUnit !== 'cases' || exactWidthMm !== null;
      await apiService.updateShelf(editingShelf.id, {
        display_name: formDisplayName.trim(),
        name: formName.trim().toLowerCase().replace(/\s+/g, '_'),
        capacity_units: resolvedShelfWidth.capacityUnits,
        width_source: hasCustomWidth ? 'manual' : 'cases',
        width_mm: hasCustomWidth
          ? resolvedShelfWidth.widthMm
          : resolvedShelfWidth.capacityUnits * STANDARD_UNIT_MM,
      });
      await loadLibrary();
      toast({ message: 'Shelf updated.', type: 'success' });
      setEditingShelf(null);
      setFormName('');
      setFormDisplayName('');
      resetShelfWidthState();
    } catch (err) {
      toast({ message: 'Failed to update shelf.', type: 'error' });
      console.error('Failed to update shelf:', err);
    }
  };

  const handleDeleteShelf = async (shelf: Shelf) => {
    const confirmed = await confirm({
      title: 'Delete shelf?',
      message: `Delete "${shelf.display_name}"? Items on this shelf will become unassigned.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await apiService.deleteShelf(shelf.id);
      await loadLibrary();
      setUnassignedRefreshKey((k) => k + 1);
    } catch (err) {
      toast({ message: 'Failed to delete shelf.', type: 'error' });
      console.error('Failed to delete shelf:', err);
    }
  };

  const handleRemovePlacement = async (placementId: number) => {
    try {
      await apiService.removePlacement(placementId);
      await loadLibrary();
      setUnassignedRefreshKey((k) => k + 1);
    } catch (err) {
      toast({ message: 'Failed to remove item from shelf.', type: 'error' });
      console.error('Failed to remove placement:', err);
    }
  };

  const handleUpdateLibraryName = async () => {
    if (!libraryDisplayName.trim()) return;
    try {
      await apiService.updateLibrary({ display_name: libraryDisplayName.trim() });
      await loadLibrary();
      toast({ message: 'Library name updated.', type: 'success' });
      setIsEditingLibraryName(false);
    } catch (err) {
      toast({ message: 'Failed to update library name.', type: 'error' });
      console.error('Failed to update library name:', err);
    }
  };

  const handleOrganizeApplied = async () => {
    await loadLibrary();
    setUnassignedRefreshKey((k) => k + 1);
    onDataChange?.();
  };

  const handleQueueApplied = async () => {
    await loadLibrary();
    setUnassignedRefreshKey((k) => k + 1);
    onDataChange?.();
  };

  const handleTogglePin = async (placementId: number, isPinned: boolean) => {
    try {
      await apiService.setPlacementPinned(placementId, isPinned);
      setLibrary((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map((group) => ({
            ...group,
            shelves: group.shelves.map((shelf) => ({
              ...shelf,
              placements: shelf.placements.map((p) =>
                p.id === placementId ? { ...p, is_pinned: isPinned } : p
              ),
            })),
          })),
        };
      });
    } catch {
      toast({ message: 'Failed to update pin.', type: 'error' });
    }
  };

  const handleOpenGroupPhotos = (groupId: number | null) => {
    setPhotosInitialGroup(groupId);
    setShowPhotos(true);
  };

  const handleJumpToGroup = useCallback((groupId: number) => {
    const element = document.getElementById(`shelf-group-${groupId}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Open edit forms with pre-filled data
  const openEditGroup = (group: ShelfGroup) => {
    setFormName(group.name);
    setFormDisplayName(group.display_name);
    setEditingGroup(group);
  };

  const openEditShelf = (shelf: Shelf) => {
    setFormName(shelf.name);
    setFormDisplayName(shelf.display_name);
    setShelfWidthUnit('cases');
    setShelfWidthInput(String(shelf.capacity_units));
    const defaultMm = shelf.capacity_units * STANDARD_UNIT_MM;
    setExactWidthMm(
      shelf.width_mm !== undefined && Math.abs(shelf.width_mm - defaultMm) > 0.05
        ? shelf.width_mm
        : null
    );
    setEditingShelf(shelf);
  };

  const openAddShelf = (groupId: number) => {
    setFormName('');
    setFormDisplayName('');
    resetShelfWidthState();
    setAddShelfMode('single');
    setBulkShelfCountInput('5');
    setShowAddShelf(groupId);
  };

  const openAddGroup = () => {
    setFormName('');
    setFormDisplayName('');
    setShowAddGroup(true);
  };

  const isAddGroupOpen = showAddGroup;
  const closeAddGroup = () => {
    setShowAddGroup(false);
  };

  // =============================================
  // Render
  // =============================================
  const containerClass = embedded ? '' : 'w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8';

  if (isLoading && !library) {
    const Wrapper = embedded ? 'div' : 'main';
    return (
      <Wrapper className={containerClass}>
        <Skeleton className="mb-4 h-8 w-64 rounded-[--radius-control]" />
        <Skeleton className="mb-6 h-4 w-40 rounded-[--radius-control]" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-[--radius-card]" />
          ))}
        </div>
      </Wrapper>
    );
  }

  if (!library) {
    const Wrapper = embedded ? 'div' : 'main';
    return (
      <Wrapper className={containerClass}>
        <EmptyState
          title="Couldn’t load physical library"
          description={error || 'Library not found'}
          action={<Button onClick={() => loadLibrary()} variant="secondary">Try again</Button>}
        />
      </Wrapper>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={libraryCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={containerClass}>
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              {isEditingLibraryName && canEdit ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={libraryDisplayName}
                    onChange={(e) => setLibraryDisplayName(e.target.value)}
                    className="text-2xl font-bold bg-transparent border-b-2 border-primary-500 outline-none text-gray-900 dark:text-gray-100"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdateLibraryName();
                      if (e.key === 'Escape') setIsEditingLibraryName(false);
                    }}
                    autoFocus
                  />
                  <button
                    onClick={handleUpdateLibraryName}
                    className="text-primary-600 hover:text-primary-700 text-sm"
                  >
                    Save
                  </button>
                </div>
              ) : embedded ? (
                <h2
                  className={`text-lg font-semibold text-gray-900 dark:text-gray-100 ${
                    canEdit ? 'cursor-pointer hover:text-primary-600 dark:hover:text-primary-400' : ''
                  }`}
                  onClick={() => canEdit && setIsEditingLibraryName(true)}
                  title={canEdit ? 'Click to rename' : undefined}
                >
                  {library.display_name}
                </h2>
              ) : (
                <h1
                  className={`text-2xl font-bold text-gray-900 dark:text-gray-100 ${
                    canEdit ? 'cursor-pointer hover:text-primary-600 dark:hover:text-primary-400' : ''
                  }`}
                  onClick={() => canEdit && setIsEditingLibraryName(true)}
                  title={canEdit ? 'Click to rename' : undefined}
                >
                  {library.display_name}
                </h1>
              )}

              {/* Stats summary */}
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span>{library.groups.length} groups</span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span>
                  {library.groups.reduce((sum, g) => sum + g.shelves.length, 0)} shelves
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Single consolidated admin panel: queue callout + all shelf tools */}
        <ShelfAdminPanel
          canEdit={canEdit}
          unassignedItems={unassignedItems}
          photoCount={photoCount}
          onPlanQueue={() => setShowQueue(true)}
          onOrganize={() => setShowOrganize(true)}
          onOpenPhotos={() => handleOpenGroupPhotos(null)}
          onAddGroup={openAddGroup}
        />

        {/* Groups */}
        {library.groups.length === 0 ? (
          <EmptyState
            title="No shelf groups yet"
            description="Create a group to start organizing your physical media. Groups represent rooms or areas."
            action={canEdit ? <Button onClick={openAddGroup}>Create your first group</Button> : undefined}
            icon={
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
          />
        ) : (
          <SortableContext
            items={library.groups.map(g => `group-${g.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {library.groups.map((group) => (
                <div key={group.id} id={`shelf-group-${group.id}`}>
                  <ShelfGroupCard
                    group={group}
                    isEditMode={canEdit}
                    matchingItemIds={matchingItemIds}
                    onEditGroup={openEditGroup}
                    onDeleteGroup={handleDeleteGroup}
                    onAddShelf={openAddShelf}
                    onEditShelf={openEditShelf}
                    onDeleteShelf={handleDeleteShelf}
                    onRemovePlacement={handleRemovePlacement}
                    onItemClick={handleItemClick}
                    onSpineColorEdit={(itemId) => setEditingSpineColorItemId(itemId)}
                    onTogglePin={handleTogglePin}
                    onOpenPhotos={() => handleOpenGroupPhotos(group.id)}
                  />
                </div>
              ))}
            </div>
          </SortableContext>
        )}

        {/* Unassigned Items - Inline collapsible section */}
        {canEdit && (
          <UnassignedItemsPanel
            isOpen={isUnassignedOpen}
            onToggle={() => setIsUnassignedOpen(!isUnassignedOpen)}
            refreshKey={unassignedRefreshKey}
            matchingItemIds={matchingItemIds}
            onItemClick={handleItemClick}
          />
        )}
      </div>

      {/* Spine Color Picker Modal */}
      {editingSpineColorItemId !== null && (
        <SpineColorPicker
          physicalItemId={editingSpineColorItemId}
          onClose={() => setEditingSpineColorItemId(null)}
          onSave={async () => {
            await loadLibrary();
            setEditingSpineColorItemId(null);
          }}
        />
      )}

      {/* Organize Rules Studio */}
      {library && (
        <OrganizeShelvesModal
          isOpen={showOrganize}
          groups={library.groups}
          onClose={() => setShowOrganize(false)}
          onApplied={handleOrganizeApplied}
        />
      )}

      {/* Shelving Queue Assistant */}
      <ShelvingQueueModal
        isOpen={showQueue}
        items={unassignedItems}
        onClose={() => setShowQueue(false)}
        onApplied={handleQueueApplied}
      />

      {/* Shelf Photo Gallery */}
      <ShelfPhotoGalleryModal
        isOpen={showPhotos}
        library={library}
        readOnly={!canEdit}
        initialGroupId={photosInitialGroup}
        onClose={() => setShowPhotos(false)}
        onJumpToGroup={handleJumpToGroup}
      />

      {/* =============================================
          Inline Modals for Add/Edit Group and Shelf
          ============================================= */}

      {/* Add Group Modal */}
      <Sheet
        isOpen={isAddGroupOpen}
        onClose={closeAddGroup}
        title="Add Shelf Group"
        position="center"
        size="md"
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-content-muted">Display Name</label>
          <input
            type="text"
            value={formDisplayName}
            onChange={(e) => {
              setFormDisplayName(e.target.value);
              setFormName(e.target.value.toLowerCase().replace(/\s+/g, '_'));
            }}
            placeholder="e.g., Living Room"
            className="w-full rounded-[--radius-control] border border-subtle bg-surface px-3 py-2 text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
          />
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={closeAddGroup}>Cancel</Button>
          <Button onClick={handleAddGroup} disabled={!formDisplayName.trim()}>Create</Button>
        </div>
      </Sheet>

      {/* Edit Group Modal */}
      <Sheet
        isOpen={!!editingGroup}
        onClose={() => setEditingGroup(null)}
        title="Edit Shelf Group"
        position="center"
        size="md"
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-content-muted">Display Name</label>
          <input
            type="text"
            value={formDisplayName}
            onChange={(e) => {
              setFormDisplayName(e.target.value);
              setFormName(e.target.value.toLowerCase().replace(/\s+/g, '_'));
            }}
            className="w-full rounded-[--radius-control] border border-subtle bg-surface px-3 py-2 text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleEditGroup()}
          />
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setEditingGroup(null)}>Cancel</Button>
          <Button onClick={handleEditGroup} disabled={!formDisplayName.trim()}>Save</Button>
        </div>
      </Sheet>

      {/* Add Shelf Modal */}
      {(() => {
        const renderShelfWidthField = (
          inputId: string,
          options: { isBulk?: boolean; onEnter?: () => void } = {}
        ) => {
          const eachSuffix = options.isBulk ? ' each' : '';
          let summaryBadge = `${STANDARD_UNIT_MM}mm (${(STANDARD_UNIT_MM / MM_PER_INCH).toFixed(2)}\u2033) per case`;
          if (resolvedShelfWidth.valid) {
            if (shelfWidthUnit === 'cases') {
              summaryBadge = `${resolvedShelfWidth.widthMm.toFixed(1)}mm (${(
                resolvedShelfWidth.widthMm / MM_PER_INCH
              ).toFixed(1)}\u2033 \u00b7 ${(resolvedShelfWidth.widthMm / MM_PER_CM).toFixed(1)}cm)${eachSuffix}`;
            } else if (shelfWidthUnit === 'in') {
              summaryBadge = `Fits ${resolvedShelfWidth.capacityUnits} ${
                resolvedShelfWidth.capacityUnits === 1 ? 'case' : 'cases'
              } (${(resolvedShelfWidth.widthMm / MM_PER_CM).toFixed(1)}cm \u00b7 ${resolvedShelfWidth.widthMm.toFixed(
                0
              )}mm)${eachSuffix}`;
            } else {
              summaryBadge = `Fits ${resolvedShelfWidth.capacityUnits} ${
                resolvedShelfWidth.capacityUnits === 1 ? 'case' : 'cases'
              } (${(resolvedShelfWidth.widthMm / MM_PER_INCH).toFixed(1)}\u2033 \u00b7 ${resolvedShelfWidth.widthMm.toFixed(
                0
              )}mm)${eachSuffix}`;
            }
          }

          const minStepperVal = shelfWidthUnit === 'in' ? 0.5 : 1;
          const numericCurrent = parseFloat(shelfWidthInput);
          const isAtMin =
            Number.isFinite(numericCurrent) && numericCurrent <= minStepperVal;

          return (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor={inputId} className="block text-sm font-medium text-content">
                  Shelf Width
                </label>
                <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                  {summaryBadge}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center rounded-[--radius-control] border border-subtle bg-surface focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-surface">
                  <button
                    type="button"
                    aria-label="Decrease shelf width"
                    onClick={() => stepShelfWidth(-1)}
                    disabled={isAtMin}
                    className="px-3 py-2 text-content-muted hover:bg-surface-sunken hover:text-content disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-l-[--radius-control]"
                  >
                    &minus;
                  </button>
                  <input
                    id={inputId}
                    type="text"
                    inputMode={shelfWidthUnit === 'cases' ? 'numeric' : 'decimal'}
                    placeholder={
                      shelfWidthUnit === 'cases'
                        ? '20'
                        : shelfWidthUnit === 'in'
                          ? '30'
                          : '76'
                    }
                    value={shelfWidthInput}
                    onChange={(e) => handleShelfWidthInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        stepShelfWidth(1);
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        stepShelfWidth(-1);
                      } else if (e.key === 'Enter' && options.onEnter) {
                        e.preventDefault();
                        options.onEnter();
                      }
                    }}
                    className="w-20 bg-transparent py-2 text-center font-semibold text-content focus:outline-none focus-visible:[box-shadow:none]"
                  />
                  <button
                    type="button"
                    aria-label="Increase shelf width"
                    onClick={() => stepShelfWidth(1)}
                    className="px-3 py-2 text-content-muted hover:bg-surface-sunken hover:text-content transition-colors rounded-r-[--radius-control]"
                  >
                    +
                  </button>
                </div>

                <SegmentedControl
                  name="Shelf width unit"
                  value={shelfWidthUnit}
                  onChange={(val) => handleShelfWidthUnitChange(val as ShelfWidthUnit)}
                  options={[
                    { value: 'cases', label: 'Cases' },
                    { value: 'in', label: 'Inches' },
                    { value: 'cm', label: 'cm' },
                  ]}
                />
              </div>
              <p className="mt-1.5 text-xs text-content-muted">
                {shelfWidthUnit === 'cases'
                  ? `Standard Blu-ray cases (${STANDARD_UNIT_MM}mm / ${(STANDARD_UNIT_MM / MM_PER_INCH).toFixed(2)}\u2033 each), or switch to Inches / cm for a manual measurement.`
                  : shelfWidthUnit === 'in'
                    ? `Manual shelf width in inches. Case capacity is calculated at ${STANDARD_UNIT_MM}mm per standard Blu-ray case.`
                    : `Manual shelf width in centimeters. Case capacity is calculated at ${STANDARD_UNIT_MM}mm per standard Blu-ray case.`}
              </p>
            </div>
          );
        };

        const activeAddGroup = showAddShelf !== null
          ? library.groups.find((g) => g.id === showAddShelf) ?? null
          : null;
        const isBulkCountValid =
          parsedBulkShelfCount !== null &&
          parsedBulkShelfCount >= 1 &&
          parsedBulkShelfCount <= 50;
        const previewCount = isBulkCountValid ? parsedBulkShelfCount : 0;
        const existingNames = new Set(
          (activeAddGroup?.shelves ?? []).map((s) => s.display_name.toLowerCase())
        );
        const previewNames: string[] = [];
        if (activeAddGroup && previewCount > 0) {
          let nextNum = activeAddGroup.shelves.length + 1;
          for (let i = 0; i < previewCount; i++) {
            let candidate = `${activeAddGroup.display_name} - Shelf ${nextNum}`;
            while (existingNames.has(candidate.toLowerCase())) {
              nextNum++;
              candidate = `${activeAddGroup.display_name} - Shelf ${nextNum}`;
            }
            existingNames.add(candidate.toLowerCase());
            previewNames.push(candidate);
            nextNum++;
          }
        }
        const firstPreviewName = previewNames[0] ?? 'Group - Shelf 1';
        const lastPreviewName = previewNames[previewNames.length - 1] ?? firstPreviewName;

        return (
          <>
            <Sheet
              isOpen={showAddShelf !== null}
              onClose={() => setShowAddShelf(null)}
              title={addShelfMode === 'bulk' ? 'Bulk Add Shelves' : 'Add Shelf'}
              description={
                activeAddGroup
                  ? `Adding to ${activeAddGroup.display_name}`
                  : undefined
              }
              position="center"
              size="md"
            >
              <div className="space-y-5">
                <SegmentedControl
                  name="Add shelf mode"
                  value={addShelfMode}
                  onChange={(val) => setAddShelfMode(val as 'single' | 'bulk')}
                  className="w-full"
                  options={[
                    { value: 'single', label: 'Single Shelf' },
                    { value: 'bulk', label: 'Bulk Add' },
                  ]}
                />

                {addShelfMode === 'single' ? (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="shelf-display-name" className="block text-sm font-medium text-content-muted mb-1">
                        Display Name
                      </label>
                      <input
                        id="shelf-display-name"
                        type="text"
                        value={formDisplayName}
                        onChange={(e) => {
                          setFormDisplayName(e.target.value);
                          setFormName(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                        }}
                        placeholder="e.g., Top Shelf"
                        className="w-full rounded-[--radius-control] border border-subtle bg-surface px-3 py-2 text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleAddShelf()}
                      />
                    </div>
                    {renderShelfWidthField('shelf-capacity-single', {
                      onEnter: handleAddShelf,
                    })}
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Number of Shelves */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="bulk-shelf-count" className="block text-sm font-medium text-content">
                          Number of Shelves
                        </label>
                        <span className="text-xs text-content-muted">Max 50 at once</span>
                      </div>
                      <div className="inline-flex items-center rounded-[--radius-control] border border-subtle bg-surface focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-surface">
                        <button
                          type="button"
                          aria-label="Decrease shelf count"
                          onClick={() => {
                            const next =
                              parsedBulkShelfCount !== null
                                ? Math.max(1, parsedBulkShelfCount - 1)
                                : 1;
                            setBulkShelfCountInput(String(next));
                          }}
                          disabled={parsedBulkShelfCount !== null && parsedBulkShelfCount <= 1}
                          className="px-3 py-2 text-content-muted hover:bg-surface-sunken hover:text-content disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-l-[--radius-control]"
                        >
                          &minus;
                        </button>
                        <input
                          id="bulk-shelf-count"
                          type="text"
                          inputMode="numeric"
                          placeholder="5"
                          value={bulkShelfCountInput}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/[^\d]/g, '');
                            if (digits === '') {
                              setBulkShelfCountInput('');
                              return;
                            }
                            const n = parseInt(digits, 10);
                            setBulkShelfCountInput(String(Math.min(50, n)));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              const next =
                                parsedBulkShelfCount !== null
                                  ? Math.min(50, parsedBulkShelfCount + 1)
                                  : 1;
                              setBulkShelfCountInput(String(next));
                            } else if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              const next =
                                parsedBulkShelfCount !== null
                                  ? Math.max(1, parsedBulkShelfCount - 1)
                                  : 1;
                              setBulkShelfCountInput(String(next));
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              handleBulkAddShelves();
                            }
                          }}
                          className="w-20 bg-transparent py-2 text-center font-semibold text-content focus:outline-none focus-visible:[box-shadow:none]"
                        />
                        <button
                          type="button"
                          aria-label="Increase shelf count"
                          onClick={() => {
                            const next =
                              parsedBulkShelfCount !== null
                                ? Math.min(50, parsedBulkShelfCount + 1)
                                : 1;
                            setBulkShelfCountInput(String(next));
                          }}
                          disabled={parsedBulkShelfCount !== null && parsedBulkShelfCount >= 50}
                          className="px-3 py-2 text-content-muted hover:bg-surface-sunken hover:text-content disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-r-[--radius-control]"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Shelf Width / Capacity */}
                    {renderShelfWidthField('bulk-shelf-capacity', {
                      isBulk: true,
                      onEnter: handleBulkAddShelves,
                    })}

                    {/* Live Summary & Auto-naming Preview */}
                    <div className="rounded-[--radius-control] border border-subtle bg-surface-sunken p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium text-content-muted uppercase tracking-wider">
                        <span>Summary Preview</span>
                        <span>
                          {isBulkCountValid && resolvedShelfWidth.valid
                            ? `${previewCount * resolvedShelfWidth.capacityUnits} total units (${(
                                previewCount * resolvedShelfWidth.widthMm
                              ).toFixed(0)}mm)`
                            : 'Enter count & width'}
                        </span>
                      </div>
                      <div className="text-sm text-content">
                        {!isBulkCountValid || !resolvedShelfWidth.valid ? (
                          <span className="text-content-muted">
                            Enter the number of shelves and shelf width above to preview.
                          </span>
                        ) : previewCount === 1 ? (
                          <span>
                            Will create <span className="font-semibold">&ldquo;{firstPreviewName}&rdquo;</span>
                          </span>
                        ) : (
                          <span>
                            Will create <span className="font-semibold">{previewCount} shelves</span> named{' '}
                            <span className="font-medium text-primary-600 dark:text-primary-400">
                              &ldquo;{firstPreviewName}&rdquo;
                            </span>{' '}
                            through{' '}
                            <span className="font-medium text-primary-600 dark:text-primary-400">
                              &ldquo;{lastPreviewName}&rdquo;
                            </span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-content-muted">
                        Names are generated automatically so you can start organizing right away. You can rename any shelf later.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => setShowAddShelf(null)} disabled={isSubmittingShelves}>
                  Cancel
                </Button>
                {addShelfMode === 'single' ? (
                  <Button
                    onClick={handleAddShelf}
                    disabled={!formDisplayName.trim() || !resolvedShelfWidth.valid || isSubmittingShelves}
                  >
                    Create Shelf
                  </Button>
                ) : (
                  <Button
                    onClick={handleBulkAddShelves}
                    disabled={!isBulkCountValid || !resolvedShelfWidth.valid || isSubmittingShelves}
                  >
                    {previewCount === 1
                      ? 'Create 1 Shelf'
                      : previewCount > 1
                        ? `Create ${previewCount} Shelves`
                        : 'Create Shelves'}
                  </Button>
                )}
              </div>
            </Sheet>

            {/* Edit Shelf Modal */}
            <Sheet
              isOpen={!!editingShelf}
              onClose={() => setEditingShelf(null)}
              title="Edit Shelf"
              position="center"
              size="md"
            >
              <div className="space-y-4">
                <div>
                  <label htmlFor="edit-shelf-display-name" className="block text-sm font-medium text-content-muted mb-1">
                    Display Name
                  </label>
                  <input
                    id="edit-shelf-display-name"
                    type="text"
                    value={formDisplayName}
                    onChange={(e) => {
                      setFormDisplayName(e.target.value);
                      setFormName(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleEditShelf()}
                    className="w-full rounded-[--radius-control] border border-subtle bg-surface px-3 py-2 text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    autoFocus
                  />
                </div>
                {renderShelfWidthField('edit-shelf-capacity', {
                  onEnter: handleEditShelf,
                })}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => setEditingShelf(null)}>Cancel</Button>
                <Button onClick={handleEditShelf} disabled={!formDisplayName.trim() || !resolvedShelfWidth.valid}>Save</Button>
              </div>
            </Sheet>
          </>
        );
      })()}

      {/* Drag Overlay */}
      <DragOverlay dropAnimation={null}>
        {activeDragData?.type === 'unassigned-item' && activeDragData.item && (
          <ItemDragOverlay item={activeDragData.item} />
        )}
        {activeDragData?.type === 'placement' && activeDragData.item && (
          <ItemDragOverlay item={activeDragData.item} />
        )}
        {activeDragData?.type === 'shelf' && activeDragData.shelf && (
          <ShelfDragOverlay shelf={activeDragData.shelf} />
        )}
        {activeDragData?.type === 'shelf-group' && activeDragData.group && (
          <GroupDragOverlay group={activeDragData.group} />
        )}
      </DragOverlay>

      {/* Item Detail Modal */}
      <MediaDetailModal
        physicalItem={selectedDetailItem}
        isOpen={!!selectedDetailItem}
        onClose={() => setSelectedDetailItem(null)}
        onEdit={
          canEdit
            ? (item) => {
                setSelectedDetailItem(null);
                setEditingPhysicalItem(item);
              }
            : undefined
        }
      />

      {canEdit && (
        <MediaForm
          isOpen={!!editingPhysicalItem}
          onClose={() => setEditingPhysicalItem(null)}
          onSuccess={() => {
            setEditingPhysicalItem(null);
            loadLibrary();
            setUnassignedRefreshKey((k) => k + 1);
            onDataChange?.();
          }}
          editItem={editingPhysicalItem}
          onDelete={async (itemId) => {
            try {
              await apiService.deletePhysicalItem(itemId);
              setEditingPhysicalItem(null);
              loadLibrary();
              setUnassignedRefreshKey((k) => k + 1);
              onDataChange?.();
            } catch (err) {
              console.error('Failed to delete physical item:', err);
              toast({ message: 'Failed to delete item. Please try again.', type: 'error' });
            }
          }}
        />
      )}
    </DndContext>
  );
};

export { libraryCollisionDetection };
export default PhysicalLibraryPage;
