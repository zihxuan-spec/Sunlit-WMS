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

  useEffect(() => { fetchBatches(); fetchRules(); }, []);

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
    const { data: stepData } = await supabase.from('material_process_steps').select('*').eq('material_code', batch.material_code).order('step_order', { ascending: true });
    if (!stepData || stepData.length === 0) return alert(`❌ 找不到步驟設定！`);

    const { data: contData } = await supabase.from('production_containers').select('*').eq('batch_no', batch.batch_no);
    
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
    const match = containers.find(c => c.barcode === input);
    if (!match) return alert("❌ 條碼不在此批次中！");
    if (!scannedList.includes(input)) setScannedList([...scannedList, input]);
    setScanInput('');
  };

  const handleSaveAndNext = async () => {
    if (scannedList.length < containers.length) return alert("⚠️ 請先完成校驗！");
    const currentStep = steps[currentStepIdx];

    // 完工邏輯：同步更新 Turnover 區域
    if (currentStep.step_name.includes('Packaging')) {
      const rule = palletRules.find(r => activeBatch.material_code.startsWith(r.prefix));
      if (rule && !formData.newPallet) return alert(`⚠️ 請輸入棧板號碼！`);

      // 1. 更新生產批次
      await supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      
      // 2. 🔥 核心連動：更新週轉倉狀態為 completed
      await supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);

      if (rule) {
        await supabase.from('pallet_container_map').insert(containers.map(c => ({
          parent_pallet: formData.newPallet, child_barcode: c.barcode, action_type: 'PACK', operator: currentUser
        })));
      }

      alert("✅ 生產完工，已同步至週轉倉！");
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '20px' }}>
        {['pending', 'processing', 'completed'].map(status => (
          <div key={status} style={{ background: '#f5f5f5', padding: '15px', borderRadius: '10px', minHeight: '500px' }}>
            <h4 style={{ borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>{status.toUpperCase()} ({batches[status].length})</h4>
            {batches[status].map(b => (
              <div key={b.batch_no} onClick={() => status !== 'completed' && startProduction(b)} style={{ background: '#fff', padding: '15px', marginBottom: '10px', borderRadius: '5px', cursor: 'pointer', borderLeft: '5px solid #9c27b0' }}>
                <strong>{b.batch_no}</strong>
                <div style={{ fontSize: '12px', color: '#1976d2' }}>{b.material_code}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {activeBatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', width: '90%', maxWidth: '650px', borderRadius: '15px', padding: '30px' }}>
            <h2>{steps[currentStepIdx]?.step_name}</h2>
            <div style={{ border: '2px solid #f44336', padding: '20px', borderRadius: '10px' }}>
              <form onSubmit={handleVerify}><input type="text" className="input-field" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} autoFocus placeholder="掃描桶號..." /></form>
              {containers.map(c => <div key={c.id}>{scannedList.includes(c.barcode) ? '✅' : '⚪'} {c.barcode}</div>)}
            </div>
            {steps[currentStepIdx]?.step_name.includes('Packaging') && palletRules.some(r => activeBatch.material_code.startsWith(r.prefix)) && (
              <input type="text" className="input-field" value={formData.newPallet} onChange={e => setFormData({...formData, newPallet: e.target.value.toUpperCase()})} placeholder="輸入棧板號碼..." />
            )}
            <button className="btn" style={{ width: '100%', background: '#ce93d8', marginTop: '20px' }} onClick={handleSaveAndNext}>💾 Save & Next</button>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '10px' }} onClick={() => setActiveBatch(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
