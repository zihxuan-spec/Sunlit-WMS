import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function ReusableTracking({ t, lang, showAlert }) {
  const [trackingList, setTrackingList] = useState([]);
  const [rules, setRules] = useState({});
  const [hasRules, setHasRules] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const { data: ruleData } = await supabase.from('recycled_container_rules').select('*');
    const ruleObj = {};
    if (ruleData && ruleData.length > 0) {
      ruleData.forEach(r => { ruleObj[r.prefix] = { maxUses: r.max_uses, warnAt: r.warn_at }; });
      setHasRules(true);
    }
    setRules(ruleObj);

    const { data: trackData, error } = await supabase.from('reusable_tracking').select('*').order('use_count', { ascending: false });
    if (error) { showAlert(t.msgFail); return; }
    if (trackData) setTrackingList(trackData);
  };

  const getStatusLabel = (status) => {
    const labels = { in_plant: t.statusInPlant, ready_to_ship: t.statusReadyShip, at_customer: t.statusAtCustomer };
    return labels[status] || status;
  };

  if (!hasRules) {
    return (
      <div className="card">
        <h2 style={{ color: '#009688' }}>{t.reusableTitle}</h2>
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--dk-text-3)' }}>
          {lang === 'zh'
            ? '尚未設定任何循環包材規則 (recycled_container_rules)，無需顯示追蹤表。'
            : 'No reusable container rules configured (recycled_container_rules). Tracking table not shown.'}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ color: '#009688' }}>{t.reusableTitle}</h2>
      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th>{t.colBarcode}</th>
              <th>{t.colStatus}</th>
              <th>{t.colUses}</th>
              <th>{t.colMaxUses}</th>
              <th>{t.colTime} (Last Update)</th>
            </tr>
          </thead>
          <tbody>
            {trackingList.map(item => {
              const prefix = Object.keys(rules).find(p => item.barcode.startsWith(p));
              const ruleInfo = rules[prefix];
              const maxLimit = ruleInfo ? ruleInfo.maxUses : null;
              const warnAt = ruleInfo ? ruleInfo.warnAt : null;
              const isOverLimit = maxLimit !== null && item.use_count >= maxLimit;
              const isWarning = warnAt !== null && item.use_count >= warnAt && !isOverLimit;

              return (
                <tr key={item.barcode} style={{ backgroundColor: isOverLimit ? '#fff3e0' : isWarning ? '#fffde7' : 'transparent' }}>
                  <td style={{ fontWeight: 'bold' }}>
                    {item.barcode}
                    {isOverLimit && ' ⚠️'}
                    {isWarning && ' ⚡'}
                  </td>
                  <td>
                    <span style={{
                      padding: '3px 8px', borderRadius: '4px', fontSize: '12px',
                      background: item.current_status === 'in_plant' ? '#e0f2f1' : item.current_status === 'ready_to_ship' ? '#e3f2fd' : '#fce4ec',
                      color: item.current_status === 'in_plant' ? '#00796b' : item.current_status === 'ready_to_ship' ? '#1565c2' : '#880e4f'
                    }}>
                      {getStatusLabel(item.current_status)}
                    </span>
                  </td>
                  <td style={{ color: isOverLimit ? '#d32f2f' : isWarning ? '#f57f17' : 'inherit', fontWeight: isOverLimit ? 'bold' : 'normal' }}>
                    {item.use_count}
                  </td>
                  <td>{maxLimit ?? '--'}</td>
                  <td style={{ fontSize: '12px', color: 'var(--dk-text-3)' }}>
                    {item.last_shipped_at ? new Date(item.last_shipped_at).toLocaleString() : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {trackingList.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--dk-text-3)' }}>No reusable containers tracked.</div>
        )}
      </div>
    </div>
  );
}
