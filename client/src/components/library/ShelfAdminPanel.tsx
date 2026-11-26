import React from 'react';
import { PhysicalItem } from '../../types';
import { Button } from '../ui/Button';
import ToShelveBanner from './ToShelveBanner';

interface ShelfAdminPanelProps {
  /** Full editing rights (admin/desktop). Read-only viewers only get photo access. */
  canEdit: boolean;
  unassignedItems: PhysicalItem[];
  photoCount: number;
  onPlanQueue: () => void;
  onOrganize: () => void;
  onOpenPhotos: () => void;
  onAddGroup: () => void;
}

const SlidersIcon: React.FC = () => (
  <svg className="-mt-0.5 mr-1.5 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h13M21 18h-1M16 4v4M10 10v4M19 16v4" />
  </svg>
);

const CameraIcon: React.FC = () => (
  <svg className="-mt-0.5 mr-1.5 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const PlusIcon: React.FC = () => (
  <svg className="-mt-0.5 mr-1.5 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

/**
 * Single consolidated home for shelf-administration controls.
 * Renders above the shelf groups as a section card matching ShelfGroupCard
 * chrome: an attention row for the unassigned queue (when items wait) and a
 * tools row grouping every management action in one place.
 */
const ShelfAdminPanel: React.FC<ShelfAdminPanelProps> = ({
  canEdit,
  unassignedItems,
  photoCount,
  onPlanQueue,
  onOrganize,
  onOpenPhotos,
  onAddGroup,
}) => {
  const hasQueue = canEdit && unassignedItems.length > 0;
  const showTools = canEdit || photoCount > 0;
  if (!hasQueue && !showTools) return null;

  return (
    <section
      aria-label="Shelf management"
      className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      {hasQueue && <ToShelveBanner embedded items={unassignedItems} onPlanClick={onPlanQueue} />}

      {showTools && (
        <div
          className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${
            hasQueue ? 'border-t border-gray-100 dark:border-gray-700/70' : ''
          }`}
        >
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Shelf Tools
          </span>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {canEdit && (
              <Button onClick={onOrganize} variant="secondary" size="sm">
                <SlidersIcon />
                Organize Rules
              </Button>
            )}
            <Button onClick={onOpenPhotos} variant="secondary" size="sm">
              <CameraIcon />
              Shelf Photos{photoCount > 0 ? ` (${photoCount})` : ''}
            </Button>
            {canEdit && (
              <Button onClick={onAddGroup} variant="secondary" size="sm">
                <PlusIcon />
                Add Group
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default ShelfAdminPanel;
