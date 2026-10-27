import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders an aria-hidden placeholder with token classes', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton).toHaveClass('bg-surface-sunken');
    expect(skeleton).toHaveClass('animate-pulse');
    expect(skeleton).toHaveClass('skeleton-shimmer');
  });
});
