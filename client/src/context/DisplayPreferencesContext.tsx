import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const FORMAT_BADGES_KEY = 'show_format_badges';

interface DisplayPreferencesContextType {
  showFormatBadges: boolean;
  setShowFormatBadges: (show: boolean) => void;
  toggleFormatBadges: () => void;
}

const DisplayPreferencesContext = createContext<DisplayPreferencesContextType | undefined>(undefined);

interface DisplayPreferencesProviderProps {
  children: ReactNode;
}

export const DisplayPreferencesProvider: React.FC<DisplayPreferencesProviderProps> = ({ children }) => {
  const [showFormatBadges, setShowFormatBadgesState] = useState<boolean>(() => {
    // Format badges are shown unless the user has explicitly hidden them
    return localStorage.getItem(FORMAT_BADGES_KEY) !== 'false';
  });

  useEffect(() => {
    localStorage.setItem(FORMAT_BADGES_KEY, String(showFormatBadges));
  }, [showFormatBadges]);

  const setShowFormatBadges = (show: boolean) => {
    setShowFormatBadgesState(show);
  };

  const toggleFormatBadges = () => {
    setShowFormatBadgesState(current => !current);
  };

  return (
    <DisplayPreferencesContext.Provider value={{ showFormatBadges, setShowFormatBadges, toggleFormatBadges }}>
      {children}
    </DisplayPreferencesContext.Provider>
  );
};

export const useDisplayPreferences = (): DisplayPreferencesContextType => {
  const context = useContext(DisplayPreferencesContext);
  if (!context) {
    throw new Error('useDisplayPreferences must be used within a DisplayPreferencesProvider');
  }
  return context;
};
