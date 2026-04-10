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
  // --- 在 Turnover.jsx 的處理邏輯中 ---

const handleScanSubmit = async (e) => {
  e.preventDefault();
  const barcode = scanInput.trim();
  if (!barcode) return;

  // 1. 判斷是否為棧板：讀取資料庫 pallet_barcode_rules 
  if (!currentPallet) {
    const turnoverItem = turnoverItems.find(i => i.product_barcode === barcode);
    if (!turnoverItem) return showAlert(t.msgPalletNotFound);

    const matchedRule = palletRules.find(rule => barcode.startsWith(rule.prefix));
    if (!matchedRule) {
      // 情況 A：單一包材，直接進入後續流程 
      // 這裡可依需求實作單桶的 External Cleaning 邏輯
      return;
    }

    // 情況 B：進入拆棧板模式 
    setCurrentPallet({ barcode: barcode, requiredQty: matchedRule.qty_per_pallet, item: turnoverItem });
    setScanInput('');
    return;
  }

  // 2. 掃描子包材並記錄 
  if (scannedChildren.includes(barcode)) return setScanInput('');
  const newChildren = [...scannedChildren, barcode];
  setScannedChildren(newChildren);
  setScanInput('');

  // 3. 掃滿規定數量後執行拆分與觸發 MES 
  if (newChildren.length === currentPallet.requiredQty) {
    const todayDate = new Date().toISOString().split('T')[0];
    const newBatchNo = `BATCH-${currentPallet.barcode}-${Date.now().toString().slice(-4)}`;

    // A. 記錄到 pallet_container_map 以供未來回查 
    const mapRecords = newChildren.map(child => ({ parent_pallet: currentPallet.barcode, child_barcode: child }));
    await supabase.from('pallet_container_map').insert(mapRecords);

    // B. 更新庫存：刪除母棧板，新增子包材進入週轉倉 
    await supabase.from('turnover_inventory').delete().eq('product_barcode', currentPallet.barcode);
    await supabase.from('turnover_inventory').insert(newChildren.map(child => ({ 
      product_barcode: child, batch_date: todayDate, added_by: currentUser 
    })));

    // C. 關鍵步驟：建立 MES 生產批次，讓主畫面顯示「待生產」 
    await supabase.from('production_batches').insert([{
      batch_no: newBatchNo,
      material_code: currentPallet.barcode.split('-')[0], // 依前綴判斷物料代碼 
      status: 'pending' // 狀態設為待生產 
    }]);

    // D. 綁定批次內的子包材 (production_containers) 
    await supabase.from('production_containers').insert(newChildren.map(child => ({
      batch_no: newBatchNo,
      barcode: child,
      current_step: 1
    })));

    showAlert(t.msgSplitSuccess + ` (${newBatchNo})`);
    fetchTurnover();
    setCurrentPallet(null); setScannedChildren([]); setExtCleanModal(false);
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
