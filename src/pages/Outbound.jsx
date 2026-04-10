import React, { useState, useEffect } from 'react';
import WarehouseMap from '../components/WarehouseMap';

export default function Outbound({
 t, lang, shelves,
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
 const southZones = Array.from(new Set(shelves.filter(s => s.warehouse === 'South Warehouse').map(s => s.zone))).sort();
 if (southZones.length > 0 && !southZones.includes(autoAssignZoneOutbound)) setAutoAssignZoneOutbound(southZones[0]);
 }, [shelves, autoAssignZoneOutbound]);

 return (
 <div>
 {/* ── Section 1: Finished goods pending placement into South WH ── */}
 {outboundAssignItems.length > 0 && (
 <div className="card" style={{ border: '2px solid #4caf50' }}>
 <h2 style={{ color: '#2e7d32', marginTop: 0 }}>
 {t.outboundAssignTitle.replace('{n}', outboundAssignItems.length)}
 </h2>
 <p style={{ color: 'var(--dk-text-2)', fontSize: '14px', marginBottom: '12px' }}>{t.outboundAssignDesc}</p>
 <div style={{ background: '#e8f5e9', padding: '12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
 <select value={autoAssignZoneOutbound} onChange={e => setAutoAssignZoneOutbound(e.target.value)} style={{ width: '140px', margin: 0 }}>
 {Array.from(new Set(shelves.filter(s => s.warehouse === 'South Warehouse').map(s => s.zone))).sort().map(z =>
 <option key={z} value={z}>{z} {lang === 'zh' ? '區' : 'Zone'}</option>
 )}
 </select>
 <button className="btn btn-success" onClick={() => handleAutoAssignOutbound(autoAssignZoneOutbound)}>{t.autoAssignBtn}</button>
 <button className="btn btn-danger" onClick={(e) => handleRequestRemoveOutboundAssign(e, null)}>{t.clearList}</button>
 </div>
 <div className="pending-list">
 {outboundAssignItems.map((item) => (
 <div key={item.id} className={`pending-item ${selectedOutboundAssign === item.id ? 'selected' : ''}`} onClick={() => setSelectedOutboundAssign(item.id)}>
 {item.batch_no} <small style={{ opacity: 0.7 }}>(UID: {item.barcode})</small>
 <div className="delete-btn" onClick={(e) => handleRequestRemoveOutboundAssign(e, item)}></div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* ── Section 2: Pick items for shipment ── */}
 <div className="card">
 <h2 style={{ marginTop: 0 }}>{t.outStep1}</h2>
 <textarea
 rows="3"
 placeholder={t.outPlaceholder}
 value={outboundInput}
 onChange={e => setOutboundInput(e.target.value)}
 />
 <button className="btn" onClick={() => { handleAddOutboundList(outboundInput); setOutboundInput(''); }}>
 {lang === 'zh' ? '加入清單' : 'Add to List'}
 </button>
 </div>

 {/* ── Section 3: Not-found barcodes ── */}
 {outboundNotFound.length > 0 && (
 <div className="card" style={{ border: '2px solid #f44336' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <h2 style={{ color: '#c62828', marginTop: 0 }}>
 {t.outNotFound.replace('{n}', outboundNotFound.length)}
 </h2>
 <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}
 onClick={() => setOutboundNotFound([])}>
 {t.clearList}
 </button>
 </div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
 {outboundNotFound.map((bc, i) => (
 <div key={i} className="outbound-not-found">
 {bc}
 <div className="delete-btn" style={{ marginLeft: '6px' }}
 onClick={() => setOutboundNotFound(prev => prev.filter((_, j) => j !== i))}></div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* ── Section 4: Pending shipment list + Ship button ── */}
 {outboundPending.length > 0 && (
 <div className="card" style={{ border: '2px solid #e53935' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
 <h2 style={{ color: '#c62828', marginTop: 0 }}>
 {t.outStep2.replace('{n}', outboundPending.length)}
 </h2>
 <div style={{ display: 'flex', gap: '10px' }}>
 <button className="btn btn-secondary" style={{ padding: '8px 14px' }}
 onClick={() => setOutboundPending([])}>
 {t.clearList}
 </button>
 <button className="btn btn-danger" style={{ padding: '8px 18px', background: '#c62828' }}
 onClick={handlePickAllFound}>
 {t.btnShipAll}
 </button>
 </div>
 </div>
 <div className="pending-list">
 {outboundPending.map((shelf, idx) => (
 <div key={shelf.id} className="outbound-item" style={{ position: 'relative' }}>
 <div className="route-badge">{idx + 1}</div>
 <div className="outbound-content">
 <div> {shelf.batch_no || shelf.product_barcode}</div>
 <div className="outbound-loc"> {shelf.id} — {shelf.zone}</div>
 {shelf.product_barcode && shelf.batch_no && (
 <div style={{ fontSize: '11px', color: 'var(--dk-text-2)', marginTop: '2px' }}>UID: {shelf.product_barcode}</div>
 )}
 </div>
 <div className="delete-btn"
 onClick={() => setOutboundPending(prev => prev.filter(p => p.id !== shelf.id))}></div>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* ── Section 5: Map ── */}
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
