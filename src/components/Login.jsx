import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Login({ onLogin, t, lang, setLang, showAlert }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = username.trim();
    const pw   = password.trim();
    if (!name || !pw) return showAlert(lang === 'zh' ? '請輸入帳號和密碼' : 'Please enter username and password');
    setLoading(true);
    // Use RPC — password is verified server-side, never returned to client
    const { data, error } = await supabase.rpc('authenticate_employee', { p_name: name, p_pin: pw });
    setLoading(false);
    if (error || !data?.length) return showAlert(lang === 'zh' ? '帳號或密碼錯誤' : 'Invalid username or password');
    onLogin(data[0].emp_name, data[0].emp_role || 'Warehouse');
  };

  const isLight = document.documentElement.classList.contains('light');

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background: isLight ? '#f3f4f6' : '#0f1623', padding:24 }}>
      <div style={{ width:'100%', maxWidth:400,
        background: isLight ? '#ffffff' : '#1e2535',
        border:`1px solid ${isLight ? '#e5e7eb' : '#2d3748'}`,
        borderRadius:16, padding:'44px 40px',
        boxShadow: isLight ? '0 4px 24px rgba(0,0,0,.08)' : '0 4px 24px rgba(0,0,0,.4)' }}>

        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:'#3b82f6',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:22, fontWeight:800, color:'#fff', margin:'0 auto 16px' }}>S</div>
          <div style={{ fontSize:20, fontWeight:700, color: isLight ? '#111827' : '#f1f5f9', marginBottom:4 }}>Sunlit WMS</div>
          <div style={{ fontSize:12, color: isLight ? '#6b7280' : '#64748b', letterSpacing:'.5px' }}>Warehouse · MES · Production</div>
        </div>

        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:18, fontWeight:600, color: isLight ? '#111827' : '#f1f5f9', marginBottom:4 }}>
            {lang === 'zh' ? '登入帳號' : 'Sign in'}
          </div>
          <div style={{ fontSize:12, color: isLight ? '#6b7280' : '#64748b' }}>
            {lang === 'zh' ? '輸入你的帳號和密碼繼續' : 'Enter your credentials to continue'}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, marginBottom:6, color: isLight ? '#374151' : '#94a3b8' }}>
              {lang === 'zh' ? '帳號' : 'Username'}
            </label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder={lang === 'zh' ? '輸入帳號' : 'Enter username'}
              autoFocus autoComplete="username"
              style={{ width:'100%', padding:'11px 14px', fontSize:14,
                border:`1.5px solid ${isLight ? '#d1d5db' : '#334155'}`,
                borderRadius:8, outline:'none',
                background: isLight ? '#f9fafb' : '#0f1623',
                color: isLight ? '#111827' : '#f1f5f9', boxSizing:'border-box' }}
              onFocus={e => e.target.style.borderColor='#3b82f6'}
              onBlur={e => e.target.style.borderColor=isLight ? '#d1d5db' : '#334155'} />
          </div>

          <div style={{ marginBottom:24 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, marginBottom:6, color: isLight ? '#374151' : '#94a3b8' }}>
              {lang === 'zh' ? '密碼' : 'Password'}
            </label>
            <div style={{ position:'relative' }}>
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder={lang === 'zh' ? '輸入密碼' : 'Enter password'}
                autoComplete="current-password"
                style={{ width:'100%', padding:'11px 48px 11px 14px', fontSize:14,
                  border:`1.5px solid ${isLight ? '#d1d5db' : '#334155'}`,
                  borderRadius:8, outline:'none',
                  background: isLight ? '#f9fafb' : '#0f1623',
                  color: isLight ? '#111827' : '#f1f5f9', boxSizing:'border-box' }}
                onFocus={e => e.target.style.borderColor='#3b82f6'}
                onBlur={e => e.target.style.borderColor=isLight ? '#d1d5db' : '#334155'} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                  background:'none', border:'none', cursor:'pointer',
                  fontSize:11, fontWeight:600, color: isLight ? '#6b7280' : '#64748b', padding:'4px 6px' }}>
                {showPw ? (lang === 'zh' ? '隱藏' : 'Hide') : (lang === 'zh' ? '顯示' : 'Show')}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:'12px', fontSize:15, fontWeight:600,
              background: loading ? '#93c5fd' : '#3b82f6', color:'#fff',
              border:'none', borderRadius:8, cursor: loading ? 'not-allowed' : 'pointer',
              transition:'background .15s', textAlign:'center' }}>
            {loading ? (lang === 'zh' ? '登入中...' : 'Signing in...') : (lang === 'zh' ? '登入' : 'Sign in')}
          </button>
        </form>

        <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          style={{ display:'block', width:'100%', marginTop:14, padding:'10px',
            fontSize:13, fontWeight:500, textAlign:'center', background:'transparent',
            border:`1.5px solid ${isLight ? '#e5e7eb' : '#2d3748'}`,
            borderRadius:8, cursor:'pointer', color: isLight ? '#6b7280' : '#64748b' }}
          onMouseEnter={e => { e.target.style.borderColor='#3b82f6'; e.target.style.color='#3b82f6'; }}
          onMouseLeave={e => { e.target.style.borderColor=isLight ? '#e5e7eb' : '#2d3748'; e.target.style.color=isLight ? '#6b7280' : '#64748b'; }}>
          {lang === 'zh' ? 'English' : '中文'}
        </button>
      </div>
    </div>
  );
}
