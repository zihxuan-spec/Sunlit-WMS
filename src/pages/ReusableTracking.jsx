import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function ReusableTracking({ t, lang, showAlert }) {
  const [trackingList, setTrackingList] = useState([]);
  const [rules, setRules] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // 1. 抓取規則 (例如哪些前綴要追蹤)
    const { data: ruleData } = await supabase.from('recycled_container_rules').select('*');
    const ruleObj = {};
    if (ruleData) ruleData.forEach(r => ruleObj[r.prefix] = r.max_uses);
    setRules(ruleObj);

    // 2. 抓取追蹤資料
    const { data: trackData } = await supabase.from('reusable_tracking').select('*').order('use_count', { ascending: false });
    if (trackData) setTrackingList(trackData);
  };

  const getStatusLabel = (status) => {
    const labels = {
      'in_plant': t.statusInPlant,
      'ready_to_ship': t.statusReadyShip,
      'at_customer': t.statusAtCustomer
    };
    return labels[status] || status;
  };

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
              // 找出匹配的規則前綴
              const prefix = Object.keys(rules).find(p => item.barcode.startsWith(p));
              const maxLimit = rules[prefix] || '--';
              const isOverLimit = maxLimit !== '--' && item.use_count >= maxLimit;

              return (
                <tr key={item.barcode} style={{ backgroundColor: isOverLimit ? '#fff3e0' : 'transparent' }}>
                  <td style={{ fontWeight: 'bold' }}>
                    {item.barcode} {isOverLimit && '⚠️'}
                  </td>
                  <td>
                    <span className={`badge ${item.current_status}`} style={{ 
                      padding: '4px 8px', borderRadius: '4px', fontSize: '12px',
                      background: item.current_status === 'in_plant' ? '#e0f2f1' : '#e3f2fd',
                      color: item.current_status === 'in_plant' ? '#00796b' : '#1565c2'
                    }}>
                      {getStatusLabel(item.current_status)}
                    </span>
                  </td>
                  <td style={{ color: isOverLimit ? '#d32f2f' : 'inherit', fontWeight: isOverLimit ? 'bold' : 'normal' }}>
                    {item.use_count}
                  </td>
                  <td>{maxLimit}</td>
                  <td style={{ fontSize: '12px', color: '#666' }}>
                    {item.last_shipped_at ? new Date(item.last_shipped_at).toLocaleString() : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {trackingList.length === 0 && <div style={{textAlign: 'center', padding: '20px', color: '#999'}}>No reusable containers tracked.</div>}
      </div>
    </div>
  );
}
