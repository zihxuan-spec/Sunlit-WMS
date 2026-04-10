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

  // 1. 處理勾選邏輯
  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // 2. 點擊「外部清潔」按鈕：判定與開啟批號視窗
  const handleStartProcess = () => {
    if (selectedIds.length === 0) return showAlert(t.msgSelectFirst);
    
    const items = turnoverItems.filter(i => selectedIds.includes(i.id));
    
    // 💡 邏輯修正：只要該桶子還沒被賦予批號，就視為原料，可以清潔
    const canProcess = items.every(i => !i.batch_no || i.status === 'raw');
    
    if (!canProcess) {
      return showAlert("⚠️ 選中的項目中包含已在生產或已完成的批次！");
    }
    
    setProcessingItems(items);
    setBatchNoInput('');
    setBatchModal(true); // 開啟輸入批號視窗
  };

  // 3. 確認批號並進入掃描驗證
  const confirmBatchAndStartScan = (e) => {
    e.preventDefault();
    if (!batchNoInput.trim()) return;
    setBatchModal(false);
    setCleanModal(true);
    setScannedItems([]);
    setScanInput('');
  };

  // 4. 逐一掃描校驗邏輯
  const handleVerifyScan = async (e) => {
    e.preventDefault();
    const barcode = scanInput.trim().toUpperCase();
    if (!barcode) return;

    // 核對是否在本次勾選清單中
    const match = processingItems.find(item => item.product_barcode === barcode);
    
    if (!match) {
      setScanInput('');
      return showAlert("❌ 此條碼不在本次選取的清潔清單中！");
    }

    if (scannedItems.includes(barcode)) {
      setScanInput('');
      return; // 已經掃過了
    }

    const newScanned = [...scannedItems, barcode];
    setScannedItems(newScanned);
    setScanInput('');

    // 當勾選的桶號全部掃描校驗完成
    if (newScanned.length === processingItems.length) {
      await executeBatchConversion(batchNoInput.trim(), processingItems);
    }
  };

  // 5. 完成清潔：建立 Batch 並留在 Turnover 更新狀態為 Pending
  const executeBatchConversion = async (batchNo, items) => {
    // A. 建立生產任務
    const { error: batchErr } = await supabase.from('production_batches').insert([{
      batch_no: batchNo,
      material_code: items[0].product_barcode.split('-')[0],
      status: 'pending',
      operator: currentUser
    }]);

    if (batchErr) return showAlert("❌ 批號重複或建立失敗！");

    // B. 建立生產容器明細紀錄
    await supabase.from('production_containers').insert(items.map(item => ({
      batch_no: batchNo,
      barcode: item.product_barcode,
      current_step: 1
    })));

    // C. 更新 Turnover 畫面的桶子狀態，保留在畫面上
    const itemIds = items.map(i => i.id);
    await supabase.from('turnover_inventory').update({
      status: 'pending', 
      batch_no: batchNo,
      updated_at: new Date().toISOString()
    }).in('id', itemIds);

    showAlert(`✅ Batch ${batchNo} 清潔完成，狀態已轉為待生產。`);
    setCleanModal(false);
    setSelectedIds([]);
    fetchTurnover();
  };

  // 狀態標籤顯示邏輯
  const getStatusBadge = (status) => {
    switch(status) {
      case 'raw': return <span className="badge" style={{background: '#90a4ae'}}>{t.actOutTurn || 'Raw'}</span>;
      case 'pending': return <span className="badge" style={{background: '#ff9800'}}>{t.mesPending || 'Pending'}</span>;
      case 'completed': return <span className="badge" style={{background: '#4caf50'}}>{t.mesCompleted || 'Completed'}</span>;
      default: return <span className="badge" style={{background: '#90a4ae'}}>{t.actOutTurn}</span>;
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ color: '#c2185b' }}>🏭 {t.turnoverTitle} ({turnoverItems.length})</h2>
        <button className="btn" style={{ background: '#9c27b0', padding: '10px 20px' }} onClick={handleStartProcess}>
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
                <td style={{ color: '#666', fontSize: '12px' }}>{item.batch_no || '-'}</td>
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
          <div className="modal-content" style={{maxWidth: '400px'}}>
            <h3 style={{color: '#9c27b0'}}>🏷️ {t.batchModalTitle}</h3>
            <p>即將為 {processingItems.length} 桶包材建立批次</p>
            <form onSubmit={confirmBatchAndStartScan}>
              <input type="text" className="input-field" value={batchNoInput} onChange={e => setBatchNoInput(e.target.value.toUpperCase())} placeholder="請輸入生產批號..." autoFocus required />
              <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
                <button type="submit" className="btn" style={{flex: 1}}>下一步</button>
                <button type="button" className="btn btn-secondary" style={{flex: 1}} onClick={()=>setBatchModal(false)}>取消</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 第二階段：逐一掃描校驗 */}
      {cleanModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{maxWidth: '500px'}}>
            <h3 style={{color: '#9c27b0'}}>🧼 外部清潔驗證 (Batch: {batchNoInput})</h3>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '10px', margin: '20px 0'}}>
              {processingItems.map(item => (
                <div key={item.id} style={{
                  padding: '8px 12px', borderRadius: '4px', border: '1px solid #ddd',
                  background: scannedItems.includes(item.product_barcode) ? '#e8f5e9' : '#fff',
                  color: scannedItems.includes(item.product_barcode) ? '#2e7d32' : '#333'
                }}>
                  {scannedItems.includes(item.product_barcode) ? '✅' : '⚪'} {item.product_barcode}
                </div>
              ))}
            </div>
            <form onSubmit={handleVerifyScan}>
              <p>請依序清潔並掃描桶號：</p>
              <input type="text" className="input-field" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} placeholder="Waiting for scan..." autoFocus />
              <button type="button" className="btn btn-secondary" style={{width: '100%', marginTop: '20px'}} onClick={()=>setCleanModal(false)}>暫中斷掃描</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
