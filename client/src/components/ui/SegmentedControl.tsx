import React, { useCallback, useEffect, useRef } from 'react';

export interface SegmentedControlOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  className?: string;
  disabled?: boolean;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  name,
  className = '',
  disabled = false,
}) => {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);

  useEffect(() => {
    buttonRefs.current = buttonRefs.current.slice(0, options.length);
  }, [options.length]);

  const move = useCallback(
    (direction: number) => {
      const current = selectedIndex >= 0 ? selectedIndex : 0;
      let next = current;
      do {
        next = (next + direction + options.length) % options.length;
      } while (options[next]?.disabled && next !== current);
      if (next !== current || options[current]?.disabled) {
        onChange(options[next].value);
        buttonRefs.current[next]?.focus();
      }
    },
    [selectedIndex, options, onChange]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          move(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          move(-1);
          break;
        case 'Home':
          event.preventDefault();
          if (!options[0]?.disabled) {
            onChange(options[0].value);
            buttonRefs.current[0]?.focus();
          }
          break;
        case 'End':
          event.preventDefault();
          const last = options.length - 1;
          if (!options[last]?.disabled) {
            onChange(options[last].value);
            buttonRefs.current[last]?.focus();
          }
          break;
      }
    },
    [move, onChange, options]
  );

  if (options.length === 0) return null;

  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={`inline-flex items-center rounded-[--radius-control] bg-surface-sunken p-1 ${className}`}
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => (buttonRefs.current[index] = el)}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
            className={`
              relative flex-1 whitespace-nowrap rounded-[calc(var(--radius-control)-0.25rem)]
              px-3 py-1.5 text-sm font-medium transition-all duration-200
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-ring focus-visible:ring-offset-2
              focus-visible:ring-offset-surface
              disabled:cursor-not-allowed disabled:opacity-50
              ${
                isSelected
                  ? 'bg-surface-raised text-content shadow-[--shadow-card]'
                  : 'text-content-muted hover:bg-surface-raised/60 hover:text-content'
              }
            `}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
