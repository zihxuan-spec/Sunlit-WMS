import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function ReusableTracking({ t, lang, showAlert }) {
  const [trackingList, setTrackingList] = useState([]);
  const [rules, setRules] = useState({});
  const [hasRules, setHasRules] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: ruleData } = await supabase.from('recycled_container_rules').select('*');
    const ruleObj = {};
    if (ruleData?.length) {
      ruleData.forEach(r => { ruleObj[r.prefix] = { maxUses: r.max_uses, warnAt: r.warn_at }; });
      setHasRules(true);
    }
    setRules(ruleObj);
    const { data: trackData, error } = await supabase.from('reusable_tracking').select('*').order('use_count', { ascending: false });
    setLoading(false);
    if (error) { showAlert(t.msgFail); return; }
    if (trackData) setTrackingList(trackData);
  };

  // Confirm return to plant (ready_to_ship → in_plant)
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

  const statusBadge = (status) => {
    const map = {
      in_plant:      { label: lang === 'zh' ? '工廠中' : 'In plant',       color: '#00796b', bg: '#e0f2f1' },
      ready_to_ship: { label: lang === 'zh' ? '已出貨' : 'Shipped',         color: '#1565c2', bg: '#e3f2fd' },
      at_customer:   { label: lang === 'zh' ? '客戶端' : 'At customer',     color: '#880e4f', bg: '#fce4ec' },
    };
    const s = map[status] || { label: status, color: 'var(--dk-text-2)', bg: 'var(--bg-section)' };
    return <span style={{ padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>{s.label}</span>;
  };

  if (!hasRules && !loading) {
    return (
      <div>
        <div className="page-header">
          <div className="page-title">{t.reusableTitle}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--dk-text-3)', fontSize: 13 }}>
          {lang === 'zh' ? '尚未設定循環包材規則 (recycled_container_rules)' : 'No reusable container rules configured (recycled_container_rules)'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{t.reusableTitle}</div>
          <div className="page-subtitle">{lang === 'zh' ? '包材生命週期追蹤' : 'Container lifecycle tracking'}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchData}>{lang === 'zh' ? '重新整理' : 'Refresh'}</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--dk-text-3)' }}>{lang === 'zh' ? '載入中...' : 'Loading...'}</div>
        ) : (
          <div className="history-table-container">
            <table className="history-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>{t.colBarcode}</th>
                  <th>{lang === 'zh' ? '狀態' : 'Status'}</th>
                  <th>{t.colUses}</th>
                  <th>{t.colMaxUses}</th>
                  <th>{lang === 'zh' ? '最後出貨' : 'Last shipped'}</th>
                  <th>{lang === 'zh' ? '操作' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                {trackingList.map(item => {
                  const prefix = Object.keys(rules).find(p => item.barcode.startsWith(p));
                  const ruleInfo = rules[prefix];
                  const maxLimit = ruleInfo?.maxUses ?? null;
                  const warnAt   = ruleInfo?.warnAt ?? null;
                  const isOver   = maxLimit !== null && item.use_count >= maxLimit;
                  const isWarn   = warnAt !== null && item.use_count >= warnAt && !isOver;
                  return (
                    <tr key={item.barcode} style={{ background: isOver ? '#fff3e0' : isWarn ? '#fffde7' : 'transparent' }}>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{item.barcode}</span>
                        {isOver && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 9 }}>{lang === 'zh' ? '超限' : 'Over limit'}</span>}
                        {isWarn && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 9 }}>{lang === 'zh' ? '警告' : 'Warning'}</span>}
                      </td>
                      <td>{statusBadge(item.current_status)}</td>
                      <td style={{ color: isOver ? '#c62828' : isWarn ? '#f57f17' : 'var(--dk-text)', fontWeight: isOver ? 700 : 400, fontSize: 13 }}>{item.use_count}</td>
                      <td style={{ fontSize: 13, color: 'var(--dk-text-2)' }}>{maxLimit ?? '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--dk-text-3)' }}>
                        {item.last_shipped_at ? new Date(item.last_shipped_at).toLocaleString(lang === 'zh' ? 'zh-TW' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td>
                        {item.current_status === 'ready_to_ship' && (
                          <button className="btn btn-success btn-sm" style={{ fontSize: 10, padding: '4px 10px', minHeight: 'unset' }}
                            disabled={isSubmitting}
                            onClick={() => handleConfirmReturn(item.barcode)}>
                            {lang === 'zh' ? '確認回廠' : 'Confirm return'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {trackingList.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30, fontSize: 13, color: 'var(--dk-text-3)' }}>
                {lang === 'zh' ? '尚無追蹤記錄' : 'No containers tracked yet'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
