import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarcodeLookupJob,
  BarcodeOwnedMatch,
  BarcodeQuotaStatus,
  BulkMediaItemDto,
  BulkPhysicalItemDto,
  BulkCreatePhysicalItemsResponse,
} from '../types';
import { apiService } from '../services/api.service';
import { useToast } from '../context/ToastContext';
import { useFacets, resetFacetsCache } from '../hooks/useFacets';
import { detectBarcode } from '../lib/identifiers';
import { PHYSICAL_FORMATS } from '../lib/formats';
import { decodeBarcodesFromFile, parseManualBarcodeInput } from '../lib/barcodeDecoder';
import BarcodeCameraScanner from './BarcodeCameraScanner';
import BarcodeReviewCard, {
  BarcodeReviewDraft,
  createInitialReviewDraft,
} from './BarcodeReviewCard';
import { Button } from './ui/Button';
import { SegmentedControl } from './ui/SegmentedControl';
import { Spinner } from './ui/Spinner';
import { lockBodyScroll } from './ui/Sheet';

export interface BarcodeScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type InputTab = 'photos' | 'camera' | 'manual';
type ModalStage = 'capture' | 'lookup' | 'review' | 'results';

interface QueuedBarcode {
  code: string;
  source: string;
  format?: string;
}

interface UnreadablePhoto {
  id: string;
  fileName: string;
  previewUrl: string;
  manualInput: string;
}

function isDraftImportable(draft: BarcodeReviewDraft): boolean {
  if (!draft.include) return false;
  if (!draft.itemName.trim() || draft.formats.length === 0) return false;
  if (draft.mode === 'movie') {
    return draft.movieCandidates.some((m) => m.id === draft.selectedMovieId);
  }
  if (draft.mode === 'boxset') {
    return draft.boxSetMovies.length > 0;
  }
  if (draft.mode === 'tv') {
    const show = draft.tvCandidates.find((t) => t.id === draft.selectedTVId);
    return Boolean(show && draft.selectedSeasonNumbers.length > 0);
  }
  return false;
}

function draftToBulkDto(draft: BarcodeReviewDraft): BulkPhysicalItemDto | null {
  if (!isDraftImportable(draft)) return null;

  let media: BulkMediaItemDto | BulkMediaItemDto[];

  if (draft.mode === 'movie') {
    const movie = draft.movieCandidates.find((m) => m.id === draft.selectedMovieId);
    if (!movie) return null;
    media = {
      title: movie.title,
      original_title: movie.original_title || undefined,
      original_language: movie.original_language || undefined,
      tmdb_id: movie.id,
      synopsis: movie.overview,
      cover_art_url: movie.poster_url || undefined,
      release_date: movie.release_date,
      director: movie.director || undefined,
      cast: movie.cast || undefined,
      genres: movie.genres || undefined,
      media_type: 'movie',
    };
  } else if (draft.mode === 'boxset') {
    media = draft.boxSetMovies.map((movie) => ({
      title: movie.title,
      original_title: movie.original_title || undefined,
      original_language: movie.original_language || undefined,
      tmdb_id: movie.id,
      synopsis: movie.overview,
      cover_art_url: movie.poster_url || undefined,
      release_date: movie.release_date,
      director: movie.director || undefined,
      cast: movie.cast || undefined,
      genres: movie.genres || undefined,
      media_type: 'movie',
      formats: draft.formats,
    }));
  } else {
    const show = draft.tvCandidates.find((t) => t.id === draft.selectedTVId);
    if (!show) return null;
    media = draft.selectedSeasonNumbers
      .map((seasonNum) => {
        const season = show.seasons.find((s) => s.season_number === seasonNum);
        if (!season) return null;
        return {
          title:
            season.season_number === 0
              ? `${show.name} - Specials`
              : `${show.name} - Season ${season.season_number}`,
          original_title: show.original_name || undefined,
          original_language: show.original_language || undefined,
          tmdb_id: season.id,
          synopsis: season.overview || show.overview,
          cover_art_url: season.poster_url || show.poster_url || undefined,
          release_date: season.air_date || show.first_air_date,
          director: show.creators || undefined,
          cast: show.cast || undefined,
          genres: show.genres || undefined,
          media_type: 'tv_season' as const,
          tv_show_tmdb_id: show.id,
          tv_show_name: show.name,
          season_number: season.season_number,
          episode_count: season.episode_count,
          formats: draft.formats,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (media.length === 0) return null;
  }

  return {
    name: draft.itemName.trim(),
    physical_format: draft.formats,
    edition_notes: draft.editionNotes.trim() || undefined,
    barcode: draft.barcode,
    asin: draft.asin.trim() || undefined,
    media,
  };
}

const BarcodeScanModal: React.FC<BarcodeScanModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  const { facets } = useFacets();
  const availableEditions = useMemo(() => facets?.editions ?? [], [facets]);

  const [stage, setStage] = useState<ModalStage>('capture');
  const [inputTab, setInputTab] = useState<InputTab>('photos');

  // Capture stage state
  const [queuedBarcodes, setQueuedBarcodes] = useState<QueuedBarcode[]>([]);
  const [ownedMap, setOwnedMap] = useState<Record<string, BarcodeOwnedMatch[]>>({});
  const [unreadablePhotos, setUnreadablePhotos] = useState<UnreadablePhoto[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [decodingProgress, setDecodingProgress] = useState<{ current: number; total: number } | null>(null);
  const [singleManualInput, setSingleManualInput] = useState('');
  const [batchManualInput, setBatchManualInput] = useState('');
  const [quota, setQuota] = useState<BarcodeQuotaStatus | null>(null);

  // Lookup job stage state
  const [activeJob, setActiveJob] = useState<BarcodeLookupJob | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const unreadableUrlsRef = useRef<string[]>([]);

  // Review & import stage state
  const [drafts, setDrafts] = useState<Map<string, BarcodeReviewDraft>>(new Map());
  const [bulkFormat, setBulkFormat] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<BulkCreatePhysicalItemsResponse | null>(null);

  // Lock body scroll & handle Escape
  useEffect(() => {
    if (!isOpen) return;
    const unlock = lockBodyScroll(true);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isImporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      unlock();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, isImporting, onClose]);

  // Fetch quota status on open
  useEffect(() => {
    if (!isOpen) return;
    apiService
      .getBarcodeQuota()
      .then((q) => setQuota(q))
      .catch(() => {
        // Non-fatal
      });
  }, [isOpen]);

  // Clean up preview Object URLs and polling timer on unmount / close
  const revokeUnreadableUrls = useCallback(() => {
    if (typeof URL.revokeObjectURL === 'function') {
      unreadableUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    }
    unreadableUrlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
      revokeUnreadableUrls();
    };
  }, [revokeUnreadableUrls]);

  const checkedOwnedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unchecked = queuedBarcodes
      .map((q) => q.code)
      .filter((code) => !checkedOwnedRef.current.has(code));
    if (unchecked.length === 0) return;

    unchecked.forEach((code) => checkedOwnedRef.current.add(code));
    apiService
      .checkOwnedBarcodes(unchecked)
      .then((owned) => {
        if (owned && Object.keys(owned).length > 0) {
          setOwnedMap((prev) => ({ ...prev, ...owned }));
        }
      })
      .catch(() => {
        // Non-fatal
      });
  }, [queuedBarcodes]);

  const addBarcodesToQueue = useCallback((incoming: QueuedBarcode[]) => {
    if (incoming.length === 0) return;
    setQueuedBarcodes((prev) => {
      const existing = new Set(prev.map((q) => q.code));
      const next = [...prev];
      for (const item of incoming) {
        const normalized = item.code.replace(/[\s-]+/g, '').trim();
        if (!normalized || existing.has(normalized)) continue;
        existing.add(normalized);
        next.push({ ...item, code: normalized });
      }
      return next;
    });
  }, []);

  const processPhotoFiles = useCallback(
    async (fileList: File[]) => {
      const images = fileList.filter(
        (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|heic)$/i.test(f.name)
      );
      if (images.length === 0) {
        toast({ message: 'Please select image files containing barcodes.', type: 'warning' });
        return;
      }

      setDecodingProgress({ current: 0, total: images.length });
      let totalFound = 0;
      const failedPhotos: UnreadablePhoto[] = [];

      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        setDecodingProgress({ current: i + 1, total: images.length });
        try {
          const decoded = await decodeBarcodesFromFile(file);
          if (decoded.length > 0) {
            totalFound += decoded.length;
            addBarcodesToQueue(
              decoded.map((d) => ({
                code: d.code,
                format: d.format,
                source: file.name || 'Photo',
              }))
            );
          } else {
            const previewUrl = URL.createObjectURL(file);
            unreadableUrlsRef.current.push(previewUrl);
            failedPhotos.push({
              id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
              fileName: file.name || `Photo ${i + 1}`,
              previewUrl,
              manualInput: '',
            });
          }
        } catch (err) {
          console.error(`Failed to decode ${file.name}:`, err);
          const previewUrl = URL.createObjectURL(file);
          unreadableUrlsRef.current.push(previewUrl);
          failedPhotos.push({
            id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
            fileName: file.name || `Photo ${i + 1}`,
            previewUrl,
            manualInput: '',
          });
        }
      }

      setDecodingProgress(null);

      if (failedPhotos.length > 0) {
        setUnreadablePhotos((prev) => [...prev, ...failedPhotos]);
      }

      if (totalFound > 0 && failedPhotos.length === 0) {
        toast({
          message: `Detected ${totalFound} ${totalFound === 1 ? 'barcode' : 'barcodes'} from ${images.length} ${images.length === 1 ? 'photo' : 'photos'}.`,
          type: 'success',
        });
      } else if (totalFound > 0 && failedPhotos.length > 0) {
        toast({
          message: `Detected ${totalFound} barcode(s); ${failedPhotos.length} photo(s) couldn't be read automatically.`,
          type: 'warning',
        });
      } else if (failedPhotos.length > 0) {
        toast({
          message: 'No barcode detected in the selected photo(s). You can type the digits next to the thumbnail.',
          type: 'warning',
        });
      }
    },
    [addBarcodesToQueue, toast]
  );

  // Clipboard paste support on Photos tab
  useEffect(() => {
    if (!isOpen || stage !== 'capture' || inputTab !== 'photos') return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        void processPhotoFiles(files);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, stage, inputTab, processPhotoFiles]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length > 0) {
      void processPhotoFiles(files);
    }
  };

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFiles(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      void processPhotoFiles(files);
    }
  };

  const handleCameraDetected = useCallback(
    (code: string) => {
      addBarcodesToQueue([{ code, source: 'Camera' }]);
    },
    [addBarcodesToQueue]
  );

  const handleSingleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const codes = parseManualBarcodeInput(singleManualInput);
    if (codes.length === 0) {
      toast({ message: 'Enter a valid numeric UPC or EAN barcode.', type: 'warning' });
      return;
    }
    addBarcodesToQueue(codes.map((code) => ({ code, source: 'Manual / Scanner' })));
    setSingleManualInput('');
  };

  const handleBatchManualAdd = () => {
    const codes = parseManualBarcodeInput(batchManualInput);
    if (codes.length === 0) {
      toast({ message: 'No valid numeric barcodes found in text.', type: 'warning' });
      return;
    }
    addBarcodesToQueue(codes.map((code) => ({ code, source: 'Manual list' })));
    setBatchManualInput('');
  };

  const handleResolveUnreadable = (photoId: string) => {
    const photo = unreadablePhotos.find((p) => p.id === photoId);
    if (!photo) return;
    const codes = parseManualBarcodeInput(photo.manualInput);
    if (codes.length === 0) {
      toast({ message: 'Enter a valid numeric barcode (6–14 digits).', type: 'warning' });
      return;
    }
    addBarcodesToQueue(codes.map((code) => ({ code, source: photo.fileName })));
    URL.revokeObjectURL(photo.previewUrl);
    setUnreadablePhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const handleDismissUnreadable = (photoId: string) => {
    const photo = unreadablePhotos.find((p) => p.id === photoId);
    if (photo) {
      URL.revokeObjectURL(photo.previewUrl);
    }
    setUnreadablePhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const handleRemoveQueued = (code: string) => {
    setQueuedBarcodes((prev) => prev.filter((q) => q.code !== code));
  };

  const enterReviewStage = useCallback((job: BarcodeLookupJob) => {
    const nextDrafts = new Map<string, BarcodeReviewDraft>();
    for (const item of job.items) {
      nextDrafts.set(item.barcode, createInitialReviewDraft(item));
    }
    setDrafts(nextDrafts);
    setActiveJob(job);
    setQuota(job.quota);
    setStage('review');
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const handleStartLookup = async () => {
    if (queuedBarcodes.length === 0) return;

    try {
      const codes = queuedBarcodes.map((q) => q.code);
      const job = await apiService.startBarcodeLookupJob(codes);
      setActiveJob(job);
      setQuota(job.quota);

      if (job.status !== 'running') {
        enterReviewStage(job);
        return;
      }

      setStage('lookup');
      stopPolling();

      pollTimerRef.current = window.setInterval(async () => {
        try {
          const latest = await apiService.getBarcodeLookupJob(job.jobId);
          setActiveJob(latest);
          setQuota(latest.quota);

          if (latest.status !== 'running') {
            stopPolling();
            if (latest.status === 'failed') {
              toast({
                message: latest.error || 'Barcode lookup failed.',
                type: 'error',
              });
              setStage('capture');
            } else {
              enterReviewStage(latest);
            }
          }
        } catch (err) {
          console.error('Polling barcode job failed:', err);
          stopPolling();
          toast({ message: 'Lost connection while looking up barcodes.', type: 'error' });
          setStage('capture');
        }
      }, 1200);
    } catch (err: any) {
      console.error('Failed to start barcode lookup:', err);
      toast({
        message: err?.response?.data?.error || 'Failed to start barcode lookup.',
        type: 'error',
      });
    }
  };

  const handleCancelLookup = async () => {
    if (!activeJob) return;
    stopPolling();
    try {
      await apiService.cancelBarcodeLookupJob(activeJob.jobId);
      const latest = await apiService.getBarcodeLookupJob(activeJob.jobId);
      enterReviewStage(latest);
    } catch {
      enterReviewStage(activeJob);
    }
  };

  const handleDraftChange = (barcode: string, next: BarcodeReviewDraft) => {
    setDrafts((prev) => {
      const copy = new Map(prev);
      copy.set(barcode, next);
      return copy;
    });
  };

  const handleBulkFormatApply = () => {
    if (!bulkFormat) return;
    setDrafts((prev) => {
      const copy = new Map(prev);
      for (const [code, draft] of copy.entries()) {
        if (!draft.formats.includes(bulkFormat)) {
          copy.set(code, { ...draft, formats: [...draft.formats, bulkFormat] });
        }
      }
      return copy;
    });
    setBulkFormat('');
  };

  const importableDtos = useMemo(() => {
    const out: BulkPhysicalItemDto[] = [];
    for (const draft of drafts.values()) {
      const dto = draftToBulkDto(draft);
      if (dto) out.push(dto);
    }
    return out;
  }, [drafts]);

  const handleImport = async () => {
    if (importableDtos.length === 0) {
      toast({
        message: 'Select at least one matched item with a physical format to import.',
        type: 'warning',
      });
      return;
    }

    setIsImporting(true);
    try {
      const results = await apiService.bulkCreatePhysicalItems(importableDtos);
      setImportResults(results);
      setStage('results');

      if (results.summary.successful > 0) {
        resetFacetsCache();
        toast({
          message: `Added ${results.summary.successful} ${results.summary.successful === 1 ? 'item' : 'items'} to your collection.`,
          type: 'success',
        });
        onSuccess();
      }
    } catch (err: any) {
      console.error('Barcode bulk import failed:', err);
      toast({
        message: err?.response?.data?.error || 'Failed to import scanned items.',
        type: 'error',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    stopPolling();
    revokeUnreadableUrls();
    checkedOwnedRef.current.clear();
    setStage('capture');
    setQueuedBarcodes([]);
    setOwnedMap({});
    setUnreadablePhotos([]);
    setActiveJob(null);
    setDrafts(new Map());
    setImportResults(null);
    setBulkFormat('');
    setSingleManualInput('');
    setBatchManualInput('');
  };

  const handleRequestClose = () => {
    if (isImporting) return;
    if (stage === 'lookup' && activeJob) {
      void apiService.cancelBarcodeLookupJob(activeJob.jobId).catch(() => {});
      stopPolling();
    }
    onClose();
  };

  if (!isOpen) return null;

  const progressPct =
    activeJob && activeJob.total > 0
      ? Math.round((activeJob.completed / activeJob.total) * 100)
      : 0;

  const reviewItems = activeJob?.items || [];
  const resolvedCount = reviewItems.filter((i) => i.status === 'resolved').length;
  const unmatchedCount = reviewItems.length - resolvedCount;
  const ownedCount = reviewItems.filter((i) => i.ownedItems.length > 0).length;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleRequestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scan-modal-title"
        className="w-full max-w-4xl max-h-[92dvh] flex flex-col rounded-[--radius-card] border border-subtle bg-surface-raised shadow-[--shadow-card] overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-subtle bg-surface">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-[--radius-control] bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex-shrink-0">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5v14M7 5v14M11 5v14M15 5v14M17 5v14M21 5v14"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 id="barcode-scan-modal-title" className="text-lg font-semibold text-content truncate">
                Scan Barcodes
              </h2>
              <p className="text-xs text-content-muted">
                Upload 1 or many barcode photos, scan live with a camera, or enter UPC/EAN codes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {quota && (
              <span
                className="hidden sm:inline-flex items-center rounded-full border border-subtle bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-content-muted"
                title={`UPCitemdb ${quota.tier === 'paid' ? 'Paid' : 'Free'} tier (${quota.batchSize} barcodes per API request)`}
              >
                {quota.remaining !== null && quota.limit !== null
                  ? `${quota.remaining}/${quota.limit} daily API lookups left`
                  : quota.tier === 'paid'
                    ? 'UPCitemdb Paid'
                    : 'UPCitemdb Free (up to 200/day)'}
              </span>
            )}
            <button
              type="button"
              onClick={handleRequestClose}
              aria-label="Close barcode scanner"
              disabled={isImporting}
              className="rounded-[--radius-control] p-1.5 text-content-muted hover:bg-surface-sunken hover:text-content transition-colors"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* STAGE 1: CAPTURE */}
          {stage === 'capture' && (
            <>
              <div className="flex justify-center">
                <SegmentedControl
                  name="Barcode input method"
                  options={[
                    { value: 'photos', label: 'Photos (1 or Many)' },
                    { value: 'camera', label: 'Live Camera' },
                    { value: 'manual', label: 'Manual / USB Scanner' },
                  ]}
                  value={inputTab}
                  onChange={(v) => setInputTab(v as InputTab)}
                />
              </div>

              {/* Tab 1: Photos */}
              {inputTab === 'photos' && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFiles(true);
                    }}
                    onDragLeave={() => setIsDraggingFiles(false)}
                    onDrop={handleDropFiles}
                    className={`rounded-[--radius-card] border-2 border-dashed p-6 text-center transition-colors ${
                      isDraggingFiles
                        ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-900/20'
                        : 'border-subtle bg-surface-sunken/40 hover:border-primary-400/70'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileInputChange}
                      className="sr-only"
                      aria-label="Upload barcode photos"
                    />
                    {decodingProgress ? (
                      <div className="flex flex-col items-center gap-2 py-2">
                        <Spinner size="md" />
                        <p className="text-sm font-medium text-content">
                          Scanning photo {decodingProgress.current} of {decodingProgress.total}…
                        </p>
                        <p className="text-xs text-content-muted">
                          Barcodes are decoded locally in your browser — photos are never uploaded.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface border border-subtle text-content-muted">
                          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.8}
                              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.8}
                              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-content">
                            Drop 1 or many barcode photos here, or paste an image
                          </p>
                          <p className="text-xs text-content-muted">
                            Tip: You can photograph several cases side-by-side in a single shot — all visible UPC/EAN barcodes are detected locally.
                          </p>
                        </div>
                        <div>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            Choose Photos
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Unreadable Photos Recovery List */}
                  {unreadablePhotos.length > 0 && (
                    <div className="rounded-[--radius-card] border border-amber-200 dark:border-amber-800/70 bg-amber-50/50 dark:bg-amber-900/15 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                          Couldn&rsquo;t auto-read {unreadablePhotos.length}{' '}
                          {unreadablePhotos.length === 1 ? 'photo' : 'photos'} — enter digits manually or dismiss
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {unreadablePhotos.map((photo) => (
                          <div
                            key={photo.id}
                            className="flex flex-wrap sm:flex-nowrap items-center gap-3 rounded-[--radius-control] border border-subtle bg-surface p-2"
                          >
                            <img
                              src={photo.previewUrl}
                              alt={photo.fileName}
                              className="h-12 w-16 object-cover rounded border border-subtle flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-content truncate">
                                {photo.fileName}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={photo.manualInput}
                                  onChange={(e) =>
                                    setUnreadablePhotos((prev) =>
                                      prev.map((p) =>
                                        p.id === photo.id
                                          ? { ...p, manualInput: e.target.value }
                                          : p
                                      )
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleResolveUnreadable(photo.id);
                                    }
                                  }}
                                  placeholder="Type UPC/EAN digits…"
                                  className="flex-1 min-w-[140px] px-2.5 py-1 text-xs font-mono border border-subtle rounded-[--radius-control] bg-surface text-content"
                                />
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleResolveUnreadable(photo.id)}
                                >
                                  Add
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDismissUnreadable(photo.id)}
                                >
                                  Dismiss
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Live Camera */}
              {inputTab === 'camera' && (
                <BarcodeCameraScanner
                  onBarcodeDetected={handleCameraDetected}
                  onSwitchToPhotos={() => setInputTab('photos')}
                />
              )}

              {/* Tab 3: Manual / USB Scanner */}
              {inputTab === 'manual' && (
                <div className="space-y-4">
                  <form onSubmit={handleSingleManualSubmit} className="space-y-1.5">
                    <label
                      htmlFor="barcode-single-input"
                      className="block text-xs font-medium text-content"
                    >
                      Quick Scan / USB Barcode Scanner Input
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="barcode-single-input"
                        type="text"
                        inputMode="numeric"
                        value={singleManualInput}
                        onChange={(e) => setSingleManualInput(e.target.value)}
                        placeholder="Scan with USB/Bluetooth scanner or type UPC/EAN and press Enter…"
                        className="flex-1 px-3 py-2 text-sm font-mono border border-subtle rounded-[--radius-control] bg-surface text-content"
                      />
                      <Button type="submit" variant="secondary">
                        Add
                      </Button>
                    </div>
                  </form>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="barcode-batch-input"
                      className="block text-xs font-medium text-content"
                    >
                      Or paste multiple barcodes (one per line or comma-separated)
                    </label>
                    <textarea
                      id="barcode-batch-input"
                      rows={4}
                      value={batchManualInput}
                      onChange={(e) => setBatchManualInput(e.target.value)}
                      placeholder={'715515265812\n191329144657\n5027035018591'}
                      className="w-full px-3 py-2 text-sm font-mono border border-subtle rounded-[--radius-control] bg-surface text-content"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!batchManualInput.trim()}
                        onClick={handleBatchManualAdd}
                      >
                        Add List to Queue
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Shared Barcode Queue */}
              {queuedBarcodes.length > 0 && (
                <div className="rounded-[--radius-card] border border-subtle bg-surface p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-content">
                      Queued Barcodes ({queuedBarcodes.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setQueuedBarcodes([])}
                      className="text-xs text-content-muted hover:text-red-500"
                    >
                      Clear all
                    </button>
                  </div>

                  <ul className="divide-y divide-subtle max-h-56 overflow-y-auto">
                    {queuedBarcodes.map((item) => {
                      const info = detectBarcode(item.code);
                      const owned = ownedMap[item.code] || [];
                      return (
                        <li
                          key={item.code}
                          className="flex items-center justify-between gap-2 py-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="font-mono font-semibold text-content">
                              {item.code}
                            </span>
                            {info && info.type !== 'Barcode' && (
                              <span className="rounded bg-surface-sunken border border-subtle px-1.5 py-0.5 text-[10px] font-medium text-content-muted">
                                {info.type}
                              </span>
                            )}
                            {info?.checksumValid === false && (
                              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                                Check digit unusual
                              </span>
                            )}
                            {owned.length > 0 && (
                              <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                                Already owned ({owned[0].name})
                              </span>
                            )}
                            <span className="text-content-muted truncate">
                              · {item.source}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveQueued(item.code)}
                            aria-label={`Remove ${item.code}`}
                            className="rounded p-1 text-content-muted hover:bg-surface-sunken hover:text-red-500"
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* STAGE 2: PACED LOOKUP PROGRESS */}
          {stage === 'lookup' && activeJob && (
            <div className="py-8 max-w-lg mx-auto text-center space-y-5">
              <Spinner size="lg" className="mx-auto" />
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-content">
                  Looking up metadata ({activeJob.completed} of {activeJob.total})
                </h3>
                <p className="text-xs text-content-muted">
                  {activeJob.currentBarcode
                    ? `Currently resolving ${activeJob.currentBarcode}…`
                    : 'Finishing TMDb matching…'}
                </p>
              </div>

              <div className="w-full h-2.5 rounded-full bg-surface-sunken overflow-hidden border border-subtle">
                <div
                  className="h-full bg-primary-600 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="flex flex-wrap justify-center gap-3 text-xs text-content-muted">
                {activeJob.cachedCount > 0 && (
                  <span>{activeJob.cachedCount} instant from cache</span>
                )}
                {activeJob.uncachedCount > 0 && (
                  <span>
                    {activeJob.uncachedCount} via UPCitemdb
                    {activeJob.quota.tier === 'free' && activeJob.uncachedCount > 4
                      ? ' (paced for free-tier rate limits)'
                      : ''}
                  </span>
                )}
                {activeJob.quota.remaining !== null && activeJob.quota.limit !== null && (
                  <span>
                    · {activeJob.quota.remaining}/{activeJob.quota.limit} daily API lookups left
                  </span>
                )}
              </div>

              <div>
                <Button type="button" variant="secondary" size="sm" onClick={handleCancelLookup}>
                  Cancel &amp; Review Resolved So Far
                </Button>
              </div>
            </div>
          )}

          {/* STAGE 3: REVIEW & CUSTOMIZE */}
          {stage === 'review' && (
            <div className="space-y-4">
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-[--radius-control] bg-green-50 dark:bg-green-900/20 p-3">
                  <div className="text-xl font-bold text-green-600 dark:text-green-400">
                    {resolvedCount}
                  </div>
                  <div className="text-xs font-medium text-green-700 dark:text-green-300">
                    Resolved
                  </div>
                </div>
                <div className="rounded-[--radius-control] bg-amber-50 dark:bg-amber-900/20 p-3">
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                    {unmatchedCount}
                  </div>
                  <div className="text-xs font-medium text-amber-700 dark:text-amber-300">
                    Needs Manual Match
                  </div>
                </div>
                <div className="rounded-[--radius-control] bg-blue-50 dark:bg-blue-900/20 p-3">
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {ownedCount}
                  </div>
                  <div className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    Already Owned
                  </div>
                </div>
              </div>

              {/* Bulk format helper when > 1 item */}
              {reviewItems.length > 1 && (
                <div className="rounded-[--radius-control] border border-subtle bg-surface-sunken/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-medium text-content">
                    Apply a physical format to all {reviewItems.length} scanned items:
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Format to apply to all scanned items"
                      value={bulkFormat}
                      onChange={(e) => setBulkFormat(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-subtle rounded-[--radius-control] bg-surface text-content"
                    >
                      <option value="">Select format…</option>
                      {PHYSICAL_FORMATS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!bulkFormat}
                      onClick={handleBulkFormatApply}
                    >
                      Apply to All
                    </Button>
                  </div>
                </div>
              )}

              {/* Per-barcode review cards */}
              <div className="space-y-3">
                {reviewItems.map((item) => {
                  const draft = drafts.get(item.barcode);
                  if (!draft) return null;
                  return (
                    <BarcodeReviewCard
                      key={item.barcode}
                      result={item}
                      draft={draft}
                      availableEditions={availableEditions}
                      onChange={(next) => handleDraftChange(item.barcode, next)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* STAGE 4: IMPORT RESULTS */}
          {stage === 'results' && importResults && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-[--radius-control] bg-green-50 dark:bg-green-900/20 p-4">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {importResults.summary.successful}
                  </div>
                  <div className="text-xs font-medium text-green-700 dark:text-green-300">
                    Added
                  </div>
                </div>
                <div className="rounded-[--radius-control] bg-red-50 dark:bg-red-900/20 p-4">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {importResults.summary.failed}
                  </div>
                  <div className="text-xs font-medium text-red-700 dark:text-red-300">
                    Failed
                  </div>
                </div>
                <div className="rounded-[--radius-control] bg-blue-50 dark:bg-blue-900/20 p-4">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {importResults.summary.total}
                  </div>
                  <div className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    Total
                  </div>
                </div>
              </div>

              {importResults.failed.length > 0 && (
                <div className="rounded-[--radius-control] border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10 p-3">
                  <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                    Failed Imports
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-xs text-red-600 dark:text-red-400">
                    {importResults.failed.map((f, idx) => (
                      <li key={idx}>
                        <strong>{f.originalName}</strong>: {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-t border-subtle bg-surface">
          {stage === 'capture' && (
            <>
              <span className="text-xs text-content-muted">
                {queuedBarcodes.length === 0
                  ? 'Add 1 or more barcodes to continue.'
                  : queuedBarcodes.length > 4 && quota?.tier !== 'paid'
                    ? `${queuedBarcodes.length} barcodes ready · uncached lookups pace at ~12/min on free tier.`
                    : `${queuedBarcodes.length} ${queuedBarcodes.length === 1 ? 'barcode' : 'barcodes'} ready to look up.`}
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={handleRequestClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleStartLookup}
                  disabled={queuedBarcodes.length === 0 || Boolean(decodingProgress)}
                >
                  Look Up {queuedBarcodes.length || ''}{' '}
                  {queuedBarcodes.length === 1 ? 'Barcode' : 'Barcodes'}
                </Button>
              </div>
            </>
          )}

          {stage === 'lookup' && (
            <div className="w-full flex justify-end">
              <Button type="button" variant="ghost" onClick={handleCancelLookup}>
                Cancel
              </Button>
            </div>
          )}

          {stage === 'review' && (
            <>
              <Button type="button" variant="secondary" onClick={handleReset} disabled={isImporting}>
                Start Over
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={handleRequestClose} disabled={isImporting}>
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={handleImport}
                  isLoading={isImporting}
                  disabled={importableDtos.length === 0}
                >
                  Import {importableDtos.length}{' '}
                  {importableDtos.length === 1 ? 'Item' : 'Items'}
                </Button>
              </div>
            </>
          )}

          {stage === 'results' && (
            <>
              <Button type="button" variant="secondary" onClick={handleReset}>
                Scan More
              </Button>
              <Button type="button" onClick={handleRequestClose}>
                Done
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default BarcodeScanModal;
