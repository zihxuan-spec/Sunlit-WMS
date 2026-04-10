import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function MES({ t, lang, showAlert, currentUser }) {
  // 初始化狀態，確保畫面不會空白
  const [batches, setBatches] = useState({ pending: [], processing: [], completed: [] });
  const [activeBatch, setActiveBatch] = useState(null); 
  const [steps, setSteps] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [containers, setContainers] = useState([]);
  const [scannedList, setScannedList] = useState([]); 
  const [scanInput, setScanInput] = useState('');
  
  const [formData, setFormData] = useState({ cleaningLine: 'Line A', workOrder: '', gunNumber: '', newPallet: '' });
  const [weightData, setWeightData] = useState({});

  useEffect(() => { 
    fetchBatches(); 
  }, []);

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('production_batches')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setBatches({
          pending: data.filter(b => b.status === 'pending'),
          processing: data.filter(b => b.status === 'processing'),
          completed: data.filter(b => b.status === 'completed'),
        });
      }
    } catch (err) {
      console.error("Fetch Batches Error:", err);
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

    if (batch.status === 'pending') {
      await supabase.from('production_batches').update({ status: 'processing' }).eq('batch_no', batch.batch_no);
      fetchBatches();
    }
  };

  // ---------------------------------------------------------
  // 畫面渲染區：確保看板區塊一定會出現
  // ---------------------------------------------------------
  return (
    <div className="card" style={{ padding: '20px' }}>
      <h2 style={{ color: '#9c27b0', borderBottom: '2px solid #9c27b0', paddingBottom: '10px', marginBottom: '20px' }}>
        ⚙️ MES 看板
      </h2>

      {/* 看板主體：分成三欄 */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr 1fr', 
        gap: '20px', 
        minHeight: '500px' 
      }}>
        
        {/* PENDING 區 */}
        <div style={{ background: '#f8f9fa', borderRadius: '10px', padding: '15px', border: '1px solid #ddd' }}>
          <h4 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', color: '#555' }}>
            PENDING ({batches.pending.length})
          </h4>
          {batches.pending.map(b => (
            <div key={b.batch_no} onClick={() => startProduction(b)} style={{ 
              background: '#fff', padding: '15px', marginBottom: '10px', borderRadius: '5px', 
              cursor: 'pointer', borderLeft: '5px solid #9c27b0', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' 
            }}>
              <strong style={{ fontSize: '16px' }}>{b.batch_no}</strong>
              <div style={{ fontSize: '12px', color: '#1976d2', marginTop: '5px' }}>Material: {b.material_code}</div>
            </div>
          ))}
        </div>

        {/* PROCESSING 區 */}
        <div style={{ background: '#f8f9fa', borderRadius: '10px', padding: '15px', border: '1px solid #ddd' }}>
          <h4 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', color: '#555' }}>
            PROCESSING ({batches.processing.length})
          </h4>
          {batches.processing.map(b => (
            <div key={b.batch_no} onClick={() => startProduction(b)} style={{ 
              background: '#fff', padding: '15px', marginBottom: '10px', borderRadius: '5px', 
              cursor: 'pointer', borderLeft: '5px solid #ff9800', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' 
            }}>
              <strong style={{ fontSize: '16px' }}>{b.batch_no}</strong>
              <div style={{ fontSize: '12px', color: '#1976d2', marginTop: '5px' }}>Material: {b.material_code}</div>
            </div>
          ))}
        </div>

        {/* COMPLETED 區 */}
        <div style={{ background: '#f8f9fa', borderRadius: '10px', padding: '15px', border: '1px solid #ddd' }}>
          <h4 style={{ borderBottom: '2px solid #ccc', paddingBottom: '10px', color: '#555' }}>
            COMPLETED ({batches.completed.length})
          </h4>
          {batches.completed.map(b => (
            <div key={b.batch_no} style={{ 
              background: '#fff', padding: '15px', marginBottom: '10px', borderRadius: '5px', 
              borderLeft: '5px solid #4caf50', opacity: 0.8 
            }}>
              <strong style={{ fontSize: '16px' }}>{b.batch_no}</strong>
              <div style={{ fontSize: '12px', color: '#1976d2', marginTop: '5px' }}>Material: {b.material_code}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 生產精靈彈窗 (原本的 Modal 邏輯，放在此處之後...) */}
      {activeBatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000 }}>
          {/* ...中間的生產內容代碼... */}
        </div>
      )}
    </div>
  );
}
