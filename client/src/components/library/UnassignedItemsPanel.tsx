import React, { useState, useEffect, useCallback } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { PhysicalItem } from '../../types';
import { apiService } from '../../services/api.service';

const DEFAULT_SPINE_BG = 'rgba(30, 64, 175, 0.65)';
const DEFAULT_SPINE_SOLID = '#1e40af';

/** Convert a hex color to an rgba string with given alpha */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.35 ? '#1a1a2e' : '#f0f0f0';
}

interface UnassignedItemsPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  refreshKey: number;
  onItemClick?: (physicalItemId: number) => void;
}

// Draggable spine-style unassigned item
const DraggableUnassignedItem: React.FC<{
  item: PhysicalItem;
  onItemClick?: (physicalItemId: number) => void;
}> = ({ item, onItemClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `unassigned-${item.id}`,
    data: {
      type: 'unassigned-item',
      physicalItemId: item.id,
      item,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0 : 1,
      }
    : isDragging
    ? { opacity: 0 }
    : undefined;

  const thickness = item.thickness_units || 1;
  const spineWidth = Math.max(32, thickness * 40);
  const coverUrl = (item as any).cover_art_url || item.custom_image_url;
  const customSpineColor = (item as any).spine_color as string | undefined;
  const spineColor = customSpineColor || DEFAULT_SPINE_SOLID;
  const spineAccent = (item as any).spine_color_accent || (customSpineColor ? getContrastColor(customSpineColor) : '#f0f0f0');
  const overlayBg = customSpineColor ? hexToRgba(customSpineColor, 0.65) : DEFAULT_SPINE_BG;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, width: `${spineWidth}px`, zIndex: isHovered ? 20 : 1 }}
      className={`relative flex-shrink-0 h-[200px] cursor-grab active:cursor-grabbing ${isDragging ? 'z-50' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...attributes}
      {...listeners}
    >
      {/* Spine — layered: poster art, frosted overlay, vertical text */}
      <div
        className="h-full w-full overflow-hidden border-r border-black/10 dark:border-white/10 rounded-sm relative"
        style={{ backgroundColor: !coverUrl ? spineColor : undefined }}
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
            className="text-[11px] font-medium leading-tight select-none whitespace-nowrap overflow-hidden text-ellipsis max-h-full"
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

      {/* Hover overlay */}
      {isHovered && !isDragging && (
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none"
          style={{ width: '160px', height: '240px', zIndex: 30, bottom: '-4px' }}
        >
          <div
            className="w-full h-full rounded-md shadow-2xl overflow-hidden border-2 border-white/80 dark:border-gray-600 pointer-events-auto"
            style={{ backgroundColor: !coverUrl ? spineColor : undefined }}
            onClick={() => onItemClick?.(item.id)}
          >
            {coverUrl ? (
              <img src={coverUrl} alt={item.name} className="w-full h-full object-cover" draggable={false} />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-2">
                <span className="text-xs font-semibold text-center leading-tight" style={{ color: spineAccent }}>
                  {item.name}
                </span>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-3">
              <p className="text-[9px] font-medium text-white leading-tight truncate">
                {item.name}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const UnassignedItemsPanel: React.FC<UnassignedItemsPanelProps> = ({
  isOpen,
  onToggle,
  refreshKey,
  onItemClick,
}) => {
  const [items, setItems] = useState<PhysicalItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: 'unassigned-droppable',
    data: { type: 'unassigned-container' },
  });

  // Debounce search
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiService.getUnassignedItems(debouncedSearch || undefined);
      setItems(data);
    } catch (error) {
      console.error('Failed to load unassigned items:', error);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    if (isOpen) {
      loadItems();
    }
  }, [isOpen, loadItems, refreshKey]);

  return (
    <div ref={setDropRef} className={`mt-6 rounded-lg transition-all ${isOver ? 'ring-2 ring-primary-400 ring-offset-2 dark:ring-offset-gray-900' : ''}`}>
      {/* Collapsible header */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
          isOver
            ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-600'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
        }`}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Unassigned Items
          </h3>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            {items.length}
          </span>
        </div>
        {isOpen && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Drag items to a shelf above
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="mt-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Search */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search unassigned items..."
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Items row - fixed width, clipped to container */}
          <div className="p-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
                {debouncedSearch
                  ? 'No matching items found'
                  : 'All items are placed on shelves'}
              </div>
            ) : (
              <div className="relative">
                <div className="flex flex-wrap gap-0.5 pb-2 items-end" style={{ minHeight: '200px' }}>
                  {items.map((item) => (
                    <DraggableUnassignedItem
                      key={item.id}
                      item={item}
                      onItemClick={onItemClick}
                    />
                  ))}
                </div>
                {/* Shelf edge for unassigned area */}
                <div
                  className="relative h-3 rounded-b-sm overflow-hidden"
                  style={{
                    background: 'linear-gradient(to bottom, #a8936a 0%, #8b7355 30%, #7a6548 60%, #6d5a3e 100%)',
                  }}
                >
                  <div className="absolute top-0 left-0 right-0 h-px bg-white/20" />
                  <div className="hidden dark:block absolute inset-0 bg-black/30" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UnassignedItemsPanel;
