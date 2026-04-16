import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../config/supabaseClient';

export default function ReusableTracking({ t, lang, showAlert }) {
  const [trackingList, setTrackingList] = useState([]);
  const [containerTypes, setContainerTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: ctData }, { data: trackData, error }] = await Promise.all([
      supabase.from('container_types').select('*').eq('is_reusable', true).eq('active', true),
      supabase.from('reusable_tracking').select('*').order('last_shipped_at', { ascending: false, nullsFirst: false }),
    ]);
    if (ctData) setContainerTypes(ctData);
    if (error) { showAlert(t.msgFail); setLoading(false); return; }
    if (trackData) setTrackingList(trackData);
    setLoading(false);
  };

  const exportExcel = async () => {
    // Fetch full shipment history from shelf_history for all reusable barcodes
    const barcodes = trackingList.map(r => r.barcode);
    if (!barcodes.length) return showAlert(lang === 'zh' ? '尚無資料' : 'No data to export');

    const { data: history } = await supabase
      .from('shelf_history')
      .select('*')
      .in('product_barcode', barcodes)
      .eq('action', 'outbound_customer')
      .order('created_at', { ascending: false });

    const rows = (history || []).map(h => {
      const ct = containerTypes.find(ct => h.product_barcode?.startsWith(ct.barcode_prefix));
      return {
        [lang === 'zh' ? '桶號' : 'Barcode']: h.product_barcode || '',
        [lang === 'zh' ? '包材類型' : 'Type']: ct?.name || '',
        [lang === 'zh' ? '批號' : 'Batch No']: h.batch_no || '',
        [lang === 'zh' ? '操作人員' : 'Operator']: h.operator || '',
        [lang === 'zh' ? '出貨時間' : 'Shipped At']: h.created_at ? new Date(h.created_at).toLocaleString() : '',
        [lang === 'zh' ? '貨架' : 'Shelf']: h.shelf_id || '',
      };
    });

    if (!rows.length) return showAlert(lang === 'zh' ? '尚無出貨歷史' : 'No shipment history found');

    const headers = Object.keys(rows[0]);
    const csv = '\uFEFF' + [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `ReusableTracking_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleConfirmReturn = async (barcode) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const { error } = await supabase.from('reusable_tracking')
      .update({ current_status: 'in_plant' })
      .eq('barcode', barcode);
    setIsSubmitting(false);
    if (error) return showAlert(t.msgFail);
    showAlert(lang === 'zh' ? `${barcode} 已確認回廠` : `${barcode} confirmed back in plant`);
    fetchData();
  };

  // Find container type for a barcode
  const getCT = (barcode) => containerTypes.find(ct => barcode?.startsWith(ct.barcode_prefix)) || null;

  const statusBadge = (status) => {
    const map = {
      in_plant:      { label: lang === 'zh' ? '工廠中'   : 'In plant',      color: '#065f46', bg: '#d1fae5' },
      ready_to_ship: { label: lang === 'zh' ? '已出貨'   : 'Shipped',        color: '#1e40af', bg: '#dbeafe' },
      at_customer:   { label: lang === 'zh' ? '客戶端'   : 'At customer',    color: '#7c2d12', bg: '#fee2e2' },
    };
    const s = map[status] || { label: status, color: 'var(--dk-text-2)', bg: 'var(--bg-section)' };
    return (
      <span style={{ padding:'3px 9px', borderRadius:4, fontSize:11, fontWeight:600, background: s.bg, color: s.color }}>
        {s.label}
      </span>
    );
  };

  const fmtDate = (d) => d
    ? new Date(d).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en-US',
        { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  // Summary counts
  const summary = {
    in_plant:      trackingList.filter(r => r.current_status === 'in_plant').length,
    ready_to_ship: trackingList.filter(r => r.current_status === 'ready_to_ship').length,
  };

  const hasReusable = containerTypes.length > 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{t.reusableTitle}</div>
          <div className="page-subtitle">
            {lang === 'zh' ? '循環包材生命週期追蹤 · 入庫時自動偵測回廠' : 'Lifecycle tracking · Auto-detected on inbound scan'}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost btn-sm" onClick={fetchData}>{lang === 'zh' ? '重新整理' : 'Refresh'}</button>
          <button className="btn btn-success btn-sm" onClick={exportExcel}>⬇ {lang === 'zh' ? '匯出歷史' : 'Export History'}</button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
        <div className="metric-card">
          <div className="metric-label">{lang==='zh'?'總追蹤桶數':'Total tracked'}</div>
          <div className="metric-value" style={{ fontSize:24 }}>{trackingList.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{lang==='zh'?'工廠中':'In plant'}</div>
          <div className="metric-value" style={{ fontSize:24, color:'#10b981' }}>{summary.in_plant}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">{lang==='zh'?'已出貨（待回廠）':'Shipped (awaiting return)'}</div>
          <div className="metric-value" style={{ fontSize:24, color:'#f59e0b' }}>{summary.ready_to_ship}</div>
        </div>
      </div>

      {!hasReusable && !loading && (
        <div className="card" style={{ textAlign:'center', padding:40, color:'var(--dk-text-3)', fontSize:13 }}>
          {lang==='zh'
            ? '尚未設定循環包材（container_types.is_reusable = true）'
            : 'No reusable container types configured (container_types.is_reusable = true)'}
        </div>
      )}

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', fontSize:13, color:'var(--dk-text-3)' }}>
            {lang==='zh'?'載入中...':'Loading...'}
          </div>
        ) : trackingList.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', fontSize:13, color:'var(--dk-text-3)' }}>
            {lang==='zh'
              ? '尚無追蹤記錄。包材出貨後會自動出現在這裡。'
              : 'No records yet. Records appear here automatically after shipment.'}
          </div>
        ) : (
          <div className="history-table-container">
            <table className="history-table" style={{ minWidth:700 }}>
              <thead>
                <tr>
                  <th>{lang==='zh'?'桶號':'Barcode'}</th>
                  <th>{lang==='zh'?'包材類型':'Type'}</th>
                  <th>{lang==='zh'?'狀態':'Status'}</th>
                  <th>{lang==='zh'?'使用次數':'Uses'}</th>
                  <th>{lang==='zh'?'最後客戶':'Last customer'}</th>
                  <th>{lang==='zh'?'最後出貨':'Last shipped'}</th>
                  <th>{lang==='zh'?'操作':'Action'}</th>
                </tr>
              </thead>
              <tbody>
                {trackingList.map(item => {
                  const ct       = getCT(item.barcode);
                  const maxLimit = ct?.max_uses ?? null;
                  const warnAt   = ct?.warn_at_uses ?? null;
                  const isOver   = maxLimit !== null && item.use_count >= maxLimit;
                  const isWarn   = warnAt !== null && item.use_count >= warnAt && !isOver;
                  return (
                    <tr key={item.barcode}>
                      <td>
                        <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700 }}>{item.barcode}</span>
                        {isOver && <span className="badge badge-red" style={{ marginLeft:6, fontSize:9 }}>{lang==='zh'?'超限':'Over limit'}</span>}
                        {isWarn && <span className="badge badge-amber" style={{ marginLeft:6, fontSize:9 }}>{lang==='zh'?'警告':'Warning'}</span>}
                      </td>
                      <td>
                        {ct
                          ? <span className="badge badge-gray" style={{ fontSize:10 }}>{ct.name}</span>
                          : <span style={{ fontSize:11, color:'var(--dk-text-4)' }}>—</span>
                        }
                      </td>
                      <td>{statusBadge(item.current_status)}</td>
                      <td>
                        <span style={{ fontSize:13, fontWeight:700,
                          color: isOver ? '#dc2626' : isWarn ? '#d97706' : 'var(--dk-text)' }}>
                          {item.use_count}
                        </span>
                        {maxLimit && <span style={{ fontSize:11, color:'var(--dk-text-3)' }}>/{maxLimit}</span>}
                      </td>
                      <td style={{ fontSize:12, color:'var(--dk-text-2)' }}>{item.last_customer || '—'}</td>
                      <td style={{ fontSize:11, color:'var(--dk-text-3)' }}>{fmtDate(item.last_shipped_at)}</td>
                      <td>
                        {item.current_status === 'ready_to_ship' && (
                          <button className="btn btn-success btn-sm"
                            style={{ fontSize:11, padding:'4px 10px', minHeight:'unset' }}
                            disabled={isSubmitting}
                            onClick={() => handleConfirmReturn(item.barcode)}>
                            {lang==='zh'?'手動回廠':'Manual return'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
