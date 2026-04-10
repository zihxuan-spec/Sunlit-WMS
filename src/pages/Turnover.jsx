import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ t, lang, showAlert, currentUser }) {
  const [inventory, setInventory] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    // 抓取所有在 Turnover 區域的物件
    const { data, error } = await supabase
      .from('turnover_inventory')
      .select('*')
      .eq('location', 'Turnover')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setInventory(data || []);
    }
    setLoading(false);
  };

  // 處理移動到 Outbound 的邏輯
  const moveToOutbound = async () => {
    if (!selectedBatch) return alert("請先選擇一個要出貨的 Batch！");

    const confirmMove = window.confirm(`確定要將批次 [${selectedBatch}] 移動到 Outbound 區域嗎？`);
    if (!confirmMove) return;

    setLoading(true);
    // 1. 更新此批次所有桶子的位置到 Outbound
    const { error: invError } = await supabase
      .from('turnover_inventory')
      .update({ 
        location: 'Outbound',
        operator: currentUser,
        updated_at: new Date().toISOString()
      })
      .eq('batch_no', selectedBatch);

    if (invError) {
      alert("更新位置失敗");
    } else {
      alert(`批次 ${selectedBatch} 已成功移至 Outbound！`);
      setSelectedBatch('');
      fetchInventory();
    }
    setLoading(false);
  };

  // 數據分組：將 inventory 依照狀態與批次整理
  const pendingProduction = inventory.filter(item => item.status === 'pending');
  
  // 已完成生產的零件，改以 Batch 進行分組顯示
  const completedBatches = inventory
    .filter(item => item.status === 'completed')
    .reduce((acc, curr) => {
      if (!acc[curr.batch_no]) {
        acc[curr.batch_no] = {
          batch_no: curr.batch_no,
          material_code: curr.material_code,
          count: 0,
          items: []
        };
      }
      acc[curr.batch_no].count += 1;
      acc[curr.batch_no].items.push(curr);
      return acc;
    }, {});

  const completedBatchList = Object.values(completedBatches);

  return (
    <div className="card">
      <h2 style={{ color: '#2e7d32', borderBottom: '2px solid #2e7d32', paddingBottom: '10px' }}>
        🚚 Turnover 庫存管理
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        
        {/* 左側：待生產 (個別包材顯示) */}
        <div style={{ background: '#f5f5f5', padding: '20px', borderRadius: '10px' }}>
          <h4 style={{ marginTop: 0, color: '#666' }}>📦 待生產 (清潔完成)</h4>
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {pendingProduction.length === 0 && <p style={{ color: '#999' }}>目前無待生產零件</p>}
            {pendingProduction.map(item => (
              <div key={item.id} style={{ 
                background: '#fff', padding: '12px', marginBottom: '8px', borderRadius: '5px',
                borderLeft: '5px solid #ffa000', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ fontWeight: 'bold' }}>{item.barcode}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>批次: {item.batch_no} | 物料: {item.material_code}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 右側：已完成生產 (批次化顯示) */}
        <div style={{ background: '#e8f5e9', padding: '20px', borderRadius: '10px', border: '1px solid #c8e6c9' }}>
          <h4 style={{ marginTop: 0, color: '#2e7d32' }}>✅ 已完成生產 (可出貨 Batch)</h4>
          
          {/* 出貨操作區 */}
          <div style={{ marginBottom: '20px', padding: '15px', background: '#fff', borderRadius: '8px', border: '1px solid #a5d6a7' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>選擇出貨批次</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select 
                className="input-field" 
                value={selectedBatch} 
                onChange={(e) => setSelectedBatch(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">-- 請選擇批次 --</option>
                {completedBatchList.map(b => (
                  <option key={b.batch_no} value={b.batch_no}>{b.batch_no} ({b.material_code})</option>
                ))}
              </select>
              <button 
                className="btn" 
                onClick={moveToOutbound}
                disabled={!selectedBatch || loading}
                style={{ background: '#2e7d32', width: '120px' }}
              >
                {loading ? '處理中...' : '移至 Outbound'}
              </button>
            </div>
          </div>

          <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
            {completedBatchList.length === 0 && <p style={{ color: '#999' }}>目前無完成生產之批次</p>}
            {completedBatchList.map(batch => (
              <div 
                key={batch.batch_no} 
                onClick={() => setSelectedBatch(batch.batch_no)}
                style={{ 
                  background: selectedBatch === batch.batch_no ? '#c8e6c9' : '#fff', 
                  padding: '15px', marginBottom: '10px', borderRadius: '8px', 
                  cursor: 'pointer', border: '1px solid #a5d6a7',
                  transition: '0.2s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '16px' }}>🔢 Batch: {batch.batch_no}</strong>
                  <span style={{ background: '#2e7d32', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>
                    {batch.count} Items
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#555', marginTop: '5px' }}>物料代碼: {batch.material_code}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
