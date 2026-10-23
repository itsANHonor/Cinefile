import React from 'react';
import { PhysicalItem } from '../types';
import MediaCard from './MediaCard';
import { Skeleton } from './ui/Skeleton';

interface MediaGridProps {
  physicalItems: PhysicalItem[];
  onItemClick: (item: PhysicalItem) => void;
  isEditMode?: boolean;
  isAuthenticated?: boolean;
  onEditItem?: (item: PhysicalItem) => void;
  onArchiveItem?: (itemId: number, archived: boolean, archiveReason: string | null) => Promise<void> | void;
  skeletonCount?: number;
}

const MediaGrid: React.FC<MediaGridProps> = ({
  physicalItems,
  onItemClick,
  isEditMode = false,
  isAuthenticated = false,
  onEditItem,
  onArchiveItem,
  skeletonCount = 0,
}) => {
  const items = physicalItems;
  const showSkeletons = skeletonCount > 0;

  return (
    <div
      role="list"
      aria-busy={showSkeletons || undefined}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4"
    >
      {items.map((item) => (
        <div key={item.id} role="listitem" className="h-full">
          <MediaCard
            physicalItem={item}
            onClick={() => onItemClick(item)}
            isEditMode={isEditMode}
            isAuthenticated={isAuthenticated}
            onEdit={onEditItem}
            onArchive={onArchiveItem}
          />
        </div>
      ))}
      {showSkeletons &&
        Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={`skeleton-${i}`} role="listitem" aria-hidden="true">
            <Skeleton className="aspect-[2/3] w-full rounded-[--radius-card]" />
            <Skeleton className="mt-2 h-4 w-3/4 rounded-[--radius-control]" />
            <Skeleton className="mt-1.5 h-3 w-1/2 rounded-[--radius-control]" />
          </div>
        ))}
    </div>
  );
};

export default MediaGrid;
