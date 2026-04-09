import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Login({ onLogin, t, lang, setLang, showAlert }) {
  const [loginInput, setLoginInput] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    const inputName = loginInput.trim();
    if (!inputName) return;

    // 查詢員工資料表
    const { data, error } = await supabase
      .from('employees')
      .select('name, role') // 👈 這裡多加了 role
      .eq('name', inputName)
      .single();

    if (data) {
      // 👈 把 name 和 role 一起傳出去。如果資料庫剛好沒填 role，預設給他 'Warehouse'
      onLogin(data.name, data.role || 'Warehouse'); 
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
