import React, { useState, useEffect, useMemo } from 'react';
import WarehouseMap from '../components/WarehouseMap';

export default function Inbound({
  t, lang, currentUser, shelves, turnoverItems, pendingItems, setPendingItems,
  outboundAssignItems, inboundTransferSelected, setInboundTransferSelected,
  activeWarehouse, setActiveWarehouse, activeZone, setActiveZone,
  showAlert, showConfirm, handleRequestRemovePending, handleAutoAssign,
  handleAddPendingInbound, handleShelfClickInbound, selectedPending, setSelectedPending,
  inboundDate, setInboundDate
}) {
  const [transferCategory, setTransferCategory] = useState('');
  const [transferQty, setTransferQty] = useState(1);
  const [autoAssignZone, setAutoAssignZone] = useState('');
  const [batchInput, setBatchInput] = useState('');

  useEffect(() => {
    if (shelves.length > 0) {
      const northZones = [...new Set(shelves.filter(s => s.warehouse === 'North Warehouse').map(s => s.zone))].sort();
      if (northZones.length > 0 && !northZones.includes(autoAssignZone)) setAutoAssignZone(northZones[0]);
    }
  }, [shelves, autoAssignZone]);

  // useMemo for FIFO category calculation
  const categoryCounts = useMemo(() => {
    const northOccupied = shelves.filter(s => s.warehouse === 'North Warehouse' && s.status === 'occupied' && s.product_barcode);
    const counts = {};
    northOccupied.forEach(s => {
      const prefix = s.product_barcode.split('-')[0];
      counts[prefix] = (counts[prefix] || 0) + 1;
    });
    return counts;
  }, [shelves]);

  const availableCategories = useMemo(() => Object.keys(categoryCounts).sort(), [categoryCounts]);

  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.includes(transferCategory)) {
      setTransferCategory(availableCategories[0]);
    }
  }, [shelves, availableCategories]);

  const handleSmartSelectForTurnover = () => {
    if (!transferCategory || transferQty < 1) return;
    const alreadySelectedIds = inboundTransferSelected.map(s => s.id);
    const candidates = shelves.filter(s =>
      s.warehouse === 'North Warehouse' && s.status === 'occupied' && s.product_barcode &&
      s.product_barcode.startsWith(transferCategory + '-') && !alreadySelectedIds.includes(s.id)
    ).sort((a, b) => {
      const da = a.batch_date ? new Date(a.batch_date) : new Date('9999-12-31');
      const db = b.batch_date ? new Date(b.batch_date) : new Date('9999-12-31');
      return da - db;
    });

    if (candidates.length === 0) return showAlert(t.msgInsufficientStock.replace('{n}', 0));
    const toSelect = candidates.slice(0, parseInt(transferQty, 10));
    if (toSelect.length < parseInt(transferQty, 10)) showAlert(t.msgInsufficientStock.replace('{n}', toSelect.length));
    setInboundTransferSelected(prev => [...prev, ...toSelect]);
    setTransferQty(1);
  };

  return (
    <div>
      {/* Date picker for inbound */}
      <div className="card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
          📅 {lang === 'zh' ? '入庫日期：' : 'Inbound date:'}
        </span>
        <input type="date" value={inboundDate} onChange={e => setInboundDate(e.target.value)}
          style={{ width: '160px', margin: 0, padding: '8px 12px', fontSize: '14px' }} />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {lang === 'zh' ? '（可修改補登歷史入庫）' : '(Editable for backdating)'}
        </span>
      </div>

      {/* FIFO Transfer */}
      <div className="card" style={{ border: '2px solid #9c27b0' }}>
        <h2 style={{ marginTop: 0, color: '#7b1fa2', fontSize: '17px' }}>{t.smartTransferTitle}</h2>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--bg-section-purple)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong style={{ fontSize: '13px' }}>{t.categoryStr}</strong>
            <select value={transferCategory} onChange={e => setTransferCategory(e.target.value)} style={{ width: '130px', margin: 0, fontSize: '14px', padding: '8px 10px' }}>
              {availableCategories.length === 0 && <option value="">N/A</option>}
              {availableCategories.map(cat => <option key={cat} value={cat}>{cat} ({categoryCounts[cat]})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong style={{ fontSize: '13px' }}>{t.qtyStr}</strong>
            <input type="number" min="1" value={transferQty} onChange={e => setTransferQty(e.target.value)} style={{ width: '80px', margin: 0, fontSize: '14px', padding: '8px 10px' }} />
          </div>
          <button className="btn btn-sm" style={{ background: '#9c27b0' }} onClick={handleSmartSelectForTurnover}>{t.btnSmartSelect}</button>
        </div>
      </div>

      {/* Transfer list */}
      {inboundTransferSelected.length > 0 && (
        <div className="card" style={{ border: '2px solid var(--warning)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ marginTop: 0, color: '#f57c00', fontSize: '16px' }}>{t.transferListTitle.replace('{n}', inboundTransferSelected.length)}</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setInboundTransferSelected([])}>{t.clearList}</button>
              <button className="btn btn-sm" style={{ background: 'var(--warning)' }} onClick={() => handleShelfClickInbound('transfer_all')}>{t.btnTransferTurnover}</button>
            </div>
          </div>
          <div className="pending-list" style={{ marginBottom: '10px' }}>
            {inboundTransferSelected.map((shelf, idx) => (
              <div key={idx} className="outbound-item" style={{ borderColor: 'var(--warning)', background: 'var(--bg-section-warm)' }}>
                <div className="outbound-content">
                  <div>📦 {shelf.product_barcode}</div><div className="outbound-loc">📍 {shelf.id}</div>
                </div>
                <div className="delete-btn" onClick={(e) => { e.stopPropagation(); setInboundTransferSelected(inboundTransferSelected.filter(p => p.id !== shelf.id)); }}>✖</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch input */}
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '16px' }}>{t.inStep1}</h2>
        <textarea rows="3" placeholder={t.inPlaceholder} value={batchInput} onChange={e => setBatchInput(e.target.value)} />
        <button className="btn btn-sm" onClick={() => { handleAddPendingInbound(batchInput); setBatchInput(''); }}>{t.addPending}</button>
      </div>

      {/* Pending list */}
      {pendingItems.length > 0 && (
        <div className="card" style={{ border: '2px solid var(--primary)' }}>
          <h2 style={{ marginTop: 0, fontSize: '16px' }}>{t.inStep2} ({t.pendingCount.replace('{n}', pendingItems.length)})</h2>
          <div style={{ background: 'var(--bg-section)', padding: '14px', borderRadius: 'var(--radius-md)', marginBottom: '14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '13px' }}>{t.autoAssignTitle}</strong>
            <select value={autoAssignZone} onChange={e => setAutoAssignZone(e.target.value)} style={{ width: '150px', margin: 0, fontSize: '14px', padding: '8px 10px' }}>
              {[...new Set(shelves.filter(s => s.warehouse === 'North Warehouse').map(s => s.zone))].sort().map(z =>
                <option key={z} value={z}>{z} {lang === 'zh' ? '區' : 'Zone'}</option>
              )}
            </select>
            <button className="btn btn-success btn-sm" onClick={() => handleAutoAssign(autoAssignZone)}>{t.autoAssignBtn}</button>
            <button className="btn btn-danger btn-sm" onClick={(e) => handleRequestRemovePending(e, null)}>{t.clearList}</button>
          </div>
          <div style={{ background: 'var(--bg-section)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
            <strong style={{ fontSize: '13px' }}>{t.manualAssignTitle}</strong> <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.manualAssignDesc}</span>
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

      <WarehouseMap t={t} lang={lang} currentView="inbound" shelves={shelves}
        activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse}
        activeZone={activeZone} setActiveZone={setActiveZone}
        selectedPending={selectedPending} inboundTransferSelected={inboundTransferSelected}
        onShelfClick={handleShelfClickInbound} />
    </div>
  );
}
