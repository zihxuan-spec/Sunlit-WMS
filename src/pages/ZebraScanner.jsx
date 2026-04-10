import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';

export default function ZebraScanner({ t, currentUser }) {
  const [zebraInput, setZebraInput] = useState('');
  const [zebraToast, setZebraToast] = useState('');

  const handleZebraSubmit = async (e) => {
    e.preventDefault();
    const bc = zebraInput.trim();
    if (!bc) return;

    // 將條碼與操作員送上雲端
    await supabase.from('cloud_scanner').insert([{ barcode: bc, operator: currentUser }]);
    
    setZebraToast(t.zebraSent.replace('{bc}', bc));
    setZebraInput('');
    
    setTimeout(() => setZebraToast(''), 2000);
  };

  return (
    <div className="card" style={{ border: '3px solid #333', textAlign: 'center', padding: '40px 20px', backgroundColor: '#fffde7' }}>
      <h1 style={{ fontSize: '28px', color: '#333', marginTop: 0 }}> {t.zebraTitle}</h1>
      <p style={{ fontSize: '18px', color: '#666' }}>{t.zebraDesc}</p>
      
      <form onSubmit={handleZebraSubmit}>
        <input 
          type="text" 
          placeholder={t.zebraPlaceholder} 
          value={zebraInput} 
          onChange={e => setZebraInput(e.target.value)} 
          autoFocus 
          style={{ fontSize: '24px', padding: '20px', textAlign: 'center', borderColor: '#333', borderWidth: '3px' }}
        />
      </form>
      
      {zebraToast && (
        <div style={{ marginTop: '20px', fontSize: '20px', fontWeight: 'bold', color: '#2e7d32', backgroundColor: '#e8f5e9', padding: '15px', borderRadius: '8px', border: '2px solid #4caf50' }}>
          {zebraToast}
        </div>
      )}
    </div>
  );
}