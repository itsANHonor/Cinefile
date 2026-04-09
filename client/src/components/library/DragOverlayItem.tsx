import React from 'react';
import { PhysicalItem, ShelfGroup, Shelf } from '../../types';

const DEFAULT_SPINE_SOLID = '#1e40af';

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.35 ? '#1a1a2e' : '#f0f0f0';
}

// ─── Item Overlay (poster card while dragging a physical item) ───

export const ItemDragOverlay: React.FC<{ item: PhysicalItem }> = ({ item }) => {
  const coverUrl = (item as any).cover_art_url || item.custom_image_url;
  const spineColor = (item as any).spine_color || DEFAULT_SPINE_SOLID;
  const spineAccent = (item as any).spine_color_accent || getContrastColor(spineColor);

  return (
    <div
      className="pointer-events-none select-none"
      style={{ width: '120px', transform: 'rotate(3deg)' }}
    >
      <div
        className="w-full rounded-lg shadow-2xl overflow-hidden border-2 border-white/60 dark:border-gray-500"
        style={{ aspectRatio: '2/3', backgroundColor: !coverUrl ? spineColor : undefined }}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={item.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-3">
            <span
              className="text-sm font-semibold text-center leading-tight"
              style={{ color: spineAccent }}
            >
              {item.name}
            </span>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs font-medium text-gray-800 dark:text-gray-200 text-center truncate drop-shadow-sm">
        {item.name}
      </p>
    </div>
  );
};

// ─── Shelf Overlay (compact bar while dragging a shelf) ───

export const ShelfDragOverlay: React.FC<{ shelf: Shelf }> = ({ shelf }) => {
  return (
    <div
      className="pointer-events-none select-none bg-white dark:bg-gray-800 rounded-lg shadow-2xl border-2 border-primary-400 dark:border-primary-500 px-4 py-3 flex items-center gap-3"
      style={{ width: '360px', opacity: 0.95 }}
    >
      <svg className="w-5 h-5 text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {shelf.display_name}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {shelf.placements.length} items &middot; {shelf.used_units}/{shelf.capacity_units} units
        </p>
      </div>
    </div>
  );
};

// ─── Group Overlay (compact card while dragging a group) ───

export const GroupDragOverlay: React.FC<{ group: ShelfGroup }> = ({ group }) => {
  const totalItems = group.shelves.reduce((sum, s) => sum + s.placements.length, 0);

  return (
    <div
      className="pointer-events-none select-none bg-white dark:bg-gray-800 rounded-xl shadow-2xl border-2 border-primary-400 dark:border-primary-500 px-5 py-3 flex items-center gap-3"
      style={{ width: '400px', opacity: 0.95 }}
    >
      <svg className="w-5 h-5 text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
          {group.display_name}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {group.shelves.length} shelves &middot; {totalItems} items
        </p>
      </div>
    </div>
  );
};
