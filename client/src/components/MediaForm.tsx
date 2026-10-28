import React, { useState, useEffect, useRef } from 'react';
import { PhysicalItem, TMDbMovie, Media, UnifiedSearchResult, Series, ManualMovieData } from '../types';
import { apiService } from '../services/api.service';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useFacets, resetFacetsCache } from '../hooks/useFacets';
import UnifiedSearchModal from './UnifiedSearchModal';
import StoreLinkManager from './StoreLinkManager';
import MediaEditModal from './MediaEditModal';
import FormatSelector from './FormatSelector';
import PosterSelector from './PosterSelector';
import EditionTagInput from './EditionTagInput';
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
  isManual?: boolean;
  // TV-specific fields
  media_type?: 'movie' | 'tv_season';
  tv_show_tmdb_id?: number;
  tv_show_name?: string;
  season_number?: number;
  episode_count?: number;
  genres?: { id: number; name: string }[];
}

const MediaForm: React.FC<MediaFormProps> = ({ isOpen, onClose, onSuccess, editItem, onDelete }) => {
  console.log('🎬 MediaForm rendered:', { isOpen, editItemId: editItem?.id, editItemName: editItem?.name });
  
  const [showUnifiedSearch, setShowUnifiedSearch] = useState(false);
  const [showMediaEditModal, setShowMediaEditModal] = useState(false);
  const [editingMedia, setEditingMedia] = useState<Media | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedMovies, setSelectedMovies] = useState<MovieWithFormats[]>([]);
  const [movieDetails, setMovieDetails] = useState<Map<number, any>>(new Map());
  const [storeLinks, setStoreLinks] = useState<Array<{label: string; url: string}>>([]);
  const [showFormatSelector, setShowFormatSelector] = useState(false);
  const [editingFormatsFor, setEditingFormatsFor] = useState<number | null>(null);
  const [originalFormats, setOriginalFormats] = useState<string[]>([]);
  
  // Poster selection state
  const [showPosterSelector, setShowPosterSelector] = useState(false);
  const [posterSelectorMovieId, setPosterSelectorMovieId] = useState<number | null>(null);
  const [showMovieSelectionForPoster, setShowMovieSelectionForPoster] = useState(false);
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
    thickness_units: 1,
    width_mm: undefined as number | undefined,
    height_mm: undefined as number | undefined,
    depth_mm: undefined as number | undefined,
    media_primary_series_id: undefined as number | undefined, // Adds movies to series
    sort_series_id: undefined as number | undefined, // Used for sorting
  });
  const [showDimensions, setShowDimensions] = useState(false);
  const [availableSeries, setAvailableSeries] = useState<Series[]>([]);
  const autoOpenedSearchRef = useRef(false);
  const hasSavedMediaChangesRef = useRef(false);

  const handleFormClose = () => {
    if (hasSavedMediaChangesRef.current) {
      hasSavedMediaChangesRef.current = false;
      resetFacetsCache();
      onSuccess();
    }
    onClose();
  };

  // Auto-open the search dialog once per open in create mode, so the
  // first (and required) step is front and center. Closing the search
  // without selecting lands on the guided empty state instead.
  useEffect(() => {
    if (isOpen && !editItem && !autoOpenedSearchRef.current) {
      autoOpenedSearchRef.current = true;
      setShowUnifiedSearch(true);
    }
    if (!isOpen) {
      autoOpenedSearchRef.current = false;
      hasSavedMediaChangesRef.current = false;
    }
  }, [isOpen, editItem]);

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
        custom_image_url: editItem.custom_image_url || '',
        purchase_date: editItem.purchase_date || '',
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
          overview: m.synopsis || '',
          poster_path: null, // We'll use cover_art_url directly
          release_date: m.release_date || '',
          vote_average: 0,
          vote_count: 0,
        },
        formats: m.formats || ['Blu-ray'],
        mediaDbId: m.id, // Preserve the actual media database ID
        media_type: m.media_type,
        tv_show_tmdb_id: m.tv_show_tmdb_id,
        tv_show_name: m.tv_show_name,
        season_number: m.season_number,
        episode_count: m.episode_count,
        genres: m.genres,
        details: {
          title: m.title,
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
        thickness_units: 1,
        width_mm: undefined,
        height_mm: undefined,
        depth_mm: undefined,
        media_primary_series_id: undefined,
        sort_series_id: undefined,
      });
      setShowDimensions(false);
      setSelectedMovies([]);
      setMovieDetails(new Map());
      setStoreLinks([]);
    }
  }, [editItem, isOpen]);

  const handleUnifiedSearchSelect = async (result: UnifiedSearchResult, formats: string[]) => {
    try {
      if (result.source === 'database') {
        // Handle existing database movie
        const existingMedia = result.originalData as Media;
        
        // Add existing movie with formats to selection
        const newMovieWithFormats: MovieWithFormats = {
          movie: {
            id: existingMedia.tmdb_id || existingMedia.id,
            title: existingMedia.title,
            overview: existingMedia.synopsis || '',
            poster_path: null,
            release_date: existingMedia.release_date || '',
            vote_average: 0,
            vote_count: 0,
          },
          formats,
          mediaDbId: existingMedia.id, // Preserve the database ID for existing media
          isManual: !existingMedia.tmdb_id,
          media_type: existingMedia.media_type,
          tv_show_tmdb_id: existingMedia.tv_show_tmdb_id,
          tv_show_name: existingMedia.tv_show_name,
          season_number: existingMedia.season_number,
          episode_count: existingMedia.episode_count,
          genres: existingMedia.genres,
          details: {
            title: existingMedia.title,
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
            overview: manualMovie.synopsis,
            poster_path: null,
            release_date: manualMovie.release_date,
            vote_average: 0,
            vote_count: 0,
          },
          formats,
          isManual: true,
          media_type: manualMediaType,
          tv_show_name: manualMovie.tv_show_name,
          season_number: manualMovie.season_number,
          episode_count: manualMovie.episode_count,
          details: {
            title: manualMovie.title,
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
    }
  };

  const handleTVSeasonsSelect = (seasons: any[], formats: string[]) => {
    const newEntries: MovieWithFormats[] = seasons.map(season => ({
      movie: {
        id: season.tmdb_id,
        title: season.title,
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
      season_number: season.season_number,
      episode_count: season.episode_count,
      genres: season.genres,
      details: {
        title: season.title,
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

    // Auto-generate name
    const oldAutoName = updatePhysicalItemName(selectedMovies);
    const newAutoName = updatePhysicalItemName(updatedMovies);
    if (!formData.name || formData.name === oldAutoName) {
      setFormData({
        ...formData,
        name: newAutoName,
      });
    }
  };

  const handleRemoveMovie = (movieId: number) => {
    const newMovies = selectedMovies.filter(m => m.movie.id !== movieId);
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

  const handleRemoveMovieFromPhysicalItem = async (movieWithFormats: MovieWithFormats) => {
    if (!editItem) {
      // Creating new item - just remove from local state
      handleRemoveMovie(movieWithFormats.movie.id);
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
      await apiService.removeMediaLink(editItem.id, movieWithFormats.mediaDbId!);
      setSelectedMovies(prev => prev.filter(m => m.mediaDbId !== movieWithFormats.mediaDbId));
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

  const handleEditFormats = (movieId: number) => {
    const movie = selectedMovies.find(m => m.movie.id === movieId);
    if (movie) {
      setOriginalFormats([...movie.formats]);
      setEditingFormatsFor(movieId);
      setShowFormatSelector(true);
    }
  };

  const handleFormatsUpdated = async (formats: string[]) => {
    if (editingFormatsFor === null || !editItem) return;
    
    // Update local state immediately for UI responsiveness
    setSelectedMovies(prev => 
      prev.map(movie => 
        movie.movie.id === editingFormatsFor 
          ? { ...movie, formats }
          : movie
      )
    );
    
    // If editing an existing item, update the backend immediately
    if (editItem) {
      try {
        const movieWithFormats = selectedMovies.find(m => m.movie.id === editingFormatsFor);
        if (movieWithFormats?.mediaDbId) {
          await apiService.updateMovieFormats(editItem.id, movieWithFormats.mediaDbId, formats);
        }
      } catch (error) {
        console.error('Failed to update movie formats:', error);
        toast({ message: 'Failed to update movie formats. Please try again.', type: 'error' });
        // Revert the local state change on error
        setSelectedMovies(prev => 
          prev.map(movie => 
            movie.movie.id === editingFormatsFor 
              ? { ...movie, formats: originalFormats }
              : movie
          )
        );
      }
    }
    
    setShowFormatSelector(false);
    setEditingFormatsFor(null);
    setOriginalFormats([]);
  };

  const handleSelectPosterClick = () => {
    if (selectedMovies.length === 0) {
      toast({ message: 'Please select a movie first to choose a poster.', type: 'warning' });
      return;
    }

    if (selectedMovies.length === 1 && selectedMovies[0].isManual) {
      toast({ message: 'Manual movies can use a cover image from the manual movie form or an upload.', type: 'warning' });
      return;
    }

    if (selectedMovies.length === 1) {
      setPosterSelectorMovieId(selectedMovies[0].movie.id);
      setShowPosterSelector(true);
    } else {
      setShowMovieSelectionForPoster(true);
    }
  };

  const handlePosterSelected = (url: string) => {
    setFormData({ ...formData, custom_image_url: url });
    setShowPosterSelector(false);
    setPosterSelectorMovieId(null);
  };

  const handleMediaSaved = (updatedMedia: Media) => {
    hasSavedMediaChangesRef.current = true;
    const oldAutoName = updatePhysicalItemName(selectedMovies);
    const updatedMovies = selectedMovies.map(m =>
      m.mediaDbId === updatedMedia.id
        ? {
            ...m,
            movie: {
              ...m.movie,
              title: updatedMedia.title,
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
              id: m.movie.id,
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
  const updatePhysicalItemName = (movies: MovieWithFormats[]) => {
    if (movies.length === 0) return '';
    
    const tvSeasons = movies.filter(m => m.media_type === 'tv_season');
    const isAllTV = tvSeasons.length === movies.length && tvSeasons.length > 0;
    
    if (isAllTV) {
      // All TV seasons - group by show name
      const showName = tvSeasons[0].tv_show_name || tvSeasons[0].movie.title;
      const seasonNumbers = tvSeasons.map(s => s.season_number).filter(n => n != null).sort((a, b) => a! - b!);
      
      let title: string;
      if (seasonNumbers.length === 0) {
        title = showName;
      } else if (seasonNumbers.length === 1) {
        title = `${showName} - Season ${seasonNumbers[0]}`;
      } else {
        // Check if contiguous
        const min = seasonNumbers[0]!;
        const max = seasonNumbers[seasonNumbers.length - 1]!;
        if (max - min + 1 === seasonNumbers.length) {
          title = `${showName} - Complete Series`;
          if (seasonNumbers.length < 10) {
            title = `${showName} - Seasons ${min}-${max}`;
          }
        } else {
          title = `${showName} - Seasons ${seasonNumbers.join(', ')}`;
        }
      }
      
      return title;
    }
    
    // Movies or mixed - use titles
    return movies.map(m => m.movie.title).join(' / ');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const result = await apiService.uploadImage(file);
      setFormData({ ...formData, custom_image_url: result.url });
    } catch (error) {
      console.error('Upload failed:', error);
      toast({ message: 'Failed to upload image. Please try again.', type: 'error' });
    } finally {
      setUploadingImage(false);
    }
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
        await apiService.updatePhysicalItem(editItem.id, {
          name: finalName,
          sort_name: formData.sort_name || undefined,
          edition_notes: formData.edition_notes,
          notes: formData.notes || undefined,
          notes_public: formData.notes_public,
          archived: formData.archived,
          archive_reason: formData.archived ? formData.archive_reason.trim() : null,
          custom_image_url: formData.custom_image_url,
          purchase_date: formData.purchase_date,
          thickness_units: formData.thickness_units,
          width_mm: formData.width_mm || null,
          height_mm: formData.height_mm || null,
          depth_mm: formData.depth_mm || null,
          store_links: storeLinks,
          sort_series_id: formData.sort_series_id,
          media_primary_series_id: formData.media_primary_series_id,
        } as any);

        // Handle media links for existing physical items
        // Get list of currently linked media IDs
        const currentMediaIds = new Set(editItem.media.map(m => m.id));
        const selectedMediaIds = new Set(selectedMovies.map(m => m.mediaDbId).filter(id => id !== undefined));

        console.log('🎬 Media link management:', {
          currentMediaIds: Array.from(currentMediaIds),
          selectedMediaIds: Array.from(selectedMediaIds)
        });

        // Remove media links that are no longer selected
        for (const mediaId of currentMediaIds) {
          if (!selectedMediaIds.has(mediaId)) {
            console.log('🗑️ Removing media link:', mediaId);
            try {
              await apiService.removeMediaLink(editItem.id, mediaId);
            } catch (error) {
              console.error(`Failed to remove media link ${mediaId}:`, error);
            }
          }
        }

        // Add new media links for selected movies
        for (const movieWithFormats of selectedMovies) {
          const { movie, formats, details, mediaDbId } = movieWithFormats;
          
          // Skip if this media is already linked
          if (mediaDbId && currentMediaIds.has(mediaDbId)) {
            console.log('📝 Updating formats for existing media:', mediaDbId);
            // Update formats if they changed
            try {
              await apiService.updateMovieFormats(editItem.id, mediaDbId, formats);
            } catch (error) {
              console.error(`Failed to update formats for media ${mediaDbId}:`, error);
            }
            continue;
          }

          // Add new media link
          let mediaData: any;
          if (mediaDbId) {
            mediaData = {
              id: mediaDbId,
              formats: formats,
              disc_number: 1,
            };
          } else {
            mediaData = {
              title: details?.title || movie.title,
              ...(movieWithFormats.isManual ? {} : { tmdb_id: details?.id || movie.id }),
              synopsis: details?.overview || details?.synopsis || movie.overview,
              cover_art_url: details?.poster_url || details?.cover_art_url || '',
              release_date: details?.release_date || movie.release_date,
              director: details?.director || '',
              cast: details?.cast || [],
              genres: details?.genres || movieWithFormats.genres || [],
              formats: formats,
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
          const { movie, formats, details } = movieWithFormats;
          const mediaEntry: any = {
            title: details?.title || movie.title,
            ...(movieWithFormats.isManual ? {} : { tmdb_id: details?.id || movie.id }),
            synopsis: details?.overview || details?.synopsis || movie.overview,
            cover_art_url: details?.poster_url || details?.cover_art_url || '',
            release_date: details?.release_date || movie.release_date,
            director: details?.director || '',
            cast: details?.cast || [],
            genres: details?.genres || movieWithFormats.genres || [],
            formats: formats,
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

        // #region agent log
        fetch('http://localhost:7242/ingest/8b2e7252-624c-479a-86a6-74b0ba1b2bf3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0162e4'},body:JSON.stringify({sessionId:'0162e4',location:'MediaForm.tsx:680',message:'createPhysicalItem payload',data:{name:finalName,mediaCount:mediaArray.length,firstMedia:mediaArray[0],allMediaTypes:mediaArray.map((m:any)=>({title:m.title,media_type:m.media_type,tmdb_id:m.tmdb_id,tv_show_tmdb_id:m.tv_show_tmdb_id,genres_type:typeof m.genres,genres_is_array:Array.isArray(m.genres),director:m.director,cast_type:typeof m.cast,cast_is_array:Array.isArray(m.cast),disc_number:m.disc_number}))},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        await apiService.createPhysicalItem({
          name: finalName,
          sort_name: formData.sort_name || undefined,
          edition_notes: formData.edition_notes,
          notes: formData.notes || undefined,
          notes_public: formData.notes_public,
          custom_image_url: formData.custom_image_url,
          purchase_date: formData.purchase_date,
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
      // #region agent log
      fetch('http://localhost:7242/ingest/8b2e7252-624c-479a-86a6-74b0ba1b2bf3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0162e4'},body:JSON.stringify({sessionId:'0162e4',location:'MediaForm.tsx:700',message:'handleSubmit catch error',data:{errorMessage:error?.message,errorResponse:error?.response?.data,errorStatus:error?.response?.status},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      toast({ message: 'Failed to save physical item. Please try again.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Get image URL - prioritize custom, then first selected movie's poster
  const imageUrl = formData.custom_image_url || 
    (selectedMovies.length > 0 ? selectedMovies[0].details?.poster_url : null);

  // Guided empty state: in create mode with nothing selected, selecting
  // media is the required first step, so it becomes the entire UI.
  const showEmptyState = !editItem && selectedMovies.length === 0;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={handleFormClose} />

        {/* Modal */}
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 z-10">
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

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6">
              {showEmptyState ? (
                <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                  <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-5">
                    <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35m1.6-4.65a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    What are you adding?
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
                    Search TMDb and your library to find a movie or TV season — we'll autofill the details, poster, and formats for you.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowUnifiedSearch(true)}
                    className="btn-primary flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.6-4.65a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Search for media
                  </button>
                  <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
                    Can't find it? You can create it manually from the search dialog.
                  </p>
                  <button
                    type="button"
                    onClick={handleFormClose}
                    className="mt-6 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
              <>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Left Column - Image */}
                <div>
                  <div className="aspect-[2/3] bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden mb-4">
                    {imageUrl ? (
                      <img src={imageUrl} alt={formData.name || "Physical item cover"} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-20 h-20 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => setShowUnifiedSearch(true)}
                      className="btn-secondary text-sm w-full"
                    >
                      + Add another title
                    </button>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Custom Image
                    </label>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={handleSelectPosterClick}
                      disabled={selectedMovies.length === 1 && selectedMovies[0].isManual}
                      className="flex-1 btn-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Select Poster
                      </button>
                    </div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Or upload your own:
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      disabled={uploadingImage}
                      className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary-50 dark:file:bg-primary-900 file:text-primary-700 dark:file:text-primary-200 hover:file:bg-primary-100 dark:hover:file:bg-primary-800"
                    />
                    {uploadingImage && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Uploading...</p>}
                  </div>
                </div>

                {/* Right Column - Form Fields */}
                <div className="space-y-4">
                  {/* Selected Movies */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Selected Media *
                    </label>
                    
                    {selectedMovies.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {selectedMovies.map((movieWithFormats) => (
                          <div
                            key={movieWithFormats.movie.id}
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
                                    handleEditFormats(movieWithFormats.movie.id);
                                  }}
                                  className="text-gray-400 hover:text-green-600 dark:hover:text-green-400"
                                  title="Edit formats"
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
                                  onClick={() => handleRemoveMovieFromPhysicalItem(movieWithFormats)}
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

                  {/* Purchase Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Purchase Date
                    </label>
                    <input
                      type="date"
                      value={formData.purchase_date}
                      onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    />
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
                        = {(formData.thickness_units * 12.5).toFixed(1)}mm
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

                  {/* Store Links */}
                  <div>
                    <StoreLinkManager
                      links={storeLinks}
                      onChange={setStoreLinks}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
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

              {editItem && formData.archived && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
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
              </>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Unified Search Modal */}
      <UnifiedSearchModal
        isOpen={showUnifiedSearch}
        onClose={() => setShowUnifiedSearch(false)}
        onSelect={handleUnifiedSearchSelect}
        onSelectTVSeasons={handleTVSeasonsSelect}
        currentPhysicalItem={editItem}
      />

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
          setEditingFormatsFor(null);
          setOriginalFormats([]);
        }}
        onConfirm={handleFormatsUpdated}
        movieTitle={editingFormatsFor ? selectedMovies.find(m => m.movie.id === editingFormatsFor)?.movie.title || '' : ''}
        initialFormats={editingFormatsFor ? selectedMovies.find(m => m.movie.id === editingFormatsFor)?.formats || [] : []}
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
      {showPosterSelector && posterSelectorMovieId && (
        <PosterSelector
          tmdbId={posterSelectorMovieId}
          movieTitle={selectedMovies.find(m => m.movie.id === posterSelectorMovieId)?.movie.title || ''}
          onSelect={handlePosterSelected}
          onClose={() => {
            setShowPosterSelector(false);
            setPosterSelectorMovieId(null);
          }}
          currentPosterUrl={formData.custom_image_url}
        />
      )}

      {/* Movie Selection for Poster Modal */}
      {showMovieSelectionForPoster && (
        <div className="fixed inset-0 z-[60] overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowMovieSelectionForPoster(false)} />
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                Choose movie for poster
              </h3>
              <div className="space-y-2">
                {selectedMovies.map((movie) => (
                  <button
                    key={movie.movie.id}
                    onClick={() => {
                      setPosterSelectorMovieId(movie.movie.id);
                      setShowMovieSelectionForPoster(false);
                      setShowPosterSelector(true);
                    }}
                    disabled={movie.isManual}
                    className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-gray-900 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {movie.movie.title}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowMovieSelectionForPoster(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MediaForm;

