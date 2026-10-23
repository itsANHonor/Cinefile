import React from 'react';

export type IconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonBaseProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  'aria-label': string;
}

const variantClasses: Record<IconButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 disabled:bg-primary-600/50',
  secondary:
    'bg-surface-raised text-content border border-subtle hover:bg-surface-sunken active:bg-surface-sunken/80 disabled:opacity-50',
  ghost:
    'bg-transparent text-content hover:bg-surface-sunken active:bg-surface-sunken/80 disabled:opacity-40',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-600/50',
};

const sizeClasses: Record<IconButtonSize, string> = {
  sm: 'h-9 w-9 min-h-touch min-w-touch text-sm rounded-[--radius-control]',
  md: 'h-11 w-11 min-h-touch min-w-touch text-base rounded-[--radius-control]',
  lg: 'h-12 w-12 min-h-touch min-w-touch text-lg rounded-[--radius-control]',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonBaseProps>(
  (
    { children, className = '', variant = 'ghost', size = 'md', type = 'button', ...props },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={`
        inline-flex items-center justify-center
        transition-colors duration-200
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-ring focus-visible:ring-offset-2
        focus-visible:ring-offset-surface
        disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
);

IconButton.displayName = 'IconButton';
