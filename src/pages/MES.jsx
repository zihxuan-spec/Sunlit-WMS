import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function MES({ t, lang, showAlert, currentUser }) {
  const [batches, setBatches] = useState({ pending: [], processing: [], completed: [] });
  const [activeBatch, setActiveBatch] = useState(null); 
  const [steps, setSteps] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [containers, setContainers] = useState([]);
  const [scannedList, setScannedList] = useState([]); // 存儲目前步驟已驗證的桶號
  const [scanInput, setScanInput] = useState('');

  // 站點專屬表單欄位
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

  // 進入生產精靈
  const startProduction = async (batch) => {
    setActiveBatch(batch);
    // 1. 抓取製程步驟
    const { data: stepData } = await supabase.from('material_process_steps')
      .eq('material_code', batch.material_code).order('step_order', { ascending: true });
    setSteps(stepData || []);

    // 2. 抓取此批次的桶子清單
    const { data: contData } = await supabase.from('production_containers').eq('batch_no', batch.batch_no);
    setContainers(contData || []);
    setScannedList([]);
    setCurrentStepIdx(0);

    // 3. 更新批次狀態為加工中
    if (batch.status === 'pending') {
      await supabase.from('production_batches').update({ status: 'processing' }).eq('batch_no', batch.batch_no);
      fetchBatches();
    }
  };

  const handleVerify = (e) => {
    e.preventDefault();
    const barcode = scanInput.trim().toUpperCase();
    const match = containers.find(c => c.barcode === barcode);
    if (!match) return showAlert("❌ 此桶號不在批次清單中");
    if (scannedList.includes(barcode)) return setScanInput('');
    setScannedList([...scannedList, barcode]);
    setScanInput('');
  };

  const handleSaveAndNext = async () => {
    if (scannedList.length < containers.length) return showAlert("⚠️ 請先完成所有桶號校驗！");

    const currentStep = steps[currentStepIdx];
    
    // 如果是最後一站 Packaging，執行封板與完工
    if (currentStep.step_name.includes('Packaging')) {
      if (!formData.newPallet) return showAlert("⚠️ 請輸入成品棧板號碼！");
      
      // 紀錄母子對應 (PACK 模式)
      await supabase.from('pallet_container_map').insert(containers.map(c => ({
        parent_pallet: formData.newPallet,
        child_barcode: c.barcode,
        action_type: 'PACK',
        operator: currentUser
      })));

      // 更新 Batch 狀態為 Completed
      await supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      // 同步更新 Turnover 狀態為 Completed
      await supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      
      showAlert("✅ 批次生產完成並已自動封板！");
      setActiveBatch(null);
      fetchBatches();
      return;
    }

    // 否則跳下一站
    setCurrentStepIdx(prev => prev + 1);
    setScannedList([]);
  };

  if (activeBatch) {
    const currentStep = steps[currentStepIdx];
    const progress = ((currentStepIdx + 1) / steps.length) * 100;

    return (
      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* 進度條與標題 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Step {currentStepIdx + 1}: {currentStep?.step_name} [{activeBatch.batch_no}]</h3>
          <button className="btn btn-secondary" onClick={() => setActiveBatch(null)}>Close</button>
        </div>
        <div style={{ width: '100%', height: '8px', background: '#eee', borderRadius: '4px', margin: '15px 0' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: '#4caf50', borderRadius: '4px', transition: '0.3s' }}></div>
        </div>

        {/* 站點導覽選單 */}
        <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ 
              padding: '8px 12px', borderRadius: '20px', fontSize: '12px',
              background: i === currentStepIdx ? '#e3f2fd' : '#f5f5f5',
              color: i === currentStepIdx ? '#1976d2' : '#999',
              border: i === currentStepIdx ? '1px solid #1976d2' : '1px solid #ddd'
            }}>
              Step {i+1}: {s.step_name}
            </div>
          ))}
        </div>

        {/* 專屬欄位區 */}
        <div style={{ background: '#fff', border: '1px solid #f44336', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
          <h4 style={{ color: '#f44336', marginTop: 0 }}>Scan Containers to Verify</h4>
          <p style={{ fontSize: '13px' }}>Progress {scannedList.length} / {containers.length}</p>
          
          {currentStep?.step_name.includes('Cleaning') && (
            <div style={{ marginBottom: '15px' }}>
              <label>Cleaning Line</label>
              <select className="input-field" value={formData.cleaningLine} onChange={e => setFormData({...formData, cleaningLine: e.target.value})}>
                <option>Line A</option><option>Line B</option>
              </select>
            </div>
          )}

          {currentStep?.step_name.includes('Filling') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
              <div><label>Work Order</label><input type="text" className="input-field" value={formData.workOrder} onChange={e => setFormData({...formData, workOrder: e.target.value})} /></div>
              <div><label>Gun Number</label><input type="text" className="input-field" value={formData.gunNumber} onChange={e => setFormData({...formData, gunNumber: e.target.value})} /></div>
            </div>
          )}

          {currentStep?.step_name.includes('Packaging') && (
            <div style={{ marginBottom: '15px' }}>
              <label>輸入新成品棧板條碼 (例如: AZAP-001)</label>
              <input type="text" className="input-field" value={formData.newPallet} onChange={e => setFormData({...formData, newPallet: e.target.value.toUpperCase()})} placeholder="AZAP-..." />
            </div>
          )}

          <form onSubmit={handleVerify} style={{ display: 'flex', gap: '10px' }}>
            <input type="text" className="input-field" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} placeholder="Scan any container barcode" autoFocus />
            <button type="submit" className="btn" style={{ background: '#f44336' }}>Verify</button>
          </form>

          <div style={{ marginTop: '15px', maxHeight: '150px', overflowY: 'auto' }}>
            {containers.map(c => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                <span>📦 {c.barcode}</span>
                <span style={{ color: scannedList.includes(c.barcode) ? '#4caf50' : '#999' }}>
                  {scannedList.includes(c.barcode) ? 'Verified ✓' : 'Waiting...'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button className="btn" style={{ width: '100%', background: '#9c27b0', padding: '15px', fontSize: '18px' }} onClick={handleSaveAndNext}>
           💾 Save & Next
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>⚙️ MES 看板</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        {['pending', 'processing', 'completed'].map(status => (
          <div key={status} style={{ background: '#f8f9fa', padding: '15px', borderRadius: '10px', minHeight: '400px' }}>
            <h4 style={{ textTransform: 'capitalize', borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>
              {status} ({batches[status].length})
            </h4>
            {batches[status].map(b => (
              <div key={b.batch_no} className="item-card" onClick={() => status !== 'completed' && startProduction(b)} style={{ cursor: 'pointer', padding: '10px', background: '#fff', marginBottom: '10px', borderRadius: '5px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <strong>{b.batch_no}</strong>
                <div style={{ fontSize: '12px', color: '#666' }}>Material: {b.material_code}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
