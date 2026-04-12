import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Login({ onLogin, lang, setLang, showAlert }) {
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
    // Convert username to email format used in Supabase Auth
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}@sunlit-wms.internal`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setLoading(false);

    if (error || !data?.user) {
      const msg = error?.message || 'No user found';
      if (msg.includes('Invalid login') || msg.includes('invalid') || msg.includes('credentials')) {
        return showAlert(lang === 'zh' ? '帳號或密碼錯誤' : 'Invalid username or password');
      }
      if (msg.includes('Email not confirmed')) {
        return showAlert(lang === 'zh' ? '帳號未確認，請至 Supabase Auth 勾選 Auto Confirm' : 'Email not confirmed. Enable Auto Confirm in Supabase Auth.');
      }
      return showAlert(`${lang === 'zh' ? '登入失敗' : 'Login failed'}: ${msg}`);
    }
    // Profile (name + role) is fetched in App.jsx via onAuthStateChange
  };

  const isLight = document.documentElement.classList.contains('light');
  const bdr = (light, dark) => isLight ? light : dark;

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background: bdr('#f3f4f6','#0f1623'), padding:24 }}>
      <div style={{ width:'100%', maxWidth:400,
        background: bdr('#fff','#1e2535'),
        border:`1px solid ${bdr('#e5e7eb','#2d3748')}`,
        borderRadius:16, padding:'44px 40px',
        boxShadow: bdr('0 4px 24px rgba(0,0,0,.08)','0 4px 24px rgba(0,0,0,.4)') }}>

        <div style={{ textAlign:'center', marginBottom:36 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:'#3b82f6',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:22, fontWeight:800, color:'#fff', margin:'0 auto 16px' }}>S</div>
          <div style={{ fontSize:20, fontWeight:700, color: bdr('#111827','#f1f5f9'), marginBottom:4 }}>Sunlit WMS</div>
          <div style={{ fontSize:12, color: bdr('#6b7280','#64748b'), letterSpacing:'.5px' }}>Warehouse · MES · Production</div>
        </div>

        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:18, fontWeight:600, color: bdr('#111827','#f1f5f9'), marginBottom:4 }}>
            {lang === 'zh' ? '登入帳號' : 'Sign in'}
          </div>
          <div style={{ fontSize:12, color: bdr('#6b7280','#64748b') }}>
            {lang === 'zh' ? '輸入你的帳號和密碼繼續' : 'Enter your credentials to continue'}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {[
            { label: lang==='zh'?'帳號':'Username', key:'user', type:'text', val:username, set:setUsername, ac:'username', ph:lang==='zh'?'輸入帳號':'Enter username' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:12, fontWeight:600, marginBottom:6, color: bdr('#374151','#94a3b8') }}>{f.label}</label>
              <input type={f.type} value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                autoFocus autoComplete={f.ac}
                style={{ width:'100%', padding:'11px 14px', fontSize:14, border:`1.5px solid ${bdr('#d1d5db','#334155')}`,
                  borderRadius:8, outline:'none', background: bdr('#f9fafb','#0f1623'), color: bdr('#111827','#f1f5f9'), boxSizing:'border-box' }}
                onFocus={e=>e.target.style.borderColor='#3b82f6'}
                onBlur={e=>e.target.style.borderColor=bdr('#d1d5db','#334155')} />
            </div>
          ))}

          <div style={{ marginBottom:24 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, marginBottom:6, color: bdr('#374151','#94a3b8') }}>
              {lang === 'zh' ? '密碼' : 'Password'}
            </label>
            <div style={{ position:'relative' }}>
              <input type={showPw ? 'text':'password'} value={password} onChange={e=>setPassword(e.target.value)}
                placeholder={lang==='zh'?'輸入密碼':'Enter password'} autoComplete="current-password"
                style={{ width:'100%', padding:'11px 48px 11px 14px', fontSize:14, border:`1.5px solid ${bdr('#d1d5db','#334155')}`,
                  borderRadius:8, outline:'none', background: bdr('#f9fafb','#0f1623'), color: bdr('#111827','#f1f5f9'), boxSizing:'border-box' }}
                onFocus={e=>e.target.style.borderColor='#3b82f6'}
                onBlur={e=>e.target.style.borderColor=bdr('#d1d5db','#334155')} />
              <button type="button" onClick={()=>setShowPw(v=>!v)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                  background:'none', border:'none', cursor:'pointer', fontSize:11, fontWeight:600, color: bdr('#6b7280','#64748b') }}>
                {showPw?(lang==='zh'?'隱藏':'Hide'):(lang==='zh'?'顯示':'Show')}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:12, fontSize:15, fontWeight:600,
              background: loading ? '#93c5fd':'#3b82f6', color:'#fff', border:'none',
              borderRadius:8, cursor: loading ? 'not-allowed':'pointer', textAlign:'center' }}>
            {loading?(lang==='zh'?'登入中...':'Signing in...'):(lang==='zh'?'登入':'Sign in')}
          </button>
        </form>

        <button onClick={()=>setLang(lang==='zh'?'en':'zh')}
          style={{ display:'block', width:'100%', marginTop:14, padding:10, fontSize:13, fontWeight:500,
            textAlign:'center', background:'transparent', border:`1.5px solid ${bdr('#e5e7eb','#2d3748')}`,
            borderRadius:8, cursor:'pointer', color: bdr('#6b7280','#64748b') }}
          onMouseEnter={e=>{e.target.style.borderColor='#3b82f6';e.target.style.color='#3b82f6';}}
          onMouseLeave={e=>{e.target.style.borderColor=bdr('#e5e7eb','#2d3748');e.target.style.color=bdr('#6b7280','#64748b');}}>
          {lang==='zh'?'English':'中文'}
        </button>
      </div>
    </div>
  );
}
