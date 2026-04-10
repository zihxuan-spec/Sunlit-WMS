import React, { useState, useEffect, useMemo } from 'react';
import WarehouseMap from '../components/WarehouseMap';

export default function Inbound({
  t, lang, currentUser, shelves, shelvesLoading,
  turnoverItems, pendingItems, selectedPending, setSelectedPending,
  outboundAssignItems, inboundTransferSelected, setInboundTransferSelected,
  activeWarehouse, setActiveWarehouse, activeZone, setActiveZone,
  showAlert, showConfirm, handleRequestRemovePending, handleAutoAssign,
  handleAddPendingInbound, handleShelfClickInbound,
  inboundDate, setInboundDate
}) {
  const [transferCategory, setTransferCategory] = useState('');
  const [transferQty, setTransferQty] = useState(1);
  const [autoAssignZone, setAutoAssignZone] = useState('');
  const [batchInput, setBatchInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (shelves.length > 0) {
      const northZones = [...new Set(shelves.filter(s => s.warehouse === 'North Warehouse').map(s => s.zone))].sort();
      if (northZones.length > 0 && !northZones.includes(autoAssignZone)) setAutoAssignZone(northZones[0]);
    }
  }, [shelves, autoAssignZone]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    shelves.filter(s => s.warehouse === 'North Warehouse' && s.status === 'occupied' && s.product_barcode).forEach(s => {
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
  }, [availableCategories]);

  const handleSmartSelect = () => {
    if (!transferCategory || transferQty < 1) return;
    const alreadySelectedIds = inboundTransferSelected.map(s => s.id);
    const candidates = shelves.filter(s =>
      s.warehouse === 'North Warehouse' && s.status === 'occupied' &&
      s.product_barcode?.startsWith(transferCategory + '-') && !alreadySelectedIds.includes(s.id)
    ).sort((a, b) => {
      const da = a.batch_date ? new Date(a.batch_date) : new Date('9999');
      const db = b.batch_date ? new Date(b.batch_date) : new Date('9999');
      return da - db;
    });
    if (!candidates.length) return showAlert(t.msgInsufficientStock.replace('{n}', 0));
    const toSelect = candidates.slice(0, parseInt(transferQty, 10));
    if (toSelect.length < parseInt(transferQty, 10)) showAlert(t.msgInsufficientStock.replace('{n}', toSelect.length));
    setInboundTransferSelected(prev => [...prev, ...toSelect]);
    setTransferQty(1);
  };

  const pendingBarcodes = pendingItems.map(p => p.barcode);

  const withSubmit = async (fn) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try { await fn(); } finally { setIsSubmitting(false); }
  };

  return (
    <div>
      {/* Date picker */}
      <div className="card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dk-text-2)' }}>{lang === 'zh' ? '入庫日期' : 'Inbound date'}</span>
        <input type="date" value={inboundDate} onChange={e => setInboundDate(e.target.value)} style={{ width: 160, margin: 0, padding: '7px 12px', fontSize: 13 }} />
        <span style={{ fontSize: 11, color: 'var(--dk-text-3)' }}>{lang === 'zh' ? '可修改補登歷史入庫' : 'Editable for backdating'}</span>
      </div>

      {/* FIFO Transfer */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">{t.smartTransferTitle}</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <select value={transferCategory} onChange={e => setTransferCategory(e.target.value)} style={{ width: 140, margin: 0 }}>
            {availableCategories.length === 0 && <option value="">—</option>}
            {availableCategories.map(cat => <option key={cat} value={cat}>{cat} ({categoryCounts[cat]})</option>)}
          </select>
          <input type="number" min="1" value={transferQty} onChange={e => setTransferQty(e.target.value)} style={{ width: 80, margin: 0 }} />
          <button className="btn btn-primary btn-sm" onClick={handleSmartSelect}>{t.btnSmartSelect}</button>
        </div>
      </div>

      {/* Selected for Transfer */}
      {inboundTransferSelected.length > 0 && (
        <div className="card" style={{ border: '1px solid var(--dk-warn)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title" style={{ color: '#f59e0b' }}>{t.transferListTitle.replace('{n}', inboundTransferSelected.length)}</span>
            <button className="btn btn-warning btn-sm" disabled={isSubmitting}
              onClick={() => withSubmit(() => handleShelfClickInbound('transfer_all'))}>
              {isSubmitting ? '...' : t.btnTransferTurnover}
            </button>
          </div>
          <div className="pending-list" style={{ marginTop: 10 }}>
            {inboundTransferSelected.map((shelf, idx) => (
              <div key={idx} className="outbound-item" style={{ borderColor: 'var(--dk-warn)' }}>
                <div className="outbound-content">
                  <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{shelf.product_barcode}</div>
                  <div className="outbound-loc">{shelf.id}</div>
                </div>
                <div className="delete-btn" onClick={() => setInboundTransferSelected(p => p.filter(x => x.id !== shelf.id))}>x</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch input */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">{t.inStep1}</span></div>
        <textarea rows="3" placeholder={t.inPlaceholder} value={batchInput} onChange={e => setBatchInput(e.target.value)} style={{ marginTop: 10 }} />
        <button className="btn btn-primary btn-sm" disabled={isSubmitting || !batchInput.trim()}
          onClick={() => withSubmit(async () => { await handleAddPendingInbound(batchInput); setBatchInput(''); })}>
          {isSubmitting ? '...' : t.addPending}
        </button>
      </div>

      {/* Pending list */}
      {pendingItems.length > 0 && (
        <div className="card" style={{ border: '1px solid var(--dk-accent)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="card-title" style={{ color: 'var(--dk-accent)' }}>{t.inStep2} ({t.pendingCount.replace('{n}', pendingItems.length)})</span>
          </div>
          <div style={{ background: 'var(--bg-section)', padding: 12, borderRadius: 8, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dk-text-2)' }}>{t.autoAssignTitle}</span>
            <select value={autoAssignZone} onChange={e => setAutoAssignZone(e.target.value)} style={{ width: 150, margin: 0 }}>
              {[...new Set(shelves.filter(s => s.warehouse === 'North Warehouse').map(s => s.zone))].sort().map(z =>
                <option key={z} value={z}>{z} {lang === 'zh' ? '區' : 'Zone'}</option>
              )}
            </select>
            <button className="btn btn-success btn-sm" disabled={isSubmitting}
              onClick={() => withSubmit(() => handleAutoAssign(autoAssignZone))}>
              {isSubmitting ? '...' : t.autoAssignBtn}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={e => handleRequestRemovePending(e, null)}>{t.clearList}</button>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dk-text-2)', marginBottom: 8 }}>{t.manualAssignTitle} <span style={{ fontSize: 11, color: 'var(--dk-text-3)', fontWeight: 400 }}>{t.manualAssignDesc}</span></div>
          <div className="pending-list">
            {pendingItems.map((item) => (
              <div key={item.id || item.barcode} className={`pending-item ${selectedPending === item.barcode ? 'selected' : ''}`}
                onClick={() => setSelectedPending(item.barcode)}>
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.barcode}</span>
                <div className="delete-btn" onClick={e => handleRequestRemovePending(e, item.barcode)}>x</div>
              </div>
            ))}
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
