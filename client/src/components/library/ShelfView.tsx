import React, { useState } from 'react';
import { useDroppable, useDndContext } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Shelf, ShelfPlacement, STANDARD_UNIT_MM } from '../../types';

const DEFAULT_SPINE_BG = 'rgba(30, 64, 175, 0.65)';
const DEFAULT_SPINE_SOLID = '#1e40af';
const PX_PER_UNIT = 40;

/** Convert a hex color to an rgba string with given alpha */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Vertical glowing drop indicator line */
const DropIndicatorLine: React.FC = () => (
  <div className="flex-shrink-0 relative" style={{ width: '4px' }}>
    <div className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary-500 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)] animate-pulse" />
  </div>
);

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.35 ? '#1a1a2e' : '#f0f0f0';
}

interface ShelfViewProps {
  shelf: Shelf;
  isEditMode: boolean;
  onEditShelf?: (shelf: Shelf) => void;
  onDeleteShelf?: (shelfId: number) => void;
  onRemovePlacement?: (placementId: number) => void;
  onItemClick?: (physicalItemId: number) => void;
  onSpineColorEdit?: (physicalItemId: number) => void;
}

// Calibre-style spine item
const SortableShelfItem: React.FC<{
  placement: ShelfPlacement;
  isEditMode: boolean;
  onRemove?: (placementId: number) => void;
  onClick?: (physicalItemId: number) => void;
  onSpineColorEdit?: (physicalItemId: number) => void;
}> = ({ placement, isEditMode, onRemove, onClick, onSpineColorEdit }) => {
  const [isHovered, setIsHovered] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `placement-${placement.id}`,
    data: {
      type: 'placement',
      placement,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const item = placement.physical_item;
  if (!item) return null;

  const thickness = (item as any).thickness_units || 1;
  const spineWidth = Math.max(32, thickness * 40);
  const coverUrl = (item as any).cover_art_url || (item as any).custom_image_url;
  const customSpineColor = (item as any).spine_color as string | undefined;
  const spineColor = customSpineColor || DEFAULT_SPINE_SOLID;
  const spineAccent = (item as any).spine_color_accent || (customSpineColor ? getContrastColor(customSpineColor) : '#f0f0f0');
  const overlayBg = customSpineColor ? hexToRgba(customSpineColor, 0.65) : DEFAULT_SPINE_BG;

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isEditMode && onSpineColorEdit) {
      e.preventDefault();
      onSpineColorEdit(item.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, width: `${spineWidth}px`, height: '260px', zIndex: isHovered ? 20 : 1 }}
      className={`relative flex-shrink-0 ${isDragging ? 'z-50' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={handleContextMenu}
      {...(isEditMode ? { ...attributes, ...listeners } : {})}
    >
      {/* Spine (default state) — layered: poster art, frosted overlay, vertical text */}
      <div
        className="h-full w-full overflow-hidden border-r border-black/10 dark:border-white/10 cursor-pointer relative"
        style={{ backgroundColor: !coverUrl ? spineColor : undefined }}
        onClick={() => onClick?.(item.id)}
        title={`${item.name}${thickness > 1 ? ` (${thickness} units)` : ''}`}
      >
        {/* Bottom layer: poster art (if available) */}
        {coverUrl && (
          <img
            src={coverUrl}
            alt={item.name}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        )}
        {/* Middle layer: frosted color overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: coverUrl ? overlayBg : undefined,
            backdropFilter: coverUrl ? 'blur(2px)' : undefined,
            WebkitBackdropFilter: coverUrl ? 'blur(2px)' : undefined,
          }}
        />
        {/* Top layer: vertical title text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-xs font-medium leading-tight select-none whitespace-nowrap overflow-hidden text-ellipsis max-h-full"
            style={{
              color: spineAccent,
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              maxWidth: '100%',
              padding: '4px 2px',
            }}
          >
            {item.name}
          </span>
        </div>
      </div>

      {/* Hover: Expanded poster overlay */}
      {isHovered && coverUrl && !isDragging && (
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            width: '180px',
            height: '270px',
            zIndex: 30,
            bottom: '-4px',
          }}
        >
          <div
            className="w-full h-full rounded-md shadow-2xl overflow-hidden border-2 border-white/80 dark:border-gray-600 pointer-events-auto cursor-pointer"
            onClick={() => onClick?.(item.id)}
          >
            <img
              src={coverUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              draggable={false}
            />
            {/* Title overlay at bottom */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-4">
              <p className="text-[10px] font-medium text-white leading-tight truncate">
                {item.name}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hover: Expanded card for no-cover items */}
      {isHovered && !coverUrl && !isDragging && (
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            width: '180px',
            height: '270px',
            zIndex: 30,
            bottom: '-4px',
          }}
        >
          <div
            className="w-full h-full rounded-md shadow-2xl overflow-hidden border-2 border-white/80 dark:border-gray-600 pointer-events-auto cursor-pointer flex flex-col items-center justify-center"
            style={{ backgroundColor: spineColor }}
            onClick={() => onClick?.(item.id)}
          >
            <span
              className="text-xs font-semibold text-center px-2 leading-tight"
              style={{ color: spineAccent }}
            >
              {item.name}
            </span>
          </div>
        </div>
      )}

      {/* Remove button */}
      {isEditMode && isHovered && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(placement.id);
          }}
          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center hover:bg-red-600 z-40 shadow-md"
          title="Remove from shelf"
        >
          &times;
        </button>
      )}
    </div>
  );
};

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

const ShelfView: React.FC<ShelfViewProps> = ({
  shelf,
  isEditMode,
  onEditShelf,
  onDeleteShelf,
  onRemovePlacement,
  onItemClick,
  onSpineColorEdit,
}) => {
  const capacityPercent = shelf.capacity_units > 0
    ? Math.min(100, (shelf.used_units / shelf.capacity_units) * 100)
    : 0;
  const isOverCapacity = shelf.used_units > shelf.capacity_units;
  const widthMm = shelf.width_mm ?? shelf.capacity_units * STANDARD_UNIT_MM;
  const usedMm = shelf.used_units * STANDARD_UNIT_MM;

  // Sortable: for reordering shelves within/between groups
  const {
    setNodeRef: setSortableRef,
    attributes: shelfAttributes,
    listeners: shelfListeners,
    transform: shelfTransform,
    transition: shelfTransition,
    isDragging: isShelfDragging,
  } = useSortable({
    id: `sortable-shelf-${shelf.id}`,
    data: { type: 'shelf', shelf },
    disabled: !isEditMode,
  });

  const shelfSortableStyle = {
    transform: CSS.Transform.toString(shelfTransform),
    transition: shelfTransition,
    opacity: isShelfDragging ? 0 : 1,
  };

  // Droppable: for accepting item drops onto this shelf
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `shelf-${shelf.id}`,
    data: {
      type: 'shelf',
      shelfId: shelf.id,
    },
  });

  // Track DnD context for cross-container drop indicators
  const { active, over } = useDndContext();
  const isItemDrag = active?.data.current?.type === 'placement' || active?.data.current?.type === 'unassigned-item';
  const activeIsFromThisShelf = active?.data.current?.type === 'placement'
    && active.data.current.placement.shelf_id === shelf.id;

  // Compute drop indicator position for cross-container drags
  let dropIndicatorIndex: number | null = null;
  if (isItemDrag && !activeIsFromThisShelf && over) {
    const overData = over.data.current;
    if (overData?.type === 'placement' && overData.placement.shelf_id === shelf.id) {
      const idx = shelf.placements.findIndex(p => `placement-${p.id}` === String(over.id));
      if (idx !== -1) dropIndicatorIndex = idx;
    } else if (String(over.id) === `shelf-${shelf.id}`) {
      dropIndicatorIndex = shelf.placements.length; // indicator at end
    }
  }

  const sortableIds = shelf.placements.map((p) => `placement-${p.id}`);

  const shelfVisualWidthPx = shelf.capacity_units * PX_PER_UNIT;

  return (
    <div ref={setSortableRef} style={shelfSortableStyle} className="mb-4">
      {/* Shelf header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {/* Drag handle for shelf reordering */}
          {isEditMode && (
            <div
              {...shelfAttributes}
              {...shelfListeners}
              className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Drag to reorder shelf"
            >
              <GripIcon className="w-3.5 h-3.5" />
            </div>
          )}
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {shelf.display_name}
          </h4>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            isOverCapacity
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
          }`}>
            {shelf.used_units} / {shelf.capacity_units} units
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            ({usedMm.toFixed(1)}mm / {widthMm.toFixed(1)}mm)
          </span>
        </div>

        {isEditMode && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEditShelf?.(shelf)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Edit shelf"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={() => onDeleteShelf?.(shelf.id)}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
              title="Delete shelf"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Capacity bar */}
      <div
        className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mb-2 overflow-hidden"
        style={{ width: `${shelfVisualWidthPx}px`, maxWidth: '100%' }}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isOverCapacity
              ? 'bg-red-500'
              : capacityPercent > 80
              ? 'bg-amber-500'
              : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(100, capacityPercent)}%` }}
        />
      </div>

      {/* Shelf visual - scrollable container for wide shelves */}
      <div className="overflow-x-auto">
        <div
          ref={setDropRef}
          className={`relative rounded-t-md overflow-visible transition-all ${
            isOver
              ? 'ring-2 ring-primary-400 dark:ring-primary-500 ring-inset'
              : ''
          }`}
          style={{ minWidth: `${shelfVisualWidthPx}px` }}
        >
          {/* Back panel - fixed to shelf capacity width */}
          <div
            className={`absolute top-0 left-0 bottom-0 rounded-t-md transition-colors ${
              isOver
                ? 'bg-primary-50 dark:bg-primary-900/20'
                : 'bg-gradient-to-b from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-800/60'
            }`}
            style={{
              width: `${shelfVisualWidthPx}px`,
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06), inset 0 0 0 1px rgba(0,0,0,0.04)',
            }}
          />

          {shelf.placements.length === 0 ? (
            <div
              className="relative flex flex-col items-center justify-center min-h-[260px] border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-t-md"
              style={{ width: `${shelfVisualWidthPx}px` }}
            >
              <svg className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {isEditMode ? 'Drag items here' : 'Empty shelf'}
              </p>
            </div>
          ) : (
            <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
              <div className="relative flex flex-nowrap min-h-[260px] items-end">
                {shelf.placements.map((placement, idx) => (
                  <React.Fragment key={placement.id}>
                    {dropIndicatorIndex === idx && <DropIndicatorLine />}
                    <SortableShelfItem
                      placement={placement}
                      isEditMode={isEditMode}
                      onRemove={onRemovePlacement}
                      onClick={onItemClick}
                      onSpineColorEdit={onSpineColorEdit}
                    />
                  </React.Fragment>
                ))}
                {dropIndicatorIndex === shelf.placements.length && <DropIndicatorLine />}
              </div>
            </SortableContext>
          )}

          {/* Shelf edge - wood-grain lip, fixed to shelf capacity width */}
          <div
            className="relative h-4 rounded-b-sm overflow-hidden"
            style={{
              width: `${shelfVisualWidthPx}px`,
              background: 'linear-gradient(to bottom, #a8936a 0%, #8b7355 30%, #7a6548 50%, #6d5a3e 70%, #5c4c35 100%)',
            }}
          >
            {/* Highlight line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-white/20" />
            {/* Inner shadow */}
            <div className="absolute inset-0" style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)' }} />
            {/* Dark mode variant overlay */}
            <div className="hidden dark:block absolute inset-0 bg-black/30" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShelfView;
