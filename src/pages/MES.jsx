import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function MES({ t, lang, showAlert, currentUser }) {
  const [batches, setBatches] = useState({ pending: [], processing: [], completed: [] });
  const [activeBatch, setActiveBatch] = useState(null); 
  const [steps, setSteps] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [containers, setContainers] = useState([]);
  const [scannedList, setScannedList] = useState([]); 
  const [scanInput, setScanInput] = useState('');
  
  // 對接您資料庫截圖中的欄位
  const [formData, setFormData] = useState({ 
    cleaningLine: 'Line A', 
    workOrder: '', 
    gunNumber: '', 
    newPallet: '' 
  });

  useEffect(() => { fetchBatches(); }, []);

  const fetchBatches = async () => {
    // 修正後的查詢語法
    const { data } = await supabase.from('production_batches').select('*').order('created_at', { ascending: false });
    if (data) {
      setBatches({
        pending: data.filter(b => b.status === 'pending'),
        processing: data.filter(b => b.status === 'processing'),
        completed: data.filter(b => b.status === 'completed'),
      });
    }
  };

  const startProduction = async (batch) => {
    // 🔍 修正處 1：補上 .select()，解決 Console 中的 eq is not a function 錯誤
    const { data: stepData } = await supabase
      .from('material_process_steps')
      .select('*') // 👈 重要：必須先 select 才能 eq
      .eq('material_code', batch.material_code)
      .order('step_order', { ascending: true });
    
    if (!stepData || stepData.length === 0) {
      return alert(`❌ 錯誤：資料庫中找不到 [${batch.material_code}] 的步驟設定！`);
    }

    // 🔍 修正處 2：同樣補上 .select()
    const { data: contData } = await supabase
      .from('production_containers')
      .select('*') // 👈 重要
      .eq('batch_no', batch.batch_no);
    
    setSteps(stepData);
    setContainers(contData || []);
    setActiveBatch(batch);
    setCurrentStepIdx(0);
    setScannedList([]);

    if (batch.status === 'pending') {
      await supabase.from('production_batches').update({ status: 'processing' }).eq('batch_no', batch.batch_no);
      fetchBatches();
    }
  };

  const handleVerify = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    // 使用您資料庫截圖中的 barcode 欄位名
    const match = containers.find(c => c.barcode === input);
    
    if (!match) return alert("❌ 此桶號不在批次清單中！");
    if (scannedList.includes(input)) return setScanInput('');
    setScannedList([...scannedList, input]);
    setScanInput('');
  };

  const handleSaveAndNext = async () => {
    if (scannedList.length < containers.length) return alert("⚠️ 請先完成所有桶號校驗！");
    const currentStep = steps[currentStepIdx];
    
    // Packaging 站點邏輯
    if (currentStep.step_name.includes('Packaging')) {
      if (!formData.newPallet) return alert("⚠️ 請輸入成品棧板號碼！");
      
      await supabase.from('pallet_container_map').insert(containers.map(c => ({
        parent_pallet: formData.newPallet,
        child_barcode: c.barcode,
        action_type: 'PACK',
        operator: currentUser
      })));

      await supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      await supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      
      alert("✅ 生產完成！");
      setActiveBatch(null);
      fetchBatches();
      return;
    }
    setCurrentStepIdx(prev => prev + 1);
    setScannedList([]);
  };

  return (
    <div className="card">
      <h2 style={{ color: '#9c27b0', borderBottom: '2px solid #9c27b0', paddingBottom: '10px' }}>⚙️ MES 看板</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '20px' }}>
        {['pending', 'processing', 'completed'].map(status => (
          <div key={status} style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', minHeight: '300px' }}>
            <h4 style={{ textTransform: 'uppercase', color: '#666', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>{status}</h4>
            {batches[status].map(b => (
              <div key={b.batch_no} onClick={() => status !== 'completed' && startProduction(b)} style={{ 
                background: '#fff', padding: '15px', marginBottom: '10px', borderRadius: '4px', cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)', borderLeft: '5px solid #9c27b0'
              }}>
                <div style={{ fontWeight: 'bold' }}>{b.batch_no}</div>
                <div style={{ fontSize: '12px', color: '#1976d2' }}>Material: {b.material_code}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {activeBatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000 }}>
          <div style={{ background: '#fff', width: '90%', maxWidth: '600px', borderRadius: '12px', padding: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#1976d2' }}>{steps[currentStepIdx]?.step_name}</h3>
              <button onClick={() => setActiveBatch(null)} style={{ background: '#eee', border: 'none', padding: '5px 15px', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
            </div>

            <div style={{ display: 'flex', gap: '5px', marginBottom: '25px' }}>
              {steps.map((s, i) => (
                <div key={i} style={{ flex: 1, height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '20px', fontSize: '11px', background: i === currentStepIdx ? '#e3f2fd' : (i < currentStepIdx ? '#e8f5e9' : '#f5f5f5'), color: i === currentStepIdx ? '#1976d2' : (i < currentStepIdx ? '#2e7d32' : '#999'), border: i === currentStepIdx ? '2px solid #1976d2' : '1px solid #ddd' }}>Step {i+1}</div>
              ))}
            </div>

            <div style={{ border: '2px solid #f44336', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
              <h4 style={{ color: '#f44336', marginTop: 0 }}>Scan Containers ({scannedList.length}/{containers.length})</h4>
              <form onSubmit={handleVerify} style={{ display: 'flex', gap: '10px' }}>
                <input type="text" className="input-field" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} placeholder="掃描桶號..." autoFocus />
                <button type="submit" className="btn" style={{ background: '#f44336', width: '80px' }}>Verify</button>
              </form>
              <div style={{ marginTop: '15px', maxHeight: '120px', overflowY: 'auto' }}>
                {containers.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: '14px' }}>
                    <span>📦 {c.barcode}</span>
                    <span style={{ color: scannedList.includes(c.barcode) ? '#4caf50' : '#999' }}>{scannedList.includes(c.barcode) ? 'Verified ✓' : 'Waiting...'}</span>
                  </div>
                ))}
              </div>
            </div>

            {steps[currentStepIdx]?.step_name.includes('Packaging') && (
              <div style={{ marginBottom: '20px', padding: '15px', background: '#fce4ec', borderRadius: '8px' }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>輸入新成品棧板條碼</label>
                <input type="text" className="input-field" value={formData.newPallet} onChange={e => setFormData({...formData, newPallet: e.target.value.toUpperCase()})} />
              </div>
            )}

            <button className="btn" style={{ width: '100%', background: '#9c27b0', padding: '18px', fontSize: '18px', fontWeight: 'bold' }} onClick={handleSaveAndNext}>💾 Save & Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
