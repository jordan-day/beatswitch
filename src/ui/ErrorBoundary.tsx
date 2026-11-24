import { Component, type ReactNode } from 'react';

/**
 * Keeps one broken panel from blanking the whole app: shows a small recovery card in its place
 * while the rest of the workspace (and the beat itself) keeps working.
 */
export class ErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.name}]`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="card border-kick/50 flex flex-col items-start gap-2">
        <div className="font-extrabold">The {this.props.name} hit a problem.</div>
        <div className="text-sm text-cream-500">
          Your beat is safe. Try again, or press Ctrl+Z to undo the last change if it keeps happening.
        </div>
        <button className="btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
