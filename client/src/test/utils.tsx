import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, RenderOptions } from '@testing-library/react';
import { AuthProvider } from '../context/AuthContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import { DisplayPreferencesProvider } from '../context/DisplayPreferencesContext';
import { ServerModeProvider } from '../context/ServerModeContext';
import { SidebarProvider } from '../context/SidebarContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';

interface AllProvidersProps {
  children: React.ReactNode;
  initialRoute?: string;
}

export function AllProviders({ children, initialRoute = '/' }: AllProvidersProps) {
  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <ThemeProvider>
        <DisplayPreferencesProvider>
          <ServerModeProvider>
            <ToastProvider>
              <ConfirmProvider>
                <AuthProvider>
                  <SidebarProvider>{children}</SidebarProvider>
                </AuthProvider>
              </ConfirmProvider>
            </ToastProvider>
          </ServerModeProvider>
        </DisplayPreferencesProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string;
}

export function renderWithProviders(
  ui: React.ReactElement,
  { initialRoute = '/', ...options }: CustomRenderOptions = {}
) {
  return render(ui, {
    wrapper: ({ children }) => <AllProviders initialRoute={initialRoute}>{children}</AllProviders>,
    ...options,
  });
}
