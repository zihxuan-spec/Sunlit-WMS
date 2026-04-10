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

  const handleStartProcess = () => {
    if (selectedIds.length === 0) return showAlert(t.msgSelectFirst);
    const items = turnoverItems.filter(i => selectedIds.includes(i.id));
    
    // 檢查：只有 status 為 'raw' (原料) 的桶子才能進行清潔
    if (items.some(i => i.status !== 'raw')) return showAlert("⚠️ 只有【原料】狀態的項目可以執行清潔！");
    
    setProcessingItems(items);
    setBatchNoInput('');
    setBatchModal(true);
  };

  const confirmBatchAndStartScan = (e) => {
    e.preventDefault();
    if (!batchNoInput.trim()) return;
    setBatchModal(false);
    setCleanModal(true);
    setScannedItems([]);
    setScanInput('');
  };

  const handleVerifyScan = async (e) => {
    e.preventDefault();
    const barcode = scanInput.trim();
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

    if (newScanned.length === processingItems.length) {
      await executeBatchConversion(batchNoInput.trim(), processingItems);
    }
  };

  // 核心變動：不刪除，而是更新狀態為 'pending'
  const executeBatchConversion = async (batchNo, items) => {
    // A. 建立生產任務
    const { error: batchErr } = await supabase.from('production_batches').insert([{
      batch_no: batchNo,
      material_code: items[0].product_barcode.split('-')[0],
      status: 'pending',
      operator: currentUser
    }]);

    if (batchErr) return showAlert("❌ 批號重複！");

    // B. 建立生產容器明細
    await supabase.from('production_containers').insert(items.map(item => ({
      batch_no: batchNo,
      barcode: item.product_barcode,
      current_step: 1
    })));

    // C. 重點：更新 Turnover 畫面上的桶子狀態，而不是刪除
    const itemIds = items.map(i => i.id);
    await supabase.from('turnover_inventory').update({
      status: 'pending', // 狀態轉為待生產
      batch_no: batchNo,
      updated_at: new Date().toISOString()
    }).in('id', itemIds);

    showAlert(`✅ Batch ${batchNo} 清潔完成，已轉為待生產狀態。`);
    setCleanModal(false);
    setSelectedIds([]);
    fetchTurnover();
  };

  // 輔助函式：根據狀態顯示標籤顏色
  const getStatusBadge = (status) => {
    switch(status) {
      case 'raw': return <span className="badge" style={{background: '#90a4ae'}}>{t.actOutTurn || 'Raw'}</span>;
      case 'pending': return <span className="badge" style={{background: '#ff9800'}}>{t.mesPending}</span>;
      case 'completed': return <span className="badge" style={{background: '#4caf50'}}>{t.mesCompleted}</span>;
      default: return null;
    }
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
              <th style={{ width: '40px' }}><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? turnoverItems.map(i => i.id) : [])} /></th>
              <th>Status</th>
              <th>Batch No</th>
              <th>Barcode</th>
              <th>Op</th>
            </tr>
          </thead>
          <tbody>
            {turnoverItems.map(item => (
              <tr key={item.id} onClick={() => toggleSelect(item.id)} style={{ cursor: 'pointer', background: selectedIds.includes(item.id) ? '#fce4ec' : '' }}>
                <td><input type="checkbox" checked={selectedIds.includes(item.id)} readOnly /></td>
                <td>{getStatusBadge(item.status)}</td>
                <td style={{ color: '#777' }}>{item.batch_no || '-'}</td>
                <td style={{ fontWeight: 'bold' }}>📦 {item.product_barcode}</td>
                <td>👤 {item.added_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 第一階段 Modal (Batch No) & 第二階段 Modal (Verify Scan) 同前... */}
      {/* 僅需確保在 modal 內顯示 batchNoInput 即可 */}
    </div>
  );
}
