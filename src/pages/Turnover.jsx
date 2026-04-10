import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ t, lang, turnoverItems, fetchTurnover, showAlert, showConfirm, currentUser }) {
  const [selectedIds, setSelectedIds] = useState([]); // 存儲勾選的 ID
  const [extCleanModal, setExtCleanModal] = useState(false);
  const [palletRules, setPalletRules] = useState([]);
  
  // 拆棧板模式專用狀態
  const [currentPallet, setCurrentPallet] = useState(null);
  const [scannedChildren, setScannedChildren] = useState([]);
  const [scanInput, setScanInput] = useState('');

  useEffect(() => {
    const fetchRules = async () => {
      const { data } = await supabase.from('pallet_barcode_rules').select('*');
      if (data) setPalletRules(data);
    };
    fetchRules();
  }, []);

  // 1. 處理勾選邏輯
  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // 2. 點擊主按鈕後的判定邏輯
  const handleMainAction = () => {
    if (selectedIds.length === 0) return showAlert(t.msgSelectFirst);
    
    // 取得選中的完整資料
    const selectedItems = turnoverItems.filter(i => selectedIds.includes(i.id));
    
    // 檢查是否包含「棧板」
    const palletItem = selectedItems.find(item => 
      palletRules.some(rule => item.product_barcode.startsWith(rule.prefix))
    );

    if (palletItem) {
      if (selectedIds.length > 1) return showAlert("⚠️ 拆棧板模式一次只能選擇一個棧板！");
      // 進入情況 B：拆棧板
      const rule = palletRules.find(r => palletItem.product_barcode.startsWith(r.prefix));
      setCurrentPallet({ barcode: palletItem.product_barcode, requiredQty: rule.qty_per_pallet });
      setExtCleanModal(true);
    } else {
      // 情況 A：一般單桶，直接批次處理
      showConfirm(`確認對選中的 ${selectedIds.length} 桶執行 External Cleaning 並送入生產？`, async () => {
        await processBatchSingleCleaning(selectedItems);
      });
    }
  };

  // 執行單桶批次清理
  const processBatchSingleCleaning = async (items) => {
    for (const item of items) {
      const newBatchNo = `BATCH-S-${item.product_barcode}-${Date.now().toString().slice(-4)}`;
      await supabase.from('production_batches').insert([{ batch_no: newBatchNo, material_code: item.product_barcode.split('-')[0], status: 'pending' }]);
      await supabase.from('production_containers').insert([{ batch_no: newBatchNo, barcode: item.product_barcode, current_step: 1 }]);
      await supabase.from('turnover_inventory').delete().eq('id', item.id);
    }
    showAlert(t.msgAutoSuccess);
    setSelectedIds([]);
    fetchTurnover();
  };

  // 執行拆棧板掃描邏輯
  const handlePalletScan = async (e) => {
    e.preventDefault();
    const barcode = scanInput.trim();
    if (!barcode || barcode === currentPallet.barcode) return setScanInput('');
    if (scannedChildren.includes(barcode)) return setScanInput('');

    const newChildren = [...scannedChildren, barcode];
    setScannedChildren(newChildren);
    setScanInput('');

    if (newChildren.length === currentPallet.requiredQty) {
      await executeFinalSplit(currentPallet.barcode, newChildren);
    }
  };

  const executeFinalSplit = async (parent, children) => {
    const newBatchNo = `BATCH-P-${parent}-${Date.now().toString().slice(-4)}`;
    // 紀錄母子對應表
    await supabase.from('pallet_container_map').insert(children.map(c => ({ parent_pallet: parent, child_barcode: c, action_type: 'SPLIT', operator: currentUser })));
    // 建立生產任務
    await supabase.from('production_batches').insert([{ batch_no: newBatchNo, material_code: parent.split('-')[0], status: 'pending' }]);
    await supabase.from('production_containers').insert(children.map(c => ({ batch_no: newBatchNo, barcode: c, current_step: 1 })));
    // 刪除母棧板
    await supabase.from('turnover_inventory').delete().eq('product_barcode', parent);
    
    showAlert(t.msgSplitSuccess);
    setExtCleanModal(false); setCurrentPallet(null); setScannedChildren([]); setSelectedIds([]);
    fetchTurnover();
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ color: '#c2185b' }}>🏭 {t.turnoverTitle} ({turnoverItems.length})</h2>
        <button className="btn" style={{ background: '#9c27b0' }} onClick={handleMainAction}>
          ✨ {t.btnExtCleaning}
        </button>
      </div>

      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}><input type="checkbox" onChange={() => {
                if (selectedIds.length === turnoverItems.length) setSelectedIds([]);
                else setSelectedIds(turnoverItems.map(i => i.id));
              }} checked={selectedIds.length === turnoverItems.length && turnoverItems.length > 0} /></th>
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

      {/* 只有在選中棧板時才會開啟的拆分視窗 */}
      {extCleanModal && currentPallet && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h3 style={{ color: '#9c27b0' }}>📦 {t.extCleanTitle}</h3>
            <p>Parent Pallet: <b>{currentPallet.barcode}</b></p>
            <form onSubmit={handlePalletScan}>
              <p>{t.extCleanScanChild.replace('{current}', scannedChildren.length).replace('{total}', currentPallet.requiredQty)}</p>
              <input type="text" className="input-field" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} autoFocus />
              <div style={{ marginTop: '10px', textAlign: 'left', maxHeight: '150px', overflowY: 'auto' }}>
                {scannedChildren.map((c, i) => <div key={i}>✅ {c}</div>)}
              </div>
              <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: '20px' }} onClick={() => { setExtCleanModal(false); setCurrentPallet(null); setScannedChildren([]); }}>{t.btnCancel}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
