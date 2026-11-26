import React, { createContext, useContext, useState, useEffect } from 'react';

interface ServerModeContextType {
  isReadOnly: boolean;
  isDesktop: boolean;
  isHistoryPublic: boolean;
  isLoading: boolean;
}

const ServerModeContext = createContext<ServerModeContextType | undefined>(undefined);

export const ServerModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isHistoryPublic, setIsHistoryPublic] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkServerMode = async () => {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        const readOnly = data.mode === 'readonly';
        setIsReadOnly(readOnly);
        setIsDesktop(Boolean(data.desktop));

        if (readOnly) {
          try {
            const settingRes = await fetch('/api/settings/history_public');
            if (settingRes.ok) {
              const settingData = await settingRes.json();
              setIsHistoryPublic(settingData?.value === 'true');
            } else if (settingRes.status === 404) {
              setIsHistoryPublic(false);
            }
          } catch {
            // Keep default if settings check fails in offline/test environments
          }
        }
      } catch (error) {
        console.error('Failed to check server mode:', error);
        // Default to read-only mode if health check fails for safety
        setIsReadOnly(true);
        setIsDesktop(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkServerMode();

    const handleVisibilityChange = (e: Event) => {
      const detail = (e as CustomEvent<{ historyPublic?: boolean }>).detail;
      if (detail && typeof detail.historyPublic === 'boolean') {
        setIsHistoryPublic(detail.historyPublic);
      }
    };
    window.addEventListener('cinefile:history-visibility-changed', handleVisibilityChange);
    return () => {
      window.removeEventListener('cinefile:history-visibility-changed', handleVisibilityChange);
    };
  }, []);

  return (
    <ServerModeContext.Provider value={{ isReadOnly, isDesktop, isHistoryPublic, isLoading }}>
      {children}
    </ServerModeContext.Provider>
  );
};

export const useServerMode = () => {
  const context = useContext(ServerModeContext);
  if (context === undefined) {
    throw new Error('useServerMode must be used within a ServerModeProvider');
  }
  return context;
};

