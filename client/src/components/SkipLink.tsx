import React from 'react';

export const SkipLink: React.FC = () => (
  <a
    href="#main"
    className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[--radius-control] focus:bg-primary-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-[--shadow-card]"
  >
    Skip to main content
  </a>
);
