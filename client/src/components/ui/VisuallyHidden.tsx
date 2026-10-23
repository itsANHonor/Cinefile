import React from 'react';

export type VisuallyHiddenProps = React.HTMLAttributes<HTMLSpanElement>;

/**
 * Visually hides content while keeping it available to screen readers.
 */
export const VisuallyHidden = React.forwardRef<HTMLSpanElement, VisuallyHiddenProps>(
  ({ children, ...props }, ref) => (
    <span
      ref={ref}
      className="absolute h-px w-px overflow-hidden whitespace-nowrap p-0 border-0"
      style={{
        clip: 'rect(0 0 0 0)',
        clipPath: 'inset(50%)',
        margin: '-1px',
      }}
      {...props}
    >
      {children}
    </span>
  )
);

VisuallyHidden.displayName = 'VisuallyHidden';
