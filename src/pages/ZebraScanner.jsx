import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function ZebraScanner({ t, currentUser }) {
  const [zebraInput, setZebraInput] = useState('');
  const [lastSent, setLastSent] = useState(null);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const bc = zebraInput.trim().toUpperCase();
    if (!bc) return;

    await supabase.from('cloud_scanner').insert([{ barcode: bc, operator: currentUser }]);
    if (navigator.vibrate) navigator.vibrate(40);

    const entry = { bc, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
    setLastSent(entry);
    setHistory(prev => [entry, ...prev].slice(0, 10));
    setZebraInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{t.zebraTitle}</div>
          <div className="page-subtitle">{t.zebraDesc}</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--dk-text-3)' }}>
          {currentUser}
        </div>
      </div>

      {/* Scan input */}
      <div className="card" style={{ marginBottom: 14 }}>
        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--dk-text-2)', display: 'block', marginBottom: 8 }}>
            {t.zebraPlaceholder}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              type="text"
              value={zebraInput}
              onChange={e => setZebraInput(e.target.value.toUpperCase())}
              placeholder={t.zebraPlaceholder}
              style={{ flex: 1, fontSize: 18, padding: '12px 16px', fontFamily: 'monospace', letterSpacing: 2 }}
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '12px 20px', fontSize: 15 }}>
              Send
            </button>
          </div>
        </form>
      </div>

      {/* Last sent toast */}
      {lastSent && (
        <div style={{ marginBottom: 14, padding: '12px 16px', borderRadius: 8,
          background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)',
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
          <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#10b981' }}>{lastSent.bc}</span>
          <span style={{ fontSize: 12, color: 'var(--dk-text-3)', marginLeft: 'auto' }}>{t.zebraSent?.replace('{bc}', '') || 'Sent'} {lastSent.time}</span>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600,
            color: 'var(--dk-text-3)', textTransform: 'uppercase', letterSpacing: '.5px',
            borderBottom: '1px solid var(--border)' }}>
            Recent scans
          </div>
          {history.map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
              opacity: i === 0 ? 1 : 1 - i * 0.08 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600,
                color: i === 0 ? 'var(--dk-accent)' : 'var(--dk-text-2)' }}>{h.bc}</span>
              <span style={{ fontSize: 11, color: 'var(--dk-text-4)', marginLeft: 'auto' }}>{h.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
