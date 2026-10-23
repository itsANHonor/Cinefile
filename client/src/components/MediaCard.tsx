import React, { useState } from 'react';
import { PhysicalItem } from '../types';
import { useDisplayPreferences } from '../context/DisplayPreferencesContext';
import { useConfirm } from '../context/ConfirmContext';
import { IconButton } from './ui/IconButton';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';
import { formatBadgeClasses } from '../lib/formats';

interface MediaCardProps {
  physicalItem: PhysicalItem;
  onClick?: () => void;
  isEditMode?: boolean;
  isAuthenticated?: boolean;
  onEdit?: (item: PhysicalItem) => void;
  onArchive?: (itemId: number, archived: boolean, archiveReason: string | null) => Promise<void> | void;
}

const MediaCard: React.FC<MediaCardProps> = ({
  physicalItem,
  onClick,
  isEditMode = false,
  isAuthenticated = false,
  onEdit,
  onArchive,
}) => {
  const { showFormatBadges } = useDisplayPreferences();
  const confirm = useConfirm();
  const [imageFailed, setImageFailed] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [isArchiving, setIsArchiving] = useState(false);

  const primaryMedia = physicalItem.media[0];
  const imageUrl = physicalItem.custom_image_url || primaryMedia?.cover_art_url;
  const getFormatColor = (format: string) =>
    formatBadgeClasses[format] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';

  const metadataParts: string[] = [];
  if (primaryMedia?.release_date) {
    metadataParts.push(String(new Date(primaryMedia.release_date).getFullYear()));
  }
  if (primaryMedia?.media_type === 'tv_season' && primaryMedia.tv_show_name) {
    metadataParts.push(
      `${primaryMedia.tv_show_name}${primaryMedia.season_number != null ? ` - Season ${primaryMedia.season_number}` : ''}`
    );
  }
  if (primaryMedia?.series && primaryMedia.series.length > 0) {
    metadataParts.push(primaryMedia.series.map((s) => s.name).join(', '));
  }
  if (physicalItem.edition_notes) {
    metadataParts.push(physicalItem.edition_notes);
  }
  if (physicalItem.archived && physicalItem.archive_reason) {
    metadataParts.push(`Archived: ${physicalItem.archive_reason}`);
  }
  const metadataText = metadataParts.join(' · ');

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(physicalItem);
  };

  const handleArchiveClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (physicalItem.archived) {
      const confirmed = await confirm({
        title: 'Unarchive item?',
        message: `Move "${physicalItem.name}" back to your active collection?`,
        confirmLabel: 'Unarchive',
        cancelLabel: 'Cancel',
      });
      if (confirmed) {
        await onArchive?.(physicalItem.id, false, null);
      }
      return;
    }
    setArchiveReason(physicalItem.archive_reason || '');
    setShowArchiveModal(true);
  };

  const handleArchiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = archiveReason.trim();
    if (!trimmed) return;
    setIsArchiving(true);
    try {
      await onArchive?.(physicalItem.id, true, trimmed);
      setShowArchiveModal(false);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      role="button"
      tabIndex={onClick ? 0 : -1}
      aria-label={`Open details for ${physicalItem.name}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="card group relative flex h-full cursor-pointer flex-col overflow-hidden p-0 text-left transition-shadow duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {/* Cover Image */}
      <div className="relative aspect-[2/3] overflow-hidden bg-surface-sunken">
        {imageUrl && !imageFailed ? (
          <img
            src={imageUrl}
            alt={physicalItem.name}
            width={300}
            height={450}
            decoding="async"
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              className="h-16 w-16 text-content-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 4v16M17 4v16M3 8h18M3 12h18M3 16h18"
              />
            </svg>
          </div>
        )}

        {/* Admin Controls Overlay */}
        {isAuthenticated && isEditMode && (
          <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
            <IconButton
              size="sm"
              variant="secondary"
              aria-label={`Edit ${physicalItem.name}`}
              onClick={handleEditClick}
              className="bg-surface-raised/90 backdrop-blur-sm"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </IconButton>
            <IconButton
              size="sm"
              variant="secondary"
              aria-label={physicalItem.archived ? `Unarchive ${physicalItem.name}` : `Archive ${physicalItem.name}`}
              onClick={handleArchiveClick}
              className={
                physicalItem.archived
                  ? 'bg-amber-600/90 text-white hover:bg-amber-700 backdrop-blur-sm'
                  : 'bg-surface-raised/90 backdrop-blur-sm'
              }
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
            </IconButton>
          </div>
        )}

        {/* Format Badges */}
        {showFormatBadges && (
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {physicalItem.archived && (
              <span className="rounded bg-amber-600/95 px-2 py-1 text-xs font-semibold text-white shadow-sm">
                Archived
              </span>
            )}
            {physicalItem.physical_format.map((format, idx) => (
              <span key={idx} className={`${getFormatColor(format)} rounded px-2 py-1 text-xs font-medium shadow-sm`}>
                {format}
              </span>
            ))}
          </div>
        )}
        {!showFormatBadges && physicalItem.archived && (
          <div className="absolute left-2 top-2">
            <span className="rounded bg-amber-600/95 px-2 py-1 text-xs font-semibold text-white shadow-sm">
              Archived
            </span>
          </div>
        )}

        {/* Multi-item indicator */}
        {physicalItem.media.length > 1 && (
          <div className="absolute bottom-2 left-2">
            <span className="rounded bg-black/75 px-2 py-1 text-xs font-medium text-white">
              {(() => {
                const tvCount = physicalItem.media.filter((m) => m.media_type === 'tv_season').length;
                const movieCount = physicalItem.media.length - tvCount;
                if (tvCount > 0 && movieCount === 0) return `${tvCount} season${tvCount !== 1 ? 's' : ''}`;
                if (movieCount > 0 && tvCount === 0) return `${movieCount} movie${movieCount !== 1 ? 's' : ''}`;
                return `${physicalItem.media.length} items`;
              })()}
            </span>
          </div>
        )}

        {/* TV type badge */}
        {primaryMedia?.media_type === 'tv_season' && (
          <div className="absolute bottom-2 right-2">
            <span className="rounded bg-purple-600/90 px-1.5 py-0.5 text-xs font-medium text-white">TV</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col justify-between p-3 sm:p-4">
        <h3
          title={physicalItem.name}
          className="line-clamp-2 min-h-[2.5rem] font-semibold leading-5 text-content"
        >
          {physicalItem.name}
        </h3>
        <p
          title={metadataText || undefined}
          className="mt-1 h-4 truncate text-xs leading-4 text-content-muted"
        >
          {metadataText}
        </p>
      </div>

      {/* Archive Reason Prompt Modal */}
      <Sheet
        isOpen={showArchiveModal}
        onClose={() => !isArchiving && setShowArchiveModal(false)}
        title="Archive Physical Item"
        description={`Why is "${physicalItem.name}" being archived?`}
        position="center"
        size="sm"
      >
        <form onSubmit={handleArchiveSubmit} onClick={(e) => e.stopPropagation()} className="space-y-4">
          <div>
            <label htmlFor={`archive-reason-${physicalItem.id}`} className="mb-1 block text-sm font-medium text-content">
              Archive Reason *
            </label>
            <input
              id={`archive-reason-${physicalItem.id}`}
              type="text"
              required
              maxLength={500}
              placeholder="e.g., Given away, sold, trashed"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              className="w-full rounded-[--radius-control] border border-subtle bg-surface px-3 py-2 text-sm text-content placeholder-content-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            <p className="mt-1 text-xs text-content-muted">
              Archived items are removed from shelves and hidden from the main collection unless the Archived filter is selected.
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={isArchiving}
              onClick={() => setShowArchiveModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isArchiving || !archiveReason.trim()}
              isLoading={isArchiving}
            >
              Archive Item
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
};

export default MediaCard;
