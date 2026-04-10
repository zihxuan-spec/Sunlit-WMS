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
  const [formData, setFormData] = useState({ cleaningLine: 'Line A', workOrder: '', gunNumber: '', newPallet: '' });

  useEffect(() => { fetchBatches(); }, []);

  const fetchBatches = async () => {
    const { data } = await supabase.from('production_batches').select('*').order('created_at', { ascending: false });
    if (data) {
      setBatches({
        pending: data.filter(b => b.status === 'pending'),
        processing: data.filter(b => b.status === 'processing'),
        completed: data.filter(b => b.status === 'completed'),
      });
    }
  };

  // 進入生產精靈：這是最容易卡住的地方，加入了更多錯誤提示
  const startProduction = async (batch) => {
    // 1. 抓取製程步驟
    const { data: stepData, error: stepErr } = await supabase.from('material_process_steps')
      .eq('material_code', batch.material_code).order('step_order', { ascending: true });
    
    if (!stepData || stepData.length === 0) {
      return alert(`❌ 找不到物料 [${batch.material_code}] 的製程設定，請檢查資料庫！`);
    }

    // 2. 抓取桶子清單
    const { data: contData } = await supabase.from('production_containers').eq('batch_no', batch.batch_no);
    
    setSteps(stepData);
    setContainers(contData || []);
    setActiveBatch(batch);
    setCurrentStepIdx(0);
    setScannedList([]);

    // 更新批次狀態為加工中
    if (batch.status === 'pending') {
      await supabase.from('production_batches').update({ status: 'processing' }).eq('batch_no', batch.batch_no);
      fetchBatches();
    }
  };

  const handleVerify = (e) => {
    e.preventDefault();
    const barcode = scanInput.trim().toUpperCase();
    // 同時支援多種可能欄位名
    const match = containers.find(c => (c.barcode === barcode || c.product_barcode === barcode));
    
    if (!match) return alert("❌ 此桶號不在批次清單中！");
    if (scannedList.includes(barcode)) return setScanInput('');
    
    setScannedList([...scannedList, barcode]);
    setScanInput('');
  };

  const handleSaveAndNext = async () => {
    if (scannedList.length < containers.length) return alert("⚠️ 請先完成所有桶號校驗！");

    const currentStep = steps[currentStepIdx];
    
    // 如果是最後一站 Packaging
    if (currentStep.step_name.includes('Packaging')) {
      if (!formData.newPallet) return alert("⚠️ 請輸入成品棧板號碼！");
      
      // 1. 紀錄母子對應 (PACK)
      await supabase.from('pallet_container_map').insert(containers.map(c => ({
        parent_pallet: formData.newPallet,
        child_barcode: c.barcode || c.product_barcode,
        action_type: 'PACK',
        operator: currentUser
      })));

      // 2. 更新 Batch 狀態與 Turnover 狀態
      await supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      await supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      
      alert("✅ 生產完成！批次已封板。");
      setActiveBatch(null);
      fetchBatches();
      return;
    }

    // 跳下一站
    setCurrentStepIdx(prev => prev + 1);
    setScannedList([]);
  };

  if (activeBatch) {
    const currentStep = steps[currentStepIdx];
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '20px auto', border: '2px solid #9c27b0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
          <h3 style={{ color: '#1976d2' }}>{currentStep?.step_name} [{activeBatch.batch_no}]</h3>
          <button onClick={() => setActiveBatch(null)} style={{ background: '#666', color: '#fff', border: 'none', padding: '5px 15px', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
        </div>

        {/* 步驟導航 (Stepper) */}
        <div style={{ display: 'flex', gap: '10px', margin: '20px 0' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ 
              flex: 1, height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '15px', fontSize: '12px',
              background: i <= currentStepIdx ? '#e3f2fd' : '#f5f5f5',
              color: i <= currentStepIdx ? '#1976d2' : '#999',
              border: i === currentStepIdx ? '2px solid #1976d2' : '1px solid #ddd'
            }}>
              Step {i+1}
            </div>
          ))}
        </div>

        {/* 紅色校驗框 [仿舊版介面] */}
        <div style={{ border: '2px solid #f44336', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
          <h4 style={{ color: '#f44336', margin: '0 0 10px 0' }}>Scan Containers to Verify</h4>
          <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Progress: {scannedList.length} / {containers.length}</p>
          
          <form onSubmit={handleVerify} style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              className="input-field" 
              value={scanInput} 
              onChange={e => setScanInput(e.target.value.toUpperCase())} 
              placeholder="Scan container barcode..." 
              autoFocus 
            />
            <button type="submit" className="btn" style={{ background: '#f44336', width: '80px' }}>Verify</button>
          </form>

          <div style={{ marginTop: '15px', maxHeight: '120px', overflowY: 'auto', background: '#fff', padding: '5px' }}>
            {containers.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '5px 0', borderBottom: '1px solid #eee' }}>
                <span>📦 {c.barcode || c.product_barcode}</span>
                <span style={{ color: scannedList.includes(c.barcode || c.product_barcode) ? '#4caf50' : '#999', fontWeight: 'bold' }}>
                  {scannedList.includes(c.barcode || c.product_barcode) ? 'Verified ✓' : 'Waiting...'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Packaging 專屬欄位 */}
        {currentStep?.step_name.includes('Packaging') && (
          <div style={{ marginBottom: '20px', padding: '10px', background: '#fce4ec', borderRadius: '8px' }}>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>新成品棧板號碼 (例如: AZAP-001)</label>
            <input type="text" className="input-field" value={formData.newPallet} onChange={e => setFormData({...formData, newPallet: e.target.value.toUpperCase()})} />
          </div>
        )}

        <button className="btn" style={{ width: '100%', background: '#9c27b0', padding: '15px', fontSize: '18px', borderRadius: '8px' }} onClick={handleSaveAndNext}>
           💾 Save & Next
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ color: '#9c27b0', borderBottom: '2px solid #9c27b0', paddingBottom: '10px' }}>⚙️ MES 看板</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '20px' }}>
        {['pending', 'processing', 'completed'].map(status => (
          <div key={status} style={{ background: '#f5f5f5', padding: '10px', borderRadius: '8px', minHeight: '300px' }}>
            <h4 style={{ textTransform: 'uppercase', color: '#666', borderBottom: '1px solid #ccc', paddingBottom: '5px' }}>{status}</h4>
            {batches[status].map(b => (
              <div key={b.batch_no} onClick={() => status !== 'completed' && startProduction(b)} style={{ 
                background: '#fff', padding: '10px', marginBottom: '10px', borderRadius: '4px', cursor: status !== 'completed' ? 'pointer' : 'default',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)', borderLeft: '4px solid #9c27b0'
              }}>
                <div style={{ fontWeight: 'bold' }}>{b.batch_no}</div>
                <div style={{ fontSize: '12px', color: '#888' }}>Material: {b.material_code}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
