import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function ProductionRecord({ t, lang }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ customer: '', status: '', search: '', month: '' });

  useEffect(() => { fetchRecords(); }, []);

  const fetchRecords = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('production_batches')
      .select('*, production_containers(count)')
      .order('created_at', { ascending: false });
    if (data) setRecords(data);
    setLoading(false);
  };

  const filtered = records.filter(r => {
    if (filter.customer && r.customer !== filter.customer) return false;
    if (filter.status && r.status !== filter.status) return false;
    if (filter.month && r.created_at) {
      const m = r.created_at.slice(0, 7); // 'YYYY-MM'
      if (m !== filter.month) return false;
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      if (!r.batch_no?.toLowerCase().includes(q) && !r.material_code?.toLowerCase().includes(q) && !r.customer?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const customers = [...new Set(records.map(r => r.customer).filter(Boolean))].sort();
  const months = [...new Set(records.map(r => r.created_at?.slice(0,7)).filter(Boolean))].sort().reverse();
  const fmtMonth = (m) => { const [y,mo] = m.split('-'); return `${y}/${mo}`; };

  // Status label and badge
  const statusBadge = (s) => {
    const map = {
      pending:    { label: lang === 'zh' ? '待生產'   : 'Pending',      cls: 'badge-amber'  },
      processing: { label: lang === 'zh' ? '生產中'   : 'Processing',   cls: 'badge-purple' },
      completed:  { label: lang === 'zh' ? '待出貨'   : 'Ready to ship',cls: 'badge-blue'   },
      shipped:    { label: lang === 'zh' ? '在客戶端' : 'At customer',  cls: 'badge-green'  },
    };
    const m = map[s] || { label: s, cls: 'badge-gray' };
    return <span className={`badge ${m.cls}`}>{m.label}</span>;
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(lang === 'zh' ? 'zh-TW' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  // Summary counts
  const counts = { pending: 0, processing: 0, completed: 0, shipped: 0 };
  records.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{lang === 'zh' ? '生產記錄' : 'Production Record'}</div>
          <div className="page-subtitle">{lang === 'zh' ? '批次追蹤 · 出貨歷史 · 客戶分佈' : 'Batch tracking · Shipment history · Customer view'}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchRecords}>{lang === 'zh' ? '重新整理' : 'Refresh'}</button>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { key: 'pending',    label: lang === 'zh' ? '待生產'   : 'Pending',      color: '#f59e0b' },
          { key: 'processing', label: lang === 'zh' ? '生產中'   : 'Processing',   color: '#8b5cf6' },
          { key: 'completed',  label: lang === 'zh' ? '待出貨'   : 'Ready',        color: '#3b82f6' },
          { key: 'shipped',    label: lang === 'zh' ? '在客戶端' : 'At customer',  color: '#10b981' },
        ].map(s => (
          <div key={s.key} className="metric-card" style={{ cursor: 'pointer', borderLeft: `3px solid ${s.color}` }}
            onClick={() => setFilter(f => ({ ...f, status: f.status === s.key ? '' : s.key }))}>
            <div className="metric-label">{s.label}</div>
            <div className="metric-value" style={{ fontSize: 24, color: s.color }}>{counts[s.key]}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder={lang === 'zh' ? '搜尋批號 / 物料 / 客戶...' : 'Search batch / material / customer...'}
            value={filter.search}
            onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
            style={{ width: 240, margin: 0, padding: '7px 12px', fontSize: 13 }}
          />
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
            style={{ width: 150, margin: 0, padding: '7px 10px', fontSize: 13 }}>
            <option value="">{lang === 'zh' ? '所有狀態' : 'All statuses'}</option>
            <option value="pending">{lang === 'zh' ? '待生產' : 'Pending'}</option>
            <option value="processing">{lang === 'zh' ? '生產中' : 'Processing'}</option>
            <option value="completed">{lang === 'zh' ? '待出貨' : 'Ready'}</option>
            <option value="shipped">{lang === 'zh' ? '在客戶端' : 'At customer'}</option>
          </select>
          <select value={filter.customer} onChange={e => setFilter(f => ({ ...f, customer: e.target.value }))}
            style={{ width: 160, margin: 0, padding: '7px 10px', fontSize: 13 }}>
            <option value="">{lang === 'zh' ? '所有客戶' : 'All customers'}</option>
            {customers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filter.month} onChange={e => setFilter(f => ({ ...f, month: e.target.value }))}
            style={{ width:120, margin:0, padding:'7px 10px', fontSize:13 }}>
            <option value="">{lang === 'zh' ? '所有月份' : 'All months'}</option>
            {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
          {(filter.search || filter.status || filter.customer || filter.month) && (
            <button className="btn btn-ghost btn-sm" onClick={() => setFilter({ customer: '', status: '', search: '', month: '' })}>
              {lang === 'zh' ? '清除' : 'Clear'}
            </button>
          )}
          <span style={{ fontSize: 11, color: 'var(--dk-text-3)', marginLeft: 'auto' }}>
            {filtered.length} / {records.length} {lang === 'zh' ? '筆' : 'records'}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--dk-text-3)' }}>
            {lang === 'zh' ? '載入中...' : 'Loading...'}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--dk-text-3)' }}>
            {lang === 'zh' ? '無符合記錄' : 'No records found'}
          </div>
        ) : (
          <div className="history-table-container">
            <table className="history-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>{lang === 'zh' ? '批號' : 'Batch No.'}</th>
                  <th>{lang === 'zh' ? '物料' : 'Material'}</th>
                  <th>{lang === 'zh' ? '桶數' : 'Drums'}</th>
                  <th>{lang === 'zh' ? '客戶' : 'Customer'}</th>
                  <th>{lang === 'zh' ? '狀態' : 'Status'}</th>
                  <th>{lang === 'zh' ? '操作員' : 'Operator'}</th>
                  <th>{lang === 'zh' ? '建立日期' : 'Created'}</th>
                  <th>{lang === 'zh' ? '出貨日期' : 'Shipped'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.batch_no} className="row-clickable">
                    <td><span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--dk-accent)' }}>{r.batch_no}</span></td>
                    <td><span className="badge badge-gray" style={{ fontSize: 10 }}>{r.material_code || '—'}</span></td>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>{r.production_containers?.[0]?.count != null ? parseInt(r.production_containers[0].count) || 0 : '—'}</td>
                    <td>
                      {r.customer
                        ? <span style={{ fontSize: 12, fontWeight: 600 }}>{r.customer}</span>
                        : <span style={{ color: 'var(--dk-text-4)', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td>{statusBadge(r.status)}</td>
                    <td style={{ fontSize: 12, color: 'var(--dk-text-2)' }}>{r.operator || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--dk-text-3)' }}>{fmtDate(r.created_at)}</td>
                    <td style={{ fontSize: 11, color: r.shipped_at ? 'var(--dk-text-2)' : 'var(--dk-text-4)' }}>
                      {r.shipped_at ? fmtDateTime(r.shipped_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
