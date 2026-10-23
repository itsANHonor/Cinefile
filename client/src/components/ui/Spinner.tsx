import React from 'react';
import { VisuallyHidden } from './VisuallyHidden';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize | number;
  className?: string;
  label?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ size = 'md', className = '', label = 'Loading…', ...props }, ref) => {
    const sizeClass = typeof size === 'string' ? sizeClasses[size] : '';
    const style = typeof size === 'number' ? { width: size, height: size } : undefined;

    return (
      <span
        ref={ref}
        role="status"
        aria-live="polite"
        className={`inline-block animate-spin ${sizeClass} ${className}`}
        style={style}
        {...props}
      >
        <svg
          className="h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <VisuallyHidden>{label}</VisuallyHidden>
      </span>
    );
  }
);

Spinner.displayName = 'Spinner';
