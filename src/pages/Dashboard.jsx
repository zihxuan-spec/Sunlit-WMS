import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Dashboard({ t, lang, shelves, turnoverItems, showAlert }) {
  const [inProductionCount, setInProductionCount] = useState(0);

  useEffect(() => {
    fetchProductionStats();
  }, []);

  const fetchProductionStats = async () => {
    const { data } = await supabase.from('production_batches').select('batch_no').eq('status', 'processing');
    if (data) setInProductionCount(data.length);
  };

  const northShelves = shelves.filter(s => s.warehouse === 'North Warehouse');
  const northTotal = northShelves.length;
  const northUsed = northShelves.filter(s => s.status === 'occupied').length;
  const northUsedRate = northTotal === 0 ? 0 : Math.round((northUsed / northTotal) * 100);
  const northEmptyRate = northTotal === 0 ? 0 : 100 - northUsedRate;

  const southShelves = shelves.filter(s => s.warehouse === 'South Warehouse');
  const southTotal = southShelves.length;
  const southUsed = southShelves.filter(s => s.status === 'occupied').length;
  const southUsedRate = southTotal === 0 ? 0 : Math.round((southUsed / southTotal) * 100);
  const southEmptyRate = southTotal === 0 ? 0 : 100 - southUsedRate;

  const turnoverCount = turnoverItems.length;

  const handleExportCSV = () => {
    const headers = ['Warehouse Area', 'Zone', 'Shelf ID', 'Status', 'Batch No.', 'Original UID (Drum No.)', 'Batch Date', 'Operator', 'Action Time'];

    const northRows = shelves.filter(s => s.warehouse === 'North Warehouse').map(s => [
      'North Warehouse', s.zone || '-', s.id, s.status === 'occupied' ? 'Occupied' : 'Empty',
      '-', s.product_barcode || '-', s.batch_date || '-', s.last_updated_by || '-', '-'
    ]);

    const southRows = shelves.filter(s => s.warehouse === 'South Warehouse').map(s => [
      'South Warehouse', s.zone || '-', s.id, s.status === 'occupied' ? 'Occupied' : 'Empty',
      s.batch_no || '-', s.product_barcode || '-', s.batch_date || '-', s.last_updated_by || '-', '-'
    ]);

    const turnoverRows = turnoverItems.map(item => [
      'Turnover Area', '-', '-', 'Processing', item.batch_no || '-', item.product_barcode || '-', item.batch_date || '-',
      item.added_by || '-', new Date(item.added_at).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en-US', { hour12: false })
    ]);

    const allRows = [...northRows, ...southRows, ...turnoverRows];
    const csvContent = [headers.join(','), ...allRows.map(row => row.map(item => `"${item}"`).join(','))].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `WMS_Inventory_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showAlert(t.exportSuccess);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0 }}>{t.navDash}</h2>
        <button className="btn btn-success" onClick={handleExportCSV}>{t.exportBtn}</button>
      </div>

      {/* North Warehouse */}
      <div style={{ marginBottom: '25px' }}>
        <h3 style={{ color: '#0071e3', borderBottom: '2px solid #eee', paddingBottom: '8px', marginTop: 0 }}>🟦 {t.dashNorth}</h3>
        <div className="dashboard-grid">
          <div className="stat-card">
            <h3>{t.capUsed} / {t.capTotal}</h3>
            <div className="num">{northUsed} / {northTotal}</div>
          </div>
          <div className="stat-card">
            <h3>{t.dashUsedPct}</h3>
            <div className="num" style={{ color: '#e53935' }}>{northUsedRate}%</div>
            <div className="bar-bg"><div className="bar-fill" style={{ width: `${northUsedRate}%`, background: northUsedRate > 80 ? '#e53935' : '#ff9800' }}></div></div>
          </div>
          <div className="stat-card">
            <h3>{t.dashEmptyPct}</h3>
            <div className="num" style={{ color: '#4caf50' }}>{northEmptyRate}%</div>
            <div className="bar-bg"><div className="bar-fill" style={{ width: `${northEmptyRate}%`, background: '#4caf50' }}></div></div>
          </div>
        </div>
      </div>

      {/* South Warehouse */}
      <div style={{ marginBottom: '25px' }}>
        <h3 style={{ color: '#ff9800', borderBottom: '2px solid #eee', paddingBottom: '8px', marginTop: 0 }}>🟧 {t.dashSouth}</h3>
        <div className="dashboard-grid">
          <div className="stat-card">
            <h3>{t.capUsed} / {t.capTotal}</h3>
            <div className="num">{southUsed} / {southTotal}</div>
          </div>
          <div className="stat-card">
            <h3>{t.dashUsedPct}</h3>
            <div className="num" style={{ color: '#e53935' }}>{southUsedRate}%</div>
            <div className="bar-bg"><div className="bar-fill" style={{ width: `${southUsedRate}%`, background: southUsedRate > 80 ? '#e53935' : '#ff9800' }}></div></div>
          </div>
          <div className="stat-card">
            <h3>{t.dashEmptyPct}</h3>
            <div className="num" style={{ color: '#4caf50' }}>{southEmptyRate}%</div>
            <div className="bar-bg"><div className="bar-fill" style={{ width: `${southEmptyRate}%`, background: '#4caf50' }}></div></div>
          </div>
        </div>
      </div>

      {/* Turnover + MES */}
      <div>
        <h3 style={{ color: '#757575', borderBottom: '2px solid #eee', paddingBottom: '8px', marginTop: 0 }}>🏭 {t.dashTurnover}</h3>
        <div className="dashboard-grid">
          <div className="stat-card">
            <h3>{t.dashTurnoverItems}</h3>
            <div className="num" style={{ color: '#333' }}>{turnoverCount}</div>
          </div>
          <div className="stat-card">
            <h3>{t.dashInProduction}</h3>
            <div className="num" style={{ color: '#9c27b0' }}>{inProductionCount}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
