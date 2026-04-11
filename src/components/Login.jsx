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
    const { data, error } = await supabase
      .from('employees')
      .select('name, role, pin')
      .eq('name', name)
      .maybeSingle();
    setLoading(false);

    if (error || !data) return showAlert(t.msgInvalidUser);

    // pin field is used as password
    if (data.pin && data.pin !== pw) {
      return showAlert(lang === 'zh' ? '密碼錯誤' : 'Incorrect password');
    }

    onLogin(data.name, data.role || 'Warehouse');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Logo mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--dk-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, color: '#fff' }}>W</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--dk-text)', lineHeight: 1.2 }}>Sunlit WMS</div>
            <div style={{ fontSize: 11, color: 'var(--dk-text-3)' }}>Warehouse · MES · Production</div>
          </div>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 6px', color: 'var(--dk-text)' }}>
          {lang === 'zh' ? '登入' : 'Sign in'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--dk-text-3)', margin: '0 0 28px' }}>
          {lang === 'zh' ? '輸入你的帳號和密碼繼續' : 'Enter your credentials to continue'}
        </p>

        <form onSubmit={handleSubmit}>
          {/* Username */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--dk-text-2)', display: 'block', marginBottom: 6 }}>
              {lang === 'zh' ? '帳號' : 'Username'}
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={lang === 'zh' ? '輸入帳號...' : 'Enter username...'}
              autoFocus
              autoComplete="username"
              style={{ fontSize: 15 }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 22 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--dk-text-2)', display: 'block', marginBottom: 6 }}>
              {lang === 'zh' ? '密碼' : 'Password'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={lang === 'zh' ? '輸入密碼...' : 'Enter password...'}
                autoComplete="current-password"
                style={{ fontSize: 15, paddingRight: 44 }}
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, color: 'var(--dk-text-3)', padding: '4px' }}>
                {showPw ? (lang === 'zh' ? '隱藏' : 'Hide') : (lang === 'zh' ? '顯示' : 'Show')}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary"
            style={{ width: '100%', padding: '13px', fontSize: 15, fontWeight: 600 }}
            disabled={loading}>
            {loading ? (lang === 'zh' ? '登入中...' : 'Signing in...') : (lang === 'zh' ? '登入' : 'Sign in')}
          </button>
        </form>

        {/* Language toggle */}
        <button className="btn btn-ghost btn-sm"
          style={{ width: '100%', marginTop: 14, fontSize: 13 }}
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
          {t.switchLang}
        </button>
      </div>
    </div>
  );
}
