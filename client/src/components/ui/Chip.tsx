import React from 'react';

export interface ChipProps {
  label: string;
  selected?: boolean;
  count?: number;
  className?: string;
  onClick?: () => void;
  onRemove?: () => void;
}

/**
 * A compact, token-styled pill. Supports two modes:
 * - **Selectable**: use `selected` and `onClick` (renders a button with `aria-pressed`).
 * - **Removable**: use `onRemove` (renders a static chip with a remove button).
 */
export const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  count,
  className = '',
  onClick,
  onRemove,
}) => {
  const baseClasses = `
    inline-flex items-center gap-1.5 rounded-full border text-sm font-medium
    transition-all duration-200
    ${
      selected
        ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
        : 'bg-surface border-subtle text-content hover:border-primary-400 hover:text-primary-700'
    }
    ${className}
  `;

  const content = (
    <>
      {selected && (
        <svg
          className="h-3.5 w-3.5 -ml-0.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      <span>{label}</span>
      {typeof count === 'number' && (
        <span className={`text-xs ${selected ? 'text-white/75' : 'text-content-muted'}`}>
          {count}
        </span>
      )}
    </>
  );

  if (onRemove) {
    return (
      <span
        className={`
          ${baseClasses}
          pl-2.5 pr-1 py-1
          bg-primary-50 border-primary-200 text-primary-700
          dark:bg-primary-900/30 dark:border-primary-800 dark:text-primary-300
        `}
      >
        {content}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
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
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`${baseClasses} px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface`}
    >
      {content}
    </button>
  );
};
