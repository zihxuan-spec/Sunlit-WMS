import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ t, lang, turnoverItems, fetchTurnover, showAlert, showConfirm, currentUser }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchModal, setBatchModal] = useState(false); // 第一步：輸入 Batch 視窗
  const [cleanModal, setCleanModal] = useState(false); // 第二步：逐桶掃描視窗
  
  const [batchNoInput, setBatchNoInput] = useState('');
  const [processingItems, setProcessingItems] = useState([]); // 當前批次包含的所有桶子
  const [scannedItems, setScannedItems] = useState([]); // 已成功掃描確認的桶子
  const [scanInput, setScanInput] = useState('');

  // 1. 處理勾選邏輯
  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // 2. 點擊「外部清潔」按鈕：進入批號輸入階段
  const handleStartProcess = () => {
    if (selectedIds.length === 0) return showAlert(t.msgSelectFirst);
    
    // 取得選中的完整物件清單
    const items = turnoverItems.filter(i => selectedIds.includes(i.id));
    setProcessingItems(items);
    setBatchNoInput('');
    setBatchModal(true);
  };

  // 3. 確認批號後：進入掃描校驗階段
  const confirmBatchAndStartScan = (e) => {
    e.preventDefault();
    if (!batchNoInput.trim()) return;
    setBatchModal(false);
    setCleanModal(true);
    setScannedItems([]);
    setScanInput('');
  };

  // 4. 核心掃描校驗邏輯
  const handleVerifyScan = async (e) => {
    e.preventDefault();
    const barcode = scanInput.trim();
    if (!barcode) return;

    // 檢查掃描的條碼是否在本次選取的處理清單中
    const match = processingItems.find(item => item.product_barcode === barcode);
    
    if (!match) {
      setScanInput('');
      return showAlert("❌ 此條碼不在此批次清單中！");
    }

    if (scannedItems.includes(barcode)) {
      setScanInput('');
      return; // 已經掃過了
    }

    const newScanned = [...scannedItems, barcode];
    setScannedItems(newScanned);
    setScanInput('');

    // 當清單內所有桶號都掃描完成
    if (newScanned.length === processingItems.length) {
      await executeBatchCompletion(batchNoInput.trim(), processingItems);
    }
  };

  // 5. 資料庫寫入：建立 Batch 並移動庫存
  const executeBatchCompletion = async (batchNo, items) => {
    // A. 在生產表建立批次
    const { error: batchErr } = await supabase.from('production_batches').insert([{
      batch_no: batchNo,
      material_code: items[0].product_barcode.split('-')[0], // 以第一桶前綴作為物料代碼
      status: 'pending'
    }]);

    if (batchErr) return showAlert("❌ 批號重複或建立失敗！");

    // B. 將所有桶子關聯至此批次
    const containerRecords = items.map(item => ({
      batch_no: batchNo,
      barcode: item.product_barcode,
      current_step: 1
    }));
    await supabase.from('production_containers').insert(containerRecords);

    // C. 從週轉倉庫存移除
    const itemIds = items.map(i => i.id);
    await supabase.from('turnover_inventory').delete().in('id', itemIds);

    showAlert(`✅ Batch ${batchNo} 已完成清潔並送入 MES Pending。`);
    setCleanModal(false);
    setSelectedIds([]);
    fetchTurnover();
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ color: '#c2185b' }}>🏭 {t.turnoverTitle} ({turnoverItems.length})</h2>
        <button className="btn" style={{ background: '#9c27b0', padding: '10px 20px', fontSize: '16px' }} onClick={handleStartProcess}>
          ✨ {t.btnExtCleaning}
        </button>
      </div>

      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}><input type="checkbox" onChange={(e) => {
                if (e.target.checked) setSelectedIds(turnoverItems.map(i => i.id));
                else setSelectedIds([]);
              }} checked={selectedIds.length === turnoverItems.length && turnoverItems.length > 0} /></th>
              <th>Time</th>
              <th>Barcode/Batch</th>
              <th>Date</th>
              <th>Op</th>
            </tr>
          </thead>
          <tbody>
            {turnoverItems.map(item => (
              <tr key={item.id} onClick={() => toggleSelect(item.id)} style={{ cursor: 'pointer', background: selectedIds.includes(item.id) ? '#fce4ec' : '' }}>
                <td><input type="checkbox" checked={selectedIds.includes(item.id)} readOnly /></td>
                <td>{new Date(item.added_at).toLocaleString()}</td>
                <td style={{ fontWeight: 'bold', color: '#1565c2' }}>📦 {item.product_barcode}</td>
                <td>📅 {item.batch_date}</td>
                <td>👤 {item.added_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 第一階段：輸入 Batch Number 視窗 */}
      {batchModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h3 style={{ color: '#9c27b0' }}>🏷️ {t.batchModalTitle}</h3>
            <p style={{ margin: '15px 0' }}>{t.batchModalDesc.replace('{n}', selectedIds.length)}</p>
            <form onSubmit={confirmBatchAndStartScan}>
              <input 
                type="text" 
                className="input-field" 
                value={batchNoInput} 
                onChange={e => setBatchNoInput(e.target.value.toUpperCase())} 
                placeholder={t.batchInputPlaceholder}
                autoFocus 
                required 
              />
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn" style={{ flex: 1 }}>{t.btnConfirm}</button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setBatchModal(false)}>{t.btnCancel}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 第二階段：逐桶清潔掃描驗證視窗 */}
      {cleanModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <h3 style={{ color: '#9c27b0' }}>🧼 {t.btnExtCleaning} (Batch: {batchNoInput})</h3>
            
            <div style={{ margin: '20px 0', textAlign: 'left', background: '#f5f5f5', padding: '15px', borderRadius: '8px' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '10px' }}>Progress: {scannedItems.length} / {processingItems.length}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {processingItems.map(item => (
                  <div key={item.id} style={{ 
                    padding: '5px 10px', 
                    borderRadius: '4px', 
                    border: '1px solid #ddd',
                    background: scannedItems.includes(item.product_barcode) ? '#e8f5e9' : '#fff',
                    color: scannedItems.includes(item.product_barcode) ? '#2e7d32' : '#333',
                    textDecoration: scannedItems.includes(item.product_barcode) ? 'line-through' : 'none'
                  }}>
                    {scannedItems.includes(item.product_barcode) ? '✅' : '⭕'} {item.product_barcode}
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleVerifyScan}>
              <p style={{ marginBottom: '10px' }}>請清潔並掃描桶號進行驗證：</p>
              <input 
                type="text" 
                className="input-field" 
                value={scanInput} 
                onChange={e => setScanInput(e.target.value.toUpperCase())} 
                placeholder="Waiting for scan..."
                autoFocus 
              />
              <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: '20px' }} onClick={() => setCleanModal(false)}>
                中斷操作 (暫存進度)
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
