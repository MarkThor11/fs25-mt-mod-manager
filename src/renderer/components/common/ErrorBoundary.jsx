import React from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[CRITICAL] [UI] React Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          height: '100vh', 
          width: '100vw', 
          background: 'var(--bg-primary)', 
          color: 'var(--text-primary)', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: 40,
          textAlign: 'center'
        }}>
          <div style={{ 
            width: 80, 
            height: 80, 
            borderRadius: 20, 
            background: 'rgba(var(--error-rgb), 0.1)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            color: 'var(--error)',
            marginBottom: 24
          }}>
            <ShieldAlert size={48} />
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 12 }}>Interface Failure</h1>
          <p style={{ maxWidth: 500, opacity: 0.7, marginBottom: 32, lineHeight: 1.6 }}>
            The application encountered a fatal rendering error. This usually happens if the system bridge is uninitialized or a component failed to load.
          </p>
          <div style={{ 
            background: 'var(--bg-tertiary)', 
            padding: '16px 24px', 
            borderRadius: 12, 
            border: '1px solid var(--border)', 
            fontSize: 12, 
            fontFamily: 'monospace', 
            color: 'var(--error)',
            marginBottom: 32,
            maxWidth: '80%',
            overflow: 'auto',
            maxHeight: 200
          }}>
            {this.state.error?.toString()}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button 
              className="btn btn--secondary" 
              onClick={() => {
                const report = {
                  error: this.state.error?.toString(),
                  stack: this.state.error?.stack,
                  version: '1.0.10',
                  platform: window.navigator.platform,
                  userAgent: window.navigator.userAgent,
                  timestamp: new Date().toISOString()
                };
                const reportStr = JSON.stringify(report, null, 2);
                if (window.api && window.api.clipboard) {
                  window.api.clipboard.writeText(reportStr);
                } else {
                  navigator.clipboard.writeText(reportStr);
                }
                alert('Diagnostic report copied to clipboard!');
              }}
              style={{ gap: 8 }}
            >
              Copy Diagnostic Report
            </button>
            <button 
              className="btn btn--primary" 
              onClick={() => window.location.reload()}
              style={{ gap: 8 }}
            >
              <RefreshCw size={18} /> Restart Interface
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
