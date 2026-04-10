import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ t, lang, turnoverItems, fetchTurnover, showAlert, showConfirm, currentUser }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [extCleanModal, setExtCleanModal] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [palletRules, setPalletRules] = useState([]);
  
  // 當前正在處理的對象（單桶或棧板）
  const [processingItem, setProcessingItem] = useState(null); 
  const [scannedChildren, setScannedChildren] = useState([]);

  useEffect(() => {
    const fetchRules = async () => {
      const { data } = await supabase.from('pallet_barcode_rules').select('*');
      if (data) setPalletRules(data);
    };
    fetchRules();
  }, []);

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // 開啟掃描視窗前的檢查
  const handleOpenModal = () => {
    if (selectedIds.length === 0) return showAlert(t.msgSelectFirst);
    if (selectedIds.length > 1) return showAlert("⚠️ 請一次選擇一個項目進行清潔掃描");

    const item = turnoverItems.find(i => i.id === selectedIds[0]);
    const matchedRule = palletRules.find(rule => item.product_barcode.startsWith(rule.prefix));

    setProcessingItem({
      ...item,
      isPallet: !!matchedRule,
      requiredQty: matchedRule ? matchedRule.qty_per_pallet : 1 // 單桶只需掃 1 次
    });
    setExtCleanModal(true);
    setScanInput('');
    setScannedChildren([]);
  };

  // 核心掃描邏輯
  const handleScanProcess = async (e) => {
    e.preventDefault();
    const barcode = scanInput.trim();
    if (!barcode) return;

    if (!processingItem.isPallet) {
      // -------------------------------------------------------
      // 【情況 A：單一包材】強制驗證掃描內容是否一致
      // -------------------------------------------------------
      if (barcode !== processingItem.product_barcode) {
        setScanInput('');
        return showAlert("❌ 掃描條碼與選取項目不符！");
      }
      await executeSingleFinish(barcode);
    } else {
      // -------------------------------------------------------
      // 【情況 B：棧板】掃描子桶
      // -------------------------------------------------------
      if (barcode === processingItem.product_barcode) return setScanInput(''); // 不能掃母棧板充數
      if (scannedChildren.includes(barcode)) return setScanInput('');

      const newChildren = [...scannedChildren, barcode];
      setScannedChildren(newChildren);
      setScanInput('');

      if (newChildren.length === processingItem.requiredQty) {
        await executePalletFinish(processingItem.product_barcode, newChildren);
      }
    }
  };

  // 單桶完工邏輯
  const executeSingleFinish = async (barcode) => {
    const newBatchNo = `BATCH-S-${barcode}-${Date.now().toString().slice(-4)}`;
    // 1. 建立生產批次
    await supabase.from('production_batches').insert([{ batch_no: newBatchNo, material_code: barcode.split('-')[0], status: 'pending' }]);
    await supabase.from('production_containers').insert([{ batch_no: newBatchNo, barcode: barcode, current_step: 1 }]);
    // 2. 扣除庫存
    await supabase.from('turnover_inventory').delete().eq('product_barcode', barcode);
    
    finishAll(newBatchNo);
  };

  // 棧板完工邏輯
  const executePalletFinish = async (parent, children) => {
    const newBatchNo = `BATCH-P-${parent}-${Date.now().toString().slice(-4)}`;
    // 1. 紀錄母子關聯
    await supabase.from('pallet_container_map').insert(children.map(c => ({ parent_pallet: parent, child_barcode: c, action_type: 'SPLIT', operator: currentUser })));
    // 2. 建立生產批次
    await supabase.from('production_batches').insert([{ batch_no: newBatchNo, material_code: parent.split('-')[0], status: 'pending' }]);
    await supabase.from('production_containers').insert(children.map(c => ({ batch_no: newBatchNo, barcode: c, current_step: 1 })));
    // 3. 扣除庫存
    await supabase.from('turnover_inventory').delete().eq('product_barcode', parent);
    
    finishAll(newBatchNo);
  };

  const finishAll = (batchNo) => {
    showAlert(`✅ ${t.msgAutoSuccess} (${batchNo})`);
    setExtCleanModal(false);
    setSelectedIds([]);
    fetchTurnover();
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ color: '#c2185b' }}>🏭 {t.turnoverTitle} ({turnoverItems.length})</h2>
        <button className="btn" style={{ background: '#9c27b0' }} onClick={handleOpenModal}>
          ✨ {t.btnExtCleaning}
        </button>
      </div>

      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              <th>Time</th>
              <th>Barcode/Batch</th>
              <th>Date</th>
              <th>Op</th>
            </tr>
          </thead>
          <tbody>
            {turnoverItems.map(item => (
              <tr key={item.id} onClick={() => toggleSelect(item.id)} style={{ cursor: 'pointer', background: selectedIds.includes(item.id) ? '#fce4ec' : '' }}>
                <td><input type="checkbox" checked={selectedIds.includes(item.id)} readOnly /></td>
                <td>{new Date(item.added_at).toLocaleString()}</td>
                <td style={{ fontWeight: 'bold' }}>📦 {item.product_barcode}</td>
                <td>📅 {item.batch_date}</td>
                <td>👤 {item.added_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {extCleanModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h3 style={{ color: '#9c27b0' }}>
              {processingItem.isPallet ? `📦 ${t.extCleanTitle}` : `✨ External Cleaning`}
            </h3>
            <p>Target: <b>{processingItem.product_barcode}</b></p>
            
            <form onSubmit={handleScanProcess}>
              <p>
                {processingItem.isPallet 
                  ? t.extCleanScanChild.replace('{current}', scannedChildren.length).replace('{total}', processingItem.requiredQty)
                  : "請掃描桶號條碼以確認清潔..."}
              </p>
              
              <input 
                type="text" 
                className="input-field" 
                value={scanInput} 
                onChange={e => setScanInput(e.target.value.toUpperCase())} 
                autoFocus 
                placeholder="Waiting for scan..."
              />

              {processingItem.isPallet && (
                <div style={{ marginTop: '10px', textAlign: 'left', maxHeight: '100px', overflowY: 'auto', fontSize: '13px' }}>
                  {scannedChildren.map((c, i) => <div key={i}>✅ {c}</div>)}
                </div>
              )}

              <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: '20px' }} onClick={() => setExtCleanModal(false)}>
                {t.btnCancel}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
