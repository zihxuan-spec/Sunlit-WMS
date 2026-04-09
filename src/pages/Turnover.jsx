import React, { useState } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ 
  t, lang, turnoverItems, fetchTurnover, showAlert, showConfirm, 
  setPendingItems, setOutboundAssignItems, setCurrentView, setActiveWarehouse 
}) {
  const [selectedTurnover, setSelectedTurnover] = useState([]);
  const [batchInputModal, setBatchInputModal] = useState({ isOpen: false });
  const [batchTargetName, setBatchTargetName] = useState('');

  const toggleTurnoverItem = (id) => {
    setSelectedTurnover(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  
  const toggleAllTurnover = (e) => {
    if (e.target.checked) setSelectedTurnover(turnoverItems.map(i => i.id));
    else setSelectedTurnover([]);
  };

  // 退回入庫清單 (北區)
  const handleBulkReturnToInbound = () => {
    if (selectedTurnover.length === 0) return showAlert(t.msgSelectFirst);
    showConfirm(t.turnoverBulkInboundConfirm.replace('{n}', selectedTurnover.length), async () => {
      const itemsToReturn = turnoverItems.filter(i => selectedTurnover.includes(i.id));
      
      await supabase.from('turnover_inventory').delete().in('id', selectedTurnover);
      fetchTurnover();
      
      // 更新 App.jsx 層級的狀態，並導向 Inbound 頁面
      setPendingItems(prev => [...prev, ...itemsToReturn.map(i => i.product_barcode)]);
      setSelectedTurnover([]);
      setCurrentView('inbound');
      setActiveWarehouse('North Warehouse');
    });
  };

  // 進入賦予成品批號流程 (南區)
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

    // 建立新的指派物件，送給出貨區的狀態
    const newAssigns = itemsToMove.map(i => ({ 
        id: Date.now().toString() + '-' + Math.floor(Math.random() * 10000), 
        barcode: i.product_barcode,
        batch_no: batchName 
    }));
    
    setOutboundAssignItems(prev => [...prev, ...newAssigns]);
    setSelectedTurnover([]);
    setBatchInputModal({ isOpen: false });
    setBatchTargetName('');
    
    setCurrentView('outbound');
    setActiveWarehouse('South Warehouse');
  };

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{marginTop: 0, marginBottom: 0}}>{t.turnoverTitle} (Total: {turnoverItems.length})</h2>
          {selectedTurnover.length > 0 && (
            <div style={{ display: 'flex', gap: '10px', background: '#fff3e0', padding: '8px 15px', borderRadius: '8px', border: '1px solid #ff9800' }}>
              <button className="btn btn-secondary" style={{padding: '8px 15px', fontSize: '14px'}} onClick={handleBulkReturnToInbound}>{t.btnReturnInbound} ({selectedTurnover.length})</button>
              <button className="btn btn-success" style={{padding: '8px 15px', fontSize: '14px', background: '#2e7d32'}} onClick={handleBulkReturnToOutbound}>{t.btnReturnOutbound} ({selectedTurnover.length})</button>
            </div>
          )}
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

      {/* 專屬 Turnover 的輸入批號 Modal，與全域 Modal 區分開來 */}
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
              autoFocus 
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