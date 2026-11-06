import React, { useState, useEffect } from 'react';
import {
  Media,
  Series,
  LetterboxdCacheItem,
  TMDbMovie,
  TMDbTVShow,
  TMDbTVShowDetails,
  TMDbTVSeason,
} from '../types';
import { apiService } from '../services/api.service';
import { useToast } from '../context/ToastContext';
import PosterSelector from './PosterSelector';
import {
  LetterboxdDotsIcon,
  formatStarString,
  formatWatchedDate,
  hasLetterboxdActivity,
} from './LetterboxdBadge';

interface MediaEditModalProps {
  media: Media | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedMedia: Media) => void;
}

interface TMDBComparison {
  current: any;
  tmdb: any;
  tmdb_id: number;
}

const MediaEditModal: React.FC<MediaEditModalProps> = ({ media, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: '',
    synopsis: '',
    director: '',
    release_date: '',
    cover_art_url: '',
  });
  const [cast, setCast] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [tmdbData, setTmdbData] = useState<TMDBComparison | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPosterSelector, setShowPosterSelector] = useState(false);
  const { toast } = useToast();

  // Series management state
  const [availableSeries, setAvailableSeries] = useState<Series[]>([]);
  const [selectedSeriesIds, setSelectedSeriesIds] = useState<number[]>([]);
  const [selectedSeriesData, setSelectedSeriesData] = useState<Series[]>([]); // Store full series objects
  const [primarySeriesId, setPrimarySeriesId] = useState<number | undefined>(undefined);
  const [seriesSearchQuery, setSeriesSearchQuery] = useState<string>('');
  const [showSeriesDropdown, setShowSeriesDropdown] = useState(false);

  // Letterboxd manual link state
  const [lbState, setLbState] = useState<{
    rating: number | null;
    liked: boolean;
    watched: boolean;
    lastWatchedDate: string | null;
    rewatch: boolean;
    uri: string | null;
  }>({
    rating: null,
    liked: false,
    watched: false,
    lastWatchedDate: null,
    rewatch: false,
    uri: null,
  });
  const [lbSearchQuery, setLbSearchQuery] = useState('');
  const [lbSearchResults, setLbSearchResults] = useState<LetterboxdCacheItem[]>([]);
  const [isSearchingLb, setIsSearchingLb] = useState(false);
  const [isLinkingLb, setIsLinkingLb] = useState(false);

  // TMDB lookup / link state
  const [linkedTmdbInfo, setLinkedTmdbInfo] = useState<{
    tmdb_id?: number;
    media_type?: 'movie' | 'tv_season';
    tv_show_tmdb_id?: number;
    tv_show_name?: string;
    season_number?: number;
    episode_count?: number;
  }>({});
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [showTmdbLookup, setShowTmdbLookup] = useState(false);
  const [tmdbSearchMode, setTmdbSearchMode] = useState<'movie' | 'tv'>('movie');
  const [tmdbSearchQuery, setTmdbSearchQuery] = useState('');
  const [tmdbDirectId, setTmdbDirectId] = useState('');
  const [tmdbMovieResults, setTmdbMovieResults] = useState<TMDbMovie[]>([]);
  const [tmdbTVResults, setTmdbTVResults] = useState<TMDbTVShow[]>([]);
  const [isSearchingTmdb, setIsSearchingTmdb] = useState(false);
  const [isLinkingTmdb, setIsLinkingTmdb] = useState(false);
  const [selectedTVShowForLink, setSelectedTVShowForLink] = useState<TMDbTVShowDetails | null>(null);

  useEffect(() => {
    if (media && isOpen) {
      setFormData({
        title: media.title || '',
        synopsis: media.synopsis || '',
        director: media.director || '',
        release_date: media.release_date || '',
        cover_art_url: media.cover_art_url || '',
      });
      setCast(media.cast || []);
      setGenres(media.genres || []);
      setTmdbData(null);
      setSelectedFields([]);
      setLinkedTmdbInfo({
        tmdb_id: media.tmdb_id,
        media_type: media.media_type,
        tv_show_tmdb_id: media.tv_show_tmdb_id,
        tv_show_name: media.tv_show_name,
        season_number: media.season_number,
        episode_count: media.episode_count,
      });
      const hasExistingTmdb = Boolean(
        media.tmdb_id || (media.media_type === 'tv_season' && media.tv_show_tmdb_id)
      );
      setShowTmdbLookup(!hasExistingTmdb);
      setTmdbSearchMode(media.media_type === 'tv_season' ? 'tv' : 'movie');
      setTmdbSearchQuery(media.tv_show_name || media.title || '');
      setTmdbDirectId(
        media.media_type === 'tv_season'
          ? String(media.tv_show_tmdb_id || media.tmdb_id || '')
          : String(media.tmdb_id || '')
      );
      setTmdbMovieResults([]);
      setTmdbTVResults([]);
      setSelectedTVShowForLink(null);
      
      // Initialize series data
      if (media.series && Array.isArray(media.series)) {
        setSelectedSeriesIds(media.series.map(s => s.id));
        setSelectedSeriesData(media.series); // Store the series objects
      } else {
        setSelectedSeriesIds([]);
        setSelectedSeriesData([]);
      }
      setPrimarySeriesId(media.primary_series_id);
      setSeriesSearchQuery('');
      setShowSeriesDropdown(false);
      setLbState({
        rating: media.letterboxd_rating ?? null,
        liked: Boolean(media.letterboxd_liked),
        watched: Boolean(media.letterboxd_watched),
        lastWatchedDate: media.letterboxd_last_watched_date || null,
        rewatch: Boolean(media.letterboxd_rewatch),
        uri: media.letterboxd_uri || null,
      });
      setLbSearchQuery('');
      setLbSearchResults([]);
    }
  }, [media, isOpen]);

  // Load available series when modal opens
  useEffect(() => {
    if (isOpen) {
      const loadSeries = async () => {
        try {
          const series = await apiService.getSeries();
          setAvailableSeries(series);
        } catch (error) {
          console.error('Failed to load series:', error);
        }
      };
      loadSeries();
    }
  }, [isOpen]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCastChange = (index: number, value: string) => {
    const newCast = [...cast];
    newCast[index] = value;
    setCast(newCast);
  };

  const addCastMember = () => {
    setCast([...cast, '']);
  };

  const removeCastMember = (index: number) => {
    setCast(cast.filter((_, i) => i !== index));
  };

  const hasTmdbLink = Boolean(
    linkedTmdbInfo.tmdb_id ||
      (linkedTmdbInfo.media_type === 'tv_season' && linkedTmdbInfo.tv_show_tmdb_id)
  );

  const handleRefreshFromTMDB = async () => {
    if (!media || !hasTmdbLink) return;

    setIsRefreshing(true);
    try {
      const data = await apiService.refreshMediaFromTMDB(media.id);
      setTmdbData(data);
      setSelectedFields(Object.keys(data.tmdb || {}));
    } catch (error) {
      console.error('Failed to refresh TMDB data:', error);
      toast({ message: 'Failed to refresh TMDB data. Please try again.', type: 'error' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const parseTmdbNumericId = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const parsed = parseInt(trimmed, 10);
      return parsed > 0 ? parsed : null;
    }
    const urlMatch = trimmed.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/i);
    if (urlMatch) {
      const parsed = parseInt(urlMatch[1], 10);
      return parsed > 0 ? parsed : null;
    }
    return null;
  };

  const handleSearchTmdb = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = tmdbSearchQuery.trim();
    if (!q) return;

    setIsSearchingTmdb(true);
    setSelectedTVShowForLink(null);
    try {
      if (tmdbSearchMode === 'movie') {
        const res = await apiService.searchMovies(q, 1);
        setTmdbMovieResults(res.results.slice(0, 8));
        setTmdbTVResults([]);
      } else {
        const res = await apiService.searchTV(q, 1);
        setTmdbTVResults(res.results.slice(0, 8));
        setTmdbMovieResults([]);
      }
    } catch (error) {
      console.error('Failed to search TMDB:', error);
      toast({ message: 'Failed to search TMDB. Please try again.', type: 'error' });
    } finally {
      setIsSearchingTmdb(false);
    }
  };

  const applyTmdbMovieLink = async (tmdbId: number) => {
    if (!media) return;
    setIsLinkingTmdb(true);
    try {
      const details = await apiService.getMovieDetails(tmdbId);
      const posterUrl =
        details.poster_url ||
        (details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : '');

      // Persist tmdb_id immediately so Refresh from TMDB / PosterSelector work right away
      await apiService.updateMedia(media.id, {
        tmdb_id: details.id,
        media_type: 'movie',
      });

      setLinkedTmdbInfo({
        tmdb_id: details.id,
        media_type: 'movie',
        tv_show_tmdb_id: undefined,
        tv_show_name: undefined,
        season_number: undefined,
        episode_count: undefined,
      });
      setTmdbDirectId(String(details.id));
      setFormData((prev) => ({
        title: details.title || prev.title,
        synopsis: details.overview || prev.synopsis,
        director: details.director || prev.director,
        release_date: details.release_date || prev.release_date,
        cover_art_url: posterUrl || prev.cover_art_url,
      }));
      if (details.cast && details.cast.length > 0) {
        setCast(details.cast);
      }
      if (details.genres && details.genres.length > 0) {
        setGenres(details.genres);
      }
      setTmdbMovieResults([]);
      setShowTmdbLookup(false);
      toast({
        message: `Linked to TMDB movie "${details.title}" (#${details.id}) and populated metadata. Click Save Changes to finalize.`,
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to link TMDB movie:', error);
      toast({
        message: 'Could not find a TMDB movie with that ID. Check the ID or try searching by title.',
        type: 'error',
      });
    } finally {
      setIsLinkingTmdb(false);
    }
  };

  const handleSelectTVShowForLink = async (tvId: number) => {
    setIsLinkingTmdb(true);
    try {
      const tvDetails = await apiService.getTVDetails(tvId);
      setSelectedTVShowForLink(tvDetails);
      setTmdbTVResults([]);
    } catch (error) {
      console.error('Failed to fetch TMDB TV show details:', error);
      toast({
        message: 'Could not find a TMDB TV show with that ID. Check the ID or try searching by title.',
        type: 'error',
      });
    } finally {
      setIsLinkingTmdb(false);
    }
  };

  const applyTmdbTVSeasonLink = async (tvDetails: TMDbTVShowDetails, season: TMDbTVSeason) => {
    if (!media) return;
    setIsLinkingTmdb(true);
    try {
      let episodeCount = season.episode_count;
      let overview = season.overview || tvDetails.overview;
      let airDate = season.air_date || tvDetails.first_air_date;
      let posterUrl = season.poster_path
        ? `https://image.tmdb.org/t/p/w500${season.poster_path}`
        : tvDetails.poster_url ||
          (tvDetails.poster_path ? `https://image.tmdb.org/t/p/w500${tvDetails.poster_path}` : '');

      try {
        const seasonDetails = await apiService.getTVSeasonDetails(tvDetails.id, season.season_number);
        if (seasonDetails) {
          episodeCount = seasonDetails.episodes?.length || seasonDetails.episode_count || episodeCount;
          overview = seasonDetails.overview || overview;
          airDate = seasonDetails.air_date || airDate;
          if (seasonDetails.poster_path) {
            posterUrl = `https://image.tmdb.org/t/p/w500${seasonDetails.poster_path}`;
          }
        }
      } catch {
        // Use summary season info if detailed season call fails
      }

      const seasonTitle =
        tvDetails.seasons.length === 1 && season.season_number === 1
          ? `${tvDetails.name} - Season 1`
          : season.season_number === 0
          ? `${tvDetails.name} - Specials`
          : `${tvDetails.name} - Season ${season.season_number}`;

      await apiService.updateMedia(media.id, {
        tmdb_id: season.id || tvDetails.id,
        media_type: 'tv_season',
        tv_show_tmdb_id: tvDetails.id,
        tv_show_name: tvDetails.name,
        season_number: season.season_number,
        episode_count: episodeCount,
      });

      setLinkedTmdbInfo({
        tmdb_id: season.id || tvDetails.id,
        media_type: 'tv_season',
        tv_show_tmdb_id: tvDetails.id,
        tv_show_name: tvDetails.name,
        season_number: season.season_number,
        episode_count: episodeCount,
      });
      setTmdbDirectId(String(tvDetails.id));
      setFormData((prev) => ({
        title: seasonTitle || prev.title,
        synopsis: overview || prev.synopsis,
        director: tvDetails.creators || prev.director,
        release_date: airDate || prev.release_date,
        cover_art_url: posterUrl || prev.cover_art_url,
      }));
      if (tvDetails.cast && tvDetails.cast.length > 0) {
        setCast(tvDetails.cast);
      }
      if (tvDetails.genres && tvDetails.genres.length > 0) {
        setGenres(tvDetails.genres);
      }
      setSelectedTVShowForLink(null);
      setShowTmdbLookup(false);
      toast({
        message: `Linked to TMDB TV show "${tvDetails.name}" (Season ${season.season_number}) and populated metadata. Click Save Changes to finalize.`,
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to link TMDB TV season:', error);
      toast({ message: 'Failed to link TMDB TV season. Please try again.', type: 'error' });
    } finally {
      setIsLinkingTmdb(false);
    }
  };

  const handleLinkByDirectId = async () => {
    const parsedId = parseTmdbNumericId(tmdbDirectId);
    if (!parsedId) {
      toast({
        message: 'Please enter a valid numeric TMDB ID or TMDB URL.',
        type: 'warning',
      });
      return;
    }
    if (tmdbSearchMode === 'movie') {
      await applyTmdbMovieLink(parsedId);
    } else {
      await handleSelectTVShowForLink(parsedId);
    }
  };

  const handleFieldToggle = (field: string) => {
    setSelectedFields(prev => 
      prev.includes(field) 
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  const handleApplyTMDBFields = async () => {
    if (!media || selectedFields.length === 0) return;

    setIsSaving(true);
    try {
      const updatedMedia = await apiService.updateMediaFromTMDB(media.id, selectedFields);
      onSave(updatedMedia);
      setTmdbData(null);
      setSelectedFields([]);
    } catch (error) {
      console.error('Failed to apply TMDB fields:', error);
      toast({ message: 'Failed to apply TMDB fields. Please try again.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!media) return;

    setIsSaving(true);
    try {
      // Build series_associations array
      const series_associations = selectedSeriesIds.map(seriesId => ({
        series_id: seriesId,
        sort_order: null,
        auto_sort: true,
      }));

      const updatedMedia = await apiService.updateMedia(media.id, {
        ...formData,
        tmdb_id: linkedTmdbInfo.tmdb_id,
        media_type: linkedTmdbInfo.media_type,
        tv_show_tmdb_id: linkedTmdbInfo.tv_show_tmdb_id,
        tv_show_name: linkedTmdbInfo.tv_show_name,
        season_number: linkedTmdbInfo.season_number,
        episode_count: linkedTmdbInfo.episode_count,
        genres,
        cast: cast.filter(c => c.trim() !== ''),
        series_associations,
        primary_series_id: primarySeriesId || null,
      });
      onSave(updatedMedia);
      onClose();
    } catch (error) {
      console.error('Failed to save media:', error);
      toast({ message: 'Failed to save media. Please try again.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Series management handlers
  const handleAddSeries = (seriesId: number) => {
    if (!selectedSeriesIds.includes(seriesId)) {
      const seriesToAdd = availableSeries.find(s => s.id === seriesId);
      if (seriesToAdd) {
        setSelectedSeriesIds([...selectedSeriesIds, seriesId]);
        setSelectedSeriesData([...selectedSeriesData, seriesToAdd]);
      }
    }
    setSeriesSearchQuery('');
    setShowSeriesDropdown(false);
  };

  const handleRemoveSeries = (seriesId: number) => {
    setSelectedSeriesIds(selectedSeriesIds.filter(id => id !== seriesId));
    setSelectedSeriesData(selectedSeriesData.filter(s => s.id !== seriesId));
    // If removing primary series, clear it
    if (primarySeriesId === seriesId) {
      setPrimarySeriesId(undefined);
    }
  };

  const handleSetPrimarySeries = (seriesId: number) => {
    if (selectedSeriesIds.includes(seriesId)) {
      setPrimarySeriesId(seriesId === primarySeriesId ? undefined : seriesId);
    }
  };

  const handleSelectPosterClick = () => {
    setShowPosterSelector(true);
  };

  const handlePosterSelected = (url: string) => {
    setFormData(prev => ({ ...prev, cover_art_url: url }));
    setShowPosterSelector(false);
  };

  const handleSearchLetterboxdCache = async (query: string) => {
    setLbSearchQuery(query);
    if (!query.trim()) {
      setLbSearchResults([]);
      return;
    }
    setIsSearchingLb(true);
    try {
      const { results } = await apiService.searchLetterboxdCache(query.trim(), 12);
      setLbSearchResults(results);
    } catch (error) {
      console.error('Failed to search Letterboxd cache:', error);
    } finally {
      setIsSearchingLb(false);
    }
  };

  const handleLinkLetterboxdItem = async (cacheItem: LetterboxdCacheItem) => {
    if (!media) return;
    setIsLinkingLb(true);
    try {
      const { media: updated } = await apiService.linkLetterboxdMedia(media.id, cacheItem.id);
      setLbState({
        rating: updated.letterboxd_rating ?? null,
        liked: Boolean(updated.letterboxd_liked),
        watched: Boolean(updated.letterboxd_watched),
        lastWatchedDate: updated.letterboxd_last_watched_date || null,
        rewatch: Boolean(updated.letterboxd_rewatch),
        uri: updated.letterboxd_uri || null,
      });
      setLbSearchQuery('');
      setLbSearchResults([]);
      onSave(updated);
      toast({
        message: `Linked "${media.title}" to Letterboxd entry "${cacheItem.filmTitle}".`,
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to link Letterboxd entry:', error);
      toast({ message: 'Failed to link Letterboxd entry.', type: 'error' });
    } finally {
      setIsLinkingLb(false);
    }
  };

  const handleUnlinkLetterboxd = async () => {
    if (!media) return;
    setIsLinkingLb(true);
    try {
      const { media: updated } = await apiService.unlinkLetterboxdMedia(media.id);
      setLbState({
        rating: null,
        liked: false,
        watched: false,
        lastWatchedDate: null,
        rewatch: false,
        uri: null,
      });
      onSave(updated);
      toast({ message: 'Unlinked Letterboxd data from this movie.', type: 'info' });
    } catch (error) {
      console.error('Failed to unlink Letterboxd entry:', error);
      toast({ message: 'Failed to unlink Letterboxd entry.', type: 'error' });
    } finally {
      setIsLinkingLb(false);
    }
  };

  // Filter available series for dropdown
  const filteredAvailableSeries = availableSeries.filter(series => {
    const matchesSearch = series.name.toLowerCase().includes(seriesSearchQuery.toLowerCase()) ||
                         series.sort_name.toLowerCase().includes(seriesSearchQuery.toLowerCase());
    const notAlreadySelected = !selectedSeriesIds.includes(series.id);
    return matchesSearch && notAlreadySelected;
  });

  if (!isOpen || !media) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Edit Media: {media.title}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6">
            {/* TMDB Link & Refresh Section */}
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    TMDB Metadata
                  </h3>
                  {hasTmdbLink ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                      {linkedTmdbInfo.media_type === 'tv_season' ? (
                        <>
                          TV ID #{linkedTmdbInfo.tv_show_tmdb_id || linkedTmdbInfo.tmdb_id}
                          {linkedTmdbInfo.season_number != null && ` • Season ${linkedTmdbInfo.season_number}`}
                        </>
                      ) : (
                        <>Movie ID #{linkedTmdbInfo.tmdb_id}</>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      Not linked to TMDB
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTmdbLookup((v) => !v)}
                    className="btn-secondary text-sm"
                  >
                    {showTmdbLookup
                      ? 'Hide TMDB Lookup'
                      : hasTmdbLink
                      ? 'Change TMDB Match'
                      : 'Lookup / Add TMDB ID'}
                  </button>
                  {hasTmdbLink && (
                    <button
                      type="button"
                      onClick={handleRefreshFromTMDB}
                      disabled={isRefreshing}
                      className="btn-primary text-sm"
                    >
                      {isRefreshing ? 'Refreshing...' : 'Refresh from TMDB'}
                    </button>
                  )}
                </div>
              </div>

              {/* TMDB Lookup / Direct ID Panel */}
              {showTmdbLookup && (
                <div className="mt-4 pt-4 border-t border-blue-200/70 dark:border-blue-800/50 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      Search TMDB by title or enter a TMDB ID / URL directly. (Documentaries like <em>Planet Earth</em> or <em>Blue Planet</em> are listed under TV Shows on TMDB.)
                    </p>
                    <div
                      role="group"
                      aria-label="TMDB media type"
                      className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5 text-xs font-medium"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setTmdbSearchMode('movie');
                          setSelectedTVShowForLink(null);
                        }}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          tmdbSearchMode === 'movie'
                            ? 'bg-primary-600 text-white'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        Movie
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTmdbSearchMode('tv');
                          setSelectedTVShowForLink(null);
                        }}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          tmdbSearchMode === 'tv'
                            ? 'bg-primary-600 text-white'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        TV / Miniseries
                      </button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    {/* Search by Title */}
                    <form onSubmit={handleSearchTmdb} className="flex gap-2">
                      <input
                        type="text"
                        value={tmdbSearchQuery}
                        onChange={(e) => setTmdbSearchQuery(e.target.value)}
                        placeholder={
                          tmdbSearchMode === 'tv'
                            ? 'Search TMDB TV shows (e.g., Planet Earth)...'
                            : 'Search TMDB movies (e.g., Disneynature Earth)...'
                        }
                        aria-label="Search TMDB by title"
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                      <button
                        type="submit"
                        disabled={isSearchingTmdb || isLinkingTmdb || !tmdbSearchQuery.trim()}
                        className="btn-primary text-sm whitespace-nowrap"
                      >
                        {isSearchingTmdb ? 'Searching...' : 'Search TMDB'}
                      </button>
                    </form>

                    {/* Direct TMDB ID or URL */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tmdbDirectId}
                        onChange={(e) => setTmdbDirectId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleLinkByDirectId();
                          }
                        }}
                        placeholder={
                          tmdbSearchMode === 'tv'
                            ? 'TMDB TV ID or URL (e.g., 1044)...'
                            : 'TMDB Movie ID or URL (e.g., 152532)...'
                        }
                        aria-label="TMDB ID or URL"
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                      <button
                        type="button"
                        onClick={handleLinkByDirectId}
                        disabled={isLinkingTmdb || !tmdbDirectId.trim()}
                        className="btn-secondary text-sm whitespace-nowrap"
                      >
                        {isLinkingTmdb ? 'Linking...' : 'Link by ID'}
                      </button>
                    </div>
                  </div>

                  {/* Movie Search Results */}
                  {tmdbSearchMode === 'movie' && tmdbMovieResults.length > 0 && (
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700 shadow-sm">
                      {tmdbMovieResults.map((item) => {
                        const year = item.release_date ? new Date(item.release_date).getFullYear() : null;
                        const poster = item.poster_path
                          ? `https://image.tmdb.org/t/p/w92${item.poster_path}`
                          : null;
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 p-2.5 hover:bg-gray-50 dark:hover:bg-gray-750"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-14 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                                {poster && (
                                  <img
                                    src={poster}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {item.title}{' '}
                                  {year && (
                                    <span className="text-gray-500 dark:text-gray-400 font-normal">
                                      ({year})
                                    </span>
                                  )}
                                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                                    #{item.id}
                                  </span>
                                </div>
                                {item.overview && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                                    {item.overview}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isLinkingTmdb}
                              onClick={() => applyTmdbMovieLink(item.id)}
                              className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
                            >
                              Use This Match
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* TV Search Results */}
                  {tmdbSearchMode === 'tv' && tmdbTVResults.length > 0 && !selectedTVShowForLink && (
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700 shadow-sm">
                      {tmdbTVResults.map((show) => {
                        const year = show.first_air_date ? new Date(show.first_air_date).getFullYear() : null;
                        const poster = show.poster_path
                          ? `https://image.tmdb.org/t/p/w92${show.poster_path}`
                          : null;
                        return (
                          <div
                            key={show.id}
                            className="flex items-center justify-between gap-3 p-2.5 hover:bg-gray-50 dark:hover:bg-gray-750"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-14 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
                                {poster && (
                                  <img
                                    src={poster}
                                    alt={show.name}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {show.name}{' '}
                                  {year && (
                                    <span className="text-gray-500 dark:text-gray-400 font-normal">
                                      ({year})
                                    </span>
                                  )}
                                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                                    #{show.id}
                                  </span>
                                </div>
                                {show.overview && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                                    {show.overview}
                                  </p>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isLinkingTmdb}
                              onClick={() => handleSelectTVShowForLink(show.id)}
                              className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
                            >
                              Select Show
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Season Picker when linking a TV Show */}
                  {selectedTVShowForLink && (
                    <div className="rounded-lg border border-purple-200 dark:border-purple-800/60 bg-white dark:bg-gray-800 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Select Season for {selectedTVShowForLink.name} (#{selectedTVShowForLink.id})
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedTVShowForLink(null)}
                          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                          Back
                        </button>
                      </div>
                      <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                        {selectedTVShowForLink.seasons.map((season) => (
                          <div
                            key={season.id}
                            className="flex items-center justify-between gap-3 py-2 px-1"
                          >
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {season.name}{' '}
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                                  ({season.episode_count} episodes
                                  {season.air_date
                                    ? ` • ${new Date(season.air_date).getFullYear()}`
                                    : ''}
                                  )
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isLinkingTmdb}
                              onClick={() => applyTmdbTVSeasonLink(selectedTVShowForLink, season)}
                              className="btn-primary text-xs px-3 py-1"
                            >
                              Link Season
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tmdbData && (
                <div className="mt-4 pt-4 border-t border-blue-200/70 dark:border-blue-800/50 space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Compare current data with latest TMDB data and select which fields to update:
                  </p>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Current Data */}
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Current Data</h4>
                      <div className="space-y-3">
                        {Object.entries(tmdbData.current).map(([key, _value]) => (
                          <div key={key} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`current-${key}`}
                              checked={selectedFields.includes(key)}
                              onChange={() => handleFieldToggle(key)}
                              className="rounded"
                            />
                            <label htmlFor={`current-${key}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* TMDB Data */}
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">TMDB Data</h4>
                      <div className="space-y-3">
                        {Object.entries(tmdbData.tmdb).map(([key, _value]) => (
                          <div key={key} className="text-sm">
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                            </span>
                            <div className="mt-1 text-gray-600 dark:text-gray-400">
                              {key === 'cast' ? (_value as string[]).join(', ') : 
                               key === 'genres' ? (_value as Array<{id: number; name: string}>).map(g => g.name).join(', ') :
                               String(_value || 'N/A')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setTmdbData(null)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleApplyTMDBFields}
                      disabled={selectedFields.length === 0 || isSaving}
                      className="btn-primary"
                    >
                      {isSaving ? 'Applying...' : `Apply ${selectedFields.length} Fields`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Manual Edit Form */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Manual Edit
              </h3>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  {/* TV Show Info (read-only) */}
                  {linkedTmdbInfo.media_type === 'tv_season' && (
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <div className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">TV Season</div>
                      {linkedTmdbInfo.tv_show_name && (
                        <div className="text-sm text-gray-900 dark:text-gray-100">{linkedTmdbInfo.tv_show_name}</div>
                      )}
                      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {linkedTmdbInfo.season_number != null && <span>Season {linkedTmdbInfo.season_number}</span>}
                        {linkedTmdbInfo.episode_count != null && <span>{linkedTmdbInfo.episode_count} episodes</span>}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {linkedTmdbInfo.media_type === 'tv_season' ? 'Creator' : 'Director'}
                    </label>
                    <input
                      type="text"
                      value={formData.director}
                      onChange={(e) => handleInputChange('director', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Release Date
                    </label>
                    <input
                      type="date"
                      value={formData.release_date}
                      onChange={(e) => handleInputChange('release_date', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Cover Art URL
                    </label>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={handleSelectPosterClick}
                        className="btn-secondary text-sm flex-1"
                        title="Search box art or select alternative poster"
                      >
                        Find Cover Art
                      </button>
                    </div>
                    <input
                      type="url"
                      value={formData.cover_art_url}
                      onChange={(e) => handleInputChange('cover_art_url', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-gray-700 dark:text-gray-100"
                    />
                    {formData.cover_art_url && (
                      <img
                        src={formData.cover_art_url}
                        alt="Cover preview"
                        className="mt-2 w-32 h-48 object-cover rounded"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Synopsis
                    </label>
                    <textarea
                      value={formData.synopsis}
                      onChange={(e) => handleInputChange('synopsis', e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Cast
                    </label>
                    <div className="space-y-2">
                      {cast.map((member, index) => (
                        <div key={index} className="flex space-x-2">
                          <input
                            type="text"
                            value={member}
                            onChange={(e) => handleCastChange(index, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-gray-700 dark:text-gray-100"
                            placeholder="Cast member name"
                          />
                          <button
                            type="button"
                            onClick={() => removeCastMember(index)}
                            className="px-3 py-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addCastMember}
                        className="text-sm text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        + Add Cast Member
                      </button>
                    </div>
                  </div>

                  {genres && genres.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Genres
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {genres.map((genre) => (
                          <span
                            key={genre.id}
                            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm"
                          >
                            {genre.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Series Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Series
                    </label>
                    
                    {/* Selected Series Chips */}
                    {selectedSeriesIds.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {selectedSeriesIds.map((seriesId) => {
                          // Use selectedSeriesData first, fallback to availableSeries
                          const series = selectedSeriesData.find(s => s.id === seriesId) || 
                                       availableSeries.find(s => s.id === seriesId);
                          if (!series) {
                            // Series not loaded yet, show placeholder
                            return (
                              <span
                                key={seriesId}
                                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                              >
                                <span>Loading...</span>
                              </span>
                            );
                          }
                          const isPrimary = primarySeriesId === seriesId;
                          
                          return (
                            <span
                              key={seriesId}
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                                isPrimary
                                  ? 'bg-primary-200 text-primary-900 dark:bg-primary-800 dark:text-primary-200 border-2 border-primary-500'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {isPrimary && (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                              )}
                              <span>{series.name}</span>
                              <button
                                type="button"
                                onClick={() => handleSetPrimarySeries(seriesId)}
                                className={`ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors ${
                                  isPrimary
                                    ? 'hover:bg-primary-300 dark:hover:bg-primary-700'
                                    : 'hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                                title={isPrimary ? 'Remove as primary' : 'Set as primary'}
                              >
                                {!isPrimary && (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                  </svg>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveSeries(seriesId)}
                                className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                title="Remove series"
                              >
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Add Series Input */}
                    <div className="relative">
                      <input
                        type="text"
                        value={seriesSearchQuery}
                        onChange={(e) => {
                          setSeriesSearchQuery(e.target.value);
                          setShowSeriesDropdown(true);
                        }}
                        onBlur={() => {
                          // Delay closing to allow clicking on dropdown items
                          setTimeout(() => setShowSeriesDropdown(false), 200);
                        }}
                        placeholder="Search and add series..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:bg-gray-700 dark:text-gray-100"
                      />
                      
                      {/* Dropdown */}
                      {showSeriesDropdown && filteredAvailableSeries.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredAvailableSeries.map((series) => (
                            <button
                              key={series.id}
                              type="button"
                              onClick={() => handleAddSeries(series.id)}
                              className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              {series.name}
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {showSeriesDropdown && seriesSearchQuery && filteredAvailableSeries.length === 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                          No series found
                        </div>
                      )}
                    </div>
                    
                  </div>

                  {/* Letterboxd Link Section (for Movies) */}
                  {media.media_type !== 'tv_season' && (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3 bg-gray-50/60 dark:bg-gray-900/30">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <LetterboxdDotsIcon className="h-3 w-auto" />
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Letterboxd Activity Link
                          </span>
                        </div>
                        {hasLetterboxdActivity({
                          ...media,
                          letterboxd_rating: lbState.rating,
                          letterboxd_liked: lbState.liked,
                          letterboxd_watched: lbState.watched,
                          letterboxd_last_watched_date: lbState.lastWatchedDate,
                        }) && (
                          <button
                            type="button"
                            onClick={handleUnlinkLetterboxd}
                            disabled={isLinkingLb}
                            className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                          >
                            Unlink
                          </button>
                        )}
                      </div>

                      {hasLetterboxdActivity({
                        ...media,
                        letterboxd_rating: lbState.rating,
                        letterboxd_liked: lbState.liked,
                        letterboxd_watched: lbState.watched,
                        letterboxd_last_watched_date: lbState.lastWatchedDate,
                      }) ? (
                        <div className="flex flex-wrap items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300">
                          {lbState.rating != null && lbState.rating > 0 && (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                              {formatStarString(lbState.rating)} ({lbState.rating})
                            </span>
                          )}
                          {lbState.liked && (
                            <span className="font-semibold text-orange-500">♥ Liked</span>
                          )}
                          <span>
                            {lbState.lastWatchedDate
                              ? `Watched ${formatWatchedDate(lbState.lastWatchedDate)}`
                              : 'Watched'}
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Not currently linked to a Letterboxd watch entry. Search your synced Letterboxd history below to link manually.
                        </p>
                      )}

                      <div className="relative">
                        <input
                          type="text"
                          value={lbSearchQuery}
                          onChange={(e) => handleSearchLetterboxdCache(e.target.value)}
                          placeholder="Search your Letterboxd history by film title..."
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                        />
                        {lbSearchResults.length > 0 && (
                          <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700 shadow-lg">
                            {lbSearchResults.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                disabled={isLinkingLb}
                                onClick={() => handleLinkLetterboxdItem(item)}
                                className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between gap-2"
                              >
                                <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {item.filmTitle} {item.filmYear ? `(${item.filmYear})` : ''}
                                </span>
                                <span className="flex shrink-0 items-center gap-1.5 text-gray-500 dark:text-gray-400">
                                  {item.rating != null && item.rating > 0 && (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                      {formatStarString(item.rating)}
                                    </span>
                                  )}
                                  {item.liked && <span className="text-orange-500">♥</span>}
                                  {item.lastWatchedDate && <span>{item.lastWatchedDate}</span>}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {lbSearchQuery.trim() && !isSearchingLb && lbSearchResults.length === 0 && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            No matching films found in your Letterboxd cache.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onClose}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Poster Selector */}
      {showPosterSelector && media && (
        <PosterSelector
          tmdbId={
            linkedTmdbInfo.media_type === 'tv_season'
              ? linkedTmdbInfo.tv_show_tmdb_id || linkedTmdbInfo.tmdb_id || null
              : linkedTmdbInfo.tmdb_id || null
          }
          movieTitle={formData.title || media.title}
          onSelect={handlePosterSelected}
          onClose={() => setShowPosterSelector(false)}
          currentPosterUrl={formData.cover_art_url}
          mediaType={linkedTmdbInfo.media_type}
          seasonNumber={linkedTmdbInfo.season_number}
        />
      )}
    </div>
  );
};

export default MediaEditModal;
