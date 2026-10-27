import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * A token-driven placeholder that pulses by default and falls back to a
 * static surface-sunken block when the user prefers reduced motion.
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={`
        bg-surface-sunken
        animate-pulse
        skeleton-shimmer
        motion-reduce:animate-none motion-reduce:opacity-70
        rounded-[--radius-control]
        ${className}
      `}
      {...props}
    />
  )
);

Skeleton.displayName = 'Skeleton';
