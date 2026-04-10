import React from 'react';

export default function Dashboard({ t, lang, shelves, turnoverItems, inProductionCount, showAlert }) {
  const northShelves = shelves.filter(s => s.warehouse === 'North Warehouse');
  const northTotal = northShelves.length;
  const northUsed = northShelves.filter(s => s.status === 'occupied').length;
  const northUsedRate = northTotal === 0 ? 0 : Math.round((northUsed / northTotal) * 100);

  const southShelves = shelves.filter(s => s.warehouse === 'South Warehouse');
  const southTotal = southShelves.length;
  const southUsed = southShelves.filter(s => s.status === 'occupied').length;
  const southUsedRate = southTotal === 0 ? 0 : Math.round((southUsed / southTotal) * 100);

  const turnoverRaw = turnoverItems.filter(i => i.status === 'raw' || !i.status).length;
  const turnoverPending = turnoverItems.filter(i => i.status === 'pending').length;

  const handleExportCSV = () => {
    const headers = ['Area', 'Zone', 'Shelf ID', 'Status', 'Batch No.', 'Barcode', 'Batch Date', 'Operator'];
    const northRows = shelves.filter(s => s.warehouse === 'North Warehouse').map(s => ['North WH', s.zone || '-', s.id, s.status === 'occupied' ? 'Occupied' : 'Empty', '-', s.product_barcode || '-', s.batch_date || '-', s.last_updated_by || '-']);
    const southRows = shelves.filter(s => s.warehouse === 'South Warehouse').map(s => ['South WH', s.zone || '-', s.id, s.status === 'occupied' ? 'Occupied' : 'Empty', s.batch_no || '-', s.product_barcode || '-', s.batch_date || '-', s.last_updated_by || '-']);
    const turnoverRows = turnoverItems.map(i => ['Turnover', '-', '-', i.status || 'raw', i.batch_no || '-', i.product_barcode || '-', i.batch_date || '-', i.added_by || '-']);
    const csv = [headers.join(','), ...[...northRows, ...southRows, ...turnoverRows].map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `WMS_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showAlert(t.exportSuccess);
  };

  const Section = ({ title, color }) => (
    <h3 style={{ color, borderBottom: `2px solid ${color}22`, paddingBottom: '8px', marginTop: 0, fontSize: '16px' }}>{title}</h3>
  );

  const usedColor = (rate) => rate > 85 ? '#e53935' : rate > 65 ? '#ff9800' : '#4caf50';

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0 }}>{t.navDash}</h2>
        <button className="btn btn-success btn-sm" onClick={handleExportCSV}>{t.exportBtn}</button>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <Section title={`🟦 ${t.dashNorth}`} color="#0071e3" />
        <div className="dashboard-grid">
          <div className="stat-card"><h3>{t.capUsed} / {t.capTotal}</h3><div className="num blue">{northUsed} / {northTotal}</div></div>
          <div className="stat-card">
            <h3>{t.dashUsedPct}</h3>
            <div className="num" style={{ color: usedColor(northUsedRate) }}>{northUsedRate}%</div>
            <div className="bar-bg"><div className="bar-fill" style={{ width: `${northUsedRate}%`, background: usedColor(northUsedRate) }} /></div>
          </div>
          <div className="stat-card">
            <h3>{t.dashEmptyPct}</h3>
            <div className="num green">{100 - northUsedRate}%</div>
            <div className="bar-bg"><div className="bar-fill" style={{ width: `${100 - northUsedRate}%`, background: '#4caf50' }} /></div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <Section title={`🟧 ${t.dashSouth}`} color="#ff9800" />
        <div className="dashboard-grid">
          <div className="stat-card"><h3>{t.capUsed} / {t.capTotal}</h3><div className="num" style={{ color: '#ff9800' }}>{southUsed} / {southTotal}</div></div>
          <div className="stat-card">
            <h3>{t.dashUsedPct}</h3>
            <div className="num" style={{ color: usedColor(southUsedRate) }}>{southUsedRate}%</div>
            <div className="bar-bg"><div className="bar-fill" style={{ width: `${southUsedRate}%`, background: usedColor(southUsedRate) }} /></div>
          </div>
          <div className="stat-card">
            <h3>{t.dashEmptyPct}</h3>
            <div className="num green">{100 - southUsedRate}%</div>
            <div className="bar-bg"><div className="bar-fill" style={{ width: `${100 - southUsedRate}%`, background: '#4caf50' }} /></div>
          </div>
        </div>
      </div>

      <div>
        <Section title={`🏭 ${t.dashTurnover}`} color="#757575" />
        <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
          <div className="stat-card"><h3>{t.dashTurnoverItems}</h3><div className="num neutral" style={{ color: 'var(--text-secondary)' }}>{turnoverRaw}</div></div>
          <div className="stat-card"><h3>{lang === 'zh' ? '待生產' : 'Pending MES'}</h3><div className="num" style={{ color: '#ff9800' }}>{turnoverPending}</div></div>
          <div className="stat-card"><h3>{t.dashInProduction}</h3><div className="num" style={{ color: '#9c27b0' }}>{inProductionCount}</div></div>
        </div>
      </div>
    </div>
  );
}
