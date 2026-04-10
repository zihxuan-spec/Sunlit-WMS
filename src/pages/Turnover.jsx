import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ t, lang, turnoverItems, fetchTurnover, showAlert, showConfirm, currentUser }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchModal, setBatchModal] = useState(false); 
  const [cleanModal, setCleanModal] = useState(false);
  
  const [batchNoInput, setBatchNoInput] = useState('');
  const [processingItems, setProcessingItems] = useState([]); 
  const [scannedItems, setScannedItems] = useState([]); 
  const [scanInput, setScanInput] = useState('');

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // 1. 倉庫人員先選擇需要的包材
  const handleStartProcess = () => {
    if (selectedIds.length === 0) return showAlert(t.msgSelectFirst);
    const items = turnoverItems.filter(i => selectedIds.includes(i.id));
    setProcessingItems(items);
    setBatchNoInput('');
    setBatchModal(true);
  };

  // 2. 輸入 Batch 號碼
  const confirmBatchAndStartScan = (e) => {
    e.preventDefault();
    if (!batchNoInput.trim()) return;
    setBatchModal(false);
    setCleanModal(true); // 3. 開始掃描包材號碼
    setScannedItems([]);
    setScanInput('');
  };

  // 4. 進行清潔並掃描桶號確認
  const handleVerifyScan = async (e) => {
    e.preventDefault();
    const barcode = scanInput.trim();
    if (!barcode) return;

    const match = processingItems.find(item => item.product_barcode === barcode);
    if (!match) {
      setScanInput('');
      return showAlert("❌ 此條碼不在本次選取的清潔清單中！");
    }
    if (scannedItems.includes(barcode)) {
      setScanInput('');
      return;
    }

    const newScanned = [...scannedItems, barcode];
    setScannedItems(newScanned);
    setScanInput('');

    // 5. 5 個桶號都完成後就完成這個 batch
    if (newScanned.length === processingItems.length) {
      await executeBatchCompletion(batchNoInput.trim(), processingItems);
    }
  };

  const executeBatchCompletion = async (batchNo, items) => {
    // A. 記錄到資料庫：建立生產批次
    const { error: batchErr } = await supabase.from('production_batches').insert([{
      batch_no: batchNo,
      material_code: items[0].product_barcode.split('-')[0],
      status: 'pending',
      operator: currentUser
    }]);

    if (batchErr) return showAlert("❌ 批號可能已重複，請檢查！");

    // B. 將掃描完成的桶子與批次綁定
    await supabase.from('production_containers').insert(items.map(item => ({
      batch_no: batchNo,
      barcode: item.product_barcode,
      current_step: 1,
      verified_at: new Date().toISOString()
    })));

    // C. 完成後主畫面要顯示待生產（從 Turnover 移除）
    await supabase.from('turnover_inventory').delete().in('id', items.map(i => i.id));

    showAlert(`✅ Batch ${batchNo} 已完成，共 ${items.length} 桶。`);
    setCleanModal(false);
    setSelectedIds([]);
    fetchTurnover();
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ color: '#c2185b' }}>🏭 {t.turnoverTitle} ({turnoverItems.length})</h2>
        <button className="btn" style={{ background: '#9c27b0' }} onClick={handleStartProcess}>
          ✨ {t.btnExtCleaning}
        </button>
      </div>

      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? turnoverItems.map(i => i.id) : [])} />
              </th>
              <th>Time</th>
              <th>Barcode/Batch</th>
              <th>Op</th>
            </tr>
          </thead>
          <tbody>
            {turnoverItems.map(item => (
              <tr key={item.id} onClick={() => toggleSelect(item.id)} style={{ cursor: 'pointer', background: selectedIds.includes(item.id) ? '#fce4ec' : '' }}>
                <td><input type="checkbox" checked={selectedIds.includes(item.id)} readOnly /></td>
                <td>{new Date(item.added_at).toLocaleString()}</td>
                <td style={{ fontWeight: 'bold' }}>📦 {item.product_barcode}</td>
                <td>👤 {item.added_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 第一階段：輸入 Batch Number */}
      {batchModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>🏷️ {t.batchModalTitle}</h3>
            <p>即將為選中的 {processingItems.length} 桶賦予批號</p>
            <form onSubmit={confirmBatchAndStartScan}>
              <input type="text" className="input-field" value={batchNoInput} onChange={e => setBatchNoInput(e.target.value.toUpperCase())} placeholder="輸入新 Batch 號碼..." autoFocus required />
              <button type="submit" className="btn" style={{ width: '100%', marginTop: '15px' }}>開始掃描確認</button>
            </form>
          </div>
        </div>
      )}

      {/* 第二階段：掃描桶號校驗 */}
      {cleanModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>🧼 逐桶清潔校驗 (Batch: {batchNoInput})</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', margin: '15px 0' }}>
              {processingItems.map(item => (
                <span key={item.id} style={{ 
                    padding: '5px 10px', borderRadius: '4px', border: '1px solid #ddd',
                    background: scannedItems.includes(item.product_barcode) ? '#4caf50' : '#fff',
                    color: scannedItems.includes(item.product_barcode) ? '#fff' : '#333'
                }}>
                  {scannedItems.includes(item.product_barcode) ? '✅' : '⚪'} {item.product_barcode}
                </span>
              ))}
            </div>
            <form onSubmit={handleVerifyScan}>
              <input type="text" className="input-field" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} placeholder="掃描桶號..." autoFocus />
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
