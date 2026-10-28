import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CollectionFacetEdition } from '../types';
import { formatEditionTags, parseEditionTags } from '../lib/editionTags';

export interface EditionTagInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  availableTags?: CollectionFacetEdition[];
  presetTags?: readonly string[];
  placeholder?: string;
  className?: string;
}

/**
 * Letterboxd-style tag input for Edition Notes and Movie Versions.
 * - Displays committed tags as removable tag pills.
 * - Autocompletes against existing tags in the collection and optional presets as the user types.
 * - Commits tags on Enter, Tab, comma, suggestion click, or input blur.
 */
export const EditionTagInput: React.FC<EditionTagInputProps> = ({
  id,
  value,
  onChange,
  availableTags = [],
  presetTags = [],
  placeholder = "Add edition tags (e.g., Steelbook, Collector's Edition, Criterion)...",
  className = '',
}) => {
  const generatedId = useId();
  const inputId = id || `edition-tags-${generatedId}`;
  const listboxId = `${inputId}-listbox`;

  const [committedTags, setCommittedTags] = useState<string[]>(() => parseEditionTags(value));
  const [draft, setDraft] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastEmittedValueRef = useRef<string>(formatEditionTags(parseEditionTags(value)));

  // Merge availableTags with presetTags so presets are included in canonical lookup & autocomplete
  const mergedAvailableTags = useMemo(() => {
    const map = new Map<string, CollectionFacetEdition>();
    for (const item of availableTags) {
      map.set(item.tag.toLowerCase(), item);
    }
    for (const preset of presetTags) {
      const key = preset.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { tag: preset, count: 0 });
      }
    }
    return Array.from(map.values());
  }, [availableTags, presetTags]);

  // Map lowercase tag -> canonical existing tag name
  const canonicalLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of mergedAvailableTags) {
      map.set(item.tag.toLowerCase(), item.tag);
    }
    return map;
  }, [mergedAvailableTags]);

  const resolveCanonical = (rawTag: string): string => {
    const cleaned = rawTag.replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return canonicalLookup.get(cleaned.toLowerCase()) ?? cleaned;
  };

  // Sync external `value` changes (e.g. when switching editItem or resetting form)
  useEffect(() => {
    const normalizedIncoming = formatEditionTags(parseEditionTags(value));
    if (normalizedIncoming !== lastEmittedValueRef.current) {
      lastEmittedValueRef.current = normalizedIncoming;
      setCommittedTags(parseEditionTags(value));
      setDraft('');
    }
  }, [value]);

  const emitChange = (nextCommitted: string[], nextDraft: string) => {
    const draftTokens = parseEditionTags(nextDraft).map(resolveCanonical);
    const combined = parseEditionTags([...nextCommitted, ...draftTokens]);
    const formatted = formatEditionTags(combined);
    lastEmittedValueRef.current = formatted;
    onChange(formatted);
  };

  const committedLowerSet = useMemo(
    () => new Set(committedTags.map((t) => t.toLowerCase())),
    [committedTags]
  );

  // Filter existing tags matching the current draft input (Letterboxd-style)
  const suggestions = useMemo(() => {
    const q = draft.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!q) return [];

    const prefixMatches: CollectionFacetEdition[] = [];
    const substringMatches: CollectionFacetEdition[] = [];

    for (const item of mergedAvailableTags) {
      const lower = item.tag.toLowerCase();
      if (committedLowerSet.has(lower)) continue;
      if (lower.startsWith(q)) {
        prefixMatches.push(item);
      } else if (lower.includes(q)) {
        substringMatches.push(item);
      }
    }

    return [...prefixMatches, ...substringMatches].slice(0, 8);
  }, [mergedAvailableTags, committedLowerSet, draft]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [suggestions.length, draft]);

  const commitDraftTokens = (rawDraft: string, baseTags: string[] = committedTags) => {
    const tokens = parseEditionTags(rawDraft)
      .map(resolveCanonical)
      .filter(Boolean);
    if (tokens.length === 0) {
      setDraft('');
      emitChange(baseTags, '');
      return;
    }
    const nextCommitted = parseEditionTags([...baseTags, ...tokens]);
    setCommittedTags(nextCommitted);
    setDraft('');
    setIsOpen(false);
    emitChange(nextCommitted, '');
  };

  const addTag = (tagToAdd: string) => {
    const resolved = resolveCanonical(tagToAdd);
    if (!resolved) return;
    const nextCommitted = parseEditionTags([...committedTags, resolved]);
    setCommittedTags(nextCommitted);
    setDraft('');
    setIsOpen(false);
    emitChange(nextCommitted, '');
    inputRef.current?.focus();
  };

  const removeTag = (indexToRemove: number) => {
    const nextCommitted = committedTags.filter((_, idx) => idx !== indexToRemove);
    setCommittedTags(nextCommitted);
    emitChange(nextCommitted, draft);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // If the user typed or pasted a comma, commit completed segments immediately
    if (raw.includes(',')) {
      const segments = raw.split(',');
      const trailing = segments.pop() ?? '';
      const toCommit = segments
        .map(resolveCanonical)
        .filter(Boolean);
      const nextCommitted = parseEditionTags([...committedTags, ...toCommit]);
      setCommittedTags(nextCommitted);
      setDraft(trailing);
      setIsOpen(trailing.trim().length > 0);
      emitChange(nextCommitted, trailing);
      return;
    }

    setDraft(raw);
    setIsOpen(raw.trim().length > 0);
    emitChange(committedTags, raw);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const trimmedDraft = draft.replace(/\s+/g, ' ').trim();

    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      return;
    }

    if (e.key === ',') {
      e.preventDefault();
      if (trimmedDraft) {
        commitDraftTokens(draft);
      }
      return;
    }

    if (e.key === 'Enter') {
      if (trimmedDraft) {
        e.preventDefault();
        if (isOpen && suggestions.length > 0 && suggestions[highlightedIndex]) {
          addTag(suggestions[highlightedIndex].tag);
        } else {
          commitDraftTokens(draft);
        }
      }
      return;
    }

    if (e.key === 'Tab' && trimmedDraft) {
      if (isOpen && suggestions.length > 0 && suggestions[highlightedIndex]) {
        e.preventDefault();
        addTag(suggestions[highlightedIndex].tag);
      } else {
        commitDraftTokens(draft);
      }
      return;
    }

    if (e.key === 'Backspace' && draft === '' && committedTags.length > 0) {
      e.preventDefault();
      removeTag(committedTags.length - 1);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (containerRef.current && containerRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
    if (draft.trim()) {
      commitDraftTokens(draft);
    } else {
      setIsOpen(false);
    }
  };

  const showSuggestions = isOpen && suggestions.length > 0;
  const availablePresets = useMemo(
    () => presetTags.filter((p) => !committedLowerSet.has(p.toLowerCase())),
    [presetTags, committedLowerSet]
  );

  return (
    <div ref={containerRef} onBlur={handleBlur} className={`relative ${className}`}>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-gray-900 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-surface dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
      >
        {committedTags.map((tag, idx) => (
          <span
            key={`${tag.toLowerCase()}-${idx}`}
            className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 pl-2.5 pr-1 py-0.5 text-xs font-medium text-primary-700 dark:border-primary-800 dark:bg-primary-900/40 dark:text-primary-300"
          >
            <span>{tag}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(idx);
              }}
              aria-label={`Remove ${tag} tag`}
              className="rounded-full p-0.5 hover:bg-primary-100 dark:hover:bg-primary-800/60 transition-colors"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={draft}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (draft.trim().length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={committedTags.length === 0 ? placeholder : 'Add tag...'}
          className="min-w-[140px] flex-1 bg-transparent py-0.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder-gray-400"
        />
      </div>

      {showSuggestions && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Suggested edition tags"
          className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {suggestions.map((item, idx) => {
            const isHighlighted = idx === highlightedIndex;
            return (
              <li
                key={item.tag}
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={(e) => {
                  // Prevent input blur before click registers
                  e.preventDefault();
                  addTag(item.tag);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors ${
                  isHighlighted
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                    : 'text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60'
                }`}
              >
                <span className="font-medium">{item.tag}</span>
                {typeof item.count === 'number' && item.count > 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-400">
                    {item.count} {item.count === 1 ? 'item' : 'items'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {availablePresets.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Quick-add presets">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-0.5">Presets:</span>
          {availablePresets.slice(0, 8).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => addTag(preset)}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-300 dark:hover:border-primary-700 dark:hover:bg-primary-900/30 dark:hover:text-primary-300 transition-colors"
            >
              <span>+ {preset}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EditionTagInput;
