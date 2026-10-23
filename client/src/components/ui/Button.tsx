import React from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  asChild?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 disabled:bg-primary-600/50',
  secondary:
    'bg-surface-raised text-content border border-subtle hover:bg-surface-sunken active:bg-surface-sunken/80 disabled:opacity-50',
  ghost:
    'bg-transparent text-content hover:bg-surface-sunken active:bg-surface-sunken/80 disabled:opacity-40',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-600/50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-2.5 py-1 text-xs rounded-[--radius-control]',
  md: 'h-10 md:min-h-touch px-4 py-2 text-sm rounded-[--radius-control]',
  lg: 'h-12 md:min-h-touch px-6 py-3 text-base rounded-[--radius-control]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      type = 'button',
      asChild = false,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;
    const classes = `
      relative inline-flex items-center justify-center gap-2 font-medium
      transition-colors duration-200
      focus-visible:outline-none focus-visible:ring-2
      focus-visible:ring-ring focus-visible:ring-offset-2
      focus-visible:ring-offset-surface
      disabled:cursor-not-allowed
      ${variantClasses[variant]}
      ${sizeClasses[size]}
      ${className}
    `;

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, {
        ...props,
        className: `${(children.props.className ?? '')} ${classes}`.trim(),
        'aria-busy': isLoading || undefined,
        'aria-disabled': isDisabled || undefined,
      });
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        className={classes}
        {...props}
      >
        {isLoading && (
          <Spinner
            size="sm"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-current"
          />
        )}
        <span className={isLoading ? 'invisible' : undefined}>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
