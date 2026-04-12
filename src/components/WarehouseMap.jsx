import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function WarehouseMap({
  t, lang, currentView, shelves,
  activeWarehouse, setActiveWarehouse, activeZone, setActiveZone,
  selectedPending, outboundPending = [], selectedOutboundAssign,
  inboundTransferSelected = [], onShelfClick, mapZoom: externalZoom, setMapZoom: externalSetZoom
}) {
  const [localZoom, setLocalZoom] = useState(1);
  const [historyModal, setHistoryModal] = useState({ isOpen: false, shelfId: '', data: [] });

  const zoom = externalZoom ?? localZoom;
  const setZoom = externalSetZoom ?? setLocalZoom;

  const whShelves = shelves.filter(s => s.warehouse === activeWarehouse);
  const zones = [...new Set(whShelves.map(s => s.zone))].sort();
  const filteredShelves = whShelves.filter(s => s.zone === activeZone);

  const maxCols = filteredShelves.length > 0 ? Math.max(...filteredShelves.map(s => parseInt(s.col_idx, 10) || 1)) : 1;
  const maxRows = filteredShelves.length > 0 ? Math.max(...filteredShelves.map(s => parseInt(s.row_idx, 10) || 1)) : 1;

  const isMobile = window.innerWidth <= 1024;
  const baseW = isMobile ? 110 : 140;
  const baseH = isMobile ? 64 : 76;
  const cellW = `${Math.round(baseW * zoom)}px`;
  const cellH = `${Math.round(baseH * zoom)}px`;
  const fontH2   = `${Math.round((isMobile ? 11 : 12) * zoom)}px`;
  const fontP    = `${Math.round((isMobile ? 10 : 11) * zoom)}px`;
  const fontDate = `${Math.round(9 * zoom)}px`;

  const handleLocalShelfClick = async (shelf) => {
    if (currentView === 'map') {
      const { data } = await supabase.from('shelf_history').select('*').eq('shelf_id', shelf.id).order('created_at', { ascending: false });
      setHistoryModal({ isOpen: true, shelfId: shelf.id, data: data || [] });
    } else {
      onShelfClick(shelf);
    }
  };

  const isClickable = selectedPending || currentView === 'outbound' || currentView === 'inbound' || currentView === 'map';

  return (
    <div className="card">
      {/* History modal */}
      {historyModal.isOpen && (
        <div className="modal-overlay" onClick={() => setHistoryModal(h => ({ ...h, isOpen: false }))}>
          <div className="modal-card" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <h3>{t.historyTitle} {historyModal.shelfId}</h3>
            <div className="history-table-container" style={{ marginTop: 12 }}>
              {historyModal.data.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--dk-text-3)' }}>{t.noHistory}</div>
              ) : (
                <table className="history-table">
                  <thead>
                    <tr><th>{t.colTime}</th><th>{t.colAction}</th><th>{t.colBarcode}</th><th>{t.colOp}</th></tr>
                  </thead>
                  <tbody>
                    {historyModal.data.map(r => (
                      <tr key={r.id}>
                        <td>{new Date(r.created_at).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                        <td><span className={r.action === 'inbound' ? 'tag-in' : 'tag-out'}>{r.action === 'inbound' ? t.actIn : r.action === 'outbound_customer' ? t.actOutCust : t.actOutTurn}</span></td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.batch_no ? `${r.batch_no} · ${r.product_barcode}` : r.product_barcode}</td>
                        <td>{r.operator}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setHistoryModal(h => ({ ...h, isOpen: false }))}>{t.btnClose}</button>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {currentView !== 'outbound' && (
            <button className={`wh-tab ${activeWarehouse === 'North Warehouse' ? 'active' : ''}`}
              onClick={() => setActiveWarehouse('North Warehouse')}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#3b82f6', marginRight: 6 }} />
              {lang === 'zh' ? '北倉' : 'North WH'}
            </button>
          )}
          {currentView !== 'inbound' && (
            <button className={`wh-tab ${activeWarehouse === 'South Warehouse' ? 'active' : ''}`}
              onClick={() => setActiveWarehouse('South Warehouse')}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#f59e0b', marginRight: 6 }} />
              {lang === 'zh' ? '南倉' : 'South WH'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.2).toFixed(1)))}>−</button>
          <span style={{ fontSize: 11, color: 'var(--dk-text-3)', minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setZoom(z => Math.min(2.5, +(z + 0.2).toFixed(1)))}>+</button>
        </div>
      </div>

      {/* Zone tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {zones.map(z => (
          <button key={z} className={`zone-tab ${activeZone === z ? 'active' : ''}`} onClick={() => setActiveZone(z)}>
            {z} {lang === 'zh' ? '區' : 'Zone'}
          </button>
        ))}
      </div>

      {/* Instruction text */}
      {(currentView === 'inbound' || currentView === 'outbound') && (
        <div style={{ fontSize: 11, color: 'var(--dk-text-3)', marginBottom: 8 }}>
          {currentView === 'inbound' ? t.inboundInstruction : t.outboundInstruction}
        </div>
      )}

      {/* Map grid */}
      <div className="warehouse-floor" style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${maxCols}, ${cellW})`,
        gridTemplateRows: `repeat(${maxRows}, ${cellH})`,
        gap: '6px 4px',
        '--dyn-font-h2': fontH2,
        '--dyn-font-p': fontP,
        '--dyn-font-date': fontDate,
      }}>
        {filteredShelves.map(shelf => {
          const isEmpty = shelf.status === 'empty';
          let isTarget = false, isTransferTarget = false, pickOrder = -1, isReadyAssign = false;
          let opacity = 1;

          if (currentView === 'outbound') {
            pickOrder = outboundPending.findIndex(p => p.id === shelf.id);
            isTarget = pickOrder > -1;
            if (selectedOutboundAssign) { isReadyAssign = isEmpty; opacity = isEmpty ? 1 : 0.35; }
            else { if (!isTarget && !isEmpty) opacity = 0.7; if (isEmpty) opacity = 0.65; }
          } else if (currentView === 'inbound') {
            isTransferTarget = inboundTransferSelected.some(p => p.id === shelf.id);
            if (selectedPending) { isReadyAssign = isEmpty; opacity = isEmpty ? 1 : 0.35; }
            else { if (!isEmpty && !isTransferTarget) opacity = 0.7; if (isEmpty) opacity = 0.65; }
          }

          let cls = isEmpty ? 'shelf shelf-empty' : 'shelf shelf-occupied';
          if (isTarget) cls += ' target-flashing';
          if (isTransferTarget) cls += ' transfer-selected';
          if (isReadyAssign) cls += ' ready-to-assign';

          const displayCode = shelf.batch_no ?? shelf.product_barcode;

          return (
            <div key={shelf.id}
              className={cls}
              style={{
                gridColumn: shelf.col_idx,
                gridRow: shelf.row_idx,
                opacity,
                cursor: isClickable ? 'pointer' : 'default',
              }}
              onClick={() => handleLocalShelfClick(shelf)}
            >
              {isTarget && <div className="route-badge">{pickOrder + 1}</div>}
              {isTransferTarget && <div className="route-badge" style={{ background: '#d97706' }}>↑</div>}
              <h2>{shelf.id}</h2>
              <p>{isEmpty ? (lang === 'zh' ? '空位' : 'Empty') : displayCode}</p>
              {!isEmpty && shelf.batch_date && <div className="date-tag">{shelf.batch_date}</div>}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
        {[
          { cls: 'shelf-empty',    label: lang === 'zh' ? '空位' : 'Empty' },
          { cls: 'shelf-occupied', label: lang === 'zh' ? '已佔用' : 'Occupied' },
        ].map(({ cls, label }) => (
          <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--dk-text-4)' }}>
            <div className={`shelf ${cls}`} style={{ width: 14, height: 10, borderRadius: 2, display: 'inline-block' }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
