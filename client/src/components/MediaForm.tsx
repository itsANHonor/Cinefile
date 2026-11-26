import React, { useState, useEffect, useRef } from 'react';
import { PhysicalItem, CustomImage, ImageFrame, TMDbMovie, Media, UnifiedSearchResult, Series, ManualMovieData, CoverCandidate, STANDARD_UNIT_MM } from '../types';
import { FRAME_MAX_ZOOM, FRAME_MIN_ZOOM, normalizeFrameForWrite, normalizeImageFrame } from '../lib/imageFrame';
import FramedImage from './FramedImage';
import { apiService } from '../services/api.service';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useFacets, resetFacetsCache } from '../hooks/useFacets';
import MediaSearchPanel from './MediaSearchPanel';
import StoreLinkManager from './StoreLinkManager';
import MediaEditModal from './MediaEditModal';
import FormatSelector from './FormatSelector';
import PosterSelector, { PosterMovieOption } from './PosterSelector';
import EditionTagInput from './EditionTagInput';
import { formatCoverSearchQuery, generatePhysicalItemName } from '../lib/tvNaming';
import { detectBarcode } from '../lib/identifiers';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';

interface MediaFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editItem?: PhysicalItem | null;
  onDelete?: (itemId: number) => Promise<void> | void;
}

interface MovieWithFormats {
  movie: TMDbMovie;
  formats: string[];
  details: any;
  mediaDbId?: number; // Track the actual database ID
  link_id?: number; // Junction table row ID for existing links (physical_item_media.id)
  version_notes?: string | null; // Per-link version/cut tags (e.g., Theatrical, Extended)
  isManual?: boolean;
  // TV-specific fields
  media_type?: 'movie' | 'tv_season';
  tv_show_tmdb_id?: number;
  tv_show_name?: string;
  tv_show_poster_url?: string;
  tv_show_total_seasons?: number;
  season_number?: number;
  episode_count?: number;
  genres?: { id: number; name: string }[];
}

const PHOTO_LABEL_PRESETS = ['Front', 'Back', 'Spine', 'Inside', 'Disc', 'Slipcover', 'Booklet'];

const FORM_TABS = [
  { id: 'details', label: 'Details' },
  { id: 'notes', label: 'Notes & Links' },
] as const;
type FormTabId = (typeof FORM_TABS)[number]['id'];

function serializeCustomImagesForSave(images: CustomImage[]): CustomImage[] {
  return images.map((img) => {
    const frame = normalizeFrameForWrite(img.frame);
    return {
      url: img.url,
      ...(img.label?.trim() ? { label: img.label.trim() } : {}),
      ...(frame ? { frame } : {}),
    };
  });
}

function normalizeInitialCustomImages(item?: PhysicalItem | null): CustomImage[] {
  if (!item) return [];
  if (Array.isArray(item.custom_images) && item.custom_images.length > 0) {
    return item.custom_images
      .filter((entry) => entry && typeof entry.url === 'string' && entry.url.trim() !== '')
      .map((entry) => ({
        url: entry.url.trim(),
        label: entry.label?.trim() || undefined,
        ...(entry.frame ? { frame: entry.frame } : {}),
      }));
  }
  if (item.custom_image_url && item.custom_image_url.trim() !== '') {
    return [{ url: item.custom_image_url.trim(), label: 'Front' }];
  }
  return [];
}

const MediaForm: React.FC<MediaFormProps> = ({ isOpen, onClose, onSuccess, editItem, onDelete }) => {
  console.log('🎬 MediaForm rendered:', { isOpen, editItemId: editItem?.id, editItemName: editItem?.name });
  
  const [showSearch, setShowSearch] = useState(false);
  const [showMediaEditModal, setShowMediaEditModal] = useState(false);
  const [editingMedia, setEditingMedia] = useState<Media | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedMovies, setSelectedMovies] = useState<MovieWithFormats[]>([]);
  const [movieDetails, setMovieDetails] = useState<Map<number, any>>(new Map());
  const [storeLinks, setStoreLinks] = useState<Array<{label: string; url: string}>>([]);
  const [showFormatSelector, setShowFormatSelector] = useState(false);
  const [editingFormatsIndex, setEditingFormatsIndex] = useState<number | null>(null);
  const [originalFormats, setOriginalFormats] = useState<string[]>([]);
  const [originalVersionNotes, setOriginalVersionNotes] = useState<string | null>(null);
  
  // Poster selection state
  const [showPosterSelector, setShowPosterSelector] = useState(false);
  const [customImages, setCustomImages] = useState<CustomImage[]>([]);
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(0);
  const [activeFormTab, setActiveFormTab] = useState<FormTabId>('details');
  const [isPanningCover, setIsPanningCover] = useState(false);
  const coverPanDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    rect: DOMRect;
  } | null>(null);
  const [showArchivePrompt, setShowArchivePrompt] = useState(false);
  const [archivePromptReason, setArchivePromptReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const confirm = useConfirm();
  const { facets } = useFacets();

  const [formData, setFormData] = useState({
    // Physical item fields
    name: '',
    sort_name: '',
    edition_notes: '',
    notes: '',
    notes_public: false,
    archived: false,
    archive_reason: '',
    custom_image_url: '',
    purchase_date: '',
    cost: '',
    barcode: '',
    asin: '',
    thickness_units: 1,
    width_mm: undefined as number | undefined,
    height_mm: undefined as number | undefined,
    depth_mm: undefined as number | undefined,
    media_primary_series_id: undefined as number | undefined, // Adds movies to series
    sort_series_id: undefined as number | undefined, // Used for sorting
  });
  const [showDimensions, setShowDimensions] = useState(false);
  const [availableSeries, setAvailableSeries] = useState<Series[]>([]);
  const hasSavedMediaChangesRef = useRef(false);

  const handleFormClose = () => {
    if (hasSavedMediaChangesRef.current) {
      hasSavedMediaChangesRef.current = false;
      resetFacetsCache();
      onSuccess();
    }
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      setShowSearch(false);
      setActiveFormTab('details');
      coverPanDragRef.current = null;
      setIsPanningCover(false);
      hasSavedMediaChangesRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    // Load available series
    const loadSeries = async () => {
      try {
        const series = await apiService.getSeries();
        setAvailableSeries(series);
      } catch (error) {
        console.error('Failed to load series:', error);
      }
    };
    loadSeries();
  }, []);

  useEffect(() => {
    if (editItem) {
      const initialPhotos = normalizeInitialCustomImages(editItem);
      setCustomImages(initialPhotos);
      setPreviewPhotoIndex(0);
      // Editing an existing physical item
      setFormData({
        // Physical item fields
        name: editItem.name,
        sort_name: editItem.sort_name || '',
        edition_notes: editItem.edition_notes || '',
        notes: editItem.notes || '',
        notes_public: editItem.notes_public || false,
        archived: Boolean(editItem.archived),
        archive_reason: editItem.archive_reason || '',
        custom_image_url: initialPhotos[0]?.url || editItem.custom_image_url || '',
        purchase_date: editItem.purchase_date || '',
        cost: editItem.cost != null ? String(editItem.cost) : '',
        barcode: editItem.barcode || '',
        asin: editItem.asin || '',
        thickness_units: editItem.thickness_units || 1,
        width_mm: editItem.width_mm,
        height_mm: editItem.height_mm,
        depth_mm: editItem.depth_mm,
        media_primary_series_id: undefined, // Don't pre-fill - this is an action, not stored state
        sort_series_id: editItem.sort_series_id || editItem.primary_series_id, // Fallback to legacy
      });
      
      // Auto-expand dimensions if any are set
      if (editItem.width_mm || editItem.height_mm || editItem.depth_mm) {
        setShowDimensions(true);
      }
      
      // Convert existing media to MovieWithFormats format for display
      const moviesWithFormats: MovieWithFormats[] = editItem.media.map(m => ({
        movie: {
          id: m.tmdb_id || m.id,
          title: m.title,
          original_title: m.original_title || undefined,
          original_language: m.original_language || undefined,
          overview: m.synopsis || '',
          poster_path: null, // We'll use cover_art_url directly
          release_date: m.release_date || '',
          vote_average: 0,
          vote_count: 0,
        },
        formats: m.formats || ['Blu-ray'],
        mediaDbId: m.id, // Preserve the actual media database ID
        link_id: m.link_id, // Preserve the junction row ID for per-link updates
        version_notes: m.version_notes || null,
        media_type: m.media_type,
        tv_show_tmdb_id: m.tv_show_tmdb_id,
        tv_show_name: m.tv_show_name,
        season_number: m.season_number,
        episode_count: m.episode_count,
        genres: m.genres,
        details: {
          title: m.title,
          original_title: m.original_title || undefined,
          original_language: m.original_language || undefined,
          id: m.tmdb_id || m.id,
          poster_url: m.cover_art_url,
          cover_art_url: m.cover_art_url,
          overview: m.synopsis,
          synopsis: m.synopsis,
          release_date: m.release_date,
          director: m.director,
          cast: m.cast,
        }
      }));
      setSelectedMovies(moviesWithFormats);
      
      // Load store links
      setStoreLinks(editItem.store_links || []);
      
      // Store full details for each movie
      const details = new Map();
      editItem.media.forEach(m => {
        details.set(m.tmdb_id || m.id, {
          title: m.title,
          id: m.tmdb_id || m.id,
          poster_url: m.cover_art_url,
          cover_art_url: m.cover_art_url,
          overview: m.synopsis,
          synopsis: m.synopsis,
          release_date: m.release_date,
          director: m.director,
          cast: m.cast,
        });
      });
      setMovieDetails(details);
    } else {
      // Reset form when not editing
      setFormData({
        name: '',
        sort_name: '',
        edition_notes: '',
        notes: '',
        notes_public: false,
        archived: false,
        archive_reason: '',
        custom_image_url: '',
        purchase_date: '',
        cost: '',
        barcode: '',
        asin: '',
        thickness_units: 1,
        width_mm: undefined,
        height_mm: undefined,
        depth_mm: undefined,
        media_primary_series_id: undefined,
        sort_series_id: undefined,
      });
      setShowDimensions(false);
      setCustomImages([]);
      setPreviewPhotoIndex(0);
      setSelectedMovies([]);
      setMovieDetails(new Map());
      setStoreLinks([]);
    }
  }, [editItem, isOpen]);

  const handleUnifiedSearchSelect = async (result: UnifiedSearchResult, formats: string[], versionNotes?: string) => {
    try {
      const normalizedVersionNotes = versionNotes?.trim() || null;
      if (result.source === 'database') {
        // Handle existing database movie
        const existingMedia = result.originalData as Media;
        
        // Add existing movie with formats to selection
        const newMovieWithFormats: MovieWithFormats = {
          movie: {
            id: existingMedia.tmdb_id || existingMedia.id,
            title: existingMedia.title,
            original_title: existingMedia.original_title || undefined,
            original_language: existingMedia.original_language || undefined,
            overview: existingMedia.synopsis || '',
            poster_path: null,
            release_date: existingMedia.release_date || '',
            vote_average: 0,
            vote_count: 0,
          },
          formats,
          mediaDbId: existingMedia.id, // Preserve the database ID for existing media
          version_notes: normalizedVersionNotes,
          isManual: !existingMedia.tmdb_id,
          media_type: existingMedia.media_type,
          tv_show_tmdb_id: existingMedia.tv_show_tmdb_id,
          tv_show_name: existingMedia.tv_show_name,
          season_number: existingMedia.season_number,
          episode_count: existingMedia.episode_count,
          genres: existingMedia.genres,
          details: {
            title: existingMedia.title,
            original_title: existingMedia.original_title || undefined,
            original_language: existingMedia.original_language || undefined,
            id: existingMedia.tmdb_id || existingMedia.id,
            poster_url: existingMedia.cover_art_url,
            cover_art_url: existingMedia.cover_art_url,
            overview: existingMedia.synopsis,
            synopsis: existingMedia.synopsis,
            release_date: existingMedia.release_date,
            director: existingMedia.director,
            cast: existingMedia.cast,
            genres: existingMedia.genres,
          }
        };
        
        console.log('📦 Added existing database media:', { id: existingMedia.id, title: existingMedia.title, formats });
        
        setSelectedMovies(prev => {
          const updated = [...prev, newMovieWithFormats];
          console.log('📦 Updated selectedMovies:', updated.map(m => ({ title: m.movie.title, mediaDbId: m.mediaDbId })));
          return updated;
        });
        
        // Auto-generate name if not manually set
        const allMovies = [...selectedMovies, newMovieWithFormats];
        const oldAutoName = updatePhysicalItemName(selectedMovies);
        const newAutoName = updatePhysicalItemName(allMovies);

        if (!formData.name || formData.name === oldAutoName) {
          setFormData({
            ...formData,
            name: newAutoName,
          });
        }
      } else if (result.source === 'manual') {
        const manualMovie = result.originalData as ManualMovieData;
        const manualMediaType = manualMovie.media_type || result.media_type || 'movie';
        const newMovieWithFormats: MovieWithFormats = {
          movie: {
            id: result.id,
            title: manualMovie.title,
            original_title: manualMovie.original_title || undefined,
            overview: manualMovie.synopsis,
            poster_path: null,
            release_date: manualMovie.release_date,
            vote_average: 0,
            vote_count: 0,
          },
          formats,
          version_notes: normalizedVersionNotes,
          isManual: true,
          media_type: manualMediaType,
          tv_show_name: manualMovie.tv_show_name,
          season_number: manualMovie.season_number,
          episode_count: manualMovie.episode_count,
          details: {
            title: manualMovie.title,
            original_title: manualMovie.original_title || undefined,
            synopsis: manualMovie.synopsis,
            overview: manualMovie.synopsis,
            director: manualMovie.director,
            release_date: manualMovie.release_date,
            cast: manualMovie.cast,
            poster_url: manualMovie.cover_art_url,
            cover_art_url: manualMovie.cover_art_url,
          },
        };

        setSelectedMovies(prev => [...prev, newMovieWithFormats]);
        const allMovies = [...selectedMovies, newMovieWithFormats];
        const oldAutoName = updatePhysicalItemName(selectedMovies);
        const newAutoName = updatePhysicalItemName(allMovies);
        if (!formData.name || formData.name === oldAutoName) {
          setFormData({ ...formData, name: newAutoName });
        }
      } else {
        // Handle TMDB movie (existing flow)
        const tmdbMovie = result.originalData as TMDbMovie;
        
        // Fetch details for the movie if not already cached
        let details = movieDetails.get(tmdbMovie.id);
        if (!details) {
          details = await apiService.getMovieDetails(tmdbMovie.id);
          setMovieDetails(prev => new Map(prev).set(tmdbMovie.id, details));
        }
        
        // Add movie with formats to selection
        const newMovieWithFormats: MovieWithFormats = {
          movie: tmdbMovie,
          formats,
          version_notes: normalizedVersionNotes,
          details,
          genres: details?.genres
        };
        
        console.log('🎬 Added TMDB movie:', { tmdb_id: tmdbMovie.id, title: tmdbMovie.title, formats });
        setSelectedMovies(prev => [...prev, newMovieWithFormats]);
        
        // Auto-generate name if not manually set
        const allMovies = [...selectedMovies, newMovieWithFormats];
        const oldAutoName = updatePhysicalItemName(selectedMovies);
        const newAutoName = updatePhysicalItemName(allMovies);

        if (!formData.name || formData.name === oldAutoName) {
          setFormData({
            ...formData,
            name: newAutoName,
          });
        }
      }
    } catch (error) {
      console.error('Failed to add movie:', error);
    } finally {
      setShowSearch(false);
    }
  };

  const handleTVSeasonsSelect = (seasons: any[], formats: string[]) => {
    const newEntries: MovieWithFormats[] = seasons.map(season => ({
      movie: {
        id: season.tmdb_id,
        title: season.title,
        original_title: season.original_title,
        original_language: season.original_language,
        overview: season.synopsis || '',
        poster_path: null,
        release_date: season.release_date || '',
        vote_average: 0,
        vote_count: 0,
      },
      formats,
      media_type: 'tv_season' as const,
      tv_show_tmdb_id: season.tv_show_tmdb_id,
      tv_show_name: season.tv_show_name,
      tv_show_poster_url: season.tv_show_poster_url,
      tv_show_total_seasons: season.tv_show_total_seasons,
      season_number: season.season_number,
      episode_count: season.episode_count,
      genres: season.genres,
      details: {
        title: season.title,
        original_title: season.original_title,
        original_language: season.original_language,
        id: season.tmdb_id,
        poster_url: season.cover_art_url,
        cover_art_url: season.cover_art_url,
        overview: season.synopsis,
        synopsis: season.synopsis,
        release_date: season.release_date,
        director: season.director,
        cast: season.cast,
      }
    }));

    const updatedMovies = [...selectedMovies, ...newEntries];
    setSelectedMovies(updatedMovies);

    // Auto-generate name and default multi-season TV sets to the main series poster
    const oldAutoName = updatePhysicalItemName(selectedMovies);
    const newAutoName = updatePhysicalItemName(updatedMovies);
    const shouldUpdateName = !formData.name || formData.name === oldAutoName;

    const tvEntries = updatedMovies.filter(m => m.media_type === 'tv_season');
    const distinctShowIds = new Set(
      tvEntries.map(m => m.tv_show_tmdb_id || m.tv_show_name).filter(Boolean)
    );
    const showPosterUrl =
      tvEntries.length > 1 && distinctShowIds.size === 1
        ? tvEntries.find(m => m.tv_show_poster_url)?.tv_show_poster_url
        : undefined;
    const shouldSetShowPoster = Boolean(!formData.custom_image_url && showPosterUrl);

    if (shouldUpdateName || shouldSetShowPoster) {
      setFormData({
        ...formData,
        ...(shouldUpdateName ? { name: newAutoName } : {}),
        ...(shouldSetShowPoster ? { custom_image_url: showPosterUrl! } : {}),
      });
    }
    setShowSearch(false);
  };

  const handleRemoveMovie = (index: number) => {
    const newMovies = selectedMovies.filter((_, i) => i !== index);
    const oldAutoName = updatePhysicalItemName(selectedMovies); // Compare to OLD
    const newAutoName = updatePhysicalItemName(newMovies);
    
    setSelectedMovies(newMovies);
    
    // Update name if it was auto-generated
    if (!formData.name || formData.name === oldAutoName) {
      setFormData({
        ...formData,
        name: newAutoName,
      });
    }
  };

  const handleRemoveMovieFromPhysicalItem = async (index: number) => {
    const movieWithFormats = selectedMovies[index];
    if (!movieWithFormats) return;

    // Entries without a link_id were never persisted - just remove locally
    if (!editItem || !movieWithFormats.link_id) {
      handleRemoveMovie(index);
      return;
    }
    
    // Editing existing item - call API
    const confirmed = await confirm({
      title: 'Remove movie link',
      message: `Remove "${movieWithFormats.movie.title}" from this physical item?\n\nThe movie will remain in your database but won't be linked to this item.`,
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      await apiService.removeMediaLink(editItem.id, movieWithFormats.mediaDbId!, movieWithFormats.link_id);
      setSelectedMovies(prev => prev.filter((_, i) => i !== index));
      toast({ message: 'Movie removed from physical item.', type: 'success' });
    } catch (error) {
      toast({ message: 'Failed to remove movie. Please try again.', type: 'error' });
    }
  };

  const handleEditMovie = async (movieWithFormats: MovieWithFormats) => {
    if (!movieWithFormats.mediaDbId) {
      toast({ message: 'Cannot edit: Movie not yet saved to database', type: 'warning' });
      return;
    }
    
    // Fetch full media data including series
    try {
      const fullMedia = await apiService.getMediaById(movieWithFormats.mediaDbId);
      setEditingMedia(fullMedia);
      setShowMediaEditModal(true);
    } catch (error) {
      console.error('Failed to load media:', error);
      // Fallback to basic media object if fetch fails
      const media: Media = {
        id: movieWithFormats.mediaDbId,
        title: movieWithFormats.details.title,
        tmdb_id: movieWithFormats.details.id,
        synopsis: movieWithFormats.details.synopsis,
        cover_art_url: movieWithFormats.details.cover_art_url,
        release_date: movieWithFormats.details.release_date,
        director: movieWithFormats.details.director,
        cast: movieWithFormats.details.cast,
        series: [], // Fallback: no series data
      };
      setEditingMedia(media);
      setShowMediaEditModal(true);
    }
  };

  const handleEditFormats = (index: number) => {
    const movie = selectedMovies[index];
    if (movie) {
      setOriginalFormats([...movie.formats]);
      setOriginalVersionNotes(movie.version_notes ?? null);
      setEditingFormatsIndex(index);
      setShowFormatSelector(true);
    }
  };

  const handleFormatsUpdated = async (formats: string[], versionNotes?: string) => {
    if (editingFormatsIndex === null) return;
    
    const index = editingFormatsIndex;
    const movieWithFormats = selectedMovies[index];
    const nextVersionNotes = versionNotes?.trim() || null;
    
    // Update local state immediately for UI responsiveness
    setSelectedMovies(prev => 
      prev.map((movie, i) => 
        i === index 
          ? { ...movie, formats, version_notes: nextVersionNotes }
          : movie
      )
    );
    
    // If editing an existing persisted link, update the backend immediately
    if (editItem && movieWithFormats?.mediaDbId && movieWithFormats?.link_id) {
      try {
        await apiService.updateMovieFormats(
          editItem.id,
          movieWithFormats.mediaDbId,
          formats,
          nextVersionNotes,
          movieWithFormats.link_id
        );
      } catch (error) {
        console.error('Failed to update movie formats:', error);
        toast({ message: 'Failed to update movie formats. Please try again.', type: 'error' });
        // Revert the local state change on error
        setSelectedMovies(prev => 
          prev.map((movie, i) => 
            i === index 
              ? { ...movie, formats: originalFormats, version_notes: originalVersionNotes }
              : movie
          )
        );
      }
    }
    
    setShowFormatSelector(false);
    setEditingFormatsIndex(null);
    setOriginalFormats([]);
    setOriginalVersionNotes(null);
  };

  const handleSelectPosterClick = () => {
    if (selectedMovies.length === 0) {
      toast({ message: 'Please select a movie first to choose cover art.', type: 'warning' });
      return;
    }

    setShowPosterSelector(true);
  };

  const syncCustomImages = (nextImages: CustomImage[]) => {
    setCustomImages(nextImages);
    const primaryUrl = nextImages[0]?.url || '';
    setFormData((prev) => ({
      ...prev,
      custom_image_url: primaryUrl,
    }));
  };

  const getSuggestedPhotoLabel = (index: number): string | undefined => {
    return PHOTO_LABEL_PRESETS[index] || undefined;
  };

  const handlePosterSelected = (url: string, candidate?: CoverCandidate) => {
    setCustomImages((prev) => {
      const existingIdx = prev.findIndex((img) => img.url === url);
      let next: CustomImage[];
      if (existingIdx !== -1) {
        next = prev;
        setPreviewPhotoIndex(existingIdx);
      } else {
        const label = getSuggestedPhotoLabel(prev.length);
        next = [...prev, label ? { url, label } : { url }];
        setPreviewPhotoIndex(next.length - 1);
      }
      setFormData((f) => ({
        ...f,
        custom_image_url: next[0]?.url || url,
        asin: !f.asin.trim() && candidate?.asin ? candidate.asin.toUpperCase() : f.asin,
      }));
      return next;
    });
    setShowPosterSelector(false);
  };

  const handleAsinExtracted = (extractedAsin: string) => {
    setFormData((prev) => {
      if (prev.asin.trim()) return prev;
      return { ...prev, asin: extractedAsin };
    });
  };

  const toNamingEntries = (movies: MovieWithFormats[]) =>
    movies.map((m) => ({
      title: m.movie.title,
      media_type: m.media_type,
      tv_show_name: m.tv_show_name,
      tv_show_tmdb_id: m.tv_show_tmdb_id,
      season_number: m.season_number,
      tv_show_total_seasons: m.tv_show_total_seasons,
      formats: m.formats,
    }));

  const buildCoverSearchQuery = () =>
    formatCoverSearchQuery({
      customName: formData.name,
      entries: toNamingEntries(selectedMovies),
      editionNotes: formData.edition_notes,
    });

  const handleMediaSaved = (updatedMedia: Media) => {
    hasSavedMediaChangesRef.current = true;
    const oldAutoName = updatePhysicalItemName(selectedMovies);
    const updatedMovies = selectedMovies.map(m =>
      m.mediaDbId === updatedMedia.id
        ? {
            ...m,
            isManual: !updatedMedia.tmdb_id,
            media_type: updatedMedia.media_type ?? m.media_type,
            tv_show_tmdb_id: updatedMedia.tv_show_tmdb_id ?? m.tv_show_tmdb_id,
            movie: {
              ...m.movie,
              id: updatedMedia.tmdb_id || m.movie.id,
              title: updatedMedia.title,
              original_title: updatedMedia.original_title || undefined,
              original_language: updatedMedia.original_language || undefined,
              overview: updatedMedia.synopsis || '',
              release_date: updatedMedia.release_date || '',
            },
            tv_show_name: updatedMedia.tv_show_name ?? m.tv_show_name,
            season_number: updatedMedia.season_number ?? m.season_number,
            episode_count: updatedMedia.episode_count ?? m.episode_count,
            genres: updatedMedia.genres ?? m.genres,
            details: {
              ...m.details,
              ...updatedMedia,
              id: updatedMedia.tmdb_id || m.movie.id,
              overview: updatedMedia.synopsis,
              poster_url: updatedMedia.cover_art_url,
              cover_art_url: updatedMedia.cover_art_url,
            },
          }
        : m
    );
    setSelectedMovies(updatedMovies);

    const newAutoName = updatePhysicalItemName(updatedMovies);
    if (!formData.name || formData.name === oldAutoName) {
      setFormData(prev => ({
        ...prev,
        name: newAutoName,
      }));
      if (editItem && newAutoName && newAutoName !== editItem.name) {
        apiService.updatePhysicalItem(editItem.id, { name: newAutoName } as any).catch((err) => {
          console.error('Failed to auto-sync physical item name:', err);
        });
      }
    }

    setShowMediaEditModal(false);
    setEditingMedia(null);
  };

  // Auto-update physical item name when media change
  const updatePhysicalItemName = (movies: MovieWithFormats[]) =>
    generatePhysicalItemName(toNamingEntries(movies));

  const buildPosterMovieOptions = (): PosterMovieOption[] => {
    const nonManual = selectedMovies.filter((m) => !m.isManual);
    const options: PosterMovieOption[] = [];
    const seenShowIds = new Set<number>();

    for (const m of nonManual) {
      if (m.media_type === 'tv_season' && m.tv_show_tmdb_id && !seenShowIds.has(m.tv_show_tmdb_id)) {
        seenShowIds.add(m.tv_show_tmdb_id);
        options.push({
          tmdbId: m.tv_show_tmdb_id,
          title: `${m.tv_show_name || m.movie.title} (Series Posters)`,
          mediaType: 'tv_season',
          seasonNumber: null,
        });
      }
    }

    for (const m of nonManual) {
      options.push({
        tmdbId:
          m.media_type === 'tv_season' && m.tv_show_tmdb_id
            ? m.tv_show_tmdb_id
            : m.movie.id,
        title: m.movie.title,
        mediaType: m.media_type,
        seasonNumber: m.season_number,
      });
    }

    return options;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const result = await apiService.uploadImage(file);
        if (result?.url) {
          uploadedUrls.push(result.url);
        }
      }
      if (uploadedUrls.length > 0) {
        setCustomImages((prev) => {
          const next = [...prev];
          for (const url of uploadedUrls) {
            if (!next.some((img) => img.url === url)) {
              const label = getSuggestedPhotoLabel(next.length);
              next.push(label ? { url, label } : { url });
            }
          }
          setPreviewPhotoIndex(next.length - 1);
          setFormData((f) => ({
            ...f,
            custom_image_url: next[0]?.url || '',
          }));
          return next;
        });
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast({ message: 'Failed to upload image. Please try again.', type: 'error' });
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSetPrimaryPhoto = (index: number) => {
    if (index <= 0 || index >= customImages.length) return;
    const next = [...customImages];
    const [selected] = next.splice(index, 1);
    next.unshift(selected);
    syncCustomImages(next);
    setPreviewPhotoIndex(0);
  };

  const handleMovePhoto = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= customImages.length) return;
    const next = [...customImages];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    syncCustomImages(next);
    setPreviewPhotoIndex(targetIndex);
  };

  const handleRemovePhoto = (index: number) => {
    const next = customImages.filter((_, i) => i !== index);
    syncCustomImages(next);
    setPreviewPhotoIndex((prev) => Math.max(0, Math.min(prev, next.length - 1)));
  };

  const handleUpdatePhotoLabel = (index: number, label: string) => {
    const next = customImages.map((img, i) =>
      i === index ? { ...img, label: label || undefined } : img
    );
    syncCustomImages(next);
  };

  const handleUpdatePhotoFrame = (index: number, partial: Partial<ImageFrame> | null) => {
    const next = customImages.map((img, i) => {
      if (i !== index) return img;
      if (partial === null) {
        const { frame: _removed, ...rest } = img;
        return rest;
      }
      return { ...img, frame: { ...img.frame, ...partial } };
    });
    syncCustomImages(next);
  };

  const clampPan = (value: number) => Math.min(100, Math.max(0, Math.round(value * 10) / 10));

  const handleCoverPanStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const photo = customImages[Math.min(previewPhotoIndex, Math.max(0, customImages.length - 1))];
    if (!photo || normalizeImageFrame(photo.frame).fit !== 'fill') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const normalized = normalizeImageFrame(photo.frame);
    coverPanDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: normalized.panX,
      panY: normalized.panY,
      rect,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanningCover(true);
  };

  const handleCoverPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = coverPanDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = ((e.clientX - drag.startX) / drag.rect.width) * 100;
    const dy = ((e.clientY - drag.startY) / drag.rect.height) * 100;
    handleUpdatePhotoFrame(safePreviewIndex, {
      panX: clampPan(drag.panX - dx),
      panY: clampPan(drag.panY - dy),
    });
  };

  const handleCoverPanEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (coverPanDragRef.current?.pointerId !== e.pointerId) return;
    coverPanDragRef.current = null;
    setIsPanningCover(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('🎬 MediaForm handleSubmit:', {
      editItem: !!editItem,
      selectedMoviesCount: selectedMovies.length,
      selectedMovies: selectedMovies.map(m => ({ title: m.movie.title, mediaDbId: m.mediaDbId, formats: m.formats }))
    });
    
    // Validate at least one movie is selected
    if (selectedMovies.length === 0) {
      toast({ message: 'Please select at least one media item.', type: 'warning' });
      return;
    }

    if (formData.archived && !formData.archive_reason.trim()) {
      toast({ message: 'Please enter a reason for archiving this item.', type: 'warning' });
      return;
    }
    
    setIsSubmitting(true);

    try {
      // Auto-generate name if not manually set
      const finalName = formData.name || updatePhysicalItemName(selectedMovies);

      if (editItem) {
        console.log('🎬 Updating existing physical item:', editItem.id);
        
        // Update existing physical item (physical fields only)
        const normalizedCustomImages = serializeCustomImagesForSave(customImages);
        await apiService.updatePhysicalItem(editItem.id, {
          name: finalName,
          sort_name: formData.sort_name || undefined,
          edition_notes: formData.edition_notes,
          notes: formData.notes || undefined,
          notes_public: formData.notes_public,
          archived: formData.archived,
          archive_reason: formData.archived ? formData.archive_reason.trim() : null,
          custom_image_url: normalizedCustomImages[0]?.url || '',
          custom_images: normalizedCustomImages,
          purchase_date: formData.purchase_date,
          cost:
            formData.cost.trim() !== '' && !Number.isNaN(Number(formData.cost))
              ? Math.round(Number(formData.cost) * 100) / 100
              : null,
          barcode: formData.barcode.trim() || null,
          asin: formData.asin.trim() || null,
          thickness_units: formData.thickness_units,
          width_mm: formData.width_mm || null,
          height_mm: formData.height_mm || null,
          depth_mm: formData.depth_mm || null,
          store_links: storeLinks,
          sort_series_id: formData.sort_series_id,
          media_primary_series_id: formData.media_primary_series_id,
        } as any);

        // Handle media links for existing physical items
        // Track links by their junction row ID so the same movie can be
        // linked multiple times (e.g., Theatrical and Extended versions)
        const currentLinks = editItem.media.filter(m => m.link_id != null);
        const selectedLinkIds = new Set(selectedMovies.map(m => m.link_id).filter(id => id != null));

        console.log('🎬 Media link management:', {
          currentLinkIds: currentLinks.map(m => m.link_id),
          selectedLinkIds: Array.from(selectedLinkIds)
        });

        // Remove media links that are no longer selected
        for (const linked of currentLinks) {
          if (!selectedLinkIds.has(linked.link_id!)) {
            console.log('🗑️ Removing media link:', linked.link_id);
            try {
              await apiService.removeMediaLink(editItem.id, linked.id, linked.link_id!);
            } catch (error) {
              console.error(`Failed to remove media link ${linked.link_id}:`, error);
            }
          }
        }

        // Add new media links for selected movies
        for (const movieWithFormats of selectedMovies) {
          const { movie, formats, details, mediaDbId, link_id, version_notes } = movieWithFormats;
          
          // Existing junction link - update formats and version notes
          if (link_id && mediaDbId) {
            console.log('📝 Updating formats for existing link:', link_id);
            try {
              await apiService.updateMovieFormats(editItem.id, mediaDbId, formats, version_notes ?? null, link_id);
            } catch (error) {
              console.error(`Failed to update link ${link_id}:`, error);
            }
            continue;
          }

          // Add new media link
          let mediaData: any;
          if (mediaDbId) {
            mediaData = {
              id: mediaDbId,
              formats: formats,
              version_notes: version_notes || null,
              disc_number: 1,
            };
          } else {
            mediaData = {
              title: details?.title || movie.title,
              original_title: details?.original_title || movie.original_title || null,
              original_language: details?.original_language || movie.original_language || null,
              ...(movieWithFormats.isManual ? {} : { tmdb_id: details?.id || movie.id }),
              synopsis: details?.overview || details?.synopsis || movie.overview,
              cover_art_url: details?.poster_url || details?.cover_art_url || '',
              release_date: details?.release_date || movie.release_date,
              director: details?.director || '',
              cast: details?.cast || [],
              genres: details?.genres || movieWithFormats.genres || [],
              formats: formats,
              version_notes: version_notes || null,
              disc_number: 1,
              media_type: movieWithFormats.media_type || 'movie',
            };
            if (movieWithFormats.media_type === 'tv_season') {
              if (!movieWithFormats.isManual && movieWithFormats.tv_show_tmdb_id) {
                mediaData.tv_show_tmdb_id = movieWithFormats.tv_show_tmdb_id;
              }
              mediaData.tv_show_name = movieWithFormats.tv_show_name;
              mediaData.season_number = movieWithFormats.season_number;
              mediaData.episode_count = movieWithFormats.episode_count;
              mediaData.genres = movieWithFormats.genres || details?.genres || [];
            }
          }

          console.log('➕ Adding new media link:', { 
            physicalItemId: editItem.id,
            mediaDbId, 
            title: movie.title, 
            formats,
            mediaData 
          });
          try {
            const result = await apiService.addMediaLink(editItem.id, mediaData);
            console.log('✅ Media link added successfully:', result);
          } catch (error: any) {
            console.error(`❌ Failed to add media link:`, error);
            console.error('❌ Error details:', error.response?.data || error.message);
            throw error; // Re-throw to show error to user
          }
        }
      } else {
        // Create new physical item with linked media
        const mediaArray = selectedMovies.map(movieWithFormats => {
          const { movie, formats, details, version_notes } = movieWithFormats;
          const mediaEntry: any = {
            title: details?.title || movie.title,
            original_title: details?.original_title || movie.original_title || null,
            original_language: details?.original_language || movie.original_language || null,
            ...(movieWithFormats.isManual ? {} : { tmdb_id: details?.id || movie.id }),
            synopsis: details?.overview || details?.synopsis || movie.overview,
            cover_art_url: details?.poster_url || details?.cover_art_url || '',
            release_date: details?.release_date || movie.release_date,
            director: details?.director || '',
            cast: details?.cast || [],
            genres: details?.genres || movieWithFormats.genres || [],
            formats: formats,
            version_notes: version_notes || null,
            media_type: movieWithFormats.media_type || 'movie',
          };
          
          if (movieWithFormats.media_type === 'tv_season') {
            if (!movieWithFormats.isManual && movieWithFormats.tv_show_tmdb_id) {
              mediaEntry.tv_show_tmdb_id = movieWithFormats.tv_show_tmdb_id;
            }
            mediaEntry.tv_show_name = movieWithFormats.tv_show_name;
            mediaEntry.season_number = movieWithFormats.season_number;
            mediaEntry.episode_count = movieWithFormats.episode_count;
            mediaEntry.genres = movieWithFormats.genres || details?.genres || [];
          }
          
          return mediaEntry;
        });

        const normalizedCustomImages = serializeCustomImagesForSave(customImages);

        await apiService.createPhysicalItem({
          name: finalName,
          sort_name: formData.sort_name || undefined,
          edition_notes: formData.edition_notes,
          notes: formData.notes || undefined,
          notes_public: formData.notes_public,
          custom_image_url: normalizedCustomImages[0]?.url || '',
          custom_images: normalizedCustomImages,
          purchase_date: formData.purchase_date,
          cost:
            formData.cost.trim() !== '' && !Number.isNaN(Number(formData.cost))
              ? Math.round(Number(formData.cost) * 100) / 100
              : undefined,
          barcode: formData.barcode.trim() || undefined,
          asin: formData.asin.trim() || undefined,
          thickness_units: formData.thickness_units,
          width_mm: formData.width_mm || undefined,
          height_mm: formData.height_mm || undefined,
          depth_mm: formData.depth_mm || undefined,
          store_links: storeLinks,
          sort_series_id: formData.sort_series_id,
          media_primary_series_id: formData.media_primary_series_id,
          media: mediaArray,
        } as any);
      }
      hasSavedMediaChangesRef.current = false;
      resetFacetsCache();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to save physical item:', error);
      toast({ message: 'Failed to save physical item. Please try again.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const safePreviewIndex = Math.min(previewPhotoIndex, Math.max(0, customImages.length - 1));
  const activePreviewPhoto = customImages[safePreviewIndex] || null;
  const activeFrame = normalizeImageFrame(activePreviewPhoto?.frame);
  // Get image URL - prioritize active preview photo, then primary custom photo, then first selected movie's poster
  const imageUrl =
    activePreviewPhoto?.url ||
    formData.custom_image_url ||
    (selectedMovies.length > 0 ? selectedMovies[0].details?.poster_url : null);

  // The modal body is a two-step flow: searching for media is the
  // required first step in create mode, then the item details form.
  // Rendering the search inline keeps it inside this dialog instead of
  // stacking a second modal on top.
  const hasItemContent = Boolean(editItem) || selectedMovies.length > 0;
  const showSearchStep = showSearch || !hasItemContent;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={handleFormClose} />

        {/* Modal */}
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
            {/* Header */}
            <div className="shrink-0 border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {editItem ? 'Edit Physical Item' : 'Add New Media'}
                </h2>
                <button onClick={handleFormClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body: media search step, or the item details form */}
            {showSearchStep ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                <MediaSearchPanel
                  onSelect={handleUnifiedSearchSelect}
                  onSelectTVSeasons={handleTVSeasonsSelect}
                  currentPhysicalItem={editItem}
                  onBack={hasItemContent ? () => setShowSearch(false) : undefined}
                />
                {!hasItemContent && (
                  <div className="mt-6 text-center">
                    <button
                      type="button"
                      onClick={handleFormClose}
                      className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              {/* Scrollable body - columns scroll independently on desktop */}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {editItem && formData.archived && (
                  <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
                    <div>
                      <span className="font-semibold">Marked as Archived:</span>{' '}
                      <span>{formData.archive_reason}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setArchivePromptReason(formData.archive_reason);
                        setShowArchivePrompt(true);
                      }}
                      className="text-xs font-medium underline hover:no-underline"
                    >
                      Edit reason
                    </button>
                  </div>
                )}
                <div className="grid gap-6 md:h-full md:grid-cols-2">
                {/* Left Column - Image */}
                <div className="md:min-h-0 md:overflow-y-auto md:pb-1 md:pr-2">
                  <div
                    className={`relative aspect-[2/3] bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden mb-3 select-none ${
                      activePreviewPhoto && activeFrame.fit === 'fill'
                        ? isPanningCover
                          ? 'cursor-grabbing'
                          : 'cursor-grab'
                        : ''
                    }`}
                    style={{
                      touchAction:
                        activePreviewPhoto && activeFrame.fit === 'fill' ? 'pan-y' : undefined,
                    }}
                    onPointerDown={handleCoverPanStart}
                    onPointerMove={handleCoverPanMove}
                    onPointerUp={handleCoverPanEnd}
                    onPointerCancel={handleCoverPanEnd}
                  >
                    {imageUrl ? (
                      <FramedImage
                        frame={activePreviewPhoto?.frame}
                        src={imageUrl}
                        alt={formData.name || "Physical item cover"}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-20 h-20 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    {activePreviewPhoto && (
                      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 pointer-events-none">
                        <span className="rounded-full bg-black/75 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
                          {safePreviewIndex === 0 ? 'Primary Cover' : `Photo ${safePreviewIndex + 1}`}
                          {activePreviewPhoto.label ? ` · ${activePreviewPhoto.label}` : ''}
                        </span>
                        {customImages.length > 1 && (
                          <span className="rounded-full bg-black/75 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                            {safePreviewIndex + 1} / {customImages.length}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {activePreviewPhoto && (
                    <div className="mb-4 space-y-2.5 rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Cover Framing
                        </span>
                        <div
                          className="flex rounded-md bg-gray-200/80 p-0.5 dark:bg-gray-700"
                          role="group"
                          aria-label="Cover fit mode"
                        >
                          {(['fill', 'fit'] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              aria-pressed={activeFrame.fit === mode}
                              onClick={() => handleUpdatePhotoFrame(safePreviewIndex, { fit: mode })}
                              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                                activeFrame.fit === mode
                                  ? 'bg-white font-semibold text-gray-900 shadow-sm dark:bg-gray-600 dark:text-gray-100'
                                  : 'font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                              }`}
                            >
                              {mode === 'fill' ? 'Fill' : 'Fit'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {activeFrame.fit === 'fill' ? (
                        <>
                          <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                            Crops the photo to the card frame. Drag the preview or use the sliders to reframe it.
                          </p>
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor="cover-zoom"
                              className="w-12 shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300"
                            >
                              Zoom
                            </label>
                            <input
                              id="cover-zoom"
                              type="range"
                              min={FRAME_MIN_ZOOM}
                              max={FRAME_MAX_ZOOM}
                              step={0.05}
                              value={activeFrame.zoom}
                              onChange={(e) =>
                                handleUpdatePhotoFrame(safePreviewIndex, { zoom: Number(e.target.value) })
                              }
                              aria-label="Cover zoom"
                              className="h-1.5 flex-1 cursor-pointer accent-primary-600"
                            />
                            <span className="w-11 shrink-0 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
                              {activeFrame.zoom.toFixed(2)}&times;
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor="cover-pan-x"
                                className="w-10 shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300"
                              >
                                Horiz.
                              </label>
                              <input
                                id="cover-pan-x"
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={activeFrame.panX}
                                onChange={(e) =>
                                  handleUpdatePhotoFrame(safePreviewIndex, { panX: Number(e.target.value) })
                                }
                                aria-label="Horizontal position"
                                className="h-1.5 flex-1 cursor-pointer accent-primary-600"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor="cover-pan-y"
                                className="w-10 shrink-0 text-xs font-medium text-gray-600 dark:text-gray-300"
                              >
                                Vert.
                              </label>
                              <input
                                id="cover-pan-y"
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={activeFrame.panY}
                                onChange={(e) =>
                                  handleUpdatePhotoFrame(safePreviewIndex, { panY: Number(e.target.value) })
                                }
                                aria-label="Vertical position"
                                className="h-1.5 flex-1 cursor-pointer accent-primary-600"
                              />
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                          Shows the entire photo letterboxed over a blurred backdrop &mdash; best for wide box sets.
                        </p>
                      )}

                      {normalizeFrameForWrite(activePreviewPhoto.frame) && (
                        <button
                          type="button"
                          onClick={() => handleUpdatePhotoFrame(safePreviewIndex, null)}
                          className="text-xs font-medium text-primary-700 hover:underline dark:text-primary-300"
                        >
                          Reset framing
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => setShowSearch(true)}
                      className="btn-secondary text-sm w-full"
                    >
                      + Add another title
                    </button>
                  </div>

                  <div className="mb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Package Photos {customImages.length > 0 && `(${customImages.length})`}
                      </label>
                      {customImages.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            syncCustomImages([]);
                            setPreviewPhotoIndex(0);
                          }}
                          className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                          title="Remove all package photos and revert to movie poster"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSelectPosterClick}
                        className="flex-1 btn-secondary text-sm"
                      >
                        + Find Cover Art
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Or upload photos (front, back, spine, inside, discs):
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileUpload}
                        disabled={uploadingImage}
                        className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary-50 dark:file:bg-primary-900 file:text-primary-700 dark:file:text-primary-200 hover:file:bg-primary-100 dark:hover:file:bg-primary-800"
                      />
                      {uploadingImage && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">Uploading...</p>}
                    </div>

                    {customImages.length > 0 && (
                      <div className="space-y-2 pt-1">
                        {customImages.map((photo, idx) => {
                          const isSelected = idx === safePreviewIndex;
                          const isPrimary = idx === 0;
                          return (
                            <div
                              key={`${photo.url}-${idx}`}
                              onClick={() => setPreviewPhotoIndex(idx)}
                              className={`flex items-center gap-2.5 rounded-lg border p-2 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'border-primary-500 bg-primary-50/50 dark:border-primary-400 dark:bg-primary-950/30'
                                  : 'border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
                                <img
                                  src={photo.url}
                                  alt={photo.label || `Photo ${idx + 1}`}
                                  className="h-full w-full object-cover"
                                />
                                {isPrimary && (
                                  <span className="absolute bottom-0 inset-x-0 bg-primary-600/95 text-center text-[9px] font-bold uppercase tracking-wider text-white">
                                    Cover
                                  </span>
                                )}
                              </div>

                              <div className="flex-1 min-w-0 space-y-1" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={photo.label || ''}
                                    onChange={(e) => handleUpdatePhotoLabel(idx, e.target.value)}
                                    placeholder={isPrimary ? 'Label (e.g., Front)' : 'Label (e.g., Back, Spine, Inside)'}
                                    maxLength={80}
                                    aria-label={`Photo ${idx + 1} label`}
                                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                  />
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {PHOTO_LABEL_PRESETS.map((preset) => {
                                    const active = (photo.label || '').toLowerCase() === preset.toLowerCase();
                                    return (
                                      <button
                                        key={preset}
                                        type="button"
                                        onClick={() => handleUpdatePhotoLabel(idx, active ? '' : preset)}
                                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                          active
                                            ? 'bg-primary-600 text-white'
                                            : 'bg-gray-200/80 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500'
                                        }`}
                                      >
                                        {preset}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-0.5">
                                  {!isPrimary && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetPrimaryPhoto(idx)}
                                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 hover:bg-primary-100 dark:text-primary-300 dark:hover:bg-primary-900/50"
                                      title="Use as primary cover on collection cards & shelf spines"
                                    >
                                      Set Cover
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => handleMovePhoto(idx, -1)}
                                    aria-label={`Move photo ${idx + 1} up`}
                                    className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
                                    title="Move earlier"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === customImages.length - 1}
                                    onClick={() => handleMovePhoto(idx, 1)}
                                    aria-label={`Move photo ${idx + 1} down`}
                                    className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
                                    title="Move later"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePhoto(idx)}
                                    aria-label={`Remove photo ${idx + 1}`}
                                    className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                    title="Remove photo"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Tabbed Form Fields */}
                <div className="flex flex-col md:min-h-0">
                  <div className="shrink-0">
                    <div
                      className="flex rounded-lg bg-gray-100 p-1 dark:bg-gray-700/60"
                      role="tablist"
                      aria-label="Physical item sections"
                    >
                      {FORM_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          id={`media-form-tab-${tab.id}`}
                          aria-selected={activeFormTab === tab.id}
                          aria-controls={`media-form-panel-${tab.id}`}
                          onClick={() => setActiveFormTab(tab.id)}
                          className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
                            activeFormTab === tab.id
                              ? 'bg-white font-semibold text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'
                              : 'font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pt-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:pb-1 md:pr-2">
                  {activeFormTab === 'details' && (
                  <div
                    role="tabpanel"
                    id="media-form-panel-details"
                    aria-labelledby="media-form-tab-details"
                    className="space-y-4"
                  >
                  {/* Selected Movies */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Selected Media *
                    </label>
                    
                    {selectedMovies.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {selectedMovies.map((movieWithFormats, index) => (
                          <div
                            key={movieWithFormats.link_id ?? `sel-${index}`}
                            className="p-3 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {movieWithFormats.movie.title}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                  {movieWithFormats.movie.release_date ? new Date(movieWithFormats.movie.release_date).getFullYear() : 'N/A'}
                                  {movieWithFormats.media_type === 'tv_season' && (
                                    <span className="ml-2 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded text-[10px] font-medium">
                                      TV
                                    </span>
                                  )}
                                  {movieWithFormats.version_notes && (
                                    <span className="ml-2 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 rounded text-[10px] font-medium">
                                      {movieWithFormats.version_notes}
                                    </span>
                                  )}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {movieWithFormats.formats.map((format) => (
                                    <span
                                      key={format}
                                      className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200"
                                    >
                                      {format}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditFormats(index);
                                  }}
                                  className="text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                                  title="Edit formats & version"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditMovie(movieWithFormats);
                                  }}
                                  className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                                  title="Edit movie metadata"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMovieFromPhysicalItem(index)}
                                  className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                  title="Remove movie"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                        No media selected. Click "+ Add another title" to search for movies or TV shows.
                      </p>
                    )}
                  </div>


                  {/* Physical Item Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Item Name
                    </label>
                    <input
                      type="text"
                      value={formData.name || updatePhysicalItemName(selectedMovies)}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={updatePhysicalItemName(selectedMovies)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    />
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Auto-generated from movie titles. Customize if needed.
                    </p>
                  </div>

                  {/* Sort Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Sort Name
                    </label>
                    <input
                      type="text"
                      value={formData.sort_name || ''}
                      onChange={(e) => setFormData({ ...formData, sort_name: e.target.value })}
                      placeholder="Auto-calculated from name (e.g., 'The Batman' → 'Batman')"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    />
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Used for sorting. Automatically calculated from name if left empty. Override if needed.
                    </p>
                  </div>

                  {/* Purchase Date & Cost */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="media-form-purchase-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Purchase Date
                      </label>
                      <input
                        id="media-form-purchase-date"
                        type="date"
                        value={formData.purchase_date}
                        onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      />
                    </div>

                    <div>
                      <label htmlFor="media-form-cost" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Purchase Cost ($)
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-gray-500 dark:text-gray-400">
                          $
                        </span>
                        <input
                          id="media-form-cost"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.cost}
                          onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                          placeholder="0.00"
                          className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Case Thickness */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Case Thickness (standard cases)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, thickness_units: Math.max(1, formData.thickness_units - 1) })}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                      >
                        -
                      </button>
                      <span className="w-12 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                        {formData.thickness_units}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, thickness_units: formData.thickness_units + 1 })}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                      >
                        +
                      </button>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        = {(formData.thickness_units * STANDARD_UNIT_MM).toFixed(1)}mm
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Most standard Blu-rays = 1. Box sets may be 2-4+.
                    </p>
                  </div>

                  {/* Custom Dimensions (collapsible) */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowDimensions(!showDimensions)}
                      className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${showDimensions ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Custom Dimensions
                      {(formData.width_mm || formData.height_mm || formData.depth_mm) && (
                        <span className="text-xs text-primary-600 dark:text-primary-400">(set)</span>
                      )}
                    </button>
                    {showDimensions && (
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                            Width (mm)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={formData.width_mm ?? ''}
                            onChange={(e) => setFormData({ ...formData, width_mm: e.target.value ? parseFloat(e.target.value) : undefined })}
                            placeholder="Auto"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                            Height (mm)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={formData.height_mm ?? ''}
                            onChange={(e) => setFormData({ ...formData, height_mm: e.target.value ? parseFloat(e.target.value) : undefined })}
                            placeholder="Auto"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                            Depth (mm)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={formData.depth_mm ?? ''}
                            onChange={(e) => setFormData({ ...formData, depth_mm: e.target.value ? parseFloat(e.target.value) : undefined })}
                            placeholder="Auto"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          />
                        </div>
                        <p className="col-span-3 text-xs text-gray-500 dark:text-gray-400">
                          Override auto-calculated dimensions for non-standard cases (e.g., TV box sets).
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Primary Series - adds movies to series */}
                  {availableSeries.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Primary Series
                      </label>
                      <select
                        value={formData.media_primary_series_id || ''}
                        onChange={(e) => setFormData({ ...formData, media_primary_series_id: e.target.value ? parseInt(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      >
                        <option value="">None</option>
                        {availableSeries.map(series => (
                          <option key={series.id} value={series.id}>
                            {series.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Setting this will add all movies in this item to the selected series and set it as their primary series.
                      </p>
                    </div>
                  )}

                  {/* Sort Series - for sorting preference */}
                  {availableSeries.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Sort Series
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                          (Optional)
                        </span>
                      </label>
                      <select
                        value={formData.sort_series_id || ''}
                        onChange={(e) => setFormData({ ...formData, sort_series_id: e.target.value ? parseInt(e.target.value) : undefined })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      >
                        <option value="">None</option>
                        {availableSeries.map(series => (
                          <option key={series.id} value={series.id}>
                            {series.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Used for sorting when you sort your collection by series. Useful for multi-movie items.
                      </p>
                    </div>
                  )}

                  {/* Edition Notes */}
                  <div>
                    <label
                      htmlFor="media-form-edition-notes"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Edition Notes
                    </label>
                    <EditionTagInput
                      id="media-form-edition-notes"
                      placeholder="e.g., Steelbook, Collector's Edition, Criterion"
                      value={formData.edition_notes}
                      onChange={(edition_notes) => setFormData({ ...formData, edition_notes })}
                      availableTags={facets?.editions ?? []}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Press Enter, Tab, or comma to add a tag. Start typing to match existing tags.
                    </p>
                  </div>

                  </div>
                  )}
                  {activeFormTab === 'notes' && (
                  <div
                    role="tabpanel"
                    id="media-form-panel-notes"
                    aria-labelledby="media-form-tab-notes"
                    className="space-y-4"
                  >
                  {/* Personal Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Personal Notes
                    </label>
                    <textarea
                      placeholder="e.g., This is my favorite version for its audio quality..."
                      value={formData.notes}
                      onChange={(e) => {
                        if (e.target.value.length <= 2000) {
                          setFormData({ ...formData, notes: e.target.value });
                        }
                      }}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface resize-none"
                    />
                    <div className="flex justify-between items-center mt-1">
                      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <input
                          type="checkbox"
                          checked={formData.notes_public}
                          onChange={(e) => setFormData({ ...formData, notes_public: e.target.checked })}
                          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                        Make notes public
                      </label>
                      <span className={`text-xs ${formData.notes.length > 1900 ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'}`}>
                        {formData.notes.length}/2000
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {formData.notes_public 
                        ? 'Notes will be visible to anyone viewing your collection.' 
                        : 'Notes are private and only visible when logged in.'}
                    </p>
                  </div>

                  {/* Product Identifiers: Barcode (UPC / EAN) & ASIN */}
                  {(() => {
                    const barcodeDetection = detectBarcode(formData.barcode);
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <label htmlFor="media-form-barcode" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                              Barcode (UPC / EAN)
                            </label>
                            {barcodeDetection && barcodeDetection.type !== 'Barcode' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary-100 text-primary-800 dark:bg-primary-900/60 dark:text-primary-200">
                                {barcodeDetection.type}
                              </span>
                            )}
                          </div>
                          <input
                            id="media-form-barcode"
                            type="text"
                            inputMode="numeric"
                            value={formData.barcode}
                            onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                            placeholder="e.g., 4010232059819"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          />
                          {barcodeDetection?.checksumValid === false ? (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                              Check digit looks unusual — double-check digits.
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              12-digit UPC or 13-digit EAN.
                            </p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="media-form-asin" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            ASIN
                          </label>
                          <input
                            id="media-form-asin"
                            type="text"
                            value={formData.asin}
                            onChange={(e) => setFormData({ ...formData, asin: e.target.value.toUpperCase() })}
                            placeholder="e.g., B00DU61N52"
                            maxLength={16}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                          />
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Auto-filled when adding an Amazon link.
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Store Links */}
                  <div>
                    <StoreLinkManager
                      links={storeLinks}
                      onChange={setStoreLinks}
                      onAsinExtracted={handleAsinExtracted}
                      disabled={isSubmitting}
                    />
                  </div>
                  </div>
                  )}
                  </div>
                </div>
                </div>
              </div>

              {/* Actions - sticky footer, always visible */}
              <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                {editItem ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting || isDeleting}
                      onClick={() => {
                        if (formData.archived) {
                          setFormData({ ...formData, archived: false, archive_reason: '' });
                        } else {
                          setArchivePromptReason(formData.archive_reason || '');
                          setShowArchivePrompt(true);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        formData.archived
                          ? 'border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/50'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                        />
                      </svg>
                      {formData.archived ? 'Unarchive Item' : 'Archive Item'}
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting || isDeleting}
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: 'Delete physical item?',
                          message: `Are you sure you want to permanently delete "${editItem.name}"? This action cannot be undone.`,
                          confirmLabel: 'Delete',
                          cancelLabel: 'Cancel',
                          variant: 'danger',
                        });
                        if (!confirmed) return;
                        setIsDeleting(true);
                        try {
                          if (onDelete) {
                            await onDelete(editItem.id);
                          } else {
                            await apiService.deletePhysicalItem(editItem.id);
                            onSuccess();
                          }
                          onClose();
                        } catch (error) {
                          console.error('Failed to delete physical item:', error);
                          toast({ message: 'Failed to delete item. Please try again.', type: 'error' });
                        } finally {
                          setIsDeleting(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      {isDeleting ? 'Deleting...' : 'Delete Item'}
                    </button>
                  </div>
                ) : (
                  <div />
                )}

                <div className="flex justify-end gap-3">
                  <button type="button" onClick={handleFormClose} className="btn-secondary">
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting || isDeleting} 
                    className="btn-primary"
                    onClick={() => console.log('🔘 Save button clicked!', { selectedMoviesCount: selectedMovies.length })}
                  >
                    {isSubmitting ? 'Saving...' : editItem ? 'Update' : 'Add Media'}
                  </button>
                </div>
                </div>
              </div>
            </form>
            )}
          </div>
        </div>
      </div>

      {/* Media Edit Modal */}
      <MediaEditModal
        media={editingMedia}
        isOpen={showMediaEditModal}
        onClose={() => {
          setShowMediaEditModal(false);
          setEditingMedia(null);
        }}
        onSave={handleMediaSaved}
      />

      {/* Format Selector Modal */}
      <FormatSelector
        isOpen={showFormatSelector}
        onClose={() => {
          setShowFormatSelector(false);
          setEditingFormatsIndex(null);
          setOriginalFormats([]);
          setOriginalVersionNotes(null);
        }}
        onConfirm={handleFormatsUpdated}
        movieTitle={editingFormatsIndex !== null ? selectedMovies[editingFormatsIndex]?.movie.title || '' : ''}
        initialFormats={editingFormatsIndex !== null ? selectedMovies[editingFormatsIndex]?.formats || [] : []}
        initialVersionNotes={editingFormatsIndex !== null ? selectedMovies[editingFormatsIndex]?.version_notes || '' : ''}
        confirmLabel={editingFormatsIndex !== null ? 'Save Changes' : undefined}
      />

      {/* Archive Reason Prompt Modal */}
      <Sheet
        isOpen={showArchivePrompt}
        onClose={() => setShowArchivePrompt(false)}
        title="Archive Physical Item"
        description={`Why is "${editItem?.name || formData.name}" being archived?`}
        position="center"
        size="sm"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const trimmed = archivePromptReason.trim();
            if (!trimmed) return;
            setFormData({ ...formData, archived: true, archive_reason: trimmed });
            setShowArchivePrompt(false);
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="edit-form-archive-reason" className="mb-1 block text-sm font-medium text-content">
              Archive Reason *
            </label>
            <input
              id="edit-form-archive-reason"
              type="text"
              required
              maxLength={500}
              placeholder="e.g., Given away, sold, trashed"
              value={archivePromptReason}
              onChange={(e) => setArchivePromptReason(e.target.value)}
              className="w-full rounded-[--radius-control] border border-subtle bg-surface px-3 py-2 text-sm text-content placeholder-content-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            />
            <p className="mt-1 text-xs text-content-muted">
              Click Update on the form to save changes.
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setShowArchivePrompt(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!archivePromptReason.trim()}>
              Set Archived
            </Button>
          </div>
        </form>
      </Sheet>

      {/* Poster Selector */}
      {showPosterSelector && (
        <PosterSelector
          tmdbId={
            selectedMovies.find((m) => !m.isManual)?.tv_show_tmdb_id ||
            selectedMovies.find((m) => !m.isManual)?.movie.id ||
            null
          }
          movieTitle={formData.name || updatePhysicalItemName(selectedMovies)}
          initialQuery={buildCoverSearchQuery()}
          movieOptions={buildPosterMovieOptions()}
          onSelect={handlePosterSelected}
          onClose={() => setShowPosterSelector(false)}
          currentPosterUrl={formData.custom_image_url}
        />
      )}
    </>
  );
};

export default MediaForm;

