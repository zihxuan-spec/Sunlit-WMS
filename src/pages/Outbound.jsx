import React, { useState, useEffect } from 'react';
import WarehouseMap from '../components/WarehouseMap';

export default function Outbound({ 
  t, lang, shelves, outboundAssignItems, outboundPending, setOutboundPending,
  outboundNotFound, setOutboundNotFound, activeWarehouse, setActiveWarehouse, activeZone, setActiveZone,
  selectedOutboundAssign, setSelectedOutboundAssign, handleAutoAssignOutbound, handleRequestRemoveOutboundAssign,
  handleAddOutboundList, handleShelfClickOutbound, handlePickAllFound
}) {
  const [autoAssignZoneOutbound, setAutoAssignZoneOutbound] = useState('');
  const [outboundInput, setOutboundInput] = useState('');

  useEffect(() => {
    const southZones = Array.from(new Set(shelves.filter(s => s.warehouse === 'South Warehouse').map(s => s.zone))).sort();
    if (southZones.length > 0 && !southZones.includes(autoAssignZoneOutbound)) setAutoAssignZoneOutbound(southZones[0]);
  }, [shelves, autoAssignZoneOutbound]);

  return (
    <div>
      {outboundAssignItems.length > 0 && (
        <div className="card" style={{ border: '2px solid #4caf50' }}>
          <h2 style={{ color: '#2e7d32' }}>成品入庫指派 ({outboundAssignItems.length})</h2>
          <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '8px', marginBottom: '15px', display: 'flex', gap: '10px' }}>
            <select value={autoAssignZoneOutbound} onChange={e => setAutoAssignZoneOutbound(e.target.value)}>
              {Array.from(new Set(shelves.filter(s => s.warehouse === 'South Warehouse').map(s => s.zone))).sort().map(z => <option key={z} value={z}>{z} 區</option>)}
            </select>
            <button className="btn btn-success" onClick={() => handleAutoAssignOutbound(autoAssignZoneOutbound)}>自動指派</button>
            <button className="btn btn-danger" onClick={(e) => handleRequestRemoveOutboundAssign(e, null)}>清空</button>
          </div>
          <div className="pending-list">
            {outboundAssignItems.map((item) => (
              <div key={item.id} className={`pending-item ${selectedOutboundAssign === item.id ? 'selected' : ''}`} onClick={() => setSelectedOutboundAssign(item.id)}>
                📦 {item.batch_no} <small>(UID: {item.barcode})</small>
                <div className="delete-btn" onClick={(e) => handleRequestRemoveOutboundAssign(e, item)}>✖</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card">
        <h2>輸入批號出貨</h2>
        <textarea rows="3" placeholder="輸入批號..." value={outboundInput} onChange={e => setOutboundInput(e.target.value)}></textarea>
        <button className="btn btn-danger" onClick={() => { handleAddOutboundList(outboundInput); setOutboundInput(''); }}>加入清單</button>
      </div>
      <WarehouseMap 
        t={t} lang={lang} currentView="outbound" shelves={shelves} activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse}
        activeZone={activeZone} setActiveZone={setActiveZone} outboundPending={outboundPending} selectedOutboundAssign={selectedOutboundAssign}
        onShelfClick={handleShelfClickOutbound}
      />
    </div>
  );
}
