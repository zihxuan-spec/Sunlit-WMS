import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function WarehouseMap({ 
  t, lang, currentView, shelves, 
  activeWarehouse, setActiveWarehouse, activeZone, setActiveZone,
  selectedPending, outboundPending = [], selectedOutboundAssign, inboundTransferSelected = [],
  onShelfClick
}) {
  const [mapZoom, setMapZoom] = useState(1);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [historyModal, setHistoryModal] = useState({ isOpen: false, shelfId: '', data: [] });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const whShelves = shelves.filter(s => s.warehouse === activeWarehouse);
  const zones = Array.from(new Set(whShelves.map(s => s.zone))).sort();
  const filteredShelves = whShelves.filter(s => s.zone === activeZone);
  
  const maxCols = filteredShelves.length > 0 ? Math.max(...filteredShelves.map(s => parseInt(s.col_idx, 10) || 1)) : 1;
  const maxRows = filteredShelves.length > 0 ? Math.max(...filteredShelves.map(s => parseInt(s.row_idx, 10) || 1)) : 1;
  
  const isMapClickable = selectedPending || currentView === 'outbound' || currentView === 'inbound' || currentView === 'map';

  const baseW = isMobile ? 135 : 160; 
  const baseH = isMobile ? 75 : 85;   
  const cellGap = isMobile ? '6px 3px' : '8px 4px';
  const cellW = `${baseW * mapZoom}px`;
  const cellH = `${baseH * mapZoom}px`;
  
  const fontH2 = `${(isMobile ? 12 : 14) * mapZoom}px`;
  const fontP = `${(isMobile ? 12 : 13) * mapZoom}px`;
  const fontDate = `${(isMobile ? 9 : 10) * mapZoom}px`;

  // 處理單純查看地圖時的點擊 (顯示履歷)
  const handleLocalShelfClick = async (shelf) => {
    if (currentView === 'map') {
      const { data } = await supabase.from('shelf_history').select('*').eq('shelf_id', shelf.id).order('created_at', { ascending: false });
      setHistoryModal({ isOpen: true, shelfId: shelf.id, data: data || [] });
    } else {
      onShelfClick(shelf);
    }
  };

  return (
    <div className="card">
      {/* 履歷彈窗 */}
      {historyModal.isOpen && (
        <div className="modal-overlay" onClick={() => setHistoryModal({...historyModal, isOpen: false})}>
          <div className="modal-card" style={{maxWidth: '600px'}} onClick={e => e.stopPropagation()}>
            <h3 style={{marginBottom: '20px', color: '#0071e3'}}>{t.historyTitle} {historyModal.shelfId}</h3>
            <div className="history-table-container">
              {historyModal.data.length === 0 ? (
                <div style={{textAlign: 'center', color: '#999', padding: '30px'}}>{t.noHistory}</div>
              ) : (
                <table className="history-table">
                  <thead><tr><th>{t.colTime}</th><th>{t.colAction}</th><th>{t.colBarcode}</th><th>{t.colOp}</th></tr></thead>
                  <tbody>
                    {historyModal.data.map(record => (
                      <tr key={record.id}>
                        <td style={{color: '#666'}}>{new Date(record.created_at).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'})}</td>
                        <td>
                          <span className={record.action === 'inbound' ? 'tag-in' : 'tag-out'}>
                            {record.action === 'inbound' ? t.actIn : 
                             record.action === 'outbound_customer' ? t.actOutCust : 
                             record.action === 'outbound_turnover' ? t.actOutTurn : t.actOut}
                          </span>
                        </td>
                        <td style={{fontWeight: 'bold'}}>{record.batch_no ? `${record.batch_no} (UID: ${record.product_barcode})` : record.product_barcode}</td>
                        <td>👤 {record.operator}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setHistoryModal({...historyModal, isOpen: false})}>{t.btnClose}</button></div>
          </div>
        </div>
      )}

      {/* 控制列：倉庫分頁與縮放 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', borderBottom: '2px solid #ccc', paddingBottom: '5px', marginBottom: '15px' }}>
        <div className="warehouse-tabs" style={{ borderBottom: 'none', margin: 0, padding: 0 }}>
          {currentView !== 'outbound' && (
            <button className={`wh-btn ${activeWarehouse === 'North Warehouse' ? 'active' : ''}`} onClick={() => setActiveWarehouse('North Warehouse')}>🟦 {lang==='zh'?'北邊倉庫':'North WH'}</button>
          )}
          {currentView !== 'inbound' && (
            <button className={`wh-btn ${activeWarehouse === 'South Warehouse' ? 'active' : ''}`} onClick={() => setActiveWarehouse('South Warehouse')}>🟧 {lang==='zh'?'南邊倉庫':'South WH'}</button>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', background: '#f5f5f5', padding: '5px 10px', borderRadius: '8px' }}>
           <button className="btn btn-outline" style={{padding: '4px 10px', fontSize: '14px', border: '1px solid #ccc', color: '#555'}} onClick={() => setMapZoom(z => Math.max(0.6, z - 0.2))}>🔍 -</button>
           <span style={{fontSize: '14px', fontWeight: 'bold', color: '#666', width: '45px', textAlign: 'center'}}>{Math.round(mapZoom * 100)}%</span>
           <button className="btn btn-outline" style={{padding: '4px 10px', fontSize: '14px', border: '1px solid #ccc', color: '#555'}} onClick={() => setMapZoom(z => Math.min(2.5, z + 0.2))}>🔍 +</button>
        </div>
      </div>

      <div className="zone-tabs">
        {zones.map(z => <button key={z} className={`zone-btn ${activeZone === z ? 'active' : ''}`} onClick={() => setActiveZone(z)}>{z} {lang==='zh'?'區':'Zone'}</button>)}
      </div>

      <div style={{color: '#666', fontSize: '14px', marginBottom: '10px', fontWeight: 'bold'}}>
         {currentView === 'inbound' && t.inboundInstruction}
         {currentView === 'outbound' && t.outboundInstruction}
      </div>

      {/* 地圖網格 */}
      <div className="warehouse-floor" style={{ 
          display: 'grid', gridTemplateColumns: `repeat(${maxCols}, ${cellW})`, gridTemplateRows: `repeat(${maxRows}, ${cellH})`, gap: cellGap,
          '--dyn-font-h2': fontH2, '--dyn-font-p': fontP, '--dyn-font-date': fontDate
        }}>
        {filteredShelves.map(shelf => {
          const isEmpty = shelf.status === 'empty';
          let isTarget = false; 
          let isTransferTarget = false; 
          let pickOrder = -1;
          let isReadyAssign = false;
          let opacity = 1;

          if (currentView === 'outbound') {
            pickOrder = outboundPending.findIndex(p => p.id === shelf.id);
            isTarget = pickOrder > -1;
            if (selectedOutboundAssign) {
               isReadyAssign = isEmpty;
               opacity = isEmpty ? 1 : 0.4;
            } else {
               if (!isTarget && !isEmpty) opacity = 0.8; 
               if (isEmpty) opacity = 0.5;
            }
          } else if (currentView === 'inbound') {
            isTransferTarget = inboundTransferSelected.find(p => p.id === shelf.id) !== undefined;
            if (selectedPending) {
              isReadyAssign = isEmpty;
              opacity = isEmpty ? 1 : 0.4;
            } else {
               if (!isEmpty && !isTransferTarget) opacity = 0.8; 
            }
          }

          const bgColor = isEmpty ? '#4caf50' : '#eeeeee';
          const textColor = isEmpty ? '#ffffff' : '#333333';
          let classNames = 'shelf ';
          if (isTarget) classNames += 'target-flashing ';
          if (isTransferTarget) classNames += 'transfer-selected ';
          if (isReadyAssign) classNames += 'ready-to-assign ';
          
          const displayCode = shelf.batch_no ? shelf.batch_no : shelf.product_barcode;

          return (
            <div key={shelf.id} className={classNames} onClick={() => handleLocalShelfClick(shelf)}
              style={{ gridColumn: shelf.col_idx, gridRow: shelf.row_idx, backgroundColor: bgColor, color: textColor, cursor: isMapClickable ? 'pointer' : 'default', opacity: opacity }}>
              {isTarget && <div className="route-badge">{pickOrder + 1}</div>}
              {isTransferTarget && <div className="route-badge" style={{background: '#ff9800'}}>🔄</div>}
              <h2>{shelf.id}</h2>
              <p>{isEmpty ? t.emptyShelf : `${t.occupied} ${displayCode}`}</p>
              {!isEmpty && shelf.batch_date && <div className="date-tag">📅 {shelf.batch_date}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}