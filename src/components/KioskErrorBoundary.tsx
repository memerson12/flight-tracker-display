import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

class KioskErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  private recoveryTimer: number | null = null;

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Kiosk display crashed', error, info.componentStack);
    this.recoveryTimer = window.setTimeout(() => window.location.reload(), 30_000);
  }

  componentWillUnmount() {
    if (this.recoveryTimer !== null) window.clearTimeout(this.recoveryTimer);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="flex h-screen w-full items-end justify-end bg-black p-6 text-white">
        <div className="rounded-full border border-white/20 bg-black/80 px-4 py-2 font-mono text-xs tracking-widest text-white/70">
          DISPLAY RECOVERING
        </div>
      </main>
    );
  }
}

export default KioskErrorBoundary;
