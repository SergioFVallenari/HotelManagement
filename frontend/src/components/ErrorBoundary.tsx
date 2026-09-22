import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error de render capturado:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fullscreen-center">
          <div className="alert alert-danger" role="alert" style={{ maxWidth: 560 }}>
            <strong>Algo salió mal.</strong>
            <p className="mb-2">{this.state.error.message}</p>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => window.location.reload()}>
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}