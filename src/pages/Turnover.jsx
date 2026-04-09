import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ 
  t, lang, turnoverItems, fetchTurnover, showAlert, showConfirm, currentUser,
  setPendingItems, setOutboundAssignItems, setCurrentView, setActiveWarehouse 
}) {
  const [selectedTurnover, setSelectedTurnover] = useState([]);
  const [batchInputModal, setBatchInputModal] = useState({ isOpen: false });
  const [batchTargetName, setBatchTargetName] = useState('');

  // --- 拆棧板 (External Cleaning) 專用 State ---
  const [extCleanModal, setExtCleanModal] = useState(false);
  const [palletRules, setPalletRules] = useState([]);
  const [scanInput, setScanInput] = useState('');
  const [currentPallet, setCurrentPallet] = useState(null); // { barcode, requiredQty }
  const [scannedChildren, setScannedChildren] = useState([]);

  // 取得棧板規則
  useEffect(() => {
    const fetchRules = async () => {
      const { data } = await supabase.from('pallet_barcode_rules').select('*');
      if (data) setPalletRules(data);
    };
    fetchRules();
  }, []);

  const toggleTurnoverItem = (id) => {
    setSelectedTurnover(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  
  const toggleAllTurnover = (e) => {
    if (e.target.checked) setSelectedTurnover(turnoverItems.map(i => i.id));
    else setSelectedTurnover([]);
  };

  // 原本的退回入庫與轉出貨邏輯...
  const handleBulkReturnToInbound = () => {
    if (selectedTurnover.length === 0) return showAlert(t.msgSelectFirst);
    showConfirm(t.turnoverBulkInboundConfirm.replace('{n}', selectedTurnover.length), async () => {
      const itemsToReturn = turnoverItems.filter(i => selectedTurnover.includes(i.id));
      await supabase.from('turnover_inventory').delete().in('id', selectedTurnover);
      fetchTurnover();
      setPendingItems(prev => [...prev, ...itemsToReturn.map(i => i.product_barcode)]);
      setSelectedTurnover([]);
      setCurrentView('inbound');
      setActiveWarehouse('North Warehouse');
    });
  };

  const handleBulkReturnToOutbound = () => {
    if (selectedTurnover.length === 0) return showAlert(t.msgSelectFirst);
    setBatchInputModal({ isOpen: true });
  };

  const confirmBatchReturnToOutbound = async () => {
    const batchName = batchTargetName.trim();
    if (!batchName) return; 
    const itemsToMove = turnoverItems.filter(i => selectedTurnover.includes(i.id));
    await supabase.from('turnover_inventory').delete().in('id', selectedTurnover);
    fetchTurnover();
    const newAssigns = itemsToMove.map(i => ({ 
        id: Date.now().toString() + '-' + Math.floor(Math.random() * 10000), 
        barcode: i.product_barcode, batch_no: batchName 
    }));
    setOutboundAssignItems(prev => [...prev, ...newAssigns]);
    setSelectedTurnover([]); setBatchInputModal({ isOpen: false }); setBatchTargetName('');
    setCurrentView('outbound'); setActiveWarehouse('South Warehouse');
  };

  // --- 拆棧板掃描邏輯 ---
  const handleScanSubmit = async (e) => {
    e.preventDefault();
    const barcode = scanInput.trim();
    if (!barcode) return;

    // 階段 1：掃描母棧板
    if (!currentPallet) {
      // 檢查是否在 Turnover 中
      const turnoverItem = turnoverItems.find(i => i.product_barcode === barcode);
      if (!turnoverItem) return showAlert(t.msgPalletNotFound);

      // 檢查是否符合棧板規則
      const matchedRule = palletRules.find(rule => barcode.startsWith(rule.prefix));
      if (!matchedRule) return showAlert(t.msgInvalidPallet);

      setCurrentPallet({ barcode: barcode, requiredQty: matchedRule.qty_per_pallet });
      setScanInput('');
      return;
    }

    // 階段 2：掃描子桶
    if (scannedChildren.includes(barcode)) {
      setScanInput(''); // 避免重複掃描同一個子桶
      return;
    }

    const newChildren = [...scannedChildren, barcode];
    setScannedChildren(newChildren);
    setScanInput('');

    // 如果掃滿了，執行拆分！
    if (newChildren.length === currentPallet.requiredQty) {
      const todayDate = new Date().toISOString().split('T')[0];
      
      // 1. 寫入 pallet_container_map 追蹤紀錄
      const mapRecords = newChildren.map(child => ({ parent_pallet: currentPallet.barcode, child_barcode: child }));
      await supabase.from('pallet_container_map').insert(mapRecords);

      // 2. 將子桶寫入 turnover_inventory
      const turnoverRecords = newChildren.map(child => ({ product_barcode: child, batch_date: todayDate, added_by: currentUser }));
      await supabase.from('turnover_inventory').insert(turnoverRecords);

      // 3. 刪除原來的母棧板
      await supabase.from('turnover_inventory').delete().eq('product_barcode', currentPallet.barcode);

      showAlert(t.msgSplitSuccess);
      fetchTurnover();
      
      // 重置狀態，準備掃下一個
      setCurrentPallet(null);
      setScannedChildren([]);
      setExtCleanModal(false);
    }
  };

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{marginTop: 0, marginBottom: 0}}>{t.turnoverTitle} (Total: {turnoverItems.length})</h2>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {/* 啟動拆棧板的按鈕 */}
            <button className="btn" style={{ background: '#9c27b0', padding: '8px 15px', fontSize: '14px' }} onClick={() => setExtCleanModal(true)}>
              {t.btnExtCleaning}
            </button>
            
            {selectedTurnover.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', background: '#fff3e0', padding: '4px 8px', borderRadius: '8px', border: '1px solid #ff9800' }}>
                 <button className="btn btn-secondary" style={{padding: '8px 15px', fontSize: '14px'}} onClick={handleBulkReturnToInbound}>{t.btnReturnInbound} ({selectedTurnover.length})</button>
                 <button className="btn btn-success" style={{padding: '8px 15px', fontSize: '14px', background: '#2e7d32'}} onClick={handleBulkReturnToOutbound}>{t.btnReturnOutbound} ({selectedTurnover.length})</button>
              </div>
            )}
          </div>
        </div>

        <div className="history-table-container">
          {turnoverItems.length === 0 ? (
            <div style={{textAlign: 'center', color: '#999', padding: '30px', fontSize: '18px'}}>{t.turnoverEmpty}</div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th style={{width: '40px', textAlign: 'center'}}>
                    <input type="checkbox" className="checkbox-lg" checked={selectedTurnover.length === turnoverItems.length && turnoverItems.length > 0} onChange={toggleAllTurnover} />
                  </th>
                  <th>{t.colTime}</th><th>{t.colBarcode}</th><th>{t.colDate}</th><th>{t.colOp}</th>
                </tr>
              </thead>
              <tbody>
                {turnoverItems.map(item => (
                  <tr key={item.id} className="row-clickable" onClick={() => toggleTurnoverItem(item.id)} style={{ backgroundColor: selectedTurnover.includes(item.id) ? '#e3f2fd' : 'transparent' }}>
                    <td style={{textAlign: 'center'}} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="checkbox-lg" checked={selectedTurnover.includes(item.id)} onChange={() => toggleTurnoverItem(item.id)} />
                    </td>
                    <td style={{color: '#666'}}>{new Date(item.added_at).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</td>
                    <td style={{fontWeight: 'bold', fontSize: '15px', color: '#0071e3'}}>📦 {item.product_barcode}</td>
                    <td>{item.batch_date ? `📅 ${item.batch_date}` : '-'}</td>
                    <td>👤 {item.added_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* --- 拆棧板專用 Modal --- */}
      {extCleanModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '400px' }}>
            <h3 style={{color: '#9c27b0'}}>{t.extCleanTitle}</h3>
            
            {!currentPallet ? (
               <p style={{color: '#666', fontWeight: 'bold'}}>{t.extCleanScanPallet}</p>
            ) : (
               <div style={{ marginBottom: '15px', background: '#f3e5f5', padding: '10px', borderRadius: '8px' }}>
                 <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#7b1fa2' }}>📍 Pallet: <strong>{currentPallet.barcode}</strong></p>
                 <p style={{ margin: 0, fontWeight: 'bold' }}>{t.extCleanScanChild.replace('{current}', scannedChildren.length).replace('{total}', currentPallet.requiredQty)}</p>
               </div>
            )}

            <form onSubmit={handleScanSubmit}>
              <input 
                type="text" 
                style={{fontSize: '20px', padding: '15px', textAlign: 'center', borderColor: '#9c27b0', borderWidth: '2px', fontWeight: 'bold'}}
                placeholder="Scan Barcode Here..." 
                value={scanInput} 
                onChange={e => setScanInput(e.target.value)} 
                autoFocus 
              />
            </form>

            {/* 顯示已掃描的子桶清單 */}
            {scannedChildren.length > 0 && (
              <div style={{ textAlign: 'left', marginTop: '10px', maxHeight: '150px', overflowY: 'auto' }}>
                {scannedChildren.map((child, idx) => (
                  <div key={idx} style={{ padding: '5px 8px', background: '#eee', borderRadius: '4px', marginBottom: '5px', fontSize: '14px' }}>
                    ✅ {child}
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => { setExtCleanModal(false); setCurrentPallet(null); setScannedChildren([]); }}>
                {t.btnCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 原本的 Batch 輸入 Modal */}
      {batchInputModal.isOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 style={{color: '#0071e3'}}>{t.batchModalTitle}</h3>
            <p style={{color: '#666', fontWeight: 'bold'}}>{t.batchModalDesc.replace('{n}', selectedTurnover.length)}</p>
            <input 
              type="text" 
              style={{fontSize: '20px', padding: '15px', textAlign: 'center', borderColor: '#0071e3', borderWidth: '2px', fontWeight: 'bold'}}
              placeholder={t.batchInputPlaceholder} 
              value={batchTargetName} 
              onChange={e => setBatchTargetName(e.target.value)} 
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => {setBatchInputModal({isOpen: false}); setBatchTargetName('');}}>{t.btnCancel}</button>
              <button className="btn btn-success" onClick={confirmBatchReturnToOutbound}>{t.btnConfirm}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
