import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Login({ onLogin, t, lang, setLang, showAlert }) {
  const [nameInput, setNameInput] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState('name');
  const [foundUser, setFoundUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleNameSubmit = async (e) => {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) return;
    setLoading(true);

    // 用 maybeSingle() 避免找不到時拋 error，同時相容 pin 欄位不存在的情況
    const { data, error } = await supabase
      .from('employees')
      .select('name, role, pin')
      .eq('name', name)
      .maybeSingle();

    setLoading(false);

    // 若 pin 欄位不存在（舊 schema），error.message 會含 column，改用不含 pin 的查詢
    if (error && error.message?.includes('column')) {
      const { data: data2, error: error2 } = await supabase
        .from('employees')
        .select('name, role')
        .eq('name', name)
        .maybeSingle();
      if (!data2) return showAlert(t.msgInvalidUser);
      return onLogin(data2.name, data2.role || 'Warehouse');
    }

    if (!data) return showAlert(t.msgInvalidUser);

    setFoundUser(data);
    if (data.pin) {
      setStep('pin');
    } else {
      onLogin(data.name, data.role || 'Warehouse');
    }
  };

  const handlePinPress = (digit) => {
    if (pin.length >= 6) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length >= (foundUser?.pin?.length || 4)) {
      if (newPin === foundUser.pin) {
        setTimeout(() => onLogin(foundUser.name, foundUser.role || 'Warehouse'), 150);
      } else {
        setTimeout(() => { setPin(''); showAlert(t.msgInvalidPin || '❌ Incorrect PIN'); }, 400);
      }
    }
  };

  const handlePinBack = () => setPin(p => p.slice(0, -1));

  const handleReset = () => {
    setStep('name'); setPin(''); setFoundUser(null); setNameInput('');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 style={{ fontSize: '30px', margin: '0 0 8px 0' }}>{t.loginTitle}</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '28px', fontSize: '15px' }}>{t.loginDesc}</p>

        {step === 'name' ? (
          <form onSubmit={handleNameSubmit}>
            <input
              type="text"
              placeholder={t.empIdPlaceholder}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              autoFocus
              style={{ textAlign: 'center', fontSize: '18px', padding: '14px' }}
            />
            <button type="submit" className="btn"
              style={{ width: '100%', fontSize: '17px', padding: '14px', marginTop: '4px' }}
              disabled={loading}>
              {loading ? '...' : t.loginBtn}
            </button>
          </form>
        ) : (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '14px' }}>
              👤 {foundUser?.name} — {t.msgEnterPin || 'Enter PIN'}
            </p>
            <div className="pin-display">
              {pin.length > 0 ? '●'.repeat(pin.length) : '○ ○ ○ ○'}
            </div>
            <div className="pin-grid" style={{ marginBottom: '12px' }}>
              {[1,2,3,4,5,6,7,8,9].map(d => (
                <button key={d} className="pin-btn" onClick={() => handlePinPress(String(d))}>{d}</button>
              ))}
              <button className="pin-btn" onClick={handlePinBack} style={{ fontSize: '20px' }}>⌫</button>
              <button className="pin-btn" onClick={() => handlePinPress('0')}>0</button>
              <button className="pin-btn" onClick={handleReset}
                style={{ fontSize: '12px', color: 'var(--text-muted)' }}>✕ {lang === 'zh' ? '返回' : 'Back'}</button>
            </div>
          </div>
        )}

        <button className="btn btn-secondary"
          style={{ marginTop: '16px', width: '100%', fontSize: '14px' }}
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
          🌐 {t.switchLang}
        </button>
      </div>
    </div>
  );
}
