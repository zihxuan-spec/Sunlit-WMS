import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Login({ onLogin, t, lang, setLang, showAlert }) {
  const [loginInput, setLoginInput] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    const inputName = loginInput.trim();
    if (!inputName) return;

    // 查詢員工資料表，同時抓取 role
    const { data, error } = await supabase
      .from('employees')
      .select('name, role')
      .eq('name', inputName)
      .single();

    if (data) {
      // 成功登入，將 name 與 role 傳回 App.jsx
      onLogin(data.name, data.role || 'Warehouse');
    } else {
      showAlert(t.msgInvalidUser);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 style={{ fontSize: '32px', margin: '0 0 10px 0' }}>{t.loginTitle}</h1>
        <p style={{ color: '#666', marginBottom: '30px' }}>{t.loginDesc}</p>
        <form onSubmit={handleLogin}>
          <input 
            type="text" 
            placeholder={t.empIdPlaceholder} 
            value={loginInput} 
            onChange={e => setLoginInput(e.target.value)} 
            autoFocus 
            required 
            style={{ textAlign: 'center', fontSize: '20px', padding: '15px' }} 
          />
          <button type="submit" className="btn" style={{ width: '100%', fontSize: '20px', padding: '15px', marginTop: '10px' }}>
            {t.loginBtn}
          </button>
        </form>
        <button 
          className="btn btn-secondary" 
          style={{ marginTop: '20px' }} 
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        >
          🌐 {t.switchLang}
        </button>
      </div>
    </div>
  );
}
