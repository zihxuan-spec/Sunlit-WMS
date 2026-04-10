import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ t, lang, showAlert, currentUser }) {
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

  const handleVerifyScan = async (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    const itemsToClean = inventory.filter(i => selectedIds.includes(i.id));
    const match = itemsToClean.find(i => i.barcode === input);

    if (!match) return alert("❌ 不在清單中");
    if (!scannedItems.includes(input)) setScannedItems([...scannedItems, input]);
    setScanInput('');

    if (scannedItems.length + 1 === itemsToClean.length) {
      const batchNo = batchNoInput.trim();
      await supabase.from('production_batches').insert([{ batch_no: batchNo, material_code: itemsToClean[0].material_code, status: 'pending', operator: currentUser }]);
      await supabase.from('production_containers').insert(itemsToClean.map(i => ({ batch_no: batchNo, barcode: i.barcode, current_step: 1 })));
      await supabase.from('turnover_inventory').update({ status: 'pending', batch_no: batchNo, updated_at: new Date().toISOString() }).in('id', selectedIds);
      
      alert("✅ 已轉入待生產");
      setCleanModal(false); setSelectedIds([]); setScannedItems([]); fetchInventory();
    }
  };

  const moveToOutbound = async () => {
    if (!selectedBatch) return;
    await supabase.from('turnover_inventory').update({ location: 'Outbound', updated_at: new Date().toISOString() }).eq('batch_no', selectedBatch);
    alert("🚚 已移至出貨區");
    setSelectedBatch(''); fetchInventory();
  };

  // 數據分流
  const rawItems = inventory.filter(i => (!i.batch_no) && (i.status === 'raw' || !i.status));
  const pendingItems = inventory.filter(i => i.batch_no && i.status === 'pending');
  const completedBatches = inventory.filter(i => i.status === 'completed').reduce((acc, curr) => {
    if (!acc[curr.batch_no]) acc[curr.batch_no] = { batch_no: curr.batch_no, code: curr.material_code, count: 0 };
    acc[curr.batch_no].count++;
    return acc;
  }, {});

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: '#9c27b0' }}>🏭 週轉倉看板 (Turnover Area)</h2>
        <button className="btn btn-secondary" onClick={fetchInventory}>🔄 刷新畫面</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '20px' }}>
        {/* 1. 待清潔 */}
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '10px', minHeight: '500px' }}>
          <h4>🧹 待清潔 ({rawItems.length})</h4>
          <button className="btn" style={{ fontSize: '12px' }} onClick={() => selectedIds.length > 0 && setBatchModal(true)}>開始清潔</button>
          {rawItems.map(item => (
            <div key={item.id} onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])} style={{ background: selectedIds.includes(item.id) ? '#e1f5fe' : '#fff', padding: '10px', marginBottom: '8px', cursor: 'pointer', border: selectedIds.includes(item.id) ? '2px solid #03a9f4' : '1px solid #eee' }}>
              <strong>{item.barcode}</strong>
            </div>
          ))}
        </div>

        {/* 2. 待生產 */}
        <div style={{ background: '#fff3e0', padding: '15px', borderRadius: '10px' }}>
          <h4>⚙️ 待生產</h4>
          {pendingItems.map(item => (
            <div key={item.id} style={{ background: '#fff', padding: '10px', marginBottom: '8px', borderLeft: '5px solid #ff9800' }}>
              <strong>{item.barcode}</strong><br/><small>Batch: {item.batch_no}</small>
            </div>
          ))}
        </div>

        {/* 3. 已完工 */}
        <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '10px' }}>
          <h4>✅ 已完工</h4>
          <button className="btn" style={{ background: '#2e7d32' }} onClick={moveToOutbound}>移至出貨</button>
          {Object.values(completedBatches).map(b => (
            <div key={b.batch_no} onClick={() => setSelectedBatch(b.batch_no)} style={{ background: selectedBatch === b.batch_no ? '#c8e6c9' : '#fff', padding: '10px', marginBottom: '8px', cursor: 'pointer', border: selectedBatch === b.batch_no ? '2px solid #2e7d32' : '1px solid #eee' }}>
              <strong>Batch: {b.batch_no}</strong> ({b.count} 桶)
            </div>
          ))}
        </div>
      </div>

      {batchModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '10px' }}>
            <h3>輸入 Batch No</h3>
            <input type="text" className="input-field" value={batchNoInput} onChange={e => setBatchNoInput(e.target.value.toUpperCase())} autoFocus />
            <button className="btn" style={{ width: '100%', marginTop: '10px' }} onClick={() => { setBatchModal(false); setCleanModal(true); }}>下一步</button>
          </div>
        </div>
      )}

      {cleanModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '10px' }}>
            <h3>校驗掃描 ({scannedItems.length}/{selectedIds.length})</h3>
            <form onSubmit={handleVerifyScan}><input type="text" className="input-field" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} autoFocus /></form>
          </div>
        </div>
      )}
    </div>
  );
}
