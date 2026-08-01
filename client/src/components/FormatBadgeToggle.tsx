import React from 'react';
import { useDisplayPreferences } from '../context/DisplayPreferencesContext';

const FormatBadgeToggle: React.FC = () => {
  const { showFormatBadges, toggleFormatBadges } = useDisplayPreferences();

  return (
    <button
      onClick={toggleFormatBadges}
      className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
      aria-label="Toggle format tags on posters"
      aria-pressed={showFormatBadges}
      title={`${showFormatBadges ? 'Hide' : 'Show'} format tags on posters`}
    >
      {showFormatBadges ? (
        // Tag icon - badges are visible
        <svg
          className="w-5 h-5 text-gray-800 dark:text-gray-100"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
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
          className="w-5 h-5 text-gray-500 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
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
    </button>
  );
};

export default FormatBadgeToggle;
