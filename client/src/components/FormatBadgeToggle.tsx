import React from 'react';
import { useDisplayPreferences } from '../context/DisplayPreferencesContext';

const FormatBadgeToggle: React.FC = () => {
  const { showFormatBadges, toggleFormatBadges } = useDisplayPreferences();

  return (
    <button
      type="button"
      onClick={toggleFormatBadges}
      className={`inline-flex h-9 items-center gap-1.5 rounded-[--radius-control] border px-2.5 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
        showFormatBadges
          ? 'border-subtle bg-surface-raised text-content shadow-sm hover:bg-surface-sunken'
          : 'border-subtle bg-surface-sunken text-content-muted hover:text-content'
      }`}
      aria-label="Toggle format tags on posters"
      aria-pressed={showFormatBadges}
      title={`${showFormatBadges ? 'Hide' : 'Show'} format tags on posters`}
    >
      {showFormatBadges ? (
        // Tag icon - badges are visible
        <svg
          className="h-4 w-4 text-primary-600 dark:text-primary-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
      ) : (
        // Crossed-out tag icon - badges are hidden
        <svg
          className="h-4 w-4 text-content-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20L20 4" />
        </svg>
      )}
      <span className="hidden sm:inline">Format tags</span>
    </button>
  );
};

export default FormatBadgeToggle;
