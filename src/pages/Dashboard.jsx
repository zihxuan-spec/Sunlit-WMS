import React from 'react';

export default function Dashboard({ t, lang, shelves, turnoverItems, inProductionCount, showAlert }) {
  const northShelves = shelves.filter(s => s.warehouse === 'North Warehouse');
  const northTotal   = northShelves.length;
  const northUsed    = northShelves.filter(s => s.status === 'occupied').length;
  const northRate    = northTotal === 0 ? 0 : Math.round((northUsed / northTotal) * 100);

  const southShelves = shelves.filter(s => s.warehouse === 'South Warehouse');
  const southTotal   = southShelves.length;
  const southUsed    = southShelves.filter(s => s.status === 'occupied').length;
  const southRate    = southTotal === 0 ? 0 : Math.round((southUsed / southTotal) * 100);

  const turnoverRaw     = turnoverItems.filter(i => i.status === 'raw' || !i.status).length;
  const turnoverPending = turnoverItems.filter(i => i.status === 'pending').length;

  const barColor = (r) => r > 85 ? '#ef4444' : r > 65 ? '#f59e0b' : '#10b981';

  const handleExportCSV = () => {
    const headers = ['Area', 'Zone', 'Shelf ID', 'Status', 'Batch No.', 'Barcode', 'Batch Date', 'Operator'];
    const rows = [
      ...shelves.filter(s => s.warehouse === 'North Warehouse').map(s => ['North WH', s.zone||'-', s.id, s.status==='occupied'?'Occupied':'Empty', '-', s.product_barcode||'-', s.batch_date||'-', s.last_updated_by||'-']),
      ...shelves.filter(s => s.warehouse === 'South Warehouse').map(s => ['South WH', s.zone||'-', s.id, s.status==='occupied'?'Occupied':'Empty', s.batch_no||'-', s.product_barcode||'-', s.batch_date||'-', s.last_updated_by||'-']),
      ...turnoverItems.map(i => ['Turnover', '-', '-', i.status||'raw', i.batch_no||'-', i.product_barcode||'-', i.batch_date||'-', i.added_by||'-']),
    ];
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `WMS_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showAlert(t.exportSuccess);
  };

  const SectionHeader = ({ color, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div style={{ width: 3, height: 18, background: color, borderRadius: 2 }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--dk-text-2)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
    </div>
  );

  const MetricSet = ({ used, total, rate }) => (
    <div className="dashboard-grid">
      <div className="stat-card">
        <h3>{t.capUsed} / {t.capTotal}</h3>
        <div className="num" style={{ color: 'var(--dk-accent)' }}>{used} / {total}</div>
      </div>
      <div className="stat-card">
        <h3>{t.dashUsedPct}</h3>
        <div className="num" style={{ color: barColor(rate) }}>{rate}%</div>
        <div className="bar-bg"><div className="bar-fill" style={{ width: `${rate}%`, background: barColor(rate) }} /></div>
      </div>
      <div className="stat-card">
        <h3>{t.dashEmptyPct}</h3>
        <div className="num" style={{ color: '#10b981' }}>{100 - rate}%</div>
        <div className="bar-bg"><div className="bar-fill" style={{ width: `${100 - rate}%`, background: '#10b981' }} /></div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{lang === 'zh' ? '總覽' : 'Dashboard'}</div>
          <div className="page-subtitle">{lang === 'zh' ? '即時庫存狀態' : 'Live inventory status'}</div>
        </div>
        <button className="btn btn-success btn-sm" onClick={handleExportCSV}>{t.exportBtn}</button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <SectionHeader color="#3b82f6" label={t.dashNorth} />
        <MetricSet used={northUsed} total={northTotal} rate={northRate} />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <SectionHeader color="#f59e0b" label={t.dashSouth} />
        <MetricSet used={southUsed} total={southTotal} rate={southRate} />
      </div>

      <div className="card">
        <SectionHeader color="#8b5cf6" label={t.dashTurnover} />
        <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <div className="stat-card">
            <h3>{t.dashTurnoverItems}</h3>
            <div className="num" style={{ color: 'var(--dk-text-2)' }}>{turnoverRaw}</div>
          </div>
          <div className="stat-card">
            <h3>{lang === 'zh' ? '待生產' : 'Pending MES'}</h3>
            <div className="num" style={{ color: '#f59e0b' }}>{turnoverPending}</div>
          </div>
          <div className="stat-card">
            <h3>{t.dashInProduction}</h3>
            <div className="num" style={{ color: '#8b5cf6' }}>{inProductionCount}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
