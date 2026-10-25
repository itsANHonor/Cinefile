import React from 'react';
import { NavLink } from 'react-router-dom';
import { useServerMode } from '../context/ServerModeContext';

interface TabDef {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const collectionIcon = (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M7 3v18" />
    <path d="M3 12h18" />
  </svg>
);

const statsIcon = (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const mediaIcon = (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 0 001 1z" />
  </svg>
);

const settingsIcon = (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const aboutIcon = (
  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export const MobileBottomTabs: React.FC = () => {
  const { isReadOnly } = useServerMode();

  const tabs: TabDef[] = [
    { to: '/', label: 'Collection', icon: collectionIcon },
    { to: '/statistics', label: 'Stats', icon: statsIcon },
  ];

  if (!isReadOnly) {
    tabs.push({ to: '/media', label: 'Media', icon: mediaIcon });
    tabs.push({ to: '/admin', label: 'Settings', icon: settingsIcon });
  }

  tabs.push({ to: '/about', label: 'About', icon: aboutIcon });

  return (
    <nav
      aria-label="Mobile primary navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 min-h-tabbar border-t border-subtle bg-surface-raised pb-safe-b shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
    >
      <ul className="flex h-tabbar items-center justify-around gap-1 px-2">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                `flex min-h-touch flex-col items-center justify-center rounded-[--radius-control] px-1 py-1 text-[10px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  isActive
                    ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-content-muted hover:bg-surface-sunken hover:text-content'
                }`
              }
              aria-current={undefined}
            >
              {tab.icon}
              <span className="mt-0.5 sr-only xs:not-sr-only">{tab.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default MobileBottomTabs;
