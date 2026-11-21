import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DualRolePersonItem,
  PeopleExplorerResponse,
  PersonExplorerItem,
  PhysicalFormat,
  TalentCollaborationItem,
} from '../types';
import { apiService } from '../services/api.service';
import { formatBadgeClasses, formatLabels, isPhysicalFormat } from '../lib/formats';
import { useAuth } from '../context/AuthContext';
import { useServerMode } from '../context/ServerModeContext';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';

export type TalentRoleMode = 'directors' | 'actors';
type SortOption = 'count' | 'name' | 'span' | 'latest';

const PAGE_BATCH_SIZE = 48;
const formatCount = (value: number) => value.toLocaleString();

const CONTROL_INPUT_CLASSES =
  'w-full min-h-11 pl-10 pr-10 py-2 text-sm border border-subtle rounded-[--radius-control] bg-surface-raised dark:bg-surface-sunken text-content placeholder:text-content-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors';

const CONTROL_SELECT_CLASSES =
  'min-h-11 pl-3 pr-8 py-2 text-sm border border-subtle rounded-[--radius-control] bg-surface-raised dark:bg-surface-sunken text-content [color-scheme:light] dark:[color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors cursor-pointer';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getRankBadgeClass(rank: number): string {
  if (rank === 1) {
    return 'bg-amber-500 text-white shadow-sm';
  }
  if (rank === 2) {
    return 'bg-slate-400 text-white shadow-sm dark:bg-slate-500';
  }
  if (rank === 3) {
    return 'bg-amber-700 text-white shadow-sm';
  }
  return 'bg-surface-raised/90 text-content-muted border border-subtle';
}

interface PersonAvatarProps {
  name: string;
  profileUrl: string | null | undefined;
  sizeClass?: string;
  rank?: number;
}

const PersonAvatar: React.FC<PersonAvatarProps> = ({
  name,
  profileUrl,
  sizeClass = 'h-28 w-20 sm:h-32 sm:w-24',
  rank,
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [profileUrl]);

  const showPhoto = Boolean(profileUrl) && !imgError;

  return (
    <div
      className={`relative ${sizeClass} flex-shrink-0 overflow-hidden rounded-[--radius-control] bg-gradient-to-br from-primary-600/20 via-primary-500/10 to-purple-600/20 border border-subtle`}
    >
      {showPhoto ? (
        <img
          src={profileUrl!}
          alt={name}
          loading="lazy"
          onError={() => setImgError(true)}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center justify-center select-none text-primary-700 dark:text-primary-300"
          aria-hidden="true"
        >
          <span className="text-lg sm:text-xl font-bold tracking-tight">{getInitials(name)}</span>
        </div>
      )}
      {rank !== undefined && (
        <span
          className={`absolute top-1.5 left-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none ${getRankBadgeClass(
            rank
          )}`}
        >
          #{rank}
        </span>
      )}
    </div>
  );
};

interface ExplorerPersonCardProps {
  person: PersonExplorerItem;
  rank: number;
  maxCount: number;
  profileUrl: string | null;
}

const ExplorerPersonCard: React.FC<ExplorerPersonCardProps> = ({
  person,
  rank,
  maxCount,
  profileUrl,
}) => {
  const filterParam = person.role === 'director' ? 'director' : 'actor';
  const unitSingular = person.role === 'director' ? 'film' : 'title';
  const unitPlural = person.role === 'director' ? 'films' : 'titles';
  const widthPct = Math.round((person.count / Math.max(1, maxCount)) * 100);
  const titles = person.titles || [];
  const extraTitlesCount = Math.max(0, person.count - Math.min(titles.length, 4));
  const yearRange =
    person.earliestYear && person.latestYear
      ? person.earliestYear === person.latestYear
        ? `${person.earliestYear}`
        : `${person.earliestYear}–${person.latestYear}`
      : null;

  return (
    <Link
      to={`/?${filterParam}=${encodeURIComponent(person.name)}`}
      className="group relative flex flex-col justify-between gap-3 rounded-[--radius-card] border border-subtle bg-surface-raised p-4 shadow-[--shadow-card] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-400 hover:shadow-md"
    >
      <div className="flex gap-3.5">
        <PersonAvatar name={person.name} profileUrl={profileUrl} rank={rank} />

        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-base font-semibold text-content group-hover:text-primary-600 dark:group-hover:text-primary-400">
                {person.name}
              </h3>
              <span className="flex-shrink-0 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                {formatCount(person.count)} {person.count === 1 ? unitSingular : unitPlural}
              </span>
            </div>

            {/* Meta badges: Dual Role, Year Span, Top Genres */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {person.alsoRoleCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
                  ★ Also {person.role === 'director' ? 'acted in' : 'directed'}{' '}
                  {person.alsoRoleCount}
                </span>
              )}
              {yearRange && (
                <span className="inline-flex items-center rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-content-muted">
                  {yearRange}
                </span>
              )}
              {person.genres.slice(0, 2).map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-content-muted"
                >
                  {g.name}
                </span>
              ))}
            </div>

            {/* Proportional Bar */}
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                style={{ width: `${Math.max(widthPct, 6)}%` }}
                className="h-full rounded-full bg-primary-500 dark:bg-primary-400 transition-all duration-300"
              />
            </div>

            {/* Format chips */}
            {person.formats.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {person.formats.slice(0, 4).map((f) => {
                  const label = isPhysicalFormat(f.format)
                    ? formatLabels[f.format as PhysicalFormat]
                    : f.format;
                  return (
                    <span
                      key={f.format}
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        formatBadgeClasses[f.format] ??
                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span>{label}</span>
                      <span className="opacity-75">×{f.count}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Owned Titles Strip & Frequent Collaborators */}
      <div className="space-y-2 border-t border-subtle pt-2.5">
        {titles.length > 0 && (
          <div className="flex items-center gap-2.5">
            <div className="flex -space-x-1.5 overflow-hidden flex-shrink-0" aria-hidden="true">
              {titles.slice(0, 5).map((t) =>
                t.coverArtUrl ? (
                  <img
                    key={t.id}
                    src={t.coverArtUrl}
                    alt=""
                    loading="lazy"
                    className="h-8 w-5.5 rounded-[3px] object-cover ring-1 ring-surface"
                  />
                ) : null
              )}
            </div>
            <p className="truncate text-xs text-content-muted">
              {titles
                .slice(0, 4)
                .map((t) => (t.year ? `${t.title} (${t.year})` : t.title))
                .join(', ')}
              {extraTitlesCount > 0 ? ` +${extraTitlesCount} more` : ''}
            </p>
          </div>
        )}

        {person.topCollaborators.length > 0 && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-content-muted">
            <span className="truncate">
              <span className="font-medium text-content">
                Frequent {person.role === 'director' ? 'cast' : 'director'}
                {person.topCollaborators.length > 1 ? 's' : ''}:
              </span>{' '}
              {person.topCollaborators.map((c) => `${c.name} (${c.count})`).join(', ')}
            </span>
            <span className="flex-shrink-0 font-medium text-primary-600 dark:text-primary-400 group-hover:underline">
              Filter →
            </span>
          </div>
        )}
      </div>
    </Link>
  );
};

interface DualRoleCardProps {
  person: DualRolePersonItem;
  profileUrl: string | null;
}

const DualRoleCard: React.FC<DualRoleCardProps> = ({ person, profileUrl }) => {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[--radius-card] border border-subtle bg-surface-sunken/50 p-3">
      <div className="flex items-center gap-3 min-w-0">
        <PersonAvatar
          name={person.name}
          profileUrl={profileUrl}
          sizeClass="h-14 w-11"
        />
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-content">{person.name}</h4>
          <p className="text-xs text-content-muted">
            {person.directedCount} directed · {person.actedCount} acted
          </p>
          {person.titles.length > 0 && (
            <p className="mt-0.5 truncate text-[11px] text-content-muted">
              {person.titles.map((t) => t.title).join(', ')}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 flex-shrink-0">
        <Link
          to={`/?director=${encodeURIComponent(person.name)}`}
          className="rounded-full border border-subtle bg-surface-raised px-2.5 py-1 text-xs font-medium text-content hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          Directed ({person.directedCount})
        </Link>
        <Link
          to={`/?actor=${encodeURIComponent(person.name)}`}
          className="rounded-full border border-subtle bg-surface-raised px-2.5 py-1 text-xs font-medium text-content hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
        >
          Acted ({person.actedCount})
        </Link>
      </div>
    </div>
  );
};

interface CollaborationCardProps {
  collab: TalentCollaborationItem;
  directorProfileUrl: string | null;
  actorProfileUrl: string | null;
}

const CollaborationCard: React.FC<CollaborationCardProps> = ({
  collab,
  directorProfileUrl,
  actorProfileUrl,
}) => {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-[--radius-card] border border-subtle bg-surface-sunken/50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex -space-x-2 flex-shrink-0">
            <PersonAvatar
              name={collab.director}
              profileUrl={directorProfileUrl}
              sizeClass="h-12 w-9 ring-2 ring-surface"
            />
            <PersonAvatar
              name={collab.actor}
              profileUrl={actorProfileUrl}
              sizeClass="h-12 w-9 ring-2 ring-surface"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-content">
              <Link
                to={`/?director=${encodeURIComponent(collab.director)}`}
                className="hover:text-primary-600 dark:hover:text-primary-400 hover:underline truncate"
              >
                {collab.director}
              </Link>
              <span className="text-content-muted font-normal">&amp;</span>
              <Link
                to={`/?actor=${encodeURIComponent(collab.actor)}`}
                className="hover:text-primary-600 dark:hover:text-primary-400 hover:underline truncate"
              >
                {collab.actor}
              </Link>
            </div>
            <p className="truncate text-xs text-content-muted mt-0.5">
              {collab.titles.map((t) => (t.year ? `${t.title} (${t.year})` : t.title)).join(', ')}
            </p>
          </div>
        </div>
        <Link
          to={`/?director=${encodeURIComponent(collab.director)}&actor=${encodeURIComponent(
            collab.actor
          )}`}
          className="flex-shrink-0 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50 transition-colors"
          title={`View ${collab.count} shared films in collection`}
        >
          {collab.count} films →
        </Link>
      </div>
    </div>
  );
};

interface PeopleExplorerPageProps {
  role: TalentRoleMode;
}

const PeopleExplorerPage: React.FC<PeopleExplorerPageProps> = ({ role }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { isReadOnly } = useServerMode();
  const canEdit = isAuthenticated && !isReadOnly;

  const [data, setData] = useState<PeopleExplorerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPrivateCollection, setIsPrivateCollection] = useState(false);

  // Dynamic TMDb profile cache for newly revealed / searched people
  const [resolvedProfiles, setResolvedProfiles] = useState<Record<string, string | null>>({});
  const requestedNamesRef = useRef<Set<string>>(new Set());

  // Filter / Sort state backed by URL query params for shareable links
  const searchQuery = searchParams.get('q') ?? '';
  const sortBy = (searchParams.get('sort') as SortOption) || 'count';
  const minCount = Number(searchParams.get('min')) || 1;
  const selectedFormat = searchParams.get('format') || 'all';
  const selectedDecade = searchParams.get('decade') || 'all';
  const selectedGenre = Number(searchParams.get('genre')) || 0;
  const dualRoleOnly = searchParams.get('dual') === 'true';

  const [visibleCount, setVisibleCount] = useState(PAGE_BATCH_SIZE);
  const [showCollabPanel, setShowCollabPanel] = useState(false);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (!value || value === 'all' || value === '0' || value === '1' && key === 'min' || value === 'count' && key === 'sort' || value === 'false') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      setSearchParams(next, { replace: key === 'q' });
      setVisibleCount(PAGE_BATCH_SIZE);
    },
    [searchParams, setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: false });
    setVisibleCount(PAGE_BATCH_SIZE);
  }, [setSearchParams]);

  const loadExplorer = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setIsPrivateCollection(false);
    try {
      const res = await apiService.getPeopleExplorer();
      setData(res);
    } catch (err: any) {
      if (err?.response?.status === 403 && err?.response?.data?.collection_public === false) {
        setIsPrivateCollection(true);
      } else {
        console.error('Failed to load talent explorer:', err);
        setError('Could not load talent explorer. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExplorer();
  }, [loadExplorer]);

  useEffect(() => {
    setVisibleCount(PAGE_BATCH_SIZE);
  }, [role]);

  const rawPeople = useMemo<PersonExplorerItem[]>(() => {
    if (!data) return [];
    return role === 'directors' ? data.directors : data.actors;
  }, [data, role]);

  const filteredPeople = useMemo<PersonExplorerItem[]>(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = rawPeople.filter((person) => {
      if (person.count < minCount) return false;
      if (dualRoleOnly && person.alsoRoleCount === 0) return false;
      if (selectedFormat !== 'all' && !person.formats.some((f) => f.format === selectedFormat)) {
        return false;
      }
      if (selectedDecade !== 'all' && !person.decades.includes(selectedDecade)) {
        return false;
      }
      if (selectedGenre > 0 && !person.genres.some((g) => g.id === selectedGenre)) {
        return false;
      }
      if (q) {
        const nameMatch = person.name.toLowerCase().includes(q);
        const titleMatch = person.titles.some((t) => t.title.toLowerCase().includes(q));
        const collabMatch = person.topCollaborators.some((c) =>
          c.name.toLowerCase().includes(q)
        );
        if (!nameMatch && !titleMatch && !collabMatch) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'span') {
        const spanA =
          a.earliestYear && a.latestYear ? a.latestYear - a.earliestYear : -1;
        const spanB =
          b.earliestYear && b.latestYear ? b.latestYear - b.earliestYear : -1;
        return spanB - spanA || b.count - a.count || a.name.localeCompare(b.name);
      }
      if (sortBy === 'latest') {
        return (
          (b.latestYear ?? 0) - (a.latestYear ?? 0) ||
          b.count - a.count ||
          a.name.localeCompare(b.name)
        );
      }
      return b.count - a.count || a.name.localeCompare(b.name);
    });
  }, [
    rawPeople,
    searchQuery,
    minCount,
    dualRoleOnly,
    selectedFormat,
    selectedDecade,
    selectedGenre,
    sortBy,
  ]);

  const visiblePeople = useMemo(
    () => filteredPeople.slice(0, visibleCount),
    [filteredPeople, visibleCount]
  );

  // Resolve TMDb photos on demand for visible people & collaborations that don't have a cached URL yet
  useEffect(() => {
    if (!data) return;

    const candidates: string[] = [];
    for (const p of visiblePeople) {
      const key = p.name.toLowerCase();
      if (!p.profileUrl && !(p.name in resolvedProfiles) && !requestedNamesRef.current.has(key)) {
        requestedNamesRef.current.add(key);
        candidates.push(p.name);
      }
      if (candidates.length >= 24) break;
    }

    if (showCollabPanel && candidates.length < 24) {
      for (const d of data.dualRolePeople) {
        const key = d.name.toLowerCase();
        if (!d.profileUrl && !(d.name in resolvedProfiles) && !requestedNamesRef.current.has(key)) {
          requestedNamesRef.current.add(key);
          candidates.push(d.name);
        }
        if (candidates.length >= 24) break;
      }
      for (const c of data.topCollaborations) {
        for (const [name, url] of [
          [c.director, c.directorProfileUrl],
          [c.actor, c.actorProfileUrl],
        ] as const) {
          const key = name.toLowerCase();
          if (!url && !(name in resolvedProfiles) && !requestedNamesRef.current.has(key)) {
            requestedNamesRef.current.add(key);
            candidates.push(name);
          }
        }
        if (candidates.length >= 24) break;
      }
    }

    if (candidates.length === 0) return;

    let cancelled = false;
    apiService
      .resolvePersonProfiles(candidates)
      .then((profiles) => {
        if (!cancelled && Object.keys(profiles).length > 0) {
          setResolvedProfiles((prev) => ({ ...prev, ...profiles }));
        }
      })
      .catch(() => {
        // Non-fatal if TMDb is unconfigured or offline
      });

    return () => {
      cancelled = true;
    };
  }, [data, visiblePeople, showCollabPanel, resolvedProfiles]);

  const getProfileUrl = (name: string, initialUrl: string | null | undefined): string | null => {
    if (initialUrl) return initialUrl;
    if (name in resolvedProfiles) return resolvedProfiles[name];
    return null;
  };

  const handleRoleSwitch = (nextRole: TalentRoleMode) => {
    if (nextRole === role) return;
    const query = searchParams.toString();
    navigate(`/statistics/${nextRole}${query ? `?${query}` : ''}`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 sm:py-8" aria-busy="true">
        <div className="mb-6">
          <Skeleton className="h-8 w-64 rounded-[--radius-control] mb-2" />
          <Skeleton className="h-4 w-96 rounded-[--radius-control]" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-[--radius-card]" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-[--radius-card]" />
          ))}
        </div>
      </div>
    );
  }

  if (isPrivateCollection && !canEdit) {
    return (
      <div className="container mx-auto px-4 py-12">
        <EmptyState
          title="This collection is private"
          description="The owner has set this media collection and its statistics to private."
          action={
            !isReadOnly ? (
              <Button asChild>
                <Link to="/admin">Sign in as Admin</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-6 sm:py-8">
        <EmptyState
          title="Couldn’t load talent explorer"
          description={error || 'Talent statistics are currently unavailable.'}
          action={
            <Button onClick={loadExplorer} variant="secondary">
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const { summary, dualRolePeople, topCollaborations, availableFormats, availableDecades, availableGenres } =
    data;
  const maxCount = Math.max(1, ...rawPeople.map((p) => p.count));
  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    minCount > 1 ||
    selectedFormat !== 'all' ||
    selectedDecade !== 'all' ||
    selectedGenre > 0 ||
    dualRoleOnly ||
    sortBy !== 'count';

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Breadcrumb & Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-content-muted mb-1">
            <Link
              to="/statistics?tab=content"
              className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              ← Back to Content Insights
            </Link>
            <span>/</span>
            <span className="text-content">
              {role === 'directors' ? 'Directors Explorer' : 'Actors & Cast Explorer'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-content sm:text-3xl">
            {role === 'directors' ? 'Directors in Collection' : 'Actors & Cast in Collection'}
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            {role === 'directors'
              ? 'Explore every filmmaker across your movie library — click any card to filter your collection.'
              : 'Explore every cast member across your movies and TV shows — click any card to filter your collection.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            name="Talent role explorer switch"
            value={role}
            onChange={(val) => handleRoleSwitch(val as TalentRoleMode)}
            options={[
              {
                value: 'directors',
                label: `Directors (${formatCount(summary.totalDirectors)})`,
              },
              {
                value: 'actors',
                label: `Actors (${formatCount(summary.totalActors)})`,
              },
            ]}
          />
        </div>
      </header>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => handleRoleSwitch('directors')}
          className={`flex flex-col items-center justify-center rounded-[--radius-card] p-4 text-center border transition-colors ${
            role === 'directors'
              ? 'bg-primary-50 border-primary-400 dark:bg-primary-900/25'
              : 'bg-surface-raised border-subtle hover:border-primary-400'
          }`}
        >
          <span className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-400">
            {formatCount(summary.totalDirectors)}
          </span>
          <span className="mt-1 text-sm font-medium text-content">Total Directors</span>
          <span className="mt-0.5 text-xs text-content-muted">
            {formatCount(summary.multiFilmDirectorsCount)} with 2+ films
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleRoleSwitch('actors')}
          className={`flex flex-col items-center justify-center rounded-[--radius-card] p-4 text-center border transition-colors ${
            role === 'actors'
              ? 'bg-primary-50 border-primary-400 dark:bg-primary-900/25'
              : 'bg-surface-raised border-subtle hover:border-primary-400'
          }`}
        >
          <span className="text-2xl sm:text-3xl font-bold text-primary-600 dark:text-primary-400">
            {formatCount(summary.totalActors)}
          </span>
          <span className="mt-1 text-sm font-medium text-content">Total Actors</span>
          <span className="mt-0.5 text-xs text-content-muted">
            {formatCount(summary.multiTitleActorsCount)} with 2+ titles
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            updateParam('dual', dualRoleOnly ? null : 'true');
          }}
          className={`flex flex-col items-center justify-center rounded-[--radius-card] p-4 text-center border transition-colors ${
            dualRoleOnly
              ? 'bg-purple-50 border-purple-400 dark:bg-purple-900/25'
              : 'bg-surface-raised border-subtle hover:border-purple-400'
          }`}
        >
          <span className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">
            {formatCount(summary.dualRoleCount)}
          </span>
          <span className="mt-1 text-sm font-medium text-content">Director &amp; Actor</span>
          <span className="mt-0.5 text-xs text-content-muted">
            {dualRoleOnly ? 'Showing dual-role only' : 'Click to filter dual roles'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setShowCollabPanel((prev) => !prev)}
          className={`flex flex-col items-center justify-center rounded-[--radius-card] p-4 text-center border transition-colors ${
            showCollabPanel
              ? 'bg-amber-50 border-amber-400 dark:bg-amber-900/20'
              : 'bg-surface-raised border-subtle hover:border-amber-400'
          }`}
        >
          <span className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">
            {formatCount(summary.collaborationsCount)}
          </span>
          <span className="mt-1 text-sm font-medium text-content">Collaborations</span>
          <span className="mt-0.5 text-xs text-content-muted">
            {showCollabPanel ? 'Hide spotlight ↑' : 'View pairs & dual roles ↓'}
          </span>
        </button>
      </div>

      {/* Expandable Collaborations & Dual Roles Spotlight */}
      {showCollabPanel && (dualRolePeople.length > 0 || topCollaborations.length > 0) && (
        <section
          aria-label="Collaborations and Dual Roles"
          className="card space-y-6 border-primary-300 dark:border-primary-700/60 animate-in"
        >
          <div className="flex items-center justify-between border-b border-subtle pb-3">
            <div>
              <h2 className="text-base font-semibold text-content">
                Collaborations &amp; Dual-Role Talent
              </h2>
              <p className="text-xs text-content-muted">
                Frequent director–actor pairings and artists who both direct and act in your collection
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCollabPanel(false)}
            >
              Close
            </Button>
          </div>

          {topCollaborations.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-content">
                Frequent Director–Actor Collaborations
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {topCollaborations.slice(0, 12).map((collab) => (
                  <CollaborationCard
                    key={`${collab.director}:::${collab.actor}`}
                    collab={collab}
                    directorProfileUrl={getProfileUrl(collab.director, collab.directorProfileUrl)}
                    actorProfileUrl={getProfileUrl(collab.actor, collab.actorProfileUrl)}
                  />
                ))}
              </div>
            </div>
          )}

          {dualRolePeople.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-content">
                Both Director &amp; Actor in Your Collection
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {dualRolePeople.slice(0, 12).map((person) => (
                  <DualRoleCard
                    key={person.name}
                    person={person}
                    profileUrl={getProfileUrl(person.name, person.profileUrl)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Search, Sort & Filter Toolbar */}
      <div className="card space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <label htmlFor="talent-search" className="sr-only">
              Search {role}
            </label>
            <input
              id="talent-search"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(e) => updateParam('q', e.target.value || null)}
              placeholder={`Search ${role} by name, film title, or collaborator…`}
              className={CONTROL_INPUT_CLASSES}
            />
            <svg
              className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-content-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => updateParam('q', null)}
                className="absolute right-3 top-2.5 h-5 w-5 text-content-muted hover:text-content transition-colors"
                aria-label="Clear search"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Sort Select */}
          <div className="md:col-span-3">
            <label htmlFor="talent-sort" className="sr-only">
              Sort by
            </label>
            <select
              id="talent-sort"
              aria-label="Sort talent"
              value={sortBy}
              onChange={(e) => updateParam('sort', e.target.value)}
              className={`w-full ${CONTROL_SELECT_CLASSES}`}
            >
              <option value="count">Sort: Most Titles Collected</option>
              <option value="name">Sort: Name (A–Z)</option>
              <option value="span">Sort: Career Span in Collection</option>
              <option value="latest">Sort: Newest Release Year</option>
            </select>
          </div>

          {/* Min Titles Filter */}
          <div className="md:col-span-2">
            <label htmlFor="talent-min-count" className="sr-only">
              Minimum titles
            </label>
            <select
              id="talent-min-count"
              aria-label="Minimum titles"
              value={String(minCount)}
              onChange={(e) => updateParam('min', e.target.value)}
              className={`w-full ${CONTROL_SELECT_CLASSES}`}
            >
              <option value="1">All (1+ titles)</option>
              <option value="2">2+ titles</option>
              <option value="3">3+ titles</option>
              <option value="5">5+ titles</option>
              <option value="10">10+ titles</option>
            </select>
          </div>

          {/* Format Filter */}
          <div className="md:col-span-2">
            <label htmlFor="talent-format" className="sr-only">
              Filter by format
            </label>
            <select
              id="talent-format"
              aria-label="Filter by format"
              value={selectedFormat}
              onChange={(e) => updateParam('format', e.target.value)}
              className={`w-full ${CONTROL_SELECT_CLASSES}`}
            >
              <option value="all">All Formats</option>
              {availableFormats.map((fmt) => (
                <option key={fmt} value={fmt}>
                  {fmt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Secondary Filter Row: Decade, Genre, Dual Role Chip & Count Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filter by decade"
              value={selectedDecade}
              onChange={(e) => updateParam('decade', e.target.value)}
              className={`${CONTROL_SELECT_CLASSES} min-h-9 py-1.5 text-xs`}
            >
              <option value="all">All Decades</option>
              {availableDecades.map((dec) => (
                <option key={dec} value={dec}>
                  {dec}s
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by genre"
              value={String(selectedGenre)}
              onChange={(e) => updateParam('genre', e.target.value)}
              className={`${CONTROL_SELECT_CLASSES} min-h-9 py-1.5 text-xs`}
            >
              <option value="0">All Genres</option>
              {availableGenres.map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.name}
                </option>
              ))}
            </select>

            <Chip
              label="Both Director & Actor only"
              selected={dualRoleOnly}
              onClick={() => updateParam('dual', dualRoleOnly ? null : 'true')}
            />

            {hasActiveFilters && (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Reset Filters
              </Button>
            )}
          </div>

          <p className="text-xs font-medium text-content-muted">
            Showing {formatCount(visiblePeople.length)} of {formatCount(filteredPeople.length)}{' '}
            {role === 'directors'
              ? filteredPeople.length === 1
                ? 'director'
                : 'directors'
              : filteredPeople.length === 1
              ? 'actor'
              : 'actors'}
          </p>
        </div>

        {/* Active Filter Chips Summary Row */}
        {(selectedFormat !== 'all' ||
          selectedDecade !== 'all' ||
          selectedGenre > 0 ||
          minCount > 1 ||
          dualRoleOnly) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-3">
            <span className="text-xs font-medium text-content-muted">Active filters:</span>
            {minCount > 1 && (
              <Chip
                label={`${minCount}+ titles`}
                onRemove={() => updateParam('min', null)}
              />
            )}
            {selectedFormat !== 'all' && (
              <Chip
                label={selectedFormat}
                onRemove={() => updateParam('format', null)}
              />
            )}
            {selectedDecade !== 'all' && (
              <Chip
                label={`${selectedDecade}s`}
                onRemove={() => updateParam('decade', null)}
              />
            )}
            {selectedGenre > 0 && (
              <Chip
                label={
                  availableGenres.find((g) => g.id === selectedGenre)?.name ??
                  `Genre ${selectedGenre}`
                }
                onRemove={() => updateParam('genre', null)}
              />
            )}
            {dualRoleOnly && (
              <Chip
                label="Director & Actor"
                onRemove={() => updateParam('dual', null)}
              />
            )}
          </div>
        )}
      </div>

      {/* Results Grid */}
      {filteredPeople.length === 0 ? (
        <EmptyState
          title={`No matching ${role} found`}
          description="Try adjusting your search query or clearing active filters."
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear Filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visiblePeople.map((person, index) => (
              <ExplorerPersonCard
                key={person.name}
                person={person}
                rank={index + 1}
                maxCount={maxCount}
                profileUrl={getProfileUrl(person.name, person.profileUrl)}
              />
            ))}
          </div>

          {visibleCount < filteredPeople.length && (
            <div className="flex flex-col items-center justify-center gap-2 pt-4">
              <Button
                variant="secondary"
                onClick={() => setVisibleCount((prev) => prev + PAGE_BATCH_SIZE)}
              >
                Show More ({formatCount(filteredPeople.length - visibleCount)} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PeopleExplorerPage;
