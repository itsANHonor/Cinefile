import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PhysicalLibrary, ShelfPhoto } from '../../types';
import { apiService } from '../../services/api.service';
import { useToast } from '../../context/ToastContext';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import FramedImage from '../FramedImage';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

interface ShelfPhotoGalleryModalProps {
  isOpen: boolean;
  library: PhysicalLibrary | null;
  readOnly?: boolean;
  /** When set, opens the gallery pre-filtered to this group id. `0` = Full Setup (no group). */
  initialGroupId?: number | null;
  onClose: () => void;
  /** Scroll the virtual shelf view to the given group after closing. */
  onJumpToGroup?: (groupId: number) => void;
}

interface SortablePhotoCardProps {
  photo: ShelfPhoto;
  groupName: string | null;
  readOnly: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

const SortablePhotoCard: React.FC<SortablePhotoCardProps> = ({
  photo,
  groupName,
  readOnly,
  onOpen,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
    disabled: readOnly,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative overflow-hidden rounded-[--radius-card] border border-subtle bg-surface-raised ${
        isDragging ? 'z-10 opacity-60 shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={photo.caption ? `Open photo: ${photo.caption}` : 'Open shelf photo'}
      >
        <FramedImage
          src={photo.image_url}
          frame={photo.frame}
          alt={photo.caption || 'Shelf photo'}
          className="h-full w-full"
          draggable={false}
        />
      </button>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <p className="min-w-0 flex-1 truncate text-xs text-content-muted">
          {photo.caption || <span className="italic">No caption</span>}
        </p>
        {groupName && (
          <span className="flex-shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-content-muted">
            {groupName}
          </span>
        )}
      </div>
      {!readOnly && (
        <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <span
            {...attributes}
            {...listeners}
            title="Drag to reorder"
            className="flex h-7 w-7 cursor-grab items-center justify-center rounded-full bg-black/60 text-white active:cursor-grabbing"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
            </svg>
          </span>
          <button
            type="button"
            title="Delete photo"
            aria-label="Delete photo"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

const ShelfPhotoGalleryModal: React.FC<ShelfPhotoGalleryModalProps> = ({
  isOpen,
  library,
  readOnly = false,
  initialGroupId,
  onClose,
  onJumpToGroup,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<ShelfPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterGroupId, setFilterGroupId] = useState<number | null | 'all'>('all');
  const [uploadGroupId, setUploadGroupId] = useState<number | null>(null);
  const [uploadCaption, setUploadCaption] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');

  const groups = useMemo(() => library?.groups ?? [], [library]);

  const groupName = useCallback(
    (groupId: number | null | undefined): string | null => {
      if (groupId == null) return 'Full Setup';
      return groups.find((g) => g.id === groupId)?.display_name || groups.find((g) => g.id === groupId)?.name || null;
    },
    [groups]
  );

  // Load photos
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    apiService
      .getShelfPhotos()
      .then((data) => setPhotos([...data].sort((a, b) => a.sort_order - b.sort_order)))
      .catch(() => toast({ message: 'Could not load shelf photos.', type: 'error' }))
      .finally(() => setIsLoading(false));
  }, [isOpen, toast]);

  // Apply incoming group filter when opened
  useEffect(() => {
    if (!isOpen) return;
    if (initialGroupId === 0) {
      setFilterGroupId(null);
    } else if (initialGroupId != null) {
      setFilterGroupId(initialGroupId);
      setUploadGroupId(initialGroupId);
    } else {
      setFilterGroupId('all');
    }
    setLightboxIndex(null);
  }, [isOpen, initialGroupId]);

  const filteredPhotos = useMemo(() => {
    if (filterGroupId === 'all') return photos;
    return photos.filter((p) => p.group_id === filterGroupId);
  }, [photos, filterGroupId]);

  const lightboxPhoto = lightboxIndex != null ? filteredPhotos[lightboxIndex] : null;

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIndex == null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
      else if (e.key === 'ArrowRight')
        setLightboxIndex((i) => (i == null ? i : Math.min(filteredPhotos.length - 1, i + 1)));
      else if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i == null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIndex, filteredPhotos.length]);

  // Keep the caption draft synced to the open lightbox photo
  useEffect(() => {
    setCaptionDraft(lightboxPhoto?.caption ?? '');
  }, [lightboxPhoto?.id, lightboxPhoto?.caption]);

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const invalid = list.find((f) => !ALLOWED_TYPES.includes(f.type) || f.size > MAX_FILE_SIZE);
    if (invalid) {
      toast({
        message: `"${invalid.name}" isn't a supported image (JPEG/PNG/GIF/WebP, max 10MB).`,
        type: 'error',
      });
      return;
    }
    setIsUploading(true);
    try {
      for (const file of list) {
        const created = await apiService.uploadShelfPhoto(file, {
          group_id: uploadGroupId,
          caption: uploadCaption || undefined,
        });
        setPhotos((prev) => [...prev, created]);
      }
      setUploadCaption('');
      toast({ message: `${list.length} photo${list.length === 1 ? '' : 's'} added to the gallery.`, type: 'success' });
    } catch {
      toast({ message: 'Photo upload failed.', type: 'error' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = photos.map((p) => p.id);
    const oldIndex = ids.indexOf(active.id as number);
    const newIndex = ids.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(photos, oldIndex, newIndex).map((p, idx) => ({
      ...p,
      sort_order: idx,
    }));
    setPhotos(reordered);
    try {
      await apiService.reorderShelfPhotos(reordered.map((p) => ({ id: p.id, sort_order: p.sort_order })));
    } catch {
      toast({ message: 'Could not save photo order.', type: 'error' });
    }
  };

  const handleDelete = async (photo: ShelfPhoto) => {
    try {
      await apiService.deleteShelfPhoto(photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      if (lightboxIndex != null && lightboxPhoto?.id === photo.id) setLightboxIndex(null);
      toast({ message: 'Photo removed.', type: 'success' });
    } catch {
      toast({ message: 'Could not delete photo.', type: 'error' });
    }
  };

  const handleSaveCaption = async () => {
    if (!lightboxPhoto) return;
    try {
      const updated = await apiService.updateShelfPhoto(lightboxPhoto.id, {
        caption: captionDraft.trim() || null,
      });
      setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch {
      toast({ message: 'Could not save caption.', type: 'error' });
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={`Shelf Photos${photos.length > 0 ? ` (${photos.length})` : ''}`}
      description="Show off the real shelves behind your collection."
      position="center"
      size="lg"
      className="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterGroupId('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterGroupId === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-surface-sunken text-content-muted hover:text-content'
            }`}
          >
            All ({photos.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterGroupId(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterGroupId === null
                ? 'bg-primary-600 text-white'
                : 'bg-surface-sunken text-content-muted hover:text-content'
            }`}
          >
            Full Setup ({photos.filter((p) => p.group_id == null).length})
          </button>
          {groups.map((g) => {
            const count = photos.filter((p) => p.group_id === g.id).length;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setFilterGroupId(g.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filterGroupId === g.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface-sunken text-content-muted hover:text-content'
                }`}
              >
                {g.display_name || g.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Upload zone */}
        {!readOnly && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              uploadFiles(e.dataTransfer.files);
            }}
            className={`rounded-[--radius-card] border-2 border-dashed p-4 transition-colors ${
              isDraggingOver
                ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                : 'border-subtle bg-surface-sunken/50'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-content">
                  {isDraggingOver ? 'Drop photos here…' : 'Drag & drop photos here'}
                </p>
                <p className="mt-0.5 text-xs text-content-muted">JPEG, PNG, GIF or WebP · max 10MB each</p>
              </div>
              <select
                value={uploadGroupId ?? ''}
                onChange={(e) => setUploadGroupId(e.target.value === '' ? null : Number(e.target.value))}
                className="rounded-[--radius-control] border border-subtle bg-surface px-2 py-1.5 text-sm text-content focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label="Tag uploaded photos to a shelf group"
              >
                <option value="">Full Setup</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.display_name || g.name}
                  </option>
                ))}
              </select>
              <input
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
                placeholder="Caption (optional)"
                className="w-40 rounded-[--radius-control] border border-subtle bg-surface px-2 py-1.5 text-sm text-content placeholder:text-content-muted focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button
                size="sm"
                variant="secondary"
                isLoading={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose photos
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_TYPES.join(',')}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadFiles(e.target.files);
                }}
              />
            </div>
          </div>
        )}

        {/* Photo grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="rounded-[--radius-card] border border-subtle bg-surface-sunken/40 py-10 text-center">
            <p className="text-sm font-medium text-content">No photos yet</p>
            <p className="mt-1 text-xs text-content-muted">
              {readOnly
                ? 'No shelf photos have been shared for this collection.'
                : 'Upload a shot of your physical shelves to show off your setup.'}
            </p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {filteredPhotos.map((photo, idx) => (
                  <SortablePhotoCard
                    key={photo.id}
                    photo={photo}
                    groupName={groupName(photo.group_id)}
                    readOnly={readOnly}
                    onOpen={() => setLightboxIndex(idx)}
                    onDelete={() => handleDelete(photo)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-black/90"
          role="dialog"
          aria-modal="true"
          aria-label="Shelf photo viewer"
          onClick={() => setLightboxIndex(null)}
        >
          <div className="flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <p className="truncate text-sm font-medium text-white/90">
              {groupName(lightboxPhoto.group_id) || 'Shelf photo'}
              <span className="ml-2 text-white/50">
                {lightboxIndex! + 1} / {filteredPhotos.length}
              </span>
            </p>
            <div className="flex items-center gap-1">
              {onJumpToGroup && lightboxPhoto.group_id != null && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onJumpToGroup(lightboxPhoto.group_id!);
                    setLightboxIndex(null);
                    onClose();
                  }}
                >
                  Jump to Virtual Shelf →
                </Button>
              )}
              <IconButton
                aria-label="Close photo viewer"
                onClick={() => setLightboxIndex(null)}
                className="text-white hover:bg-white/10"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </IconButton>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-14" onClick={(e) => e.stopPropagation()}>
            <IconButton
              aria-label="Previous photo"
              disabled={lightboxIndex === 0}
              onClick={() => setLightboxIndex((i) => Math.max(0, (i ?? 0) - 1))}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 disabled:opacity-30"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </IconButton>
            <FramedImage
              src={lightboxPhoto.image_url}
              frame={lightboxPhoto.frame}
              alt={lightboxPhoto.caption || 'Shelf photo'}
              ambientBackdrop={false}
              className="max-h-full max-w-full object-contain"
              draggable={false}
            />
            <IconButton
              aria-label="Next photo"
              disabled={lightboxIndex === filteredPhotos.length - 1}
              onClick={() => setLightboxIndex((i) => Math.min(filteredPhotos.length - 1, (i ?? 0) + 1))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white hover:bg-white/10 disabled:opacity-30"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </IconButton>
          </div>

          <div className="px-4 pb-4" onClick={(e) => e.stopPropagation()}>
            {readOnly ? (
              lightboxPhoto.caption && (
                <p className="mx-auto max-w-2xl text-center text-sm text-white/80">{lightboxPhoto.caption}</p>
              )
            ) : (
              <div className="mx-auto flex max-w-2xl items-center gap-2">
                <input
                  value={captionDraft}
                  onChange={(e) => setCaptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.stopPropagation();
                      handleSaveCaption();
                    }
                  }}
                  placeholder="Add a caption…"
                  className="min-w-0 flex-1 rounded-[--radius-control] border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
                />
                <Button size="sm" variant="secondary" onClick={handleSaveCaption}>
                  Save caption
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
};

export default ShelfPhotoGalleryModal;
