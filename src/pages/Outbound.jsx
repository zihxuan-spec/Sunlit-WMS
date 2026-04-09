import React, { useState, useEffect } from 'react';
import WarehouseMap from '../components/WarehouseMap';

export default function Outbound({ 
  t, lang, currentUser, shelves, 
  outboundAssignItems, outboundPending, setOutboundPending,
  outboundNotFound, setOutboundNotFound,
  activeWarehouse, setActiveWarehouse, activeZone, setActiveZone,
  selectedOutboundAssign, setSelectedOutboundAssign,
  handleAutoAssignOutbound, handleRequestRemoveOutboundAssign,
  handleAddOutboundList, handleShelfClickOutbound, handlePickAllFound
}) {
  const [autoAssignZoneOutbound, setAutoAssignZoneOutbound] = useState('');
  const [outboundInput, setOutboundInput] = useState('');

  useEffect(() => {
    if (shelves.length > 0) {
      const southZones = Array.from(new Set(shelves.filter(s => s.warehouse === 'South Warehouse').map(s => s.zone))).sort();
      if (southZones.length > 0 && !southZones.includes(autoAssignZoneOutbound)) setAutoAssignZoneOutbound(southZones[0]);
    }
  }, [shelves, autoAssignZoneOutbound]);

  const removeNotFoundItem = (e, bc) => {
    e.stopPropagation();
    setOutboundNotFound(outboundNotFound.filter(item => item !== bc));
  };

  return (
    <div>
      {/* 成品放置指派 */}
      {outboundAssignItems.length > 0 && (
        <div className="card" style={{ border: '2px solid #4caf50' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>
            <h2 style={{marginTop: 0, marginBottom: 0, color: '#2e7d32'}}>{t.outboundAssignTitle.replace('{n}', outboundAssignItems.length)}</h2>
          </div>
          <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '8px', marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>{t.autoAssignTitle}</strong>
            <select value={autoAssignZoneOutbound} onChange={e => setAutoAssignZoneOutbound(e.target.value)} style={{width: '150px', margin: 0, maxWidth: '100%'}}>
              {Array.from(new Set(shelves.filter(s => s.warehouse === 'South Warehouse').map(s => s.zone))).sort().map(z => <option key={z} value={z}>{z} {lang==='zh'?'區':'Zone'}</option>)}
            </select>
            <button className="btn btn-success" onClick={() => handleAutoAssignOutbound(autoAssignZoneOutbound)}>{t.autoAssignBtn}</button>
            <button className="btn btn-danger" onClick={(e) => handleRequestRemoveOutboundAssign(e, null)}>{t.clearList}</button>
          </div>
          <div style={{ background: '#f5f5f7', padding: '15px', borderRadius: '8px' }}>
            <strong>{t.manualAssignTitle}</strong> {t.outboundAssignDesc}
            <div className="pending-list">
              {outboundAssignItems.map((itemObj) => (
                <div key={itemObj.id} className={`pending-item ${selectedOutboundAssign === itemObj.id ? 'selected' : ''}`} onClick={() => setSelectedOutboundAssign(itemObj.id)}>
                  <div>📦 {itemObj.batch_no} <span style={{fontSize: '11px', color: '#666'}}>(UID: {itemObj.barcode})</span></div>
                  <div className="delete-btn" onClick={(e) => handleRequestRemoveOutboundAssign(e, itemObj)}>✖</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 輸入批號準備出貨 */}
      <div className="card">
        <h2 style={{marginTop: 0}}>{t.outStep1}</h2>
        <textarea rows="3" placeholder={t.outPlaceholder} value={outboundInput} onChange={e => setOutboundInput(e.target.value)}></textarea>
        <button className="btn btn-danger" onClick={() => { handleAddOutboundList(outboundInput); setOutboundInput(''); }}>{t.addPending}</button>
      </div>

      {/* 待出貨清單 */}
      {(outboundPending.length > 0 || outboundNotFound.length > 0) && (
        <div className="card" style={{ border: '2px solid #e53935' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{marginTop: 0, color: '#d32f2f'}}>{t.outStep2.replace('{n}', outboundPending.length)}</h2>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => setOutboundPending([])}>{t.clearList}</button>
              {outboundPending.length > 0 && <button className="btn btn-danger" onClick={handlePickAllFound}>{t.btnShipAll}</button>}
            </div>
          </div>
          {outboundPending.length > 0 && (
            <div className="pending-list" style={{marginBottom: '15px'}}>
              {outboundPending.map((shelf, idx) => (
                <div key={idx} className="outbound-item">
                  <div className="outbound-content">
                    <div style={{color: '#e53935', fontSize: '12px', marginBottom: '2px'}}>📍 Route Step: {idx + 1}</div>
                    <div>📦 {shelf.batch_no || shelf.product_barcode}</div>
                    <div className="outbound-loc">📍 {shelf.warehouse} - {shelf.id} {shelf.batch_date ? `(📅 ${shelf.batch_date})` : ''}</div>
                  </div>
                  <div className="delete-btn" onClick={(e) => { e.stopPropagation(); setOutboundPending(outboundPending.filter(p => p.id !== shelf.id)); }}>✖</div>
                </div>
              ))}
            </div>
          )}
          {outboundNotFound.length > 0 && (
            <div>
              <h3 style={{color: '#d32f2f', margin: '15px 0 5px 0'}}>{t.outNotFound.replace('{n}', outboundNotFound.length)}</h3>
              <div className="pending-list" style={{marginBottom: '10px'}}>
                {outboundNotFound.map((bc, idx) => (
                  <div key={idx} className="outbound-item outbound-not-found">📦 {bc}
                    <div className="delete-btn" onClick={(e) => removeNotFoundItem(e, bc)}>✖</div>
                  </div>
                ))}
              </div>
              <button className="btn btn-outline" style={{padding: '5px 10px', fontSize: '14px'}} onClick={() => setOutboundNotFound([])}>{t.clearNotFound}</button>
            </div>
          )}
        </div>
      )}

      <WarehouseMap 
        t={t} lang={lang} currentView="outbound" shelves={shelves}
        activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse}
        activeZone={activeZone} setActiveZone={setActiveZone}
        outboundPending={outboundPending} selectedOutboundAssign={selectedOutboundAssign}
        onShelfClick={handleShelfClickOutbound}
      />
    </div>
  );
}