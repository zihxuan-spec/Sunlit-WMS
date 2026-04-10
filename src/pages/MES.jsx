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
  const [weightData, setWeightData] = useState({}); // 儲存每一桶的重量

  useEffect(() => { 
    fetchBatches(); 
  }, []);

  const fetchBatches = async () => {
    const { data, error } = await supabase.from('production_batches').select('*').order('created_at', { ascending: false });
    if (data) {
      setBatches({
        pending: data.filter(b => b.status === 'pending'),
        processing: data.filter(b => b.status === 'processing'),
        completed: data.filter(b => b.status === 'completed'),
      });
    }
  };

  // 啟動生產：解決 eq is not a function 並檢查步驟
  const startProduction = async (batch) => {
    // 修正後的查詢語法
    const { data: stepData } = await supabase.from('material_process_steps').select('*').eq('material_code', batch.material_code).order('step_order', { ascending: true });
    
    if (!stepData || stepData.length === 0) {
      return alert(`❌ 找不到物料 [${batch.material_code}] 的步驟設定，請檢查資料庫！`);
    }

    const { data: contData } = await supabase.from('production_containers').select('*').eq('batch_no', batch.batch_no);
    
    setSteps(stepData);
    setContainers(contData || []);
    setActiveBatch(batch);
    setCurrentStepIdx(0);
    setScannedList([]);
    setWeightData({});

    if (batch.status === 'pending') {
      await supabase.from('production_batches').update({ status: 'processing' }).eq('batch_no', batch.batch_no);
      fetchBatches();
    }
  };

  // 掃描驗證邏輯
  const handleVerify = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();

    // Filling 站點：強制先填單號/槍號 [仿照截圖邏輯]
    if (steps[currentStepIdx]?.step_name.includes('Filling')) {
      if (!formData.workOrder || !formData.gunNumber) {
        return alert("⚠️ Please enter the work order and gun number before scanning.");
      }
    }

    const match = containers.find(c => c.barcode === input);
    if (!match) return alert("❌ 此桶號不在批次清單中！");
    if (scannedList.includes(input)) return setScanInput('');
    
    setScannedList([...scannedList, input]);
    setScanInput('');
  };

  // 存檔並進入下一步
  const handleSaveAndNext = async () => {
    if (scannedList.length < containers.length) return alert("⚠️ 請先完成所有桶號校驗！");
    
    const currentStep = steps[currentStepIdx];

    // Filling 站點：存入重量數據
    if (currentStep.step_name.includes('Filling')) {
      for (const barcode of scannedList) {
        const w = weightData[barcode] || {};
        await supabase.from('production_containers').update({
          work_order: formData.workOrder,
          gun_number: formData.gunNumber,
          weight_empty: w.empty,
          weight_setting: w.setting,
          weight_filling: w.filling
        }).eq('batch_no', activeBatch.batch_no).eq('barcode', barcode);
      }
    }

    // Packaging 站點：封板並同步更新 Turnover 狀態
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
      
      alert("✅ 批次生產完成！");
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
      
      {/* 狀態看板佈局 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '20px' }}>
        {['pending', 'processing', 'completed'].map(status => (
          <div key={status} style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', minHeight: '400px' }}>
            <h4 style={{ color: '#666', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>{status.toUpperCase()}</h4>
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

      {/* 生產精靈彈窗：解決背景與顯示問題 */}
      {activeBatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', width: '90%', maxWidth: '700px', borderRadius: '15px', padding: '30px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ margin: 0, color: '#1976d2' }}>{steps[currentStepIdx]?.step_name} [{activeBatch.batch_no}]</h2>
              <button onClick={() => setActiveBatch(null)} style={{ background: '#666', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '6px' }}>Close</button>
            </div>

            {/* Stepper 進度導覽 */}
            <div style={{ display: 'flex', gap: '5px', marginBottom: '25px' }}>
              {steps.map((s, i) => (
                <div key={i} style={{ flex: 1, height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '20px', fontSize: '11px', background: i === currentStepIdx ? '#e3f2fd' : (i < currentStepIdx ? '#e8f5e9' : '#f5f5f5'), color: i === currentStepIdx ? '#1976d2' : (i < currentStepIdx ? '#2e7d32' : '#999'), border: i === currentStepIdx ? '2px solid #1976d2' : '1px solid #ddd' }}>Step {i+1}</div>
              ))}
            </div>

            {/* Filling 專用欄位 */}
            {steps[currentStepIdx]?.step_name.includes('Filling') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div><label>Work Order</label><input type="text" className="input-field" value={formData.workOrder} onChange={e => setFormData({...formData, workOrder: e.target.value})} /></div>
                <div><label>Gun Number</label><input type="text" className="input-field" value={formData.gunNumber} onChange={e => setFormData({...formData, gunNumber: e.target.value})} /></div>
              </div>
            )}

            {/* 校驗區域：仿截圖紅色外框 */}
            <div style={{ border: '2px solid #f44336', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
              <h4 style={{ color: '#f44336', marginTop: 0 }}>Scan Containers to Verify ({scannedList.length}/{containers.length})</h4>
              {steps[currentStepIdx]?.step_name.includes('Filling') && (!formData.workOrder || !formData.gunNumber) && (
                <p style={{ color: 'red', fontWeight: 'bold', fontSize: '13px' }}>⚠️ Please enter work order and gun number before scanning.</p>
              )}
              <form onSubmit={handleVerify} style={{ display: 'flex', gap: '10px' }}>
                <input type="text" className="input-field" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} placeholder="Scan any container barcode" autoFocus />
                <button type="submit" className="btn" style={{ background: '#f44336', width: '80px' }}>Verify</button>
              </form>
              <div style={{ marginTop: '15px', maxHeight: '150px', overflowY: 'auto' }}>
                {containers.map(c => (
                  <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>📦 {c.barcode}</span>
                      <span style={{ color: scannedList.includes(c.barcode) ? '#4caf50' : '#999', fontWeight: 'bold' }}>{scannedList.includes(c.barcode) ? 'Verified ✓' : 'Waiting...'}</span>
                    </div>
                    {scannedList.includes(c.barcode) && steps[currentStepIdx]?.step_name.includes('Filling') && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '10px' }}>
                        <input type="number" placeholder="空重" className="input-field" onChange={e => setWeightData({...weightData, [c.barcode]: {...weightData[c.barcode], empty: e.target.value}})} />
                        <input type="number" placeholder="設定重" className="input-field" onChange={e => setWeightData({...weightData, [c.barcode]: {...weightData[c.barcode], setting: e.target.value}})} />
                        <input type="number" placeholder="充填重" className="input-field" onChange={e => setWeightData({...weightData, [c.barcode]: {...weightData[c.barcode], filling: e.target.value}})} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Packaging 專屬欄位 */}
            {steps[currentStepIdx]?.step_name.includes('Packaging') && (
              <div style={{ marginBottom: '20px', padding: '15px', background: '#fce4ec', borderRadius: '8px' }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>輸入新成品棧板條碼 (AZAP-XXX)</label>
                <input type="text" className="input-field" value={formData.newPallet} onChange={e => setFormData({...formData, newPallet: e.target.value.toUpperCase()})} />
              </div>
            )}

            <button className="btn" style={{ width: '100%', background: '#ce93d8', padding: '15px', fontSize: '18px', borderRadius: '8px' }} onClick={handleSaveAndNext}>
               💾 Save & Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
