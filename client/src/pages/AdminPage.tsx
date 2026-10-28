import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useDisplayPreferences } from '../context/DisplayPreferencesContext';
import { useServerMode } from '../context/ServerModeContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import Logo from '../components/Logo';
import {
  SortField,
  SortOrder,
  LetterboxdStatusResponse,
  LetterboxdFuzzySuggestion,
} from '../types';
import { apiService } from '../services/api.service';
import MediaForm from '../components/MediaForm';
import SeriesManager from '../components/SeriesManager';
import BulkAddForm from '../components/BulkAddForm';
import {
  LetterboxdDotsIcon,
  formatStarString,
  formatWatchedDate,
  setCachedLetterboxdUsername,
} from '../components/LetterboxdBadge';
import { Button } from '../components/ui/Button';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';

type SettingsTab = 'general' | 'series' | 'data';

interface CsvValidationResult {
  fileName: string;
  csvText: string;
  valid: boolean;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  errors: Array<{ row: number; error: string; data?: any }>;
  warnings: Array<{ row: number; warning: string; data?: any }>;
}

function resolveInitialTab(param: string | null): SettingsTab {
  if (param === 'series') return 'series';
  if (param === 'data' || param === 'import') return 'data';
  return 'general';
}

const AdminPage: React.FC = () => {
  const { isAuthenticated, login, logout } = useAuth();
  const { setTheme } = useTheme();
  const { showFormatBadges, toggleFormatBadges } = useDisplayPreferences();
  const { isDesktop } = useServerMode();
  const [searchParams, setSearchParams] = useSearchParams();

  // Login state
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Active tab state synced with URL ?tab=
  const activeTab = resolveInitialTab(searchParams.get('tab'));
  const handleTabChange = (tab: string) => {
    const nextTab = resolveInitialTab(tab);
    setSearchParams(nextTab === 'general' ? {} : { tab: nextTab }, { replace: true });
  };

  // Settings state
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [defaultTheme, setDefaultTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [defaultSortBy, setDefaultSortBy] = useState<SortField>('created_at');
  const [defaultSortOrder, setDefaultSortOrder] = useState<SortOrder>('desc');
  const [collectionTitle, setCollectionTitle] = useState('Media Collection');
  const [savedCollectionTitle, setSavedCollectionTitle] = useState('Media Collection');
  const [tmdbApiKeyInput, setTmdbApiKeyInput] = useState('');
  const [showTmdbApiKey, setShowTmdbApiKey] = useState(false);
  const [tmdbConfigured, setTmdbConfigured] = useState(true);
  const [tmdbKeySource, setTmdbKeySource] = useState<'database' | 'env' | 'none'>('none');
  const [tmdbKeyMasked, setTmdbKeyMasked] = useState('');
  const [isSavingTmdbKey, setIsSavingTmdbKey] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Letterboxd Integration state
  const [letterboxdStatus, setLetterboxdStatus] = useState<LetterboxdStatusResponse | null>(null);
  const [letterboxdUsernameInput, setLetterboxdUsernameInput] = useState('');
  const [isSyncingLetterboxd, setIsSyncingLetterboxd] = useState(false);
  const [isImportingLetterboxd, setIsImportingLetterboxd] = useState(false);
  const [isDraggingLetterboxdFile, setIsDraggingLetterboxdFile] = useState(false);
  const [resolvingSuggestionKey, setResolvingSuggestionKey] = useState<string | null>(null);
  const letterboxdFileInputRef = useRef<HTMLInputElement>(null);

  // Import / Export state
  const [isExporting, setIsExporting] = useState(false);
  const [isValidatingCsv, setIsValidatingCsv] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMode, setImportMode] = useState<'add' | 'replace'>('add');
  const [isDraggingCsv, setIsDraggingCsv] = useState(false);
  const [csvValidation, setCsvValidation] = useState<CsvValidationResult | null>(null);
  const [showImportSchema, setShowImportSchema] = useState(false);
  const [importSchema, setImportSchema] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const settings = await apiService.getSettings();
      setIsPublic(settings.collection_public === 'true');
      setDefaultTheme((settings.default_theme as 'light' | 'dark' | 'system') || 'light');
      setDefaultSortBy((settings.default_sort_by as SortField) || 'created_at');
      setDefaultSortOrder((settings.default_sort_order as SortOrder) || 'desc');
      const loadedTitle = settings.collection_title || 'Media Collection';
      setCollectionTitle(loadedTitle);
      setSavedCollectionTitle(loadedTitle);
      setTmdbConfigured(settings.tmdb_configured !== 'false');
      setTmdbKeySource((settings.tmdb_key_source as 'database' | 'env' | 'none') || 'none');
      setTmdbKeyMasked(settings.tmdb_api_key_masked || '');
      if (settings.letterboxd_username !== undefined) {
        setLetterboxdUsernameInput(settings.letterboxd_username || '');
      }
      if (settings.default_theme) {
        setTheme(settings.default_theme as 'light' | 'dark' | 'system');
      }

      try {
        const lbStatus = await apiService.getLetterboxdStatus();
        setLetterboxdStatus(lbStatus);
        if (lbStatus.username) {
          setLetterboxdUsernameInput(lbStatus.username);
        }
      } catch {
        // Non-fatal if status endpoint is not available in mock/test environments
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      toast({ message: 'Failed to load settings.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    const success = await login(password);
    if (success) {
      setPassword('');
    } else {
      setLoginError('Invalid password. Please try again.');
    }
    setIsLoggingIn(false);
  };

  const handleTogglePublic = async () => {
    const nextPublic = !isPublic;
    setIsSavingSettings(true);
    try {
      await apiService.updateSetting('collection_public', nextPublic.toString());
      setIsPublic(nextPublic);
      toast({
        message: nextPublic
          ? 'Collection is now public.'
          : 'Collection is now private.',
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to update visibility:', error);
      toast({ message: 'Failed to update collection visibility. Please try again.', type: 'error' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    setIsSavingSettings(true);
    try {
      await apiService.updateSetting('default_theme', newTheme);
      setDefaultTheme(newTheme);
      setTheme(newTheme);
      toast({ message: `Default theme set to ${newTheme}.`, type: 'success' });
    } catch (error) {
      console.error('Failed to update theme:', error);
      toast({ message: 'Failed to update theme. Please try again.', type: 'error' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSortChange = async (field: SortField, order: SortOrder) => {
    setIsSavingSettings(true);
    try {
      await apiService.updateSettings({
        default_sort_by: field,
        default_sort_order: order,
      });
      setDefaultSortBy(field);
      setDefaultSortOrder(order);
      toast({ message: 'Default admin sort order updated.', type: 'success' });
    } catch (error) {
      console.error('Failed to update sort settings:', error);
      toast({ message: 'Failed to update sort settings. Please try again.', type: 'error' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveCollectionTitle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = collectionTitle.trim() || 'Media Collection';
    if (trimmed === savedCollectionTitle) return;

    setIsSavingSettings(true);
    try {
      await apiService.updateSetting('collection_title', trimmed);
      setCollectionTitle(trimmed);
      setSavedCollectionTitle(trimmed);
      toast({ message: 'Collection title saved.', type: 'success' });
    } catch (error) {
      console.error('Failed to update collection title:', error);
      toast({ message: 'Failed to update collection title. Please try again.', type: 'error' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveTmdbApiKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = tmdbApiKeyInput.trim();
    if (!trimmed) return;

    setIsSavingTmdbKey(true);
    try {
      await apiService.updateSetting('tmdb_api_key', trimmed);
      setTmdbApiKeyInput('');
      const refreshed = await apiService.getSettings();
      setTmdbConfigured(refreshed.tmdb_configured !== 'false');
      setTmdbKeySource((refreshed.tmdb_key_source as 'database' | 'env' | 'none') || 'database');
      setTmdbKeyMasked(refreshed.tmdb_api_key_masked || '');
      toast({ message: 'TMDb API key saved.', type: 'success' });
    } catch (error) {
      console.error('Failed to update TMDb API key:', error);
      toast({ message: 'Failed to save TMDb API key. Please try again.', type: 'error' });
    } finally {
      setIsSavingTmdbKey(false);
    }
  };

  const handleClearTmdbApiKey = async () => {
    setIsSavingTmdbKey(true);
    try {
      await apiService.updateSetting('tmdb_api_key', '');
      setTmdbApiKeyInput('');
      const refreshed = await apiService.getSettings();
      setTmdbConfigured(refreshed.tmdb_configured !== 'false');
      setTmdbKeySource((refreshed.tmdb_key_source as 'database' | 'env' | 'none') || 'none');
      setTmdbKeyMasked(refreshed.tmdb_api_key_masked || '');
      toast({ message: 'Stored TMDb API key cleared.', type: 'success' });
    } catch (error) {
      console.error('Failed to clear TMDb API key:', error);
      toast({ message: 'Failed to clear TMDb API key. Please try again.', type: 'error' });
    } finally {
      setIsSavingTmdbKey(false);
    }
  };

  const handleSaveAndSyncLetterboxd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = letterboxdUsernameInput.trim();
    if (!trimmed) {
      toast({ message: 'Please enter a Letterboxd username.', type: 'error' });
      return;
    }

    setIsSyncingLetterboxd(true);
    try {
      const { summary, status } = await apiService.syncLetterboxdRss(trimmed);
      setLetterboxdStatus(status);
      setLetterboxdUsernameInput(status.username || trimmed);
      setCachedLetterboxdUsername(status.username || trimmed);
      toast({
        message: `Synced ${summary.itemsProcessed} recent RSS entries! ${summary.matchedInCollection} collection movie(s) matched.`,
        type: 'success',
      });
    } catch (error: any) {
      console.error('Failed to sync Letterboxd RSS:', error);
      const errMsg =
        error?.response?.data?.error ||
        error?.message ||
        'Failed to sync Letterboxd RSS feed.';
      toast({ message: errMsg, type: 'error' });
    } finally {
      setIsSyncingLetterboxd(false);
    }
  };

  const handleToggleLetterboxdAutoSync = async () => {
    const currentAuto = letterboxdStatus ? letterboxdStatus.autoSync : true;
    const nextAuto = !currentAuto;
    setIsSavingSettings(true);
    try {
      await apiService.updateSetting('letterboxd_auto_sync', String(nextAuto));
      setLetterboxdStatus((prev) => (prev ? { ...prev, autoSync: nextAuto } : prev));
      toast({
        message: nextAuto
          ? 'Automatic Letterboxd RSS sync enabled.'
          : 'Automatic Letterboxd RSS sync paused.',
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to update Letterboxd auto-sync:', error);
      toast({ message: 'Failed to update Letterboxd sync schedule.', type: 'error' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleLetterboxdIntervalChange = async (hours: number) => {
    setIsSavingSettings(true);
    try {
      await apiService.updateSetting('letterboxd_sync_interval_hours', String(hours));
      setLetterboxdStatus((prev) => (prev ? { ...prev, syncIntervalHours: hours } : prev));
      toast({ message: `Letterboxd sync interval set to every ${hours} hour(s).`, type: 'success' });
    } catch (error) {
      console.error('Failed to update Letterboxd interval:', error);
      toast({ message: 'Failed to update sync interval.', type: 'error' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const processLetterboxdExportFile = async (file: File) => {
    setIsImportingLetterboxd(true);
    try {
      const { summary, status } = await apiService.importLetterboxdExport(file);
      setLetterboxdStatus(status);
      toast({
        message: `Imported ${summary.itemsProcessed} Letterboxd film(s)! ${summary.matchedInCollection} collection movie(s) matched${
          status.fuzzySuggestions.length > 0
            ? ` (${status.fuzzySuggestions.length} close match(es) to confirm below)`
            : ''
        }.`,
        type: 'success',
      });
    } catch (error: any) {
      console.error('Failed to import Letterboxd export:', error);
      const errMsg =
        error?.response?.data?.error ||
        error?.message ||
        'Failed to import Letterboxd export file.';
      toast({ message: errMsg, type: 'error' });
    } finally {
      setIsImportingLetterboxd(false);
      if (letterboxdFileInputRef.current) {
        letterboxdFileInputRef.current.value = '';
      }
    }
  };

  const handleLetterboxdFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processLetterboxdExportFile(file);
  };

  const handleDropLetterboxdFile = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingLetterboxdFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processLetterboxdExportFile(file);
  };

  const handleLinkFuzzySuggestion = async (suggestion: LetterboxdFuzzySuggestion) => {
    const key = `${suggestion.mediaId}:${suggestion.cacheId}`;
    setResolvingSuggestionKey(key);
    try {
      const { status } = await apiService.linkLetterboxdMedia(
        suggestion.mediaId,
        suggestion.cacheId,
      );
      setLetterboxdStatus(status);
      toast({
        message: `Linked "${suggestion.mediaTitle}" to "${suggestion.letterboxdTitle}".`,
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to link suggestion:', error);
      toast({ message: 'Failed to link Letterboxd match.', type: 'error' });
    } finally {
      setResolvingSuggestionKey(null);
    }
  };

  const handleDismissFuzzySuggestion = async (suggestion: LetterboxdFuzzySuggestion) => {
    const key = `${suggestion.mediaId}:${suggestion.cacheId}`;
    setResolvingSuggestionKey(key);
    try {
      const { status } = await apiService.dismissLetterboxdSuggestion(
        suggestion.mediaId,
        suggestion.cacheId,
      );
      setLetterboxdStatus(status);
    } catch (error) {
      console.error('Failed to dismiss suggestion:', error);
      toast({ message: 'Failed to dismiss suggestion.', type: 'error' });
    } finally {
      setResolvingSuggestionKey(null);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await apiService.exportCollection();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().split('T')[0];
      link.download = `cinefile-export-${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast({ message: 'Collection exported to CSV.', type: 'success' });
    } catch (error) {
      console.error('Failed to export collection:', error);
      toast({ message: 'Failed to export collection. Please try again.', type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  const processCsvFile = async (file: File) => {
    setIsValidatingCsv(true);
    try {
      const text = await file.text();
      const validation = await apiService.validateCSV(text);
      setCsvValidation({
        fileName: file.name,
        csvText: text,
        valid: Boolean(validation.valid),
        total_rows: validation.total_rows ?? 0,
        valid_rows: validation.valid_rows ?? 0,
        invalid_rows: validation.invalid_rows ?? 0,
        errors: validation.errors ?? [],
        warnings: validation.warnings ?? [],
      });
      if (!validation.valid) {
        toast({
          message: `CSV validation found ${validation.errors?.length || 0} error(s). Review details below.`,
          type: 'error',
        });
      }
    } catch (error: any) {
      console.error('Failed to validate CSV:', error);
      const errMsg = error?.response?.data?.details || error?.response?.data?.error || 'Failed to validate CSV file.';
      toast({ message: errMsg, type: 'error' });
      setCsvValidation(null);
    } finally {
      setIsValidatingCsv(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processCsvFile(file);
  };

  const handleDropCsv = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingCsv(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await processCsvFile(file);
  };

  const handleExecuteImport = async () => {
    if (!csvValidation || !csvValidation.valid) return;

    const modeText =
      importMode === 'replace' ? 'REPLACE your entire collection' : 'ADD to your collection';
    const confirmMessage = `Import ${csvValidation.total_rows} row(s) from "${csvValidation.fileName}" and ${modeText}?${
      importMode === 'replace'
        ? '\n\nWARNING: This will permanently DELETE all existing physical items before importing!'
        : ''
    }`;

    const shouldImport = await confirm({
      title: importMode === 'replace' ? 'Replace Entire Collection?' : 'Confirm CSV Import',
      message: confirmMessage,
      confirmLabel: importMode === 'replace' ? 'Replace & Import' : 'Import Items',
      cancelLabel: 'Cancel',
      variant: importMode === 'replace' ? 'danger' : 'primary',
    });

    if (!shouldImport) return;

    setIsImporting(true);
    try {
      const result = await apiService.importCollection(csvValidation.csvText, importMode);
      if (result.success) {
        toast({
          message: `Import completed! Successful: ${result.results.successful}, Failed: ${result.results.failed}`,
          type: 'success',
        });
        setCsvValidation(null);
        await loadData();
      } else {
        toast({
          message: 'Import failed. Please check your CSV file and try again.',
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Failed to import collection:', error);
      toast({ message: 'Failed to import collection. Please try again.', type: 'error' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleViewSchema = async () => {
    if (!importSchema) {
      try {
        const schema = await apiService.getImportExportSchema();
        setImportSchema(schema);
      } catch (error) {
        console.error('Failed to load schema:', error);
        toast({ message: 'Failed to load CSV schema. Please try again.', type: 'error' });
        return;
      }
    }
    setShowImportSchema(!showImportSchema);
  };

  const handleDownloadSampleCsv = () => {
    if (!importSchema?.example_csv) return;
    const blob = new Blob([importSchema.example_csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cinefile-sample-import.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  // Unauthenticated Login View
  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-12 sm:py-20">
        <div className="max-w-md mx-auto">
          <div className="card p-6 sm:p-8">
            <div className="text-center mb-6">
              <div className="flex flex-col items-center">
                <Logo size="xl" className="mb-4" />
                <h1 className="text-2xl sm:text-3xl font-bold text-content">Admin Sign In</h1>
                <p className="text-sm text-content-muted mt-1">
                  Enter your administrator password to manage settings and collection data
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-password"
                  className="block text-sm font-medium text-content mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-16 border border-subtle bg-surface text-content rounded-[--radius-control] text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    placeholder="Enter admin password"
                    autoComplete="current-password"
                    aria-describedby={loginError ? 'admin-password-error' : undefined}
                    aria-invalid={loginError ? 'true' : 'false'}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-content-muted hover:text-content rounded"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {loginError && (
                  <p
                    id="admin-password-error"
                    className="mt-2 text-sm text-red-600 dark:text-red-400"
                    aria-live="polite"
                  >
                    {loginError}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                isLoading={isLoggingIn}
                disabled={!password}
                className="w-full"
              >
                Sign In
              </Button>

              <Button asChild variant="secondary" className="w-full">
                <Link to="/">← Back to Collection</Link>
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Loading Skeleton
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 sm:py-8 max-w-5xl space-y-6" aria-busy="true">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40 rounded-[--radius-control]" />
            <Skeleton className="h-4 w-72 rounded-[--radius-control]" />
          </div>
          <Skeleton className="h-10 w-28 rounded-[--radius-control]" />
        </div>
        <Skeleton className="h-10 w-80 rounded-[--radius-control]" />
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-[--radius-card]" />
          <Skeleton className="h-64 w-full rounded-[--radius-card]" />
        </div>
      </div>
    );
  }

  const isTitleDirty = (collectionTitle.trim() || 'Media Collection') !== savedCollectionTitle;

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8 max-w-5xl space-y-6">
      {/* Page Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-content">Settings</h1>
          <p className="text-sm text-content-muted mt-1">
            Configure your collection preferences, manage series, and import or export data
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAddForm(true)}
          >
            + Add Item
          </Button>
          {!isDesktop && (
            <Button
              variant="secondary"
              size="sm"
              onClick={logout}
            >
              Sign Out
            </Button>
          )}
        </div>
      </header>

      {/* 3-Tab Segmented Navigation */}
      <div className="overflow-x-auto">
        <SegmentedControl
          name="Settings sections"
          options={[
            { value: 'general', label: 'General' },
            { value: 'series', label: 'Series' },
            { value: 'data', label: 'Data & Import' },
          ]}
          value={activeTab}
          onChange={handleTabChange}
        />
      </div>

      {/* TAB 1: GENERAL */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Collection Profile & Privacy */}
          <section className="card space-y-6" aria-labelledby="profile-privacy-heading">
            <div>
              <h2 id="profile-privacy-heading" className="text-lg font-semibold text-content">
                Collection Profile & Privacy
              </h2>
              <p className="text-sm text-content-muted mt-0.5">
                Control how your collection is titled and whether visitors can browse it without signing in.
              </p>
            </div>

            {/* Collection Title */}
            <form onSubmit={handleSaveCollectionTitle} className="space-y-2">
              <label
                htmlFor="collection-title-input"
                className="block text-sm font-medium text-content"
              >
                Collection Title
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="collection-title-input"
                  type="text"
                  value={collectionTitle}
                  onChange={(e) => setCollectionTitle(e.target.value)}
                  disabled={isSavingSettings}
                  placeholder="Media Collection"
                  className="flex-1 px-3.5 py-2 border border-subtle rounded-[--radius-control] text-sm bg-surface text-content focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                />
                <Button
                  type="submit"
                  disabled={!isTitleDirty || isSavingSettings}
                  isLoading={isSavingSettings && isTitleDirty}
                >
                  Save Title
                </Button>
              </div>
              <p className="text-xs text-content-muted">
                Displayed as the main heading on your Collection page (e.g., &ldquo;Alex&rsquo;s Blu-ray Bonanza&rdquo; or &ldquo;Media Collection&rdquo;).
              </p>
            </form>

            {/* Public Collection Visibility */}
            {!isDesktop && (
              <div className="border-t border-subtle pt-5 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-content">
                      Make collection public
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        isPublic
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-surface-sunken border border-subtle text-content-muted'
                      }`}
                    >
                      {isPublic ? 'Public' : 'Private'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-content-muted">
                    Allow anyone to view your collection without logging in.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPublic}
                  aria-label="Make collection public"
                  onClick={handleTogglePublic}
                  disabled={isSavingSettings}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    isPublic ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isPublic ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </section>

          {/* TMDb API Integration */}
          <section className="card space-y-4" aria-labelledby="tmdb-integration-heading">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="tmdb-integration-heading" className="text-lg font-semibold text-content">
                    TMDb Metadata Integration
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      tmdbConfigured
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:bg-green-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:bg-amber-300'
                    }`}
                  >
                    {tmdbConfigured ? 'Configured' : 'API Key Needed'}
                  </span>
                </div>
                <p className="text-sm text-content-muted mt-0.5">
                  Used to search movies and TV shows, fetch cast &amp; crew metadata, and download cover art from The Movie Database (TMDb).
                </p>
              </div>
            </div>

            {tmdbKeyMasked && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[--radius-control] bg-surface-sunken border border-subtle px-3.5 py-2 text-xs text-content-muted">
                <span>
                  Active key: <code className="font-mono text-content">{tmdbKeyMasked}</code>{' '}
                  ({tmdbKeySource === 'database' ? 'stored in app settings' : 'from TMDB_API_KEY environment variable'})
                </span>
                {tmdbKeySource === 'database' && (
                  <button
                    type="button"
                    onClick={handleClearTmdbApiKey}
                    disabled={isSavingTmdbKey}
                    className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                  >
                    Clear stored key
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleSaveTmdbApiKey} className="space-y-2">
              <label
                htmlFor="tmdb-api-key-input"
                className="block text-sm font-medium text-content"
              >
                TMDb API Key (v3 auth)
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <input
                    id="tmdb-api-key-input"
                    type={showTmdbApiKey ? 'text' : 'password'}
                    value={tmdbApiKeyInput}
                    onChange={(e) => setTmdbApiKeyInput(e.target.value)}
                    disabled={isSavingTmdbKey}
                    placeholder={tmdbConfigured ? 'Enter new TMDb API key to replace active key' : 'Enter your TMDb v3 API key'}
                    className="w-full px-3.5 py-2 pr-16 border border-subtle rounded-[--radius-control] text-sm bg-surface text-content focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTmdbApiKey((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-content-muted hover:text-content rounded"
                    aria-label={showTmdbApiKey ? 'Hide TMDb API key' : 'Show TMDb API key'}
                  >
                    {showTmdbApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <Button
                  type="submit"
                  disabled={!tmdbApiKeyInput.trim() || isSavingTmdbKey}
                  isLoading={isSavingTmdbKey}
                >
                  Save API Key
                </Button>
              </div>
              <p className="text-xs text-content-muted">
                Get a free v3 API key from{' '}
                <a
                  href="https://www.themoviedb.org/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 dark:text-primary-400 hover:underline"
                >
                  themoviedb.org/settings/api
                </a>
                . Saving a key here overrides the <code className="font-mono">TMDB_API_KEY</code> environment variable.
              </p>
            </form>
          </section>

          {/* Letterboxd Integration */}
          <section className="card space-y-5" aria-labelledby="letterboxd-integration-heading">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <LetterboxdDotsIcon className="h-3.5 w-auto" />
                  <h2 id="letterboxd-integration-heading" className="text-lg font-semibold text-content">
                    Letterboxd Integration
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      letterboxdStatus?.configured
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-surface-sunken border border-subtle text-content-muted'
                    }`}
                  >
                    {letterboxdStatus?.username
                      ? `Connected: @${letterboxdStatus.username}`
                      : letterboxdStatus?.configured
                        ? 'History Loaded'
                        : 'Not Connected'}
                  </span>
                </div>
                <p className="text-sm text-content-muted mt-0.5">
                  Display your personal Letterboxd star ratings, liked hearts, and last watched dates on movies and box sets across your collection.
                </p>
              </div>
            </div>

            {/* Sync Status Banner */}
            {letterboxdStatus?.configured && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[--radius-control] bg-surface-sunken border border-subtle px-3.5 py-2.5 text-xs">
                <div className="space-y-0.5">
                  <div className="font-medium text-content">
                    Matched{' '}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {letterboxdStatus.matchedMoviesCount}
                    </span>{' '}
                    of {letterboxdStatus.totalCollectionMovies} collection movie(s) &middot;{' '}
                    {letterboxdStatus.totalCachedFilms} Letterboxd film(s) cached
                  </div>
                  <div className="text-content-muted">
                    {letterboxdStatus.lastSyncAt
                      ? `Last synced: ${new Date(letterboxdStatus.lastSyncAt).toLocaleString()}`
                      : 'No sync recorded yet'}
                    {letterboxdStatus.lastSyncStatus?.error && (
                      <span className="ml-2 text-red-600 dark:text-red-400">
                        ({letterboxdStatus.lastSyncStatus.error})
                      </span>
                    )}
                  </div>
                </div>
                {letterboxdStatus.username && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSaveAndSyncLetterboxd()}
                    isLoading={isSyncingLetterboxd}
                  >
                    Sync RSS Now
                  </Button>
                )}
              </div>
            )}

            {/* Letterboxd Username & RSS Sync */}
            <form onSubmit={handleSaveAndSyncLetterboxd} className="space-y-2">
              <label
                htmlFor="letterboxd-username-input"
                className="block text-sm font-medium text-content"
              >
                Letterboxd Username
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  id="letterboxd-username-input"
                  type="text"
                  value={letterboxdUsernameInput}
                  onChange={(e) => setLetterboxdUsernameInput(e.target.value)}
                  disabled={isSyncingLetterboxd}
                  placeholder="e.g. dave or https://letterboxd.com/dave/"
                  className="flex-1 px-3.5 py-2 border border-subtle rounded-[--radius-control] text-sm bg-surface text-content focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                />
                <Button
                  type="submit"
                  disabled={!letterboxdUsernameInput.trim() || isSyncingLetterboxd}
                  isLoading={isSyncingLetterboxd}
                >
                  Save &amp; Sync RSS
                </Button>
              </div>
              <p className="text-xs text-content-muted">
                Syncs your public RSS feed (<code className="font-mono">letterboxd.com/&lt;username&gt;/rss/</code>) and automatically links entries by TMDb ID.
              </p>
            </form>

            {/* Automatic Background / Desktop Launch Sync Schedule */}
            <div className="border-t border-subtle pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-medium text-content">
                  Automatic RSS Feed Sync
                </span>
                <p className="text-xs text-content-muted">
                  {isDesktop
                    ? 'Automatically syncs your Letterboxd RSS feed every time the Desktop app launches (and periodically while open).'
                    : 'Runs on a background schedule inside the server container so new diary entries are captured before rolling off the 50-item RSS feed.'}
                </p>
              </div>
              <div className="flex items-center gap-3 self-start sm:self-auto">
                {!isDesktop && (
                  <select
                    aria-label="Letterboxd sync interval"
                    value={letterboxdStatus?.syncIntervalHours ?? 4}
                    onChange={(e) => handleLetterboxdIntervalChange(Number(e.target.value))}
                    disabled={isSavingSettings || letterboxdStatus?.autoSync === false}
                    className="px-2.5 py-1.5 border border-subtle rounded-[--radius-control] text-xs bg-surface text-content"
                  >
                    <option value={1}>Every 1 hour</option>
                    <option value={4}>Every 4 hours</option>
                    <option value={6}>Every 6 hours</option>
                    <option value={12}>Every 12 hours</option>
                    <option value={24}>Every 24 hours</option>
                  </select>
                )}
                <button
                  type="button"
                  role="switch"
                  aria-checked={letterboxdStatus ? letterboxdStatus.autoSync : true}
                  aria-label="Automatic RSS Feed Sync"
                  onClick={handleToggleLetterboxdAutoSync}
                  disabled={isSavingSettings}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    (letterboxdStatus ? letterboxdStatus.autoSync : true)
                      ? 'bg-primary-600'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      (letterboxdStatus ? letterboxdStatus.autoSync : true)
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Historical Backfill via Letterboxd Account Export (.zip or .csv) */}
            <div className="border-t border-subtle pt-4 space-y-3">
              <div>
                <h3 className="text-sm font-medium text-content">
                  Backfill Full History (Letterboxd Export .ZIP or .CSV)
                </h3>
                <p className="text-xs text-content-muted mt-0.5">
                  Because Letterboxd&rsquo;s RSS feed only includes your 50 most recent diary entries, upload your account export ZIP from{' '}
                  <a
                    href="https://letterboxd.com/settings/data/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    letterboxd.com/settings/data
                  </a>{' '}
                  (or individual <code className="font-mono">ratings.csv</code> / <code className="font-mono">diary.csv</code> files) to import all historical ratings, likes, and watch dates.
                </p>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingLetterboxdFile(true);
                }}
                onDragLeave={() => setIsDraggingLetterboxdFile(false)}
                onDrop={handleDropLetterboxdFile}
                className={`border-2 border-dashed rounded-[--radius-card] p-4 text-center transition-colors ${
                  isDraggingLetterboxdFile
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20'
                    : 'border-subtle bg-surface-sunken/50 hover:border-emerald-500/60'
                }`}
              >
                <input
                  ref={letterboxdFileInputRef}
                  id="letterboxd-export-file-input"
                  type="file"
                  accept=".zip,.csv,application/zip,text/csv"
                  onChange={handleLetterboxdFileChange}
                  disabled={isImportingLetterboxd}
                  className="sr-only"
                />
                <p className="text-xs sm:text-sm font-medium text-content">
                  {isImportingLetterboxd
                    ? 'Importing Letterboxd history…'
                    : 'Drag and drop your letterboxd-*.zip export (or .csv) here'}
                </p>
                <div className="mt-2.5">
                  <label
                    htmlFor="letterboxd-export-file-input"
                    className="inline-flex cursor-pointer items-center justify-center rounded-[--radius-control] bg-surface border border-subtle px-3.5 py-1.5 text-xs font-semibold text-content hover:bg-surface-sunken transition-colors"
                  >
                    {isImportingLetterboxd ? 'Processing…' : 'Upload Letterboxd Export (.zip / .csv)'}
                  </label>
                </div>
              </div>
            </div>

            {/* Fuzzy Match Review Queue */}
            {letterboxdStatus && letterboxdStatus.fuzzySuggestions.length > 0 && (
              <div
                data-testid="letterboxd-fuzzy-review"
                className="rounded-[--radius-card] border border-amber-300/80 bg-amber-50/50 p-4 space-y-3 dark:border-amber-700/50 dark:bg-amber-950/20"
              >
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                    Confirm Close Title Matches ({letterboxdStatus.fuzzySuggestions.length})
                  </h3>
                  <p className="text-xs text-amber-800/90 dark:text-amber-300/80 mt-0.5">
                    These movies in your collection have slightly different titles or release years from entries in your Letterboxd history. Confirm to link them:
                  </p>
                </div>

                <div className="divide-y divide-amber-200/70 dark:divide-amber-800/50 rounded-lg border border-amber-200/80 dark:border-amber-800/60 bg-surface">
                  {letterboxdStatus.fuzzySuggestions.map((suggestion) => {
                    const key = `${suggestion.mediaId}:${suggestion.cacheId}`;
                    const isBusy = resolvingSuggestionKey === key;
                    const stars = formatStarString(suggestion.rating);
                    const watchedDate = formatWatchedDate(suggestion.lastWatchedDate);
                    return (
                      <div
                        key={key}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="text-content">
                            <span className="text-content-muted font-medium">In Cinefile: </span>
                            <strong className="font-semibold">{suggestion.mediaTitle}</strong>
                            {suggestion.mediaYear && (
                              <span className="text-content-muted"> ({suggestion.mediaYear})</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-content">
                            <span className="text-content-muted font-medium">In Letterboxd: </span>
                            <strong className="font-semibold">{suggestion.letterboxdTitle}</strong>
                            {suggestion.letterboxdYear && (
                              <span className="text-content-muted"> ({suggestion.letterboxdYear})</span>
                            )}
                            {stars && (
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                {stars}
                              </span>
                            )}
                            {suggestion.liked && (
                              <span className="text-orange-500" title="Liked">
                                ♥
                              </span>
                            )}
                            {watchedDate && (
                              <span className="text-content-muted">&middot; Watched {watchedDate}</span>
                            )}
                          </div>
                          <div className="text-[11px] text-content-muted">{suggestion.reason}</div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            disabled={isBusy}
                            onClick={() => handleLinkFuzzySuggestion(suggestion)}
                          >
                            Link Match
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={isBusy}
                            onClick={() => handleDismissFuzzySuggestion(suggestion)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Appearance & Display Defaults */}
          <section className="card space-y-6" aria-labelledby="appearance-defaults-heading">
            <div>
              <h2 id="appearance-defaults-heading" className="text-lg font-semibold text-content">
                Appearance & Display Defaults
              </h2>
              <p className="text-sm text-content-muted mt-0.5">
                Customize your preferred theme, card badges, and default collection sort order.
              </p>
            </div>

            {/* Theme Selection */}
            <div className="space-y-2.5">
              <span className="block text-sm font-medium text-content">Default Theme</span>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    {
                      value: 'light',
                      label: 'Light',
                      icon: (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                          />
                        </svg>
                      ),
                    },
                    {
                      value: 'dark',
                      label: 'Dark',
                      icon: (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                          />
                        </svg>
                      ),
                    },
                    {
                      value: 'system',
                      label: 'System',
                      icon: (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                      ),
                    },
                  ] as const
                ).map((option) => {
                  const selected = defaultTheme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleThemeChange(option.value)}
                      disabled={isSavingSettings}
                      aria-pressed={selected}
                      className={`py-2.5 px-3 rounded-[--radius-control] border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        selected
                          ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/25 text-primary-700 dark:text-primary-300'
                          : 'border-subtle bg-surface hover:bg-surface-sunken text-content'
                      }`}
                    >
                      {option.icon}
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Format Badges Toggle */}
            <div className="border-t border-subtle pt-5 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-sm font-medium text-content">
                  Show format badges on collection cards
                </span>
                <p className="text-xs sm:text-sm text-content-muted">
                  Display 4K UHD, Blu-ray, DVD, and edition pills overlaid on poster art in the collection grid.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showFormatBadges}
                aria-label="Show format badges on collection cards"
                onClick={toggleFormatBadges}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  showFormatBadges ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showFormatBadges ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Default Admin Sort Order */}
            <div className="border-t border-subtle pt-5 space-y-3">
              <div>
                <h3 className="text-sm font-medium text-content">Default Sort Order (Admin)</h3>
                <p className="text-xs sm:text-sm text-content-muted">
                  Default sorting applied when you open the Collection page while signed in as admin.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="default-sort-by-select"
                    className="block text-xs font-medium text-content-muted mb-1"
                  >
                    Sort by
                  </label>
                  <select
                    id="default-sort-by-select"
                    value={defaultSortBy}
                    onChange={(e) => handleSortChange(e.target.value as SortField, defaultSortOrder)}
                    disabled={isSavingSettings}
                    className="w-full px-3 py-2 border border-subtle rounded-[--radius-control] text-sm bg-surface text-content"
                  >
                    <option value="title">Title</option>
                    <option value="series_sort">Series</option>
                    <option value="director_last_name">Director</option>
                    <option value="release_date">Year</option>
                    <option value="created_at">Date Added</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="default-sort-order-select"
                    className="block text-xs font-medium text-content-muted mb-1"
                  >
                    Order
                  </label>
                  <select
                    id="default-sort-order-select"
                    value={defaultSortOrder}
                    onChange={(e) => handleSortChange(defaultSortBy, e.target.value as SortOrder)}
                    disabled={isSavingSettings}
                    className="w-full px-3 py-2 border border-subtle rounded-[--radius-control] text-sm bg-surface text-content"
                  >
                    <option value="asc">Ascending (A–Z, 0–9)</option>
                    <option value="desc">Descending (Z–A, 9–0)</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-content-muted bg-surface-sunken border border-subtle px-3 py-2 rounded-[--radius-control]">
                Public visitors default to <strong>Title (Ascending)</strong> and can customize sorting for their browser session.
              </p>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: SERIES */}
      {activeTab === 'series' && <SeriesManager />}

      {/* TAB 3: DATA & IMPORT */}
      {activeTab === 'data' && (
        <div className="space-y-6">
          {/* Backup & Export */}
          <section className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-content">Export Collection Backup</h2>
              <p className="text-sm text-content-muted mt-0.5">
                Download your entire collection—including physical items, formats, series, edition tags, and notes—as a UTF-8 CSV file.
              </p>
            </div>
            <Button
              onClick={handleExport}
              isLoading={isExporting}
              className="flex-shrink-0"
            >
              Export to CSV
            </Button>
          </section>

          {/* Import CSV */}
          <section className="card space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-content">Import Collection from CSV</h2>
                <p className="text-sm text-content-muted mt-0.5">
                  Validate and import a Cinefile CSV file. Required columns:{' '}
                  <code className="px-1.5 py-0.5 rounded bg-surface-sunken border border-subtle text-xs font-mono">
                    title
                  </code>
                  ,{' '}
                  <code className="px-1.5 py-0.5 rounded bg-surface-sunken border border-subtle text-xs font-mono">
                    physical_item_name
                  </code>
                  , and{' '}
                  <code className="px-1.5 py-0.5 rounded bg-surface-sunken border border-subtle text-xs font-mono">
                    formats
                  </code>
                  .
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={handleViewSchema}>
                {showImportSchema ? 'Hide CSV Schema' : 'View CSV Schema'}
              </Button>
            </div>

            {/* Import Mode Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Import mode">
              <label
                className={`flex items-start gap-3 p-3.5 rounded-[--radius-control] border cursor-pointer transition-colors ${
                  importMode === 'add'
                    ? 'border-primary-600 bg-primary-50/60 dark:bg-primary-900/20'
                    : 'border-subtle bg-surface hover:bg-surface-sunken'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  value="add"
                  checked={importMode === 'add'}
                  onChange={() => setImportMode('add')}
                  className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <div className="text-sm font-semibold text-content">
                    Add to existing collection
                  </div>
                  <p className="text-xs text-content-muted mt-0.5">
                    Preserves current items and appends rows from the CSV (reusing existing movies with matching TMDb IDs).
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3.5 rounded-[--radius-control] border cursor-pointer transition-colors ${
                  importMode === 'replace'
                    ? 'border-red-500 bg-red-50/70 dark:bg-red-900/20'
                    : 'border-subtle bg-surface hover:bg-surface-sunken'
                }`}
              >
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500"
                />
                <div>
                  <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                    Replace entire collection
                  </div>
                  <p className="text-xs text-content-muted mt-0.5">
                    Deletes all existing physical items first, then imports the CSV from scratch.
                  </p>
                </div>
              </label>
            </div>

            {/* Drag-and-drop CSV Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingCsv(true);
              }}
              onDragLeave={() => setIsDraggingCsv(false)}
              onDrop={handleDropCsv}
              className={`border-2 border-dashed rounded-[--radius-card] p-6 text-center transition-colors ${
                isDraggingCsv
                  ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                  : 'border-subtle bg-surface-sunken/50 hover:border-primary-400/60'
              }`}
            >
              <input
                ref={fileInputRef}
                id="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileInputChange}
                disabled={isValidatingCsv || isImporting}
                className="sr-only"
              />
              <svg
                className="w-8 h-8 mx-auto text-content-muted mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-sm font-medium text-content">
                {isValidatingCsv
                  ? 'Validating CSV file…'
                  : 'Drag and drop a CSV file here, or click to select'}
              </p>
              <p className="text-xs text-content-muted mt-1 mb-3">
                We will validate your file and show a preview before importing any items.
              </p>
              <label
                htmlFor="csv-file-input"
                className="inline-flex cursor-pointer items-center justify-center rounded-[--radius-control] bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
              >
                {csvValidation ? 'Choose Different CSV File' : 'Choose CSV File to Import'}
              </label>
            </div>

            {/* Validation Preview Card */}
            {csvValidation && (
              <div
                className={`rounded-[--radius-control] border p-4 space-y-3 ${
                  csvValidation.valid
                    ? 'border-green-300 dark:border-green-800 bg-green-50/60 dark:bg-green-900/15'
                    : 'border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-900/15'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-content">
                        {csvValidation.fileName}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          csvValidation.valid
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                        }`}
                      >
                        {csvValidation.valid ? 'Ready to Import' : 'Validation Failed'}
                      </span>
                    </div>
                    <p className="text-xs text-content-muted mt-0.5">
                      {csvValidation.total_rows} total row(s) • {csvValidation.valid_rows} valid •{' '}
                      {csvValidation.invalid_rows} invalid
                      {csvValidation.warnings.length > 0
                        ? ` • ${csvValidation.warnings.length} warning(s)`
                        : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCsvValidation(null)}
                      disabled={isImporting}
                    >
                      Clear
                    </Button>
                    {csvValidation.valid && (
                      <Button
                        variant={importMode === 'replace' ? 'danger' : 'primary'}
                        size="sm"
                        isLoading={isImporting}
                        onClick={handleExecuteImport}
                      >
                        {importMode === 'replace'
                          ? `Replace & Import ${csvValidation.valid_rows} Rows`
                          : `Import ${csvValidation.valid_rows} Rows`}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Errors Breakdown */}
                {csvValidation.errors.length > 0 && (
                  <div className="border-t border-red-200 dark:border-red-800 pt-2">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">
                      Errors ({csvValidation.errors.length}):
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-red-600 dark:text-red-400 max-h-40 overflow-y-auto">
                      {csvValidation.errors.map((err, idx) => (
                        <li key={idx}>
                          <strong>Row {err.row}</strong>: {err.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Warnings Breakdown */}
                {csvValidation.warnings.length > 0 && (
                  <div className="border-t border-amber-200 dark:border-amber-800 pt-2">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">
                      Warnings ({csvValidation.warnings.length}):
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-amber-700 dark:text-amber-300 max-h-40 overflow-y-auto">
                      {csvValidation.warnings.map((warn, idx) => (
                        <li key={idx}>
                          <strong>Row {warn.row}</strong>: {warn.warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Dynamic Schema Documentation */}
            {showImportSchema && importSchema && (
              <div className="border border-subtle rounded-[--radius-card] p-4 bg-surface-sunken space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-content">CSV Import Schema Reference</h3>
                    <p className="text-xs text-content-muted">
                      {importSchema.description} ({importSchema.encoding})
                    </p>
                  </div>
                  {importSchema.example_csv && (
                    <Button variant="secondary" size="sm" onClick={handleDownloadSampleCsv}>
                      Download Sample CSV
                    </Button>
                  )}
                </div>

                {Array.isArray(importSchema.fields) && (
                  <div className="overflow-x-auto border border-subtle rounded-[--radius-control] bg-surface">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-sunken border-b border-subtle text-content-muted">
                        <tr>
                          <th className="py-2 px-3 font-semibold">Column</th>
                          <th className="py-2 px-3 font-semibold">Required</th>
                          <th className="py-2 px-3 font-semibold">Type</th>
                          <th className="py-2 px-3 font-semibold">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-subtle">
                        {importSchema.fields.map((field: any) => (
                          <tr key={field.name}>
                            <td className="py-2 px-3 font-mono font-semibold text-content whitespace-nowrap">
                              {field.name}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {field.required ? (
                                <span className="inline-flex rounded-full bg-primary-50 dark:bg-primary-900/30 px-2 py-0.5 text-[11px] font-semibold text-primary-700 dark:text-primary-300">
                                  Required
                                </span>
                              ) : (
                                <span className="text-content-muted">Optional</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-content-muted whitespace-nowrap">
                              {field.type}
                            </td>
                            <td className="py-2 px-3 text-content-muted">
                              {field.description}
                              {field.allowed_values && (
                                <span className="block text-[11px] mt-0.5">
                                  Allowed: {field.allowed_values.join(', ')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {importSchema.example_csv && (
                  <div className="rounded-[--radius-control] border border-subtle bg-surface p-3">
                    <p className="text-xs font-semibold text-content mb-1.5">Example CSV:</p>
                    <pre className="text-xs font-mono text-content-muted overflow-x-auto">
                      {importSchema.example_csv}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Bulk Add Movies by Title */}
          <BulkAddForm onSuccess={loadData} />
        </div>
      )}

      {/* Quick Add Item Modal */}
      <MediaForm
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        onSuccess={() => {
          setShowAddForm(false);
          loadData();
        }}
        editItem={null}
      />
    </div>
  );
};

export default AdminPage;
