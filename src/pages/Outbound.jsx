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
  const [customerName, setCustomerName] = useState('');
  const [customers, setCustomers] = useState([]);
  const [showShipModal, setShowShipModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Force South Warehouse
  useEffect(() => { setActiveWarehouse('South Warehouse'); }, []);

  useEffect(() => {
    const southZones = [...new Set(shelves.filter(s => s.warehouse === 'South Warehouse').map(s => s.zone))].sort();
    if (southZones.length > 0 && !southZones.includes(autoAssignZoneOutbound)) setAutoAssignZoneOutbound(southZones[0]);
  }, [shelves, autoAssignZoneOutbound]);

  useEffect(() => {
    import('../config/supabaseClient').then(({ supabase }) => {
      supabase.from('customers').select('name').order('name').then(({ data }) => {
        if (data) setCustomers(data.map(c => c.name));
      });
    });
  }, []);

  const handleShipClick = () => {
    if (outboundPending.length === 0) return;
    setCustomerName('');
    setShowShipModal(true);
  };

  const handleConfirmShip = async () => {
    if (!customerName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setShowShipModal(false);
    await handlePickAllFound(customerName.trim());
    setIsSubmitting(false);
  };

  const row = (label, value) => (
    <div style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--dk-text-3)', minWidth: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--dk-text)', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );

  return (
    <div>
      {/* Ship confirm modal */}
      {showShipModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 420 }}>
            <h3>{lang === 'zh' ? '確認出貨' : 'Confirm Shipment'}</h3>
            <div style={{ margin: '12px 0 16px', padding: '10px 14px', background: 'var(--bg-section)', borderRadius: 8 }}>
              {row(lang === 'zh' ? '數量' : 'Items', `${outboundPending.length} ${lang === 'zh' ? '件' : 'items'}`)}
              {outboundPending.slice(0, 3).map((s, i) => (
                row(`${lang === 'zh' ? '批號' : 'Batch'} ${i + 1}`, s.batch_no || s.product_barcode)
              ))}
              {outboundPending.length > 3 && (
                <div style={{ fontSize: 11, color: 'var(--dk-text-3)', paddingTop: 6 }}>
                  +{outboundPending.length - 3} {lang === 'zh' ? '件...' : 'more...'}
                </div>
              )}
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--dk-text-2)', display: 'block', marginBottom: 6 }}>
              {lang === 'zh' ? '客戶名稱 *' : 'Customer *'}
            </label>
            {customers.length > 0 ? (
              <select value={customerName} onChange={e => setCustomerName(e.target.value)} style={{ marginBottom: 10 }}>
                <option value="">{lang === 'zh' ? '選擇客戶...' : 'Select customer...'}</option>
                {customers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                placeholder={lang === 'zh' ? '輸入客戶名稱...' : 'Enter customer name...'}
                autoFocus style={{ marginBottom: 10 }} />
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowShipModal(false)}>{t.btnCancel}</button>
              <button className="btn btn-danger" disabled={!customerName.trim() || isSubmitting} onClick={handleConfirmShip}>
                {lang === 'zh' ? '確認出貨' : 'Confirm Ship'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finished goods to place */}
      {outboundAssignItems.length > 0 && (
        <div className="card" style={{ border: '1px solid var(--dk-success)', marginBottom: 14 }}>
          <div className="card-header">
            <span className="card-title" style={{ color: 'var(--dk-success)' }}>
              {t.outboundAssignTitle.replace('{n}', outboundAssignItems.length)}
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--dk-text-2)', margin: '0 0 12px' }}>{t.outboundAssignDesc}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <select value={autoAssignZoneOutbound} onChange={e => setAutoAssignZoneOutbound(e.target.value)} style={{ width: 140, margin: 0 }}>
              {[...new Set(shelves.filter(s => s.warehouse === 'South Warehouse').map(s => s.zone))].sort().map(z =>
                <option key={z} value={z}>{z} {lang === 'zh' ? '區' : 'Zone'}</option>
              )}
            </select>
            <button className="btn btn-success btn-sm" onClick={() => handleAutoAssignOutbound(autoAssignZoneOutbound)}>{t.autoAssignBtn}</button>
            <button className="btn btn-ghost btn-sm" onClick={e => handleRequestRemoveOutboundAssign(e, null)}>{t.clearList}</button>
          </div>
          <div className="pending-list">
            {outboundAssignItems.map(item => (
              <div key={item.id} className={`pending-item ${selectedOutboundAssign === item.id ? 'selected' : ''}`}
                onClick={() => setSelectedOutboundAssign(item.id)}>
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.batch_no}</span>
                <span style={{ opacity: .6, fontSize: 10 }}>{item.barcode}</span>
                <div className="delete-btn" onClick={e => handleRequestRemoveOutboundAssign(e, item)}>x</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pick input */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header"><span className="card-title">{t.outStep1}</span></div>
        <textarea rows="3" placeholder={t.outPlaceholder} value={outboundInput} onChange={e => setOutboundInput(e.target.value)} style={{ marginTop: 10 }} />
        <button className="btn btn-primary btn-sm" onClick={() => { handleAddOutboundList(outboundInput); setOutboundInput(''); }}>
          {lang === 'zh' ? '加入清單' : 'Add to List'}
        </button>
      </div>

      {/* Not found */}
      {outboundNotFound.length > 0 && (
        <div className="card" style={{ border: '1px solid var(--dk-danger)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="card-title" style={{ color: 'var(--dk-danger)' }}>
              {t.outNotFound.replace('{n}', outboundNotFound.length)}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setOutboundNotFound([])}>{t.clearList}</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {outboundNotFound.map((bc, i) => (
              <div key={i} className="outbound-not-found">
                {bc}
                <div className="delete-btn" style={{ marginLeft: 6 }} onClick={() => setOutboundNotFound(p => p.filter((_, j) => j !== i))}>x</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending shipment list */}
      {outboundPending.length > 0 && (
        <div className="card" style={{ border: '1px solid #fca5a5', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="card-title" style={{ color: '#dc2626' }}>
              {t.outStep2.replace('{n}', outboundPending.length)}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setOutboundPending([])}>{t.clearList}</button>
              <button className="btn btn-danger btn-sm" disabled={isSubmitting} onClick={handleShipClick}>{isSubmitting ? "..." : t.btnShipAll}</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {outboundPending.map((shelf, idx) => (
              <div key={shelf.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                background: '#fff5f5',
                border: '1px solid #fca5a5',
                borderLeft: '3px solid #dc2626',
                borderRadius: 6,
              }}>
                {/* 序號 */}
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: '#dc2626', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>{idx + 1}</div>

                {/* 內容 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#7f1d1d' }}>
                    {shelf.batch_no || shelf.product_barcode}
                  </div>
                  <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2, fontWeight: 500 }}>
                    {shelf.id} — {shelf.zone}
                  </div>
                  {shelf.product_barcode && shelf.batch_no && (
                    <div style={{ fontSize: 10, color: '#dc2626', marginTop: 1, opacity: 0.7 }}>
                      {shelf.product_barcode}
                    </div>
                  )}
                </div>

                {/* 刪除 */}
                <div onClick={() => setOutboundPending(p => p.filter(x => x.id !== shelf.id))}
                  style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#fee2e2', color: '#dc2626', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700, transition: 'background .1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background='#dc2626' || (e.currentTarget.style.color='#fff')}
                  onMouseLeave={e => e.currentTarget.style.background='#fee2e2' || (e.currentTarget.style.color='#dc2626')}
                >×</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <WarehouseMap t={t} lang={lang} currentView="outbound" shelves={shelves}
        activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse}
        activeZone={activeZone} setActiveZone={setActiveZone}
        outboundPending={outboundPending} selectedOutboundAssign={selectedOutboundAssign}
        onShelfClick={handleShelfClickOutbound} />
    </div>
  );
}
