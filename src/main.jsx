import './config/logo.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
          background:'#f9fafb', padding:24, fontFamily:'sans-serif' }}>
          <div style={{ maxWidth:420, textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>⚠</div>
            <h2 style={{ fontSize:18, fontWeight:700, color:'#111827', marginBottom:8 }}>
              Something went wrong
            </h2>
            <p style={{ fontSize:13, color:'#6b7280', marginBottom:24, lineHeight:1.6 }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              style={{ padding:'10px 24px', background:'#3b82f6', color:'#fff', border:'none',
                borderRadius:8, fontSize:14, fontWeight:600, cursor:'pointer' }}>
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
