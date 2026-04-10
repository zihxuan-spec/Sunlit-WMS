import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({ t, lang, turnoverItems, fetchTurnover, showAlert, showConfirm, currentUser }) {
  const [extCleanModal, setExtCleanModal] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [palletRules, setPalletRules] = useState([]);
  
  // 拆棧板模式的狀態
  const [currentPallet, setCurrentPallet] = useState(null); // { barcode, requiredQty, item }
  const [scannedChildren, setScannedChildren] = useState([]);

  useEffect(() => {
    const fetchRules = async () => {
      const { data } = await supabase.from('pallet_barcode_rules').select('*');
      if (data) setPalletRules(data);
    };
    fetchRules();
  }, []);

  // 核心邏輯：處理 External Cleaning 的掃描動作
  const handleScanSubmit = async (e) => {
  e.preventDefault();
  const barcode = scanInput.trim();
  if (!barcode) return;

  // 1. 先確認該條碼是否存在於 Turnover 清單
  const turnoverItem = turnoverItems.find(i => i.product_barcode === barcode);
  if (!turnoverItem && !currentPallet) {
    return showAlert(t.msgPalletNotFound);
  }

  // 2. 自動判斷：是「棧板」還是「單桶」？
  if (!currentPallet) {
    const matchedRule = palletRules.find(rule => barcode.startsWith(rule.prefix));

    if (matchedRule) {
      // 【情況 B：棧板】進入拆棧板模式
      setCurrentPallet({ 
        barcode: barcode, 
        requiredQty: matchedRule.qty_per_pallet,
        item: turnoverItem 
      });
      setScanInput('');
    } else {
      // 【情況 A：單一包材】直接跳確認框，不進拆棧板流程
      setExtCleanModal(false); // 關閉掃描窗
      showConfirm(`偵測到單桶【${barcode}】，確認執行 External Cleaning 並送入生產？`, async () => {
        await executeSingleCleaning(barcode);
      });
      setScanInput('');
    }
    return;
  }

    // 3. 棧板模式下的子包材掃描邏輯
    if (barcode === currentPallet.barcode) return setScanInput(''); // 避免重複掃母棧板
    if (scannedChildren.includes(barcode)) return setScanInput(''); 

    const newChildren = [...scannedChildren, barcode];
    setScannedChildren(newChildren);
    setScanInput('');

    // 4. 掃滿數量，執行拆分與觸發 MES
    if (newChildren.length === currentPallet.requiredQty) {
      await executePalletSplit(currentPallet.barcode, newChildren);
    }
  };

  // 處理單一包材：直接進 MES
  const handleSingleCleaning = async (barcode, item) => {
    showConfirm(t.msgAutoConfirm.replace('{n}', 1).replace('{z}', 'MES Pending'), async () => {
      const newBatchNo = `BATCH-S-${barcode}-${Date.now().toString().slice(-4)}`;
      
      // 建立生產批次
      await supabase.from('production_batches').insert([{
        batch_no: newBatchNo,
        material_code: barcode.split('-')[0],
        status: 'pending'
      }]);

      await supabase.from('production_containers').insert([{
        batch_no: newBatchNo,
        barcode: barcode,
        current_step: 1
      }]);

      // 從庫存移出
      await supabase.from('turnover_inventory').delete().eq('product_barcode', barcode);
      
      showAlert(t.msgAutoSuccess + ` (${newBatchNo})`);
      fetchTurnover();
      setExtCleanModal(false);
      setScanInput('');
    });
  };

  // 處理棧板拆分：記錄關聯並進 MES
  const executePalletSplit = async (parentBarcode, childrenBarcodes) => {
    const todayDate = new Date().toISOString().split('T')[0];
    const newBatchNo = `BATCH-P-${parentBarcode}-${Date.now().toString().slice(-4)}`;

    // A. 記錄母子關聯
    const mapRecords = childrenBarcodes.map(child => ({
      parent_pallet: parentBarcode,
      child_barcode: child,
      action_type: 'SPLIT',
      operator: currentUser
    }));
    await supabase.from('pallet_container_map').insert(mapRecords);

    // B. 更新庫存與生產批次
    await supabase.from('turnover_inventory').delete().eq('product_barcode', parentBarcode);
    
    await supabase.from('production_batches').insert([{
      batch_no: newBatchNo,
      material_code: parentBarcode.split('-')[0],
      status: 'pending'
    }]);

    const containerRecords = childrenBarcodes.map(child => ({
      batch_no: newBatchNo,
      barcode: child,
      current_step: 1
    }));
    await supabase.from('production_containers').insert(containerRecords);

    showAlert(t.msgSplitSuccess + ` (${newBatchNo})`);
    fetchTurnover();
    setCurrentPallet(null);
    setScannedChildren([]);
    setExtCleanModal(false);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#c2185b' }}>🏭 {t.turnoverTitle} (Total: {turnoverItems.length})</h2>
        <button className="btn" style={{ background: '#9c27b0' }} onClick={() => setExtCleanModal(true)}>
          ✨ {t.btnExtCleaning}
        </button>
      </div>

      {/* 列表渲染區 */}
      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Barcode/Batch</th>
              <th>Date</th>
              <th>Op</th>
            </tr>
          </thead>
          <tbody>
            {turnoverItems.map(item => (
              <tr key={item.id}>
                <td>{new Date(item.added_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td style={{ fontWeight: 'bold', color: '#1565c2' }}>📦 {item.product_barcode}</td>
                <td>📅 {item.batch_date}</td>
                <td>👤 {item.added_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* External Cleaning / Pallet Splitting Modal */}
      {extCleanModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <h3 style={{ color: '#9c27b0' }}>
              {currentPallet ? `📦 ${t.extCleanTitle}` : `✨ External Cleaning`}
            </h3>
            
            <form onSubmit={handleScanSubmit}>
              <p style={{ marginBottom: '10px' }}>
                {currentPallet 
                  ? t.extCleanScanChild.replace('{current}', scannedChildren.length).replace('{total}', currentPallet.requiredQty)
                  : t.extCleanScanPallet}
              </p>
              
              <input 
                type="text"
                className="input-field"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value.toUpperCase())}
                autoFocus
                placeholder="Scan Barcode..."
                style={{ fontSize: '24px', textAlign: 'center', height: '60px' }}
              />

              {currentPallet && (
                <div style={{ marginTop: '15px', textAlign: 'left', background: '#f3e5f5', padding: '10px', borderRadius: '8px' }}>
                  <small>Parent: <b>{currentPallet.barcode}</b></small>
                  <ul style={{ margin: '5px 0', fontSize: '13px' }}>
                    {scannedChildren.map((c, i) => <li key={i}>✅ {c}</li>)}
                  </ul>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => {
                  setExtCleanModal(false); setCurrentPallet(null); setScannedChildren([]);
                }}>
                  {t.btnCancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
