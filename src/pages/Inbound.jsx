import React, { useState, useEffect } from 'react';
import WarehouseMap from '../components/WarehouseMap';

export default function Inbound({ 
  t, lang, currentUser, shelves, turnoverItems, pendingItems, setPendingItems,
  outboundAssignItems, inboundTransferSelected, setInboundTransferSelected,
  activeWarehouse, setActiveWarehouse, activeZone, setActiveZone,
  showAlert, showConfirm, handleRequestRemovePending, handleAutoAssign,
  handleAddPendingInbound, handleShelfClickInbound, selectedPending, setSelectedPending
}) {
  const [transferCategory, setTransferCategory] = useState('');
  const [transferQty, setTransferQty] = useState(1);
  const [autoAssignZone, setAutoAssignZone] = useState('');
  const [batchInput, setBatchInput] = useState('');

  // 當區塊變更時確保 autoAssignZone 有值
  useEffect(() => {
    if (shelves.length > 0) {
      const northZones = Array.from(new Set(shelves.filter(s => s.warehouse === 'North Warehouse').map(s => s.zone))).sort();
      if (northZones.length > 0 && !northZones.includes(autoAssignZone)) setAutoAssignZone(northZones[0]);
    }
  }, [shelves, autoAssignZone]);

  // 計算庫存類別
  const getAvailableCategories = () => {
    const northOccupied = shelves.filter(s => s.warehouse === 'North Warehouse' && s.status === 'occupied' && s.product_barcode);
    const counts = {};
    northOccupied.forEach(s => {
        const prefix = s.product_barcode.split('-')[0];
        counts[prefix] = (counts[prefix] || 0) + 1;
    });
    return counts;
  };

  const categoryCounts = getAvailableCategories();
  const availableCategories = Object.keys(categoryCounts).sort();

  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.includes(transferCategory)) {
        setTransferCategory(availableCategories[0]);
    }
  }, [shelves, transferCategory, availableCategories]);

  const handleSmartSelectForTurnover = () => {
    if (!transferCategory || transferQty < 1) return;
    const alreadySelectedIds = inboundTransferSelected.map(s => s.id);
    const candidates = shelves.filter(s =>
        s.warehouse === 'North Warehouse' && s.status === 'occupied' && s.product_barcode &&
        s.product_barcode.startsWith(transferCategory + '-') && !alreadySelectedIds.includes(s.id)
    );

    if (candidates.length === 0) return showAlert(`目前北邊倉庫沒有可用的 ${transferCategory} 了！`);

    candidates.sort((a, b) => {
        const dateA = a.batch_date ? new Date(a.batch_date) : new Date('9999-12-31');
        const dateB = b.batch_date ? new Date(b.batch_date) : new Date('9999-12-31');
        return dateA - dateB;
    });

    const toSelect = candidates.slice(0, parseInt(transferQty, 10));
    if (toSelect.length < parseInt(transferQty, 10)) {
        showAlert(t.msgInsufficientStock.replace('{n}', toSelect.length));
    }

    setInboundTransferSelected(prev => [...prev, ...toSelect]);
    setTransferQty(1); 
  };

  return (
    <div>
      {/* 智能先進先出備料 */}
      <div className="card" style={{ border: '2px solid #9c27b0' }}>
         <h2 style={{marginTop: 0, color: '#7b1fa2'}}>{t.smartTransferTitle}</h2>
         <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', background: '#f3e5f5', padding: '15px', borderRadius: '8px' }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
               <strong>{t.categoryStr}</strong>
               <select value={transferCategory} onChange={e => setTransferCategory(e.target.value)} style={{width: '120px', margin: 0}}>
                  {availableCategories.length === 0 && <option value="">N/A</option>}
                  {availableCategories.map(cat => <option key={cat} value={cat}>{cat} ({categoryCounts[cat]})</option>)}
               </select>
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
               <strong>{t.qtyStr}</strong>
               <input type="number" min="1" value={transferQty} onChange={e => setTransferQty(e.target.value)} style={{width: '80px', margin: 0}} />
            </div>
            <button className="btn" style={{background: '#9c27b0'}} onClick={handleSmartSelectForTurnover}>{t.btnSmartSelect}</button>
         </div>
      </div>

      {/* 準備移入週轉倉清單 */}
      {inboundTransferSelected.length > 0 && (
        <div className="card" style={{ border: '2px solid #ff9800' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{marginTop: 0, color: '#f57c00'}}>{t.transferListTitle.replace('{n}', inboundTransferSelected.length)}</h2>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => setInboundTransferSelected([])}>{t.clearList}</button>
              <button className="btn btn-danger" style={{background: '#ff9800'}} onClick={() => handleShelfClickInbound('transfer_all')}>{t.btnTransferTurnover}</button>
            </div>
          </div>
          <div className="pending-list" style={{marginBottom: '15px'}}>
            {inboundTransferSelected.map((shelf, idx) => (
              <div key={idx} className="outbound-item" style={{borderColor: '#ff9800', background: '#fff3e0'}}>
                <div className="outbound-content">
                  <div>📦 {shelf.product_barcode}</div><div className="outbound-loc">📍 {shelf.id}</div>
                </div>
                <div className="delete-btn" onClick={(e) => { e.stopPropagation(); setInboundTransferSelected(inboundTransferSelected.filter(p => p.id !== shelf.id)); }}>✖</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 批次輸入框 */}
      <div className="card">
        <h2 style={{marginTop: 0}}>{t.inStep1}</h2>
        <textarea rows="3" placeholder={t.inPlaceholder} value={batchInput} onChange={e => setBatchInput(e.target.value)}></textarea>
        <button className="btn" onClick={() => { handleAddPendingInbound(batchInput); setBatchInput(''); }}>{t.addPending}</button>
      </div>

      {/* 待上架清單 */}
      {pendingItems.length > 0 && (
        <div className="card" style={{ border: '2px solid #0071e3' }}>
          <h2 style={{marginTop: 0}}>{t.inStep2} ({t.pendingCount.replace('{n}', pendingItems.length)})</h2>
          <div style={{ background: '#f5f5f7', padding: '15px', borderRadius: '8px', marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>{t.autoAssignTitle}</strong>
            <select value={autoAssignZone} onChange={e => setAutoAssignZone(e.target.value)} style={{width: '150px', margin: 0, maxWidth: '100%'}}>
              {Array.from(new Set(shelves.filter(s => s.warehouse === 'North Warehouse').map(s => s.zone))).sort().map(z => <option key={z} value={z}>{z} {lang==='zh'?'區':'Zone'}</option>)}
            </select>
            <button className="btn btn-success" onClick={() => handleAutoAssign(autoAssignZone)}>{t.autoAssignBtn}</button>
            <button className="btn btn-danger" onClick={(e) => handleRequestRemovePending(e, null)}>{t.clearList}</button>
          </div>
          <div style={{ background: '#f5f5f7', padding: '15px', borderRadius: '8px' }}>
            <strong>{t.manualAssignTitle}</strong> {t.manualAssignDesc}
            <div className="pending-list">
              {pendingItems.map((item, idx) => (
                <div key={idx} className={`pending-item ${selectedPending === item ? 'selected' : ''}`} onClick={() => setSelectedPending(item)}>
                  📦 {item}
                  <div className="delete-btn" onClick={(e) => handleRequestRemovePending(e, item)}>✖</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <WarehouseMap 
        t={t} lang={lang} currentView="inbound" shelves={shelves}
        activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse}
        activeZone={activeZone} setActiveZone={setActiveZone}
        selectedPending={selectedPending} inboundTransferSelected={inboundTransferSelected}
        onShelfClick={handleShelfClickInbound}
      />
    </div>
  );
}