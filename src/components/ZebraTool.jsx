import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

/**
 * ZebraTool — floating scanner tool, always visible regardless of role.
 * Renders as a fixed button; expands into a compact scan panel.
 */
export default function ZebraTool({ t, currentUser, lang }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [lastSent, setLastSent] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | ok | error
  const [errMsg, setErrMsg] = useState('');
  const inputRef = useRef(null);

  // Auto-focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const handleScan = async (e) => {
    e.preventDefault();
    const bc = input.trim();
    if (!bc) return;
    setStatus('sending');
    setErrMsg('');
    const { error } = await supabase.from('cloud_scanner').insert([{ barcode: bc, operator: currentUser }]);
    if (error) {
      setErrMsg(error.message || (lang === 'zh' ? '傳送失敗' : 'Send failed'));
      setStatus('error');
      setTimeout(() => { setStatus('idle'); setErrMsg(''); }, 3000);
    } else {
      setLastSent(bc);
      setStatus('ok');
      setInput('');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const statusColor = { idle: 'var(--dk-text-3)', sending: '#f59e0b', ok: '#10b981', error: '#ef4444' };
  const statusLabel = {
    idle:    lang === 'zh' ? '就緒' : 'Ready',
    sending: lang === 'zh' ? '傳送中...' : 'Sending...',
    ok:      `${lang === 'zh' ? '已傳送' : 'Sent'}: ${lastSent}`,
    error:   lang === 'zh' ? '傳送失敗' : 'Send failed',
  };

  return (
    <>
      {/* Backdrop (closes panel on outside click) */}
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 299 }} />
      )}

      {/* Floating container — bottom-right, above tabbar on mobile */}
      <div style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
        right: 20,
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
      }}>

        {/* Expanded scan panel */}
        {open && (
          <div style={{
            background: 'var(--lt-surface, #fff)',
            border: '1px solid var(--lt-border, #e5e7eb)',
            borderRadius: 14,
            padding: '16px 18px',
            width: 280,
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--lt-text, #111)' }}>
                {lang === 'zh' ? 'Zebra 掃描' : 'Zebra Scanner'}
              </div>
              <div style={{ fontSize: 11, color: statusColor[status] }}>{statusLabel[status]}</div>
            </div>

            {/* Status bar */}
            <div style={{
              height: 3, borderRadius: 2, marginBottom: 12,
              background: status === 'idle' ? 'var(--lt-border, #e5e7eb)' : statusColor[status],
              transition: 'background .3s',
            }} />

            {/* Error message */}
            {errMsg && (
              <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6,
                background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
                fontSize: 11, color: '#b91c1c', wordBreak: 'break-word' }}>
                {errMsg}
              </div>
            )}

            {/* Scan input */}
            <form onSubmit={handleScan}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={lang === 'zh' ? '掃描或輸入條碼...' : 'Scan or enter barcode...'}
                style={{
                  width: '100%', padding: '12px 14px', fontSize: 15,
                  border: `1.5px solid ${status === 'ok' ? '#86efac' : status === 'error' ? '#fca5a5' : 'var(--lt-border2, #d1d5db)'}`,
                  borderRadius: 10, background: 'var(--lt-surface, #fff)',
                  color: 'var(--lt-text, #111)', outline: 'none',
                  transition: 'border-color .2s', marginBottom: 10,
                  boxSizing: 'border-box',
                }}
              />
              <button type="submit" disabled={!input.trim() || status === 'sending'}
                style={{
                  width: '100%', padding: '11px', fontSize: 14, fontWeight: 600,
                  background: '#007aff', color: '#fff', border: 'none',
                  borderRadius: 10, cursor: 'pointer',
                  opacity: (!input.trim() || status === 'sending') ? 0.5 : 1,
                  transition: 'opacity .15s',
                }}>
                {status === 'sending' ? (lang === 'zh' ? '傳送中...' : 'Sending...') : (lang === 'zh' ? '傳送' : 'Send')}
              </button>
            </form>

            {/* Operator info */}
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--lt-text-2, #6b7280)', textAlign: 'center' }}>
              {lang === 'zh' ? '操作員' : 'Operator'}: {currentUser}
            </div>
          </div>
        )}

        {/* FAB button */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: 52, height: 52,
            borderRadius: '50%',
            background: open ? '#1d4ed8' : '#007aff',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,122,255,0.4)',
            transition: 'background .15s, transform .15s',
            transform: open ? 'rotate(45deg) scale(0.95)' : 'scale(1)',
            fontSize: 22, fontWeight: 300, lineHeight: 1,
          }}
          title={lang === 'zh' ? 'Zebra 掃描工具' : 'Zebra Scanner Tool'}
        >
          {open ? '×' : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="5" height="5" rx="1"/>
              <rect x="16" y="3" width="5" height="5" rx="1"/>
              <rect x="3" y="16" width="5" height="5" rx="1"/>
              <line x1="16" y1="16" x2="21" y2="16"/>
              <line x1="16" y1="20" x2="21" y2="20"/>
              <line x1="16" y1="12" x2="21" y2="12"/>
              <line x1="12" y1="3" x2="12" y2="8"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
            </svg>
          )}
        </button>
      </div>
    </>
  );
}
