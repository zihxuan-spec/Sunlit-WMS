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
  
  // 表單狀態管理
  const [formData, setFormData] = useState({ 
    cleaningLine: 'Line A', 
    workOrder: '', 
    gunNumber: '', 
    newPallet: '' 
  });

  // 重量輸入暫存 (針對 Filling 站點)
  const [weightData, setWeightData] = useState({}); // { barcode: { empty, setting, filling } }

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

  const startProduction = async (batch) => {
    const { data: stepData } = await supabase.from('material_process_steps').select('*').eq('material_code', batch.material_code).order('step_order', { ascending: true });
    if (!stepData || stepData.length === 0) return alert(`❌ 找不到 [${batch.material_code}] 的步驟設定！`);

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

  const handleVerify = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();

    // Filling 站點專用防錯：必須先填好單號與槍號
    if (steps[currentStepIdx]?.step_name.includes('Filling')) {
      if (!formData.workOrder || !formData.gunNumber) {
        return alert("⚠️ Please enter the work order and gun number before scanning containers.");
      }
    }

    const match = containers.find(c => c.barcode === input);
    if (!match) return alert("❌ 此桶號不在批次清單中！");
    if (scannedList.includes(input)) return setScanInput('');
    
    setScannedList([...scannedList, input]);
    setScanInput('');
  };

  const handleSaveAndNext = async () => {
    if (scannedList.length < containers.length) return alert("⚠️ 請先完成所有桶號校驗！");
    
    const currentStep = steps[currentStepIdx];

    // 如果是 Filling，儲存重量數據
    if (currentStep.step_name.includes('Filling')) {
      for (const barcode of scannedList) {
        const data = weightData[barcode] || {};
        await supabase.from('production_containers').update({
          work_order: formData.workOrder,
          gun_number: formData.gunNumber,
          weight_empty: data.empty,
          weight_setting: data.setting,
          weight_filling: data.filling
        }).eq('batch_no', activeBatch.batch_no).eq('barcode', barcode);
      }
    }

    // Packaging 封板邏輯
    if (currentStep.step_name.includes('Packaging')) {
      if (!formData.newPallet) return alert("⚠️ 請輸入成品棧板號碼！");
      await supabase.from('pallet_container_map').insert(containers.map(c => ({ parent_pallet: formData.newPallet, child_barcode: c.barcode, action_type: 'PACK', operator: currentUser })));
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

  if (activeBatch) {
    const currentStep = steps[currentStepIdx];
    const isFilling = currentStep?.step_name.includes('Filling');

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000 }}>
        <div style={{ background: '#fff', width: '90%', maxWidth: '700px', borderRadius: '15px', padding: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h2 style={{ color: '#1976d2', margin: 0 }}>{currentStep?.step_name} [{activeBatch.batch_no}]</h2>
            <button onClick={() => setActiveBatch(null)} className="btn-secondary">Close</button>
          </div>

          {/* Stepper 進度導覽 */}
          <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
            {steps.map((s, i) => (
              <div key={i} style={{ flex: 1, height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '15px', fontSize: '11px', background: i === currentStepIdx ? '#e3f2fd' : (i < currentStepIdx ? '#e8f5e9' : '#f5f5f5'), color: i === currentStepIdx ? '#1976d2' : (i < currentStepIdx ? '#2e7d32' : '#999'), border: i === currentStepIdx ? '2px solid #1976d2' : '1px solid #ddd' }}>{s.step_name}</div>
            ))}
          </div>

          {/* Filling 專屬欄位：Work Order & Gun Number [仿截圖] */}
          {isFilling && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontWeight: 'bold' }}>Work Order</label>
                <input type="text" className="input-field" value={formData.workOrder} onChange={e => setFormData({...formData, workOrder: e.target.value})} />
              </div>
              <div>
                <label style={{ fontWeight: 'bold' }}>Gun Number</label>
                <input type="text" className="input-field" value={formData.gunNumber} onChange={e => setFormData({...formData, gunNumber: e.target.value})} />
              </div>
            </div>
          )}

          {/* 校驗區域 */}
          <div style={{ border: '2px solid #2196f3', borderRadius: '10px', padding: '20px', marginBottom: '20px', background: '#fff' }}>
            <h4 style={{ color: '#2196f3', marginTop: 0 }}>💧 Fill Weights One by One</h4>
            <div style={{ background: '#e3f2fd', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
              <span style={{ fontWeight: 'bold' }}>Scan Container Before Filling</span><br/>
              <small>Completed {scannedList.length} / {containers.length}</small>
            </div>

            {isFilling && (!formData.workOrder || !formData.gunNumber) && (
               <p style={{ color: 'red', fontSize: '14px', fontWeight: 'bold' }}>⚠️ Please enter the work order and gun number before scanning containers.</p>
            )}

            <form onSubmit={handleVerify} style={{ display: 'flex', gap: '10px' }}>
              <input type="text" className="input-field" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} placeholder="Scan any container barcode" autoFocus />
              <button type="submit" className="btn" style={{ background: '#2196f3', width: '100px' }}>Select</button>
            </form>

            <div style={{ marginTop: '15px', maxHeight: '200px', overflowY: 'auto' }}>
              {containers.map(c => (
                <div key={c.id} style={{ borderBottom: '1px solid #eee', padding: '10px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span>📦 {c.barcode}</span>
                    <span style={{ color: scannedList.includes(c.barcode) ? '#4caf50' : '#999' }}>{scannedList.includes(c.barcode) ? 'Verified' : 'Waiting...'}</span>
                  </div>
                  {/* 如果已掃描，顯示重量輸入框 */}
                  {scannedList.includes(c.barcode) && isFilling && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      <input type="number" placeholder="空重" className="input-field" onChange={e => setWeightData({...weightData, [c.barcode]: {...weightData[c.barcode], empty: e.target.value}})} />
                      <input type="number" placeholder="設定重" className="input-field" onChange={e => setWeightData({...weightData, [c.barcode]: {...weightData[c.barcode], setting: e.target.value}})} />
                      <input type="number" placeholder="充填重" className="input-field" onChange={e => setWeightData({...weightData, [c.barcode]: {...weightData[c.barcode], filling: e.target.value}})} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button className="btn" style={{ width: '100%', background: '#ce93d8', color: '#fff', padding: '15px', fontSize: '18px', fontWeight: 'bold', borderRadius: '8px' }} onClick={handleSaveAndNext}>
             💾 Save & Next
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
       {/* 保持原本的 MES 看板渲染邏輯 */}
       <h2>⚙️ MES 看板</h2>
       {/* ... */}
    </div>
  );
}
