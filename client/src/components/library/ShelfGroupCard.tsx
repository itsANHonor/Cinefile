import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ShelfGroup, Shelf } from '../../types';
import ShelfView from './ShelfView';
import { IconButton } from '../ui/IconButton';

interface ShelfGroupCardProps {
  group: ShelfGroup;
  isEditMode: boolean;
  onEditGroup?: (group: ShelfGroup) => void;
  onDeleteGroup?: (group: ShelfGroup) => void;
  onAddShelf?: (groupId: number) => void;
  onEditShelf?: (shelf: Shelf) => void;
  onDeleteShelf?: (shelf: Shelf) => void;
  onRemovePlacement?: (placementId: number) => void;
  onItemClick?: (physicalItemId: number) => void;
  onSpineColorEdit?: (physicalItemId: number) => void;
}

/** Grip/drag handle icon */
const GripIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className || 'w-4 h-4'} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="5" r="1.5" />
    <circle cx="15" cy="5" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="19" r="1.5" />
    <circle cx="15" cy="19" r="1.5" />
  </svg>
);

const ShelfGroupCard: React.FC<ShelfGroupCardProps> = ({
  group,
  isEditMode,
  onEditGroup,
  onDeleteGroup,
  onAddShelf,
  onEditShelf,
  onDeleteShelf,
  onRemovePlacement,
  onItemClick,
  onSpineColorEdit,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Group-level sortable (for reordering groups)
  const {
    setNodeRef: setGroupRef,
    attributes: groupAttributes,
    listeners: groupListeners,
    transform: groupTransform,
    transition: groupTransition,
    isDragging: isGroupDragging,
  } = useSortable({
    id: `group-${group.id}`,
    data: { type: 'shelf-group', group },
    disabled: !isEditMode,
  });

  const groupStyle = {
    transform: CSS.Transform.toString(groupTransform),
    transition: groupTransition,
    opacity: isGroupDragging ? 0 : 1,
  };

  const totalItems = group.shelves.reduce(
    (sum, shelf) => sum + shelf.placements.length,
    0
  );
  const totalUsed = group.shelves.reduce(
    (sum, shelf) => sum + shelf.used_units,
    0
  );
  const totalCapacity = group.shelves.reduce(
    (sum, shelf) => sum + shelf.capacity_units,
    0
  );

  const shelfSortableIds = group.shelves.map((s) => `sortable-shelf-${s.id}`);

  return (
    <div
      ref={setGroupRef}
      style={groupStyle}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      {/* Group Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          {/* Drag handle for group reordering */}
          {isEditMode && (
            <button
              type="button"
              {...groupAttributes}
              {...groupListeners}
              className="cursor-grab active:cursor-grabbing touch-none -ml-1 rounded p-1 text-content-muted hover:bg-surface-sunken hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Drag to reorder ${group.display_name}`}
              title="Drag to reorder group"
            >
              <GripIcon className="h-4 w-4" />
            </button>
          )}

          <svg
            className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${
              isCollapsed ? '' : 'rotate-90'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {group.display_name}
          </h3>

          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{group.shelves.length} {group.shelves.length === 1 ? 'shelf' : 'shelves'}</span>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span>{totalItems} {totalItems === 1 ? 'item' : 'items'}</span>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span>{totalUsed}/{totalCapacity} units</span>
          </div>
        </div>

        {isEditMode && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={`Add shelf to ${group.display_name}`}
              onClick={() => onAddShelf?.(group.id)}
              title="Add shelf to this group"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </IconButton>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={`Edit ${group.display_name}`}
              onClick={() => onEditGroup?.(group)}
              title="Edit group"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </IconButton>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={`Delete ${group.display_name}`}
              onClick={() => onDeleteGroup?.(group)}
              title="Delete group"
              className="hover:text-red-600"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </IconButton>
          </div>
        )}
      </div>

      {/* Shelves */}
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-1">
          {group.shelves.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500">
              {isEditMode ? (
                <button
                  onClick={() => onAddShelf?.(group.id)}
                  className="text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Add your first shelf to this group
                </button>
              ) : (
                'No shelves in this group'
              )}
            </div>
          ) : (
            <SortableContext items={shelfSortableIds} strategy={verticalListSortingStrategy}>
              {group.shelves.map((shelf) => (
                <ShelfView
                  key={shelf.id}
                  shelf={shelf}
                  isEditMode={isEditMode}
                  onEditShelf={onEditShelf}
                  onDeleteShelf={onDeleteShelf}
                  onRemovePlacement={onRemovePlacement}
                  onItemClick={onItemClick}
                  onSpineColorEdit={onSpineColorEdit}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
};

export default ShelfGroupCard;
