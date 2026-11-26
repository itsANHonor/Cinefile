import React from 'react';
import { PhysicalItem } from '../../types';
import { Button } from '../ui/Button';

interface ToShelveBannerProps {
  items: PhysicalItem[];
  onPlanClick: () => void;
  /** Render without outer card chrome (for embedding inside another card). */
  embedded?: boolean;
}

const ToShelveBanner: React.FC<ToShelveBannerProps> = ({ items, onPlanClick, embedded = false }) => {
  if (items.length === 0) return null;

  const preview = items.slice(0, 5);

  return (
    <div
      role="status"
      className={
        embedded
          ? 'flex flex-wrap items-center gap-3 bg-primary-50/60 px-4 py-3 dark:bg-primary-900/20'
          : 'mb-4 flex flex-wrap items-center gap-3 rounded-[--radius-card] border border-primary-200 bg-primary-50/60 px-4 py-3 dark:border-primary-800/60 dark:bg-primary-900/20'
      }
    >
      <div className="flex -space-x-2">
        {preview.map((item) => {
          const cover = item.custom_image_url || (item as any).cover_art_url;
          return (
            <div
              key={item.id}
              className="h-10 w-7 flex-shrink-0 overflow-hidden rounded-sm border border-white bg-surface-sunken shadow-sm dark:border-gray-700"
              title={item.name}
            >
              {cover ? (
                <img src={cover} alt={item.name} className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-[8px] font-semibold text-white"
                  style={{ backgroundColor: item.spine_color || '#1e40af' }}
                >
                  {item.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="min-w-0 flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">
        <span className="font-semibold">{items.length} new {items.length === 1 ? 'item' : 'items'}</span>{' '}
        ready to shelve
      </p>
      <Button size="sm" onClick={onPlanClick}>
        Add to shelves
      </Button>
    </div>
  );
};

export default ToShelveBanner;
