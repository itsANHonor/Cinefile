import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarProvider, useSidebar } from './SidebarContext';

function Consumer() {
  const { isCollapsed, isMobileOpen, toggleSidebar, openMobile, closeMobile } = useSidebar();
  return (
    <div>
      <div data-testid="collapsed">{isCollapsed ? 'collapsed' : 'expanded'}</div>
      <div data-testid="mobile">{isMobileOpen ? 'open' : 'closed'}</div>
      <button onClick={toggleSidebar}>toggle desktop</button>
      <button onClick={openMobile}>open mobile</button>
      <button onClick={closeMobile}>close mobile</button>
    </div>
  );
}

describe('SidebarContext', () => {
  it('defaults to expanded and mobile closed', () => {
    render(
      <SidebarProvider>
        <Consumer />
      </SidebarProvider>
    );

    expect(screen.getByTestId('collapsed')).toHaveTextContent('expanded');
    expect(screen.getByTestId('mobile')).toHaveTextContent('closed');
  });

  it('toggles desktop collapse without changing mobile state', () => {
    render(
      <SidebarProvider>
        <Consumer />
      </SidebarProvider>
    );

    fireEvent.click(screen.getByText('toggle desktop'));
    expect(screen.getByTestId('collapsed')).toHaveTextContent('collapsed');
    expect(screen.getByTestId('mobile')).toHaveTextContent('closed');
  });

  it('opens and closes mobile state without touching desktop collapse', () => {
    render(
      <SidebarProvider>
        <Consumer />
      </SidebarProvider>
    );

    fireEvent.click(screen.getByText('open mobile'));
    expect(screen.getByTestId('mobile')).toHaveTextContent('open');
    expect(screen.getByTestId('collapsed')).toHaveTextContent('expanded');

    fireEvent.click(screen.getByText('close mobile'));
    expect(screen.getByTestId('mobile')).toHaveTextContent('closed');
  });

  it('persists desktop collapsed state to localStorage', () => {
    const { unmount } = render(
      <SidebarProvider>
        <Consumer />
      </SidebarProvider>
    );

    fireEvent.click(screen.getByText('toggle desktop'));
    unmount();

    expect(window.localStorage.getItem('sidebar_collapsed')).toBe('true');
  });
});
