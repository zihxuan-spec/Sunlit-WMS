import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Login({ onLogin, t, lang, setLang, showAlert }) {
  const [loginInput, setLoginInput] = useState('');

  const { data, error } = await supabase
      .from('employees')
      .select('name, role') // 👈 這裡多加了 , role
      .eq('name', inputName)
      .single();

    if (data) {
      onLogin(data.name, data.role || 'Warehouse'); // 👈 這裡把 role 傳出去
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
