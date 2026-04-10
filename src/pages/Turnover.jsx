import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ t, lang, showAlert, currentUser }) {
  const [inventory, setInventory] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]); 
  const [selectedBatch, setSelectedBatch] = useState(''); 
  
  // Modal 狀態
  const [batchModal, setBatchModal] = useState(false);
  const [cleanModal, setCleanModal] = useState(false);
  const [batchNoInput, setBatchNoInput] = useState('');
  const [scannedItems, setScannedItems] = useState([]);
  const [scanInput, setScanInput] = useState('');

  // 1. 初始化與定時刷新 (確保畫面數據最新)
  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    // 抓取所有在 Turnover 區域的物件
    const { data, error } = await supabase
      .from('turnover_inventory')
      .select('*')
      .eq('location', 'Turnover')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error("Fetch Error:", error);
    } else {
      setInventory(data || []);
    }
  };

  // 2. 處理【待清潔】開始按鈕
  const handleStartCleaning = () => {
    if (selectedIds.length === 0) return alert("請先勾選要清潔的包材！");
    const items = inventory.filter(i => selectedIds.includes(i.id));
    
    // 嚴格判定：只能選擇 status 為 'raw' 或為空的桶子
    if (items.some(i => i.status !== 'raw' && i.status !== null)) {
      return alert("選中項包含已在處理中或已完工的項目！");
    }

    setBatchNoInput('');
    setBatchModal(true);
  };

  // 3. 逐桶校驗與狀態轉換 (核心邏輯)
  const handleVerifyScan = async (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    const itemsToClean = inventory.filter(i => selectedIds.includes(i.id));
    const match = itemsToClean.find(i => i.barcode === input);

    if (!match) {
      setScanInput('');
      return alert("❌ 條碼不在此次清潔清單中！");
    }

    if (scannedItems.includes(input)) {
      setScanInput('');
      return;
    }

    const newScanned = [...scannedItems, input];
    setScannedItems(newScanned);
    setScanInput('');

    // 當全部勾選的桶子都掃完確認
    if (newScanned.length === itemsToClean.length) {
      const batchNo = batchNoInput.trim();
      
      // A. 建立生產批次
      await supabase.from('production_batches').insert([{ 
        batch_no: batchNo, 
        material_code: itemsToClean[0].material_code, 
        status: 'pending', 
        operator: currentUser 
      }]);

      // B. 建立生產明細
      await supabase.from('production_containers').insert(itemsToClean.map(i => ({ 
        batch_no: batchNo, 
        barcode: i.barcode, 
        current_step: 1 
      })));

      // C. 更新週轉倉狀態為 Pending (待生產)
      await supabase.from('turnover_inventory').update({ 
        status: 'pending', 
        batch_no: batchNo, 
        updated_at: new Date().toISOString() 
      }).in('id', selectedIds);
      
      alert(`✅ 批次 ${batchNo} 清潔驗證完成！`);
      
      // 關鍵：關閉 Modal 並立即重新整理資料
      setCleanModal(false);
      setSelectedIds([]);
      setScannedItems([]);
      fetchInventory(); 
    }
  };

  // 4. 已完工 Batch 移轉至 Outbound
  const moveToOutbound = async () => {
    if (!selectedBatch) return alert("請先選取一個要移轉的 Batch！");

    const { error } = await supabase.from('turnover_inventory')
      .update({ 
        location: 'Outbound', 
        updated_at: new Date().toISOString() 
      })
      .eq('batch_no', selectedBatch);

    if (!error) {
      alert(`🚚 批次 ${selectedBatch} 已成功移至 Outbound！`);
      setSelectedBatch('');
      fetchInventory(); 
    }
  };

  // --- 數據分流分組 ---
  const rawItems = inventory.filter(i => i.status === 'raw' || !i.status);
  const pendingItems = inventory.filter(i => i.status === 'pending');
  const completedBatches = inventory.filter(i => i.status === 'completed').reduce((acc, curr) => {
    if (!acc[curr.batch_no]) {
      acc[curr.batch_no] = { batch_no: curr.batch_no, code: curr.material_code, count: 0 };
    }
    acc[curr.batch_no].count++;
    return acc;
  }, {});

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ color: '#9c27b0', margin: 0 }}>🏭 週轉倉看板 (Turnover Area)</h2>
        <button className="btn btn-secondary" onClick={fetchInventory} style={{ background: '#eee' }}>🔄 刷新畫面</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
        
        {/* 1. 待清潔 (RAW) */}
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '10px', border: '1px solid #ddd', minHeight: '500px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h4 style={{ margin: 0 }}>🧹 待清潔 ({rawItems.length})</h4>
            <button className="btn" style={{ fontSize: '12px', padding: '5px 10px' }} onClick={handleStartCleaning}>開始清潔</button>
          </div>
          {rawItems.map(item => (
            <div key={item.id} onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                 style={{ 
                   background: selectedIds.includes(item.id) ? '#e1f5fe' : '#fff', 
                   padding: '12px', marginBottom: '8px', borderRadius: '5px', 
                   cursor: 'pointer', border: selectedIds.includes(item.id) ? '2px solid #03a9f4' : '1px solid #eee' 
                 }}>
              <div style={{ fontWeight: 'bold' }}>📦 {item.barcode}</div>
              <div style={{ fontSize: '11px', color: '#888' }}>物料: {item.material_code}</div>
            </div>
          ))}
        </div>

        {/* 2. 待生產 (已賦予 Batch，進 MES) */}
        <div style={{ background: '#fff3e0', padding: '15px', borderRadius: '10px', border: '1px solid #ffe0b2' }}>
          <h4 style={{ marginTop: 0, color: '#e65100' }}>⚙️ 待生產 (Pending)</h4>
          {pendingItems.map(item => (
            <div key={item.id} style={{ background: '#fff', padding: '12px', marginBottom: '8px', borderRadius: '5px', borderLeft: '5px solid #ff9800', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ fontWeight: 'bold' }}>{item.barcode}</div>
              <div style={{ fontSize: '11px', color: '#f57c00' }}>Batch: {item.batch_no}</div>
            </div>
          ))}
        </div>

        {/* 3. 已完工 (成品 Batch) */}
        <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '10px', border: '1px solid #c8e6c9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h4 style={{ margin: 0, color: '#2e7d32' }}>✅ 已完工</h4>
            <button className="btn" style={{ background: '#2e7d32', fontSize: '12px', padding: '5px 10px' }} onClick={moveToOutbound}>移至出貨</button>
          </div>
          {Object.values(completedBatches).map(b => (
            <div key={b.batch_no} onClick={() => setSelectedBatch(b.batch_no)}
                 style={{ 
                   background: selectedBatch === b.batch_no ? '#c8e6c9' : '#fff', 
                   padding: '15px', marginBottom: '10px', borderRadius: '8px', 
                   cursor: 'pointer', border: selectedBatch === b.batch_no ? '2px solid #2e7d32' : '1px solid #eee' 
                 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '15px' }}>🔢 Batch: {b.batch_no}</strong>
                <span style={{ fontSize: '11px', background: '#2e7d32', color: '#fff', padding: '2px 6px', borderRadius: '10px' }}>{b.count} 桶</span>
              </div>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>物料: {b.code}</div>
            </div>
          ))}
        </div>
      </div>

      {/* --- Modals --- */}
      {batchModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '10px', width: '350px' }}>
            <h3>🏷️ 賦予生產批號</h3>
            <p>即將為選中的 {selectedIds.length} 桶包材建立批次</p>
            <input 
              type="text" 
              className="input-field" 
              value={batchNoInput} 
              onChange={e => setBatchNoInput(e.target.value.toUpperCase())} 
              placeholder="請輸入 Batch No..." 
              autoFocus 
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => { setBatchModal(false); setCleanModal(true); }}>下一步</button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setBatchModal(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {cleanModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '10px', width: '400px' }}>
            <h3>🧼 外部清潔校驗 ({scannedItems.length}/{selectedIds.length})</h3>
            <div style={{ marginBottom: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {inventory.filter(i => selectedIds.includes(i.id)).map(i => (
                <span key={i.id} style={{ color: scannedItems.includes(i.barcode) ? '#4caf50' : '#ccc', fontWeight: 'bold' }}>
                  {scannedItems.includes(i.barcode) ? '✅' : '⚪'} {i.barcode}
                </span>
              ))}
            </div>
            <form onSubmit={handleVerifyScan}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="請掃描桶號確認..." 
                value={scanInput} 
                onChange={e => setScanInput(e.target.value.toUpperCase())} 
                autoFocus 
              />
            </form>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '20px' }} onClick={() => setCleanModal(false)}>中斷</button>
          </div>
        </div>
      )}
    </div>
  );
}
