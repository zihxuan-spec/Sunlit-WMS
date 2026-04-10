import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ t, lang, showAlert, currentUser }) {
  const [inventory, setInventory] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]); // 用於待清潔區的多選
  const [selectedBatch, setSelectedBatch] = useState(''); // 用於完工區的批次選取
  
  // Modal 狀態
  const [batchModal, setBatchModal] = useState(false);
  const [cleanModal, setCleanModal] = useState(false);
  const [batchNoInput, setBatchNoInput] = useState('');
  const [scannedItems, setScannedItems] = useState([]);
  const [scanInput, setScanInput] = useState('');

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    const { data } = await supabase.from('turnover_inventory')
      .select('*')
      .eq('location', 'Turnover')
      .order('updated_at', { ascending: false });
    if (data) setInventory(data);
  };

  // --- 邏輯 A：從【待清潔】到【待生產】 ---
  const handleStartCleaning = () => {
    if (selectedIds.length === 0) return alert("請先選擇要清潔的包材！");
    setBatchNoInput('');
    setBatchModal(true);
  };

  const handleVerifyScan = async (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    const itemsToClean = inventory.filter(i => selectedIds.includes(i.id));
    const match = itemsToClean.find(i => i.barcode === input);

    if (!match) return alert("條碼不在此次清潔清單中！");
    if (!scannedItems.includes(input)) setScannedItems([...scannedItems, input]);
    setScanInput('');

    if (scannedItems.length + 1 === itemsToClean.length) {
      // 執行轉換：建立 MES 批次並更新狀態
      const batchNo = batchNoInput.trim();
      await supabase.from('production_batches').insert([{ batch_no: batchNo, material_code: itemsToClean[0].material_code, status: 'pending', operator: currentUser }]);
      await supabase.from('production_containers').insert(itemsToClean.map(i => ({ batch_no: batchNo, barcode: i.barcode, current_step: 1 })));
      await supabase.from('turnover_inventory').update({ status: 'pending', batch_no: batchNo, updated_at: new Date().toISOString() }).in('id', selectedIds);
      
      alert(`批次 ${batchNo} 清潔完成！`);
      setCleanModal(false); setSelectedIds([]); setScannedItems([]); fetchInventory();
    }
  };

  // --- 邏輯 B：從【已完工】到【Outbound】 ---
  const moveToOutbound = async () => {
    if (!selectedBatch) return alert("請先選擇要轉移的 Batch！");
    const { error } = await supabase.from('turnover_inventory')
      .update({ location: 'Outbound', updated_at: new Date().toISOString() })
      .eq('batch_no', selectedBatch);

    if (!error) {
      alert(`批次 ${selectedBatch} 已移至出貨區！`);
      setSelectedBatch(''); fetchInventory();
    }
  };

  // 數據分組
  const rawItems = inventory.filter(i => i.status === 'raw' || !i.status);
  const pendingItems = inventory.filter(i => i.status === 'pending');
  const completedBatches = inventory.filter(i => i.status === 'completed').reduce((acc, curr) => {
    if (!acc[curr.batch_no]) acc[curr.batch_no] = { batch_no: curr.batch_no, code: curr.material_code, count: 0 };
    acc[curr.batch_no].count++;
    return acc;
  }, {});

  return (
    <div className="card" style={{ padding: '20px' }}>
      <h2 style={{ color: '#9c27b0', borderBottom: '2px solid #9c27b0', paddingBottom: '10px' }}>🏭 週轉倉看板 (Turnover Area)</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '20px' }}>
        
        {/* 第一區：待清潔 (RAW) */}
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '10px', border: '1px solid #ddd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 style={{ margin: 0 }}>🧹 待清潔</h4>
            <button className="btn" style={{ fontSize: '12px', padding: '5px 10px' }} onClick={handleStartCleaning}>開始清潔</button>
          </div>
          {rawItems.map(item => (
            <div key={item.id} onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                 style={{ background: selectedIds.includes(item.id) ? '#e1f5fe' : '#fff', padding: '10px', marginBottom: '8px', borderRadius: '5px', cursor: 'pointer', border: selectedIds.includes(item.id) ? '1px solid #03a9f4' : '1px solid #eee' }}>
              <strong>{item.barcode}</strong>
              <div style={{ fontSize: '11px', color: '#888' }}>{item.material_code}</div>
            </div>
          ))}
        </div>

        {/* 第二區：待生產 (PENDING) */}
        <div style={{ background: '#fff3e0', padding: '15px', borderRadius: '10px', border: '1px solid #ffe0b2' }}>
          <h4 style={{ marginTop: 0, color: '#e65100' }}>⚙️ 待生產 (已進 MES)</h4>
          {pendingItems.map(item => (
            <div key={item.id} style={{ background: '#fff', padding: '10px', marginBottom: '8px', borderRadius: '5px', borderLeft: '5px solid #ff9800' }}>
              <strong>{item.barcode}</strong>
              <div style={{ fontSize: '11px', color: '#f57c00' }}>Batch: {item.batch_no}</div>
            </div>
          ))}
        </div>

        {/* 第三區：已完工 (COMPLETED - 以 Batch 顯示) */}
        <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '10px', border: '1px solid #c8e6c9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 style={{ margin: 0, color: '#2e7d32' }}>✅ 已完工</h4>
            <button className="btn" style={{ background: '#2e7d32', fontSize: '12px', padding: '5px 10px' }} onClick={moveToOutbound}>移至出貨</button>
          </div>
          {Object.values(completedBatches).map(b => (
            <div key={b.batch_no} onClick={() => setSelectedBatch(b.batch_no)}
                 style={{ background: selectedBatch === b.batch_no ? '#c8e6c9' : '#fff', padding: '10px', marginBottom: '8px', borderRadius: '5px', cursor: 'pointer', border: selectedBatch === b.batch_no ? '2px solid #2e7d32' : '1px solid #eee' }}>
              <strong>🔢 Batch: {b.batch_no}</strong>
              <div style={{ fontSize: '11px' }}>數量: {b.count} | 物料: {b.code}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 清潔流程 Modal */}
      {batchModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '10px', width: '400px' }}>
            <h3>1. 賦予生產批號</h3>
            <input type="text" className="input-field" placeholder="請輸入 Batch No..." value={batchNoInput} onChange={e => setBatchNoInput(e.target.value.toUpperCase())} autoFocus />
            <button className="btn" style={{ width: '100%', marginTop: '10px' }} onClick={() => { setBatchModal(false); setCleanModal(true); }}>下一步：掃描確認</button>
          </div>
        </div>
      )}

      {cleanModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '10px', width: '400px' }}>
            <h3>2. 逐桶掃描校驗 ({scannedItems.length}/{selectedIds.length})</h3>
            <div style={{ marginBottom: '15px' }}>
              {inventory.filter(i => selectedIds.includes(i.id)).map(i => (
                <span key={i.id} style={{ color: scannedItems.includes(i.barcode) ? '#4caf50' : '#ccc', marginRight: '10px' }}>● {i.barcode}</span>
              ))}
            </div>
            <form onSubmit={handleVerifyScan}>
              <input type="text" className="input-field" placeholder="請掃描桶號..." value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} autoFocus />
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
