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
  const [palletRules, setPalletRules] = useState([]); 
  
  const [formData, setFormData] = useState({ cleaningLine: 'Line A', workOrder: '', gunNumber: '', newPallet: '' });
  const [weightData, setWeightData] = useState({});

  useEffect(() => { 
    fetchBatches(); 
    fetchRules();
  }, []);

  const fetchRules = async () => {
    const { data } = await supabase.from('pallet_barcode_rules').select('*');
    if (data) setPalletRules(data);
  };

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
    const { data: stepData } = await supabase.from('material_process_steps')
      .select('*')
      .eq('material_code', batch.material_code)
      .order('step_order', { ascending: true });
      
    if (!stepData || stepData.length === 0) return alert(`❌ 找不到 [${batch.material_code}] 的步驟設定！`);

    const { data: contData } = await supabase.from('production_containers')
      .select('*')
      .eq('batch_no', batch.batch_no);
    
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

    // Filling 站點：強制先填單號/槍號
    if (steps[currentStepIdx]?.step_name.includes('Filling')) {
      if (!formData.workOrder || !formData.gunNumber) return alert("⚠️ Please enter work order and gun number first.");
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

    // Packaging 核心邏輯：區分單一 vs 組合包材
    if (currentStep.step_name.includes('Packaging')) {
      const rule = palletRules.find(r => activeBatch.material_code.startsWith(r.prefix));

      if (rule) {
        // 【組合包材，如 ADT, AZAP】
        if (!formData.newPallet) return alert(`⚠️ 此產品需組裝棧板，請輸入 ${rule.prefix} 條碼！`);
        
        await supabase.from('pallet_container_map').insert(containers.map(c => ({
          parent_pallet: formData.newPallet,
          child_barcode: c.barcode,
          action_type: 'PACK',
          operator: currentUser
        })));
      } 

      // 通用完工邏輯
      await supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      await supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      
      alert("✅ 生產程序已完成！");
      setActiveBatch(null);
      fetchBatches();
      return;
    }

    setCurrentStepIdx(prev => prev + 1);
    setScannedList([]);
  };

  return (
    <div className="card" style={{ padding: '20px' }}>
      <h2 style={{ color: '#9c27b0', borderBottom: '2px solid #9c27b0', paddingBottom: '10px' }}>⚙️ MES 看板</h2>
      
      {/* 看板列表區域 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '20px' }}>
        {['pending', 'processing', 'completed'].map(status => (
          <div key={status} style={{ background: '#f5f5f5', padding: '15px', borderRadius: '10px', minHeight: '500px' }}>
            <h4 style={{ textTransform: 'uppercase', color: '#666', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '15px' }}>
              {status} ({batches[status].length})
            </h4>
            {batches[status].map(b => (
              <div key={b.batch_no} onClick={() => status !== 'completed' && startProduction(b)} style={{ 
                background: '#fff', padding: '15px', marginBottom: '10px', borderRadius: '5px', 
                cursor: status !== 'completed' ? 'pointer' : 'default',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)', borderLeft: '5px solid #9c27b0' 
              }}>
                <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{b.batch_no}</div>
                <div style={{ fontSize: '12px', color: '#1976d2', marginTop: '5px' }}>Material: {b.material_code}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 生產精靈彈窗 */}
      {activeBatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', width: '90%', maxWidth: '750px', borderRadius: '15px', padding: '30px', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ margin: 0, color: '#1976d2' }}>{steps[currentStepIdx]?.step_name} [{activeBatch.batch_no}]</h2>
              <button onClick={() => setActiveBatch(null)} style={{ background: '#666', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>Close</button>
            </div>

            {/* Stepper 進度導覽 */}
            <div style={{ display: 'flex', gap: '5px', marginBottom: '25px' }}>
              {steps.map((s, i) => (
                <div key={i} style={{ 
                  flex: 1, height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '20px', fontSize: '11px',
                  background: i === currentStepIdx ? '#e3f2fd' : (i < currentStepIdx ? '#e8f5e9' : '#f5f5f5'),
                  color: i === currentStepIdx ? '#1976d2' : (i < currentStepIdx ? '#2e7d32' : '#999'),
                  border: i === currentStepIdx ? '2px solid #1976d2' : '1px solid #ddd'
                }}>
                  Step {i+1}
                </div>
              ))}
            </div>

            {/* Filling 專用欄位：Work Order & Gun Number */}
            {steps[currentStepIdx]?.step_name.includes('Filling') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Work Order</label>
                  <input type="text" className="input-field" value={formData.workOrder} onChange={e => setFormData({...formData, workOrder: e.target.value})} />
                </div>
                <div>
                  <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Gun Number</label>
                  <input type="text" className="input-field" value={formData.gunNumber} onChange={e => setFormData({...formData, gunNumber: e.target.value})} />
                </div>
              </div>
            )}

            {/* 校驗區域 */}
            <div style={{ border: '2px solid #f44336', borderRadius: '10px', padding: '20px', marginBottom: '20px', background: '#fff' }}>
              <h4 style={{ color: '#f44336', marginTop: 0 }}>Scan Containers to Verify ({scannedList.length}/{containers.length})</h4>
              
              {steps[currentStepIdx]?.step_name.includes('Filling') && (!formData.workOrder || !formData.gunNumber) && (
                <p style={{ color: 'red', fontWeight: 'bold', fontSize: '14px', marginBottom: '10px' }}>⚠️ Please enter work order and gun number before scanning.</p>
              )}

              <form onSubmit={handleVerify} style={{ display: 'flex', gap: '10px' }}>
                <input type="text" className="input-field" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} placeholder="Scan any container barcode" autoFocus />
                <button type="submit" className="btn" style={{ background: '#f44336', color: '#fff', width: '100px', cursor: 'pointer' }}>Verify</button>
              </form>

              <div style={{ marginTop: '15px', maxHeight: '250px', overflowY: 'auto' }}>
                {containers.map(c => (
                  <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                      <span>📦 {c.barcode}</span>
                      <span style={{ color: scannedList.includes(c.barcode) ? '#4caf50' : '#999', fontWeight: 'bold' }}>
                        {scannedList.includes(c.barcode) ? 'Verified ✓' : 'Waiting...'}
                      </span>
                    </div>
                    {/* Filling 重量輸入細節 */}
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

            {/* Packaging 分流：組合包材顯示輸入框 */}
            {steps[currentStepIdx]?.step_name.includes('Packaging') && palletRules.some(r => activeBatch.material_code.startsWith(r.prefix)) && (
              <div style={{ marginBottom: '20px', padding: '15px', background: '#fce4ec', borderRadius: '8px', border: '1px solid #e91e63' }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>📦 輸入新成品棧板條碼 (組合包材專用)</label>
                <input type="text" className="input-field" value={formData.newPallet} onChange={e => setFormData({...formData, newPallet: e.target.value.toUpperCase()})} placeholder="例如: AZAP-001" />
              </div>
            )}

            {/* Packaging 分流：單一包材顯示提示 */}
            {steps[currentStepIdx]?.step_name.includes('Packaging') && !palletRules.some(r => activeBatch.material_code.startsWith(r.prefix)) && (
              <div style={{ marginBottom: '20px', padding: '15px', background: '#e8f5e9', borderRadius: '8px', color: '#2e7d32' }}>
                ✨ 偵測為單一包材項目 (OWT)，無需組裝棧板，確認校驗完成後即可存檔。
              </div>
            )}

            <button className="btn" style={{ width: '100%', background: '#ce93d8', color: '#fff', padding: '18px', fontSize: '18px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer' }} onClick={handleSaveAndNext}>
               💾 Save & Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
