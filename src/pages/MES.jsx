import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function MES({ t, lang, currentUser, showAlert }) {
  const [batches, setBatches] = useState({ pending: [], processing: [], completed: [] });
  const [activeProcess, setActiveProcess] = useState(null); // 目前正在處理的批次
  
  // Packaging 專用 State
  const [newPalletCode, setNewPalletCode] = useState('');
  const [packedDrums, setPackedDrums] = useState([]);

  useEffect(() => { fetchBatches(); }, []);

  const fetchBatches = async () => {
    const { data } = await supabase.from('production_batches').select('*').order('created_at', { ascending: false });
    if (data) {
      setBatches({
        pending: data.filter(b => b.status === 'pending'),
        processing: data.filter(b => b.status === 'processing'),
        completed: data.filter(b => b.status === 'completed')
      });
    }
  };

  const startBatch = async (batchNo) => {
    await supabase.from('production_batches').update({ status: 'processing' }).eq('batch_no', batchNo);
    fetchBatches();
    setActiveProcess(batchNo);
  };

  // 模擬 Packaging 打包邏輯 (一板 4 桶)
  const handlePackDrum = async (e) => {
    e.preventDefault();
    if (!newPalletCode) return showAlert("請先輸入新的成品棧板號碼！");
    if (packedDrums.length >= 4) return showAlert(t.msgPackLimit.replace('{n}', 4));
    
    const drumCode = e.target.drumCode.value.trim();
    if (!drumCode) return;

    const newPacked = [...packedDrums, drumCode];
    setPackedDrums(newPacked);
    e.target.drumCode.value = '';

    // 如果滿 4 桶了，寫入資料庫並清空，等待下一個棧板
    if (newPacked.length === 4) {
      const mapRecords = newPacked.map(child => ({ parent_pallet: newPalletCode, child_barcode: child }));
      await supabase.from('pallet_container_map').insert(mapRecords);
      showAlert(`✅ 棧板 ${newPalletCode} 組裝完成！請輸入下一板號碼。`);
      setNewPalletCode('');
      setPackedDrums([]);
    }
  };

  const finishBatch = async () => {
    await supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeProcess);
    setActiveProcess(null);
    fetchBatches();
    showAlert(t.msgAutoSuccess);
  };

  return (
    <div>
      {/* 若有正在進行的批次，顯示 Wizard 精靈 */}
      {activeProcess ? (
        <div className="card" style={{ border: '3px solid #9c27b0', background: '#fdf3ff' }}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
             <h2 style={{ color: '#7b1fa2', margin: 0 }}>🔄 處理中批次：{activeProcess}</h2>
             <button className="btn btn-secondary" onClick={() => setActiveProcess(null)}>🔙 返回看板</button>
          </div>
          
          <div style={{ marginTop: '20px', background: 'white', padding: '20px', borderRadius: '8px' }}>
            <h3 style={{color: '#333'}}>📦 {t.stepPackaging} (重新組棧板)</h3>
            <p style={{color: '#666'}}>每一棧板最多只能綁定 4 桶子包材。滿 4 桶後系統會自動封板。</p>
            
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '15px' }}>
              <input type="text" placeholder="輸入新成品棧板條碼 (例如: AZAP-001)" value={newPalletCode} onChange={e => setNewPalletCode(e.target.value)} style={{flex: 1, borderColor: '#9c27b0'}} />
            </div>

            <form onSubmit={handlePackDrum} style={{ display: 'flex', gap: '15px' }}>
              <input type="text" name="drumCode" placeholder="掃描已充填完成的子包材條碼..." disabled={!newPalletCode || packedDrums.length >= 4} style={{flex: 2}} />
              <button type="submit" className="btn btn-success" disabled={!newPalletCode}>綁定至棧板 ({packedDrums.length}/4)</button>
            </form>

            {packedDrums.length > 0 && (
              <div style={{ marginTop: '10px', padding: '10px', background: '#e8f5e9', borderRadius: '8px' }}>
                目前棧板 <strong>{newPalletCode}</strong> 內容物：
                {packedDrums.map(d => <span key={d} style={{marginLeft: '10px', fontWeight: 'bold', color: '#2e7d32'}}>✅ {d}</span>)}
              </div>
            )}
            
            <div style={{ marginTop: '30px', textAlign: 'right', borderTop: '2px solid #eee', paddingTop: '15px' }}>
              <button className="btn btn-danger" onClick={finishBatch}>🏁 結束此生產批次</button>
            </div>
          </div>
        </div>
      ) : (
        /* MES Kanban 看板 */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          
          <div className="card" style={{ borderTop: '5px solid #ff9800' }}>
            <h2 style={{ color: '#f57c00', marginTop: 0 }}>{t.mesPending} ({batches.pending.length})</h2>
            {batches.pending.map(b => (
              <div key={b.batch_no} style={{ background: '#fff3e0', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
                <h3 style={{margin: '0 0 5px 0'}}>{b.batch_no}</h3>
                <p style={{margin: '0 0 10px 0', fontSize: '14px', color: '#666'}}>料號: {b.material_code}</p>
                <button className="btn" style={{width: '100%', background: '#ff9800'}} onClick={() => startBatch(b.batch_no)}>開始生產 ▶</button>
              </div>
            ))}
          </div>

          <div className="card" style={{ borderTop: '5px solid #2196f3' }}>
            <h2 style={{ color: '#1976d2', marginTop: 0 }}>{t.mesProcessing} ({batches.processing.length})</h2>
            {batches.processing.map(b => (
              <div key={b.batch_no} style={{ background: '#e3f2fd', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
                <h3 style={{margin: '0 0 5px 0'}}>{b.batch_no}</h3>
                <button className="btn" style={{width: '100%'}} onClick={() => setActiveProcess(b.batch_no)}>進入工作站 🛠️</button>
              </div>
            ))}
          </div>

          <div className="card" style={{ borderTop: '5px solid #4caf50' }}>
            <h2 style={{ color: '#2e7d32', marginTop: 0 }}>{t.mesCompleted} ({batches.completed.length})</h2>
            {batches.completed.map(b => (
              <div key={b.batch_no} style={{ background: '#e8f5e9', padding: '15px', borderRadius: '8px', marginBottom: '10px', color: '#2e7d32', fontWeight: 'bold' }}>
                ✅ {b.batch_no}
              </div>
            ))}
          </div>
          
        </div>
      )}
    </div>
  );
}
