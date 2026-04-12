import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Login({ onLogin, lang, setLang, showAlert }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = username.trim();
    const pw   = password.trim();
    if (!name || !pw) { setErrMsg(lang === 'zh' ? '請輸入帳號和密碼' : 'Please enter username and password'); return; }

    setLoading(true);
    setErrMsg('');

    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@sunlit-wms.internal`;

    let result;
    try {
      result = await Promise.race([
        supabase.auth.signInWithPassword({ email, password: pw }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('CONNECTION_TIMEOUT')), 10000)
        ),
      ]);
    } catch (err) {
      setLoading(false);
      if (err.message === 'CONNECTION_TIMEOUT') {
        setErrMsg(lang === 'zh'
          ? '連線逾時。請確認網路，或 Supabase 專案可能需要重新啟動。'
          : 'Connection timed out. Check network or restart your Supabase project.');
      } else {
        setErrMsg(err.message || 'Unknown error');
      }
      return;
    }

    setLoading(false);
    const { data, error } = result;

    if (error) {
      if (error.message?.toLowerCase().includes('invalid')) {
        setErrMsg(lang === 'zh' ? '帳號或密碼錯誤' : 'Invalid username or password');
      } else if (error.message?.includes('not confirmed')) {
        setErrMsg(lang === 'zh' ? '帳號未確認 — 請在 Supabase Auth 開啟 Auto Confirm' : 'Email not confirmed — enable Auto Confirm in Supabase Auth');
      } else {
        setErrMsg(`Error: ${error.message}`);
      }
      return;
    }

    if (!data?.user) {
      setErrMsg(lang === 'zh' ? '找不到此帳號，請先在 Supabase Auth 建立使用者' : 'User not found. Create the user in Supabase Auth first.');
      return;
    }
    // Success — onAuthStateChange in App.jsx will handle the rest
  };

  const isLight = document.documentElement.classList.contains('light');
  const C = (l, d) => isLight ? l : d;

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background: C('#f3f4f6','#0f1623'), padding:24 }}>
      <div style={{ width:'100%', maxWidth:400, background: C('#fff','#1e2535'),
        border:`1px solid ${C('#e5e7eb','#2d3748')}`, borderRadius:16, padding:'44px 40px',
        boxShadow: C('0 4px 24px rgba(0,0,0,.08)','0 4px 24px rgba(0,0,0,.4)') }}>

        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:'#3b82f6', display:'flex',
            alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, color:'#fff', margin:'0 auto 16px' }}>S</div>
          <div style={{ fontSize:20, fontWeight:700, color: C('#111827','#f1f5f9'), marginBottom:4 }}>Sunlit WMS</div>
          <div style={{ fontSize:12, color: C('#6b7280','#64748b'), letterSpacing:'.5px' }}>Warehouse · MES · Production</div>
        </div>

        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:18, fontWeight:600, color: C('#111827','#f1f5f9'), marginBottom:4 }}>
            {lang === 'zh' ? '登入帳號' : 'Sign in'}
          </div>
          <div style={{ fontSize:12, color: C('#6b7280','#64748b') }}>
            {lang === 'zh' ? '輸入你的帳號和密碼繼續' : 'Enter your credentials to continue'}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, marginBottom:6, color: C('#374151','#94a3b8') }}>
              {lang === 'zh' ? '帳號' : 'Username'}
            </label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder={lang === 'zh' ? '輸入帳號' : 'Enter username'}
              autoFocus autoComplete="username"
              style={{ width:'100%', padding:'11px 14px', fontSize:14, boxSizing:'border-box',
                border:`1.5px solid ${C('#d1d5db','#334155')}`, borderRadius:8, outline:'none',
                background: C('#f9fafb','#0f1623'), color: C('#111827','#f1f5f9') }}
              onFocus={e => e.target.style.borderColor='#3b82f6'}
              onBlur={e => e.target.style.borderColor=C('#d1d5db','#334155')} />
          </div>

          <div style={{ marginBottom: errMsg ? 12 : 24 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, marginBottom:6, color: C('#374151','#94a3b8') }}>
              {lang === 'zh' ? '密碼' : 'Password'}
            </label>
            <div style={{ position:'relative' }}>
              <input type={showPw ? 'text':'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder={lang === 'zh' ? '輸入密碼' : 'Enter password'}
                autoComplete="current-password"
                style={{ width:'100%', padding:'11px 48px 11px 14px', fontSize:14, boxSizing:'border-box',
                  border:`1.5px solid ${C('#d1d5db','#334155')}`, borderRadius:8, outline:'none',
                  background: C('#f9fafb','#0f1623'), color: C('#111827','#f1f5f9') }}
                onFocus={e => e.target.style.borderColor='#3b82f6'}
                onBlur={e => e.target.style.borderColor=C('#d1d5db','#334155')} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                  background:'none', border:'none', cursor:'pointer', fontSize:11, fontWeight:600, color: C('#6b7280','#64748b') }}>
                {showPw ? (lang === 'zh' ? '隱藏' : 'Hide') : (lang === 'zh' ? '顯示' : 'Show')}
              </button>
            </div>
          </div>

          {/* Inline error — shows ACTUAL error instead of hanging */}
          {errMsg && (
            <div style={{ marginBottom:16, padding:'10px 14px', background:'#fef2f2',
              border:'1px solid #fecaca', borderRadius:8, fontSize:12, color:'#dc2626', lineHeight:1.5 }}>
              {errMsg}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:12, fontSize:15, fontWeight:600,
              background: loading ? '#93c5fd':'#3b82f6', color:'#fff', border:'none',
              borderRadius:8, cursor: loading ? 'not-allowed':'pointer', textAlign:'center' }}>
            {loading ? (lang === 'zh' ? '登入中...' : 'Signing in...') : (lang === 'zh' ? '登入' : 'Sign in')}
          </button>
        </form>

        <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          style={{ display:'block', width:'100%', marginTop:14, padding:10, fontSize:13, fontWeight:500,
            textAlign:'center', background:'transparent', border:`1.5px solid ${C('#e5e7eb','#2d3748')}`,
            borderRadius:8, cursor:'pointer', color: C('#6b7280','#64748b') }}
          onMouseEnter={e => { e.target.style.borderColor='#3b82f6'; e.target.style.color='#3b82f6'; }}
          onMouseLeave={e => { e.target.style.borderColor=C('#e5e7eb','#2d3748'); e.target.style.color=C('#6b7280','#64748b'); }}>
          {lang === 'zh' ? 'English' : '中文'}
        </button>
      </div>
    </div>
  );
}
