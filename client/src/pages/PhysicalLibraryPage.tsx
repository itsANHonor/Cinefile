import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { PhysicalLibrary, ShelfGroup, Shelf, PhysicalItem, STANDARD_UNIT_MM } from '../types';
import { apiService } from '../services/api.service';
import { useAuth } from '../context/AuthContext';
import { useServerMode } from '../context/ServerModeContext';
import ShelfGroupCard from '../components/library/ShelfGroupCard';
import UnassignedItemsPanel from '../components/library/UnassignedItemsPanel';
import ApplySortModal from '../components/library/ApplySortModal';
import SpineColorPicker from '../components/library/SpineColorPicker';
import { ItemDragOverlay, ShelfDragOverlay, GroupDragOverlay } from '../components/library/DragOverlayItem';

/** Move an element in an array from one index to another, returning a new array. */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [removed] = result.splice(from, 1);
  result.splice(to, 0, removed);
  return result;
}

const PhysicalLibraryPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { isReadOnly } = useServerMode();
  const canEdit = isAuthenticated && !isReadOnly;

  const [library, setLibrary] = useState<PhysicalLibrary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Panel state
  const [isUnassignedOpen, setIsUnassignedOpen] = useState(false);
  const [unassignedRefreshKey, setUnassignedRefreshKey] = useState(0);

  // Modal state
  const [showApplySort, setShowApplySort] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddShelf, setShowAddShelf] = useState<number | null>(null); // group id
  const [editingGroup, setEditingGroup] = useState<ShelfGroup | null>(null);
  const [editingShelf, setEditingShelf] = useState<Shelf | null>(null);

  // Form state for inline modals
  const [formName, setFormName] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formCapacity, setFormCapacity] = useState(10);

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const loadLibrary = useCallback(async () => {
    try {
      const data = await apiService.getLibrary();
      setLibrary(data);
      setLibraryDisplayName(data.display_name);
      setError(null);
    } catch (err) {
      console.error('Failed to load library:', err);
      setError('Failed to load physical library');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

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
      setShowAddGroup(false);
      setFormName('');
      setFormDisplayName('');
    } catch (err) {
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
      setEditingGroup(null);
      setFormName('');
      setFormDisplayName('');
    } catch (err) {
      console.error('Failed to update group:', err);
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!confirm('Delete this group? All shelves and item placements in this group will be removed. Items will become unassigned.')) return;
    try {
      await apiService.deleteShelfGroup(groupId);
      await loadLibrary();
      setUnassignedRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  const handleAddShelf = async () => {
    if (showAddShelf === null || !formName.trim() || !formDisplayName.trim()) return;
    try {
      await apiService.createShelf(showAddShelf, {
        name: formName.trim().toLowerCase().replace(/\s+/g, '_'),
        display_name: formDisplayName.trim(),
        capacity_units: formCapacity,
      });
      await loadLibrary();
      setShowAddShelf(null);
      setFormName('');
      setFormDisplayName('');
      setFormCapacity(10);
    } catch (err) {
      console.error('Failed to create shelf:', err);
    }
  };

  const handleEditShelf = async () => {
    if (!editingShelf || !formDisplayName.trim()) return;
    try {
      await apiService.updateShelf(editingShelf.id, {
        display_name: formDisplayName.trim(),
        name: formName.trim().toLowerCase().replace(/\s+/g, '_'),
        capacity_units: formCapacity,
      });
      await loadLibrary();
      setEditingShelf(null);
      setFormName('');
      setFormDisplayName('');
      setFormCapacity(10);
    } catch (err) {
      console.error('Failed to update shelf:', err);
    }
  };

  const handleDeleteShelf = async (shelfId: number) => {
    if (!confirm('Delete this shelf? Items on this shelf will become unassigned.')) return;
    try {
      await apiService.deleteShelf(shelfId);
      await loadLibrary();
      setUnassignedRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('Failed to delete shelf:', err);
    }
  };

  const handleRemovePlacement = async (placementId: number) => {
    try {
      await apiService.removePlacement(placementId);
      await loadLibrary();
      setUnassignedRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('Failed to remove placement:', err);
    }
  };

  const handleUpdateLibraryName = async () => {
    if (!libraryDisplayName.trim()) return;
    try {
      await apiService.updateLibrary({ display_name: libraryDisplayName.trim() });
      await loadLibrary();
      setIsEditingLibraryName(false);
    } catch (err) {
      console.error('Failed to update library name:', err);
    }
  };

  const handleApplySortConfirm = async () => {
    await loadLibrary();
    setUnassignedRefreshKey((k) => k + 1);
  };

  // Open edit forms with pre-filled data
  const openEditGroup = (group: ShelfGroup) => {
    setFormName(group.name);
    setFormDisplayName(group.display_name);
    setEditingGroup(group);
  };

  const openEditShelf = (shelf: Shelf) => {
    setFormName(shelf.name);
    setFormDisplayName(shelf.display_name);
    setFormCapacity(shelf.capacity_units);
    setEditingShelf(shelf);
  };

  const openAddShelf = (groupId: number) => {
    setFormName('');
    setFormDisplayName('');
    setFormCapacity(10);
    setShowAddShelf(groupId);
  };

  const openAddGroup = () => {
    setFormName('');
    setFormDisplayName('');
    setShowAddGroup(true);
  };

  // =============================================
  // Render
  // =============================================
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-300">Loading physical library...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !library) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-16">
          <p className="text-red-600 dark:text-red-400">{error || 'Library not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="container mx-auto px-4 py-8">
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

            {canEdit && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowApplySort(true)}
                  className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Apply Sort
                </button>
                <button
                  onClick={openAddGroup}
                  className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Add Group
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Groups */}
        {library.groups.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No Shelf Groups Yet
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Create a group to start organizing your physical media. Groups represent rooms or areas.
            </p>
            {canEdit && (
              <button
                onClick={openAddGroup}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Create Your First Group
              </button>
            )}
          </div>
        ) : (
          <SortableContext
            items={library.groups.map(g => `group-${g.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {library.groups.map((group) => (
                <ShelfGroupCard
                  key={group.id}
                  group={group}
                  isEditMode={canEdit}
                  onEditGroup={openEditGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onAddShelf={openAddShelf}
                  onEditShelf={openEditShelf}
                  onDeleteShelf={handleDeleteShelf}
                  onRemovePlacement={handleRemovePlacement}
                  onSpineColorEdit={(itemId) => setEditingSpineColorItemId(itemId)}
                />
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

      {/* Apply Sort Modal */}
      <ApplySortModal
        isOpen={showApplySort}
        onClose={() => setShowApplySort(false)}
        onConfirm={handleApplySortConfirm}
      />

      {/* =============================================
          Inline Modals for Add/Edit Group and Shelf
          ============================================= */}

      {/* Add Group Modal */}
      {showAddGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddGroup(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Add Shelf Group</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={(e) => {
                    setFormDisplayName(e.target.value);
                    setFormName(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                  }}
                  placeholder="e.g., Living Room"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddGroup(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              <button onClick={handleAddGroup} disabled={!formDisplayName.trim()} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {editingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingGroup(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit Shelf Group</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={(e) => {
                    setFormDisplayName(e.target.value);
                    setFormName(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleEditGroup()}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingGroup(null)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              <button onClick={handleEditGroup} disabled={!formDisplayName.trim()} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Shelf Modal */}
      {showAddShelf !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAddShelf(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Add Shelf</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={(e) => {
                    setFormDisplayName(e.target.value);
                    setFormName(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                  }}
                  placeholder="e.g., Top Shelf"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Capacity (standard Blu-ray cases)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                    className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    = {(formCapacity * STANDARD_UNIT_MM).toFixed(1)}mm
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddShelf(null)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              <button
                onClick={handleAddShelf}
                disabled={!formDisplayName.trim()}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                onKeyDown={(e) => e.key === 'Enter' && handleAddShelf()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Edit Shelf Modal */}
      {editingShelf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingShelf(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Edit Shelf</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formDisplayName}
                  onChange={(e) => {
                    setFormDisplayName(e.target.value);
                    setFormName(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Capacity (standard Blu-ray cases)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                    className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    = {(formCapacity * STANDARD_UNIT_MM).toFixed(1)}mm
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingShelf(null)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
              <button onClick={handleEditShelf} disabled={!formDisplayName.trim()} className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
};

export default PhysicalLibraryPage;
