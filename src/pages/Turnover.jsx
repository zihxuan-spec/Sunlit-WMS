import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ currentUser, fetchInventory: refreshGlobal }) {
  const [inventory, setInventory] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]); 
  const [selectedBatch, setSelectedBatch] = useState(''); 
  
  const [batchModal, setBatchModal] = useState(false);
  const [cleanModal, setCleanModal] = useState(false);
  const [batchNoInput, setBatchNoInput] = useState('');
  const [scannedItems, setScannedItems] = useState([]);
  const [scanInput, setScanInput] = useState('');

  useEffect(() => { fetchInventory(); }, []);

  const fetchInventory = async () => {
    const { data } = await supabase.from('turnover_inventory').select('*').eq('location', 'Turnover').order('updated_at', { ascending: false });
    if (data) setInventory(data);
  };

  const handleStartCleaning = () => {
    if (selectedIds.length === 0) return alert("請先勾選包材！");
    setBatchNoInput('');
    setBatchModal(true);
  };

  const handleVerifyScan = async (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    const items = inventory.filter(i => selectedIds.includes(i.id));
    const match = items.find(i => i.barcode === input);

    if (!match) return alert("❌ 條碼不在清單中");
    if (!scannedItems.includes(input)) setScannedItems([...scannedItems, input]);
    setScanInput('');

    if (scannedItems.length + 1 === items.length) {
      const bNo = batchNoInput.trim();
      // 連動：建立生產任務
      await supabase.from('production_batches').insert([{ batch_no: bNo, material_code: items[0].material_code, status: 'pending', operator: currentUser }]);
      await supabase.from('production_containers').insert(items.map(i => ({ batch_no: bNo, barcode: i.barcode, current_step: 1 })));
      // 更新週轉倉狀態
      await supabase.from('turnover_inventory').update({ status: 'pending', batch_no: bNo, updated_at: new Date().toISOString() }).in('id', selectedIds);
      
      alert("✅ 清潔校驗完成，批次已進入待生產狀態");
      setCleanModal(false); setSelectedIds([]); setScannedItems([]); fetchInventory();
    }
  };

  const moveToOutbound = async () => {
    if (!selectedBatch) return alert("請先選擇 Batch");
    await supabase.from('turnover_inventory').update({ location: 'Outbound', updated_at: new Date().toISOString() }).eq('batch_no', selectedBatch);
    alert(`🚚 批次 ${selectedBatch} 已移至出貨區`);
    setSelectedBatch(''); fetchInventory();
  };

  const rawItems = inventory.filter(i => !i.batch_no && (i.status === 'raw' || !i.status));
  const pendingItems = inventory.filter(i => i.status === 'pending');
  const completedBatches = inventory.filter(i => i.status === 'completed').reduce((acc, curr) => {
    if (!acc[curr.batch_no]) acc[curr.batch_no] = { bNo: curr.batch_no, code: curr.material_code, count: 0 };
    acc[curr.batch_no].count++;
    return acc;
  }, {});

  return (
    <div className="card" style={{ padding: '20px' }}>
      <h2 style={{ color: '#9c27b0', borderBottom: '2px solid #9c27b0', paddingBottom: '10px' }}>🏭 週轉倉看板 (Turnover Area)</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '20px' }}>
        
        {/* 1. 待清潔 */}
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '10px', minHeight: '500px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h4 style={{ margin: 0 }}>🧹 待清潔 ({rawItems.length})</h4>
            <button className="btn" style={{ fontSize: '12px' }} onClick={handleStartCleaning}>開始清潔</button>
          </div>
          {rawItems.map(item => (
            <div key={item.id} onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                 style={{ background: selectedIds.includes(item.id) ? '#e1f5fe' : '#fff', padding: '10px', marginBottom: '8px', cursor: 'pointer', border: selectedIds.includes(item.id) ? '2px solid #03a9f4' : '1px solid #eee' }}>
              <strong>{item.barcode}</strong>
            </div>
          ))}
        </div>

        {/* 2. 待生產 */}
        <div style={{ background: '#fff3e0', padding: '15px', borderRadius: '10px' }}>
          <h4>⚙️ 待生產 (Pending)</h4>
          {pendingItems.map(item => (
            <div key={item.id} style={{ background: '#fff', padding: '10px', marginBottom: '8px', borderLeft: '5px solid #ff9800' }}>
              <strong>{item.barcode}</strong><br/><small>Batch: {item.batch_no}</small>
            </div>
          ))}
        </div>

        {/* 3. 已完工 (Batch 化顯示) */}
        <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h4 style={{ margin: 0, color: '#2e7d32' }}>✅ 已完工</h4>
            <button className="btn" style={{ background: '#2e7d32' }} onClick={moveToOutbound}>移至出貨</button>
          </div>
          {Object.values(completedBatches).map(b => (
            <div key={b.bNo} onClick={() => setSelectedBatch(b.bNo)}
                 style={{ background: selectedBatch === b.bNo ? '#c8e6c9' : '#fff', padding: '10px', marginBottom: '8px', cursor: 'pointer', border: selectedBatch === b.bNo ? '2px solid #2e7d32' : '1px solid #eee' }}>
              <strong>🔢 Batch: {b.bNo}</strong> ({b.count} 桶)
            </div>
          ))}
        </div>
      </div>

      {batchModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '10px', width: '350px' }}>
            <h3>輸入 Batch No</h3>
            <input type="text" className="input-field" value={batchNoInput} onChange={e => setBatchNoInput(e.target.value.toUpperCase())} autoFocus />
            <button className="btn" style={{ width: '100%', marginTop: '10px' }} onClick={() => { setBatchModal(false); setCleanModal(true); }}>下一步</button>
          </div>
        </div>
      )}

      {cleanModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '10px', width: '400px' }}>
            <h3>校驗掃描 ({scannedItems.length}/{selectedIds.length})</h3>
            <form onSubmit={handleVerifyScan}><input type="text" className="input-field" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} autoFocus placeholder="請掃描桶號..." /></form>
            <div style={{ marginTop: '10px' }}>{inventory.filter(i => selectedIds.includes(i.id)).map(i => <span key={i.id} style={{ color: scannedItems.includes(i.barcode) ? '#4caf50' : '#ccc', marginRight: '10px' }}>● {i.barcode}</span>)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
