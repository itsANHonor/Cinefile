import React from 'react';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('Cinefile error boundary caught an error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface p-4 md:p-6">
          <div className="mx-auto max-w-md pt-[20vh]">
            <EmptyState
              title="Something went wrong"
              description="Cinefile hit an unexpected error. Try reloading the app."
              action={
                <Button onClick={this.handleReload}>
                  Reload Cinefile
                </Button>
              }
            />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
