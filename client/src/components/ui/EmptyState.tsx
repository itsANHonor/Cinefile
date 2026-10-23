import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => (
  <div
    role="status"
    className={`
      flex flex-col items-center justify-center text-center
      rounded-[--radius-card] bg-surface-raised border border-subtle
      p-6 sm:p-10
      ${className}
    `}
  >
    {icon && (
      <div className="mb-4 text-content-muted" aria-hidden="true">
        {icon}
      </div>
    )}
    <h3 className="text-lg font-semibold text-content">{title}</h3>
    {description && (
      <p className="mt-1 max-w-sm text-sm text-content-muted">{description}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
