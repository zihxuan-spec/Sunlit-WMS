import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({
  t, lang, currentUser,
  turnoverItems, fetchTurnover,
  showAlert, showConfirm,
  setOutboundAssignItems, setCurrentView, setActiveWarehouse
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchNoInput, setBatchNoInput] = useState('');
  const [step, setStep] = useState('idle'); // idle | batch_input | scanning | splitting
  const [scannedItems, setScannedItems] = useState([]);
  const [scanInput, setScanInput] = useState('');
  const [palletRules, setPalletRules] = useState([]);
  const [barcodeRules, setBarcodeRules] = useState([]); // 單桶前綴規則

  // Pallet splitting state
  const [currentPalletInput, setCurrentPalletInput] = useState('');
  const [currentPalletRule, setCurrentPalletRule] = useState(null);
  const [splitPallets, setSplitPallets] = useState([]);
  const [currentChildren, setCurrentChildren] = useState([]);
  const [palletScanInput, setPalletScanInput] = useState('');

  useEffect(() => {
    fetchAllRules();
  }, []);

  // 同時抓棧板規則和單桶規則
  const fetchAllRules = async () => {
    const [{ data: palletData }, { data: barcodeData }] = await Promise.all([
      supabase.from('pallet_barcode_rules').select('*'),
      supabase.from('barcode_material_rules').select('*')
    ]);
    if (palletData) setPalletRules(palletData);
    if (barcodeData) setBarcodeRules(barcodeData);
  };

  // 從條碼自動判斷 material_code（先查棧板規則，再查單桶規則）
  const getMaterialCode = (barcode) => {
    if (!barcode) return '';
    const palletMatch = palletRules.find(r => barcode.startsWith(r.prefix));
    if (palletMatch?.material_code) return palletMatch.material_code;
    const barcodeMatch = barcodeRules.find(r => barcode.startsWith(r.prefix));
    if (barcodeMatch) return barcodeMatch.material_code;
    return '';
  };

  const getPalletRule = (barcode) => palletRules.find(r => barcode && barcode.startsWith(r.prefix));

  // Items still waiting to be cleaned
  const rawItems = turnoverItems.filter(i => !i.batch_no && (i.status === 'raw' || !i.status));
  const pendingItems = turnoverItems.filter(i => i.status === 'pending');
  const completedBatches = turnoverItems
    .filter(i => i.status === 'completed')
    .reduce((acc, curr) => {
      if (!acc[curr.batch_no]) acc[curr.batch_no] = { bNo: curr.batch_no, code: curr.material_code, items: [] };
      acc[curr.batch_no].items.push(curr);
      return acc;
    }, {});

  const handleStartCleaning = () => {
    if (selectedIds.length === 0) return showAlert(t.msgSelectFirst);
    setBatchNoInput('');
    setScannedItems([]);
    setSplitPallets([]);
    setCurrentChildren([]);
    setCurrentPalletInput('');
    setCurrentPalletRule(null);
    setStep('batch_input');
  };

  const handleBatchNoConfirm = async () => {
    const bNo = batchNoInput.trim().toUpperCase();
    if (!bNo) return showAlert(t.msgNoBatchNo);
    const { data } = await supabase.from('production_batches').select('batch_no').eq('batch_no', bNo).single();
    if (data) return showAlert(t.msgBatchExists);

    const selectedItems = rawItems.filter(i => selectedIds.includes(i.id));
    const pallets = selectedItems.filter(i => getPalletRule(i.product_barcode));
    const singles = selectedItems.filter(i => !getPalletRule(i.product_barcode));

    // 驗證：同一批次必須是同一個 material_code
    const allCodes = selectedItems.map(i => getMaterialCode(i.product_barcode)).filter(Boolean);
    const uniqueCodes = [...new Set(allCodes)];
    if (uniqueCodes.length > 1) {
      return showAlert(lang === 'zh'
        ? `⚠️ 選取的包材對應到不同物料 (${uniqueCodes.join(', ')})，請分開處理。`
        : `⚠️ Selected items map to different materials (${uniqueCodes.join(', ')}). Please process separately.`);
    }

    // 驗證：不可混合棧板和單桶
    if (pallets.length > 0 && singles.length > 0) {
      return showAlert(lang === 'zh'
        ? `⚠️ 選取中混有棧板 (${pallets.length}) 和單桶 (${singles.length})，請分開處理。`
        : `⚠️ Mixed selection: ${pallets.length} pallet(s) and ${singles.length} single drum(s). Please process separately.`);
    }

    // 驗證：條碼無法對應任何物料
    if (uniqueCodes.length === 0) {
      return showAlert(lang === 'zh'
        ? '⚠️ 無法從條碼判斷物料代碼，請確認 barcode_material_rules 或 pallet_barcode_rules 設定。'
        : '⚠️ Cannot determine material code from barcode. Please check barcode_material_rules or pallet_barcode_rules.');
    }

    if (pallets.length > 0) {
      setStep('splitting');
    } else {
      setStep('scanning');
    }
  };

  // ── Normal (non-pallet) scanning ─────────────────────────────────────
  const handleVerifyScan = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    const selectedItems = rawItems.filter(i => selectedIds.includes(i.id));
    const match = selectedItems.find(i => i.product_barcode === input);
    if (!match) return showAlert(t.msgNotInTurnover);
    if (scannedItems.includes(input)) return showAlert(t.msgAlreadyScanned);
    const newScanned = [...scannedItems, input];
    setScannedItems(newScanned);
    setScanInput('');
    if (newScanned.length === selectedItems.length) {
      finalizeBatch(selectedItems, batchNoInput.trim().toUpperCase(), [...selectedIds]);
    }
  };

  // ── Pallet splitting scanning ─────────────────────────────────────────
  const handlePalletScan = (e) => {
    e.preventDefault();
    const input = palletScanInput.trim().toUpperCase();
    if (!input) return;

    if (!currentPalletRule) {
      const rule = getPalletRule(input);
      if (!rule) return showAlert(t.msgInvalidPallet);
      const selectedItems = rawItems.filter(i => selectedIds.includes(i.id));
      const inTurnover = selectedItems.find(i => i.product_barcode === input);
      if (!inTurnover) return showAlert(t.msgPalletNotFound);
      setCurrentPalletInput(input);
      setCurrentPalletRule(rule);
      setCurrentChildren([]);
      setPalletScanInput('');
    } else {
      if (currentChildren.includes(input)) return showAlert(t.msgAlreadyScanned);
      const newChildren = [...currentChildren, input];
      setCurrentChildren(newChildren);
      setPalletScanInput('');

      if (newChildren.length >= currentPalletRule.containers_per_pallet) {
        const newSplitPallets = [...splitPallets, { palletBarcode: currentPalletInput, children: newChildren }];
        setSplitPallets(newSplitPallets);
        setCurrentPalletInput('');
        setCurrentPalletRule(null);
        setCurrentChildren([]);

        const selectedItems = rawItems.filter(i => selectedIds.includes(i.id));
        const allParentBarcodes = selectedItems.map(i => i.product_barcode);
        const doneBarcodes = newSplitPallets.map(p => p.palletBarcode);
        const remaining = allParentBarcodes.filter(b => !doneBarcodes.includes(b));
        if (remaining.length === 0) {
          finalizeSplitBatch(selectedItems, batchNoInput.trim().toUpperCase(), newSplitPallets, [...selectedIds]);
        } else {
          const msg = lang === 'zh'
            ? `✅ 棧板拆解完成！還有 ${remaining.length} 個棧板待拆。`
            : `✅ Pallet split done! ${remaining.length} pallet(s) remaining.`;
          showAlert(msg);
        }
      }
    }
  };

  const finalizeBatch = async (selectedItems, bNo, ids) => {
    // 自動從條碼判斷 material_code
    const materialCode = getMaterialCode(selectedItems[0]?.product_barcode || '');
    if (!materialCode) return showAlert(lang === 'zh'
      ? '⚠️ 無法判斷物料代碼，請確認規則設定。'
      : '⚠️ Cannot determine material code. Check rule settings.');

    const { error: batchErr } = await supabase.from('production_batches').insert([{
      batch_no: bNo, material_code: materialCode, status: 'pending', operator: currentUser
    }]);
    if (batchErr) return showAlert(t.msgFail);

    await supabase.from('production_containers').insert(
      selectedItems.map(i => ({ batch_no: bNo, barcode: i.product_barcode, current_step: 1 }))
    );
    await supabase.from('turnover_inventory').update({
      status: 'pending', batch_no: bNo, updated_at: new Date().toISOString()
    }).in('id', ids);

    setStep('idle');
    setSelectedIds([]);
    setScannedItems([]);
    fetchTurnover();
    showAlert(t.msgCleanComplete);
  };

  const finalizeSplitBatch = async (selectedItems, bNo, splitPalletsData, ids) => {
    // 自動從棧板條碼判斷 material_code
    const materialCode = getMaterialCode(selectedItems[0]?.product_barcode || '');
    if (!materialCode) return showAlert(lang === 'zh'
      ? '⚠️ 無法判斷物料代碼，請確認 pallet_barcode_rules 設定。'
      : '⚠️ Cannot determine material code. Check pallet_barcode_rules settings.');

    const { error: batchErr } = await supabase.from('production_batches').insert([{
      batch_no: bNo, material_code: materialCode, status: 'pending', operator: currentUser
    }]);
    if (batchErr) return showAlert(t.msgFail);

    const allChildren = splitPalletsData.flatMap(p => p.children);
    if (allChildren.length > 0) {
      await supabase.from('production_containers').insert(
        allChildren.map(bc => ({ batch_no: bNo, barcode: bc, current_step: 1 }))
      );
    }

    const mapRows = splitPalletsData.flatMap(p =>
      p.children.map(child => ({
        parent_pallet: p.palletBarcode,
        child_barcode: child,
        action_type: 'SPLIT',
        operator: currentUser
      }))
    );
    if (mapRows.length > 0) {
      await supabase.from('pallet_container_map').insert(mapRows);
    }

    await supabase.from('turnover_inventory').update({
      status: 'pending', batch_no: bNo, updated_at: new Date().toISOString()
    }).in('id', ids);

    setStep('idle');
    setSelectedIds([]);
    setSplitPallets([]);
    setCurrentChildren([]);
    setCurrentPalletRule(null);
    fetchTurnover();
    showAlert(t.msgSplitComplete);
  };

  const handleMoveToOutbound = (bNo, items) => {
    const msg = lang === 'zh'
      ? `確定將批次 ${bNo} (${items.length} 桶) 移至出貨區？`
      : `Move batch ${bNo} (${items.length} items) to Outbound?`;
    showConfirm(msg, async () => {
      const { error } = await supabase.from('turnover_inventory')
        .update({ location: 'Outbound', updated_at: new Date().toISOString() })
        .eq('batch_no', bNo);
      if (error) return showAlert(t.msgFail);

      const outItems = items.map(i => ({ id: i.id, barcode: i.product_barcode, batch_no: i.batch_no }));
      setOutboundAssignItems(prev => {
        const existing = prev.map(p => p.id);
        return [...prev, ...outItems.filter(o => !existing.includes(o.id))];
      });
      fetchTurnover();
      setCurrentView('outbound');
      setActiveWarehouse('South Warehouse');
      showAlert(t.msgAutoSuccess);
    });
  };

  const selectedItems = rawItems.filter(i => selectedIds.includes(i.id));
  const totalToScan = selectedItems.length;

  // 顯示選取項目自動判斷到的 material_code（給使用者確認）
  const detectedMaterialCodes = [...new Set(
    selectedItems.map(i => getMaterialCode(i.product_barcode)).filter(Boolean)
  )];

  return (
    <div className="card" style={{ padding: '20px' }}>
      <h2 style={{ color: '#9c27b0', borderBottom: '2px solid #9c27b0', paddingBottom: '10px' }}>
        🏭 {t.turnoverTitle}
      </h2>

      <div className="kanban-grid">
        {/* Column 1: 待清潔 */}
        <div className="kanban-col" style={{ minHeight: 380 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 style={{ margin: 0 }}>🧹 {t.btnExtCleaning} ({rawItems.length})</h4>
            <button className="btn" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={handleStartCleaning}>
              {t.btnExtCleaning}
            </button>
          </div>

          {/* 已選取時顯示自動判斷的 material_code */}
          {selectedIds.length > 0 && (
            <div style={{ background: detectedMaterialCodes.length === 1 ? '#e8f5e9' : '#fff3e0', borderRadius: '6px', padding: '8px 10px', marginBottom: '10px', fontSize: '12px' }}>
              {detectedMaterialCodes.length === 1
                ? `✅ ${lang === 'zh' ? '物料' : 'Material'}: ${detectedMaterialCodes[0]}`
                : detectedMaterialCodes.length === 0
                  ? `⚠️ ${lang === 'zh' ? '無法判斷物料，請確認規則設定' : 'Cannot detect material'}`
                  : `⚠️ ${lang === 'zh' ? '混合物料' : 'Mixed materials'}: ${detectedMaterialCodes.join(', ')}`
              }
              &nbsp;|&nbsp; {selectedIds.length} {lang === 'zh' ? '已選' : 'selected'}
            </div>
          )}

          {rawItems.map(item => (
            <div key={item.id}
              onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
              style={{
                background: selectedIds.includes(item.id) ? '#e1f5fe' : '#fff',
                padding: '10px', marginBottom: '8px', cursor: 'pointer', borderRadius: '6px',
                border: selectedIds.includes(item.id) ? '2px solid #03a9f4' : '1px solid #eee'
              }}>
              <strong style={{ fontSize: '13px' }}>{item.product_barcode}</strong>
              {/* 顯示自動判斷的 material_code */}
              <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                {getMaterialCode(item.product_barcode)
                  ? `📦 ${getMaterialCode(item.product_barcode)}`
                  : <span style={{ color: '#e53935' }}>⚠️ {lang === 'zh' ? '未知物料' : 'Unknown material'}</span>
                }
              </div>
              {getPalletRule(item.product_barcode) && (
                <span style={{ fontSize: '10px', background: '#ff9800', color: '#fff', borderRadius: '4px', padding: '1px 6px', marginTop: '2px', display: 'inline-block' }}>
                  PALLET
                </span>
              )}
            </div>
          ))}
          {rawItems.length === 0 && <div style={{ color: '#aaa', textAlign: 'center', marginTop: '30px' }}>{t.turnoverEmpty}</div>}
        </div>

        {/* Column 2: 待生產 */}
        <div className="kanban-col">
          <h4>⚙️ {t.mesPending} ({pendingItems.length})</h4>
          {pendingItems.map(item => (
            <div key={item.id} style={{ background: '#fff', padding: '10px', marginBottom: '8px', borderRadius: '6px', borderLeft: '5px solid #ff9800' }}>
              <strong style={{ fontSize: '13px' }}>{item.product_barcode}</strong>
              <div style={{ fontSize: '11px', color: '#666' }}>{t.labelBatchNo}: {item.batch_no}</div>
              {item.material_code && <div style={{ fontSize: '11px', color: '#9c27b0' }}>📦 {item.material_code}</div>}
            </div>
          ))}
        </div>

        {/* Column 3: 已完工 */}
        <div className="kanban-col">
          <h4 style={{ margin: '0 0 15px 0', color: '#2e7d32' }}>✅ {t.mesCompleted}</h4>
          {Object.values(completedBatches).map(b => (
            <div key={b.bNo} style={{ background: '#fff', padding: '10px', marginBottom: '8px', borderRadius: '6px', border: '1px solid #a5d6a7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: '13px' }}>🔢 {b.bNo}</strong>
                  <div style={{ fontSize: '11px', color: '#555' }}>{b.items.length} {lang === 'zh' ? '桶' : 'drums'}</div>
                  {b.code && <div style={{ fontSize: '11px', color: '#9c27b0' }}>📦 {b.code}</div>}
                </div>
                <button className="btn" style={{ background: '#2e7d32', fontSize: '11px', padding: '5px 10px' }}
                  onClick={() => handleMoveToOutbound(b.bNo, b.items)}>
                  🚚 Outbound
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Batch No. Input Modal ── */}
      {step === 'batch_input' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '380px' }}>
            <h3>🏷️ {t.labelBatchNo}</h3>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '6px' }}>
              {selectedIds.length} {lang === 'zh' ? '個項目已選取' : 'items selected'}
            </p>
            {detectedMaterialCodes.length === 1 && (
              <div style={{ background: '#e8f5e9', borderRadius: '6px', padding: '8px 10px', marginBottom: '12px', fontSize: '13px', color: '#2e7d32' }}>
                ✅ {lang === 'zh' ? '自動判斷物料' : 'Auto-detected material'}: <strong>{detectedMaterialCodes[0]}</strong>
              </div>
            )}
            <input type="text" value={batchNoInput} onChange={e => setBatchNoInput(e.target.value.toUpperCase())}
              placeholder={t.batchInputPlaceholder} autoFocus style={{ marginBottom: '10px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('idle')}>{t.btnCancel}</button>
              <button className="btn" style={{ flex: 1 }} onClick={handleBatchNoConfirm}>{t.btnConfirm}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Normal Scan Modal ── */}
      {step === 'scanning' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '420px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3>🧹 External Cleaning — {batchNoInput}</h3>
            {detectedMaterialCodes.length === 1 && (
              <div style={{ background: '#e8f5e9', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px', fontSize: '12px', color: '#2e7d32' }}>
                📦 {detectedMaterialCodes[0]}
              </div>
            )}
            <p style={{ color: '#666', fontSize: '14px' }}>{t.labelScanned}: {scannedItems.length} / {totalToScan}</p>
            <form onSubmit={handleVerifyScan}>
              <input type="text" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())}
                placeholder={t.labelScanPrompt + '...'} autoFocus style={{ marginBottom: '10px' }} />
            </form>
            <div style={{ marginTop: '10px' }}>
              {selectedItems.map(i => (
                <div key={i.id} style={{ padding: '6px 0', borderBottom: '1px solid #eee', fontSize: '14px', color: scannedItems.includes(i.product_barcode) ? '#4caf50' : '#bbb' }}>
                  {scannedItems.includes(i.product_barcode) ? '✅' : '⚪'} {i.product_barcode}
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '15px' }} onClick={() => setStep('idle')}>{t.btnCancel}</button>
          </div>
        </div>
      )}

      {/* ── Pallet Split Modal ── */}
      {step === 'splitting' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '460px', maxHeight: '85vh', overflowY: 'auto' }}>
            <h3>📦 {t.extCleanTitle}</h3>
            <div style={{ background: '#e3f2fd', borderRadius: '8px', padding: '10px', marginBottom: '15px', fontSize: '13px' }}>
              <strong>{t.labelBatchNo}:</strong> {batchNoInput} &nbsp;|&nbsp;
              <strong>{lang === 'zh' ? '棧板完成' : 'Pallets done'}:</strong> {splitPallets.length} / {selectedIds.length}
              {detectedMaterialCodes.length === 1 && (
                <span> &nbsp;|&nbsp; 📦 <strong>{detectedMaterialCodes[0]}</strong></span>
              )}
            </div>

            {!currentPalletRule ? (
              <>
                <p style={{ color: '#555', fontSize: '14px' }}>{t.extCleanScanPallet}</p>
                <form onSubmit={handlePalletScan}>
                  <input type="text" value={palletScanInput} onChange={e => setPalletScanInput(e.target.value.toUpperCase())}
                    placeholder={t.extCleanScanPallet} autoFocus style={{ marginBottom: '10px' }} />
                </form>
              </>
            ) : (
              <>
                <div style={{ background: '#fff3e0', borderRadius: '8px', padding: '10px', marginBottom: '12px', fontSize: '14px' }}>
                  <strong>{t.labelPalletNo}:</strong> {currentPalletInput}<br />
                  <strong>{t.labelChildCount}:</strong> {currentPalletRule.containers_per_pallet}<br />
                  <strong>{t.labelScanned}:</strong> {currentChildren.length} / {currentPalletRule.containers_per_pallet}
                </div>
                <form onSubmit={handlePalletScan}>
                  <input type="text" value={palletScanInput} onChange={e => setPalletScanInput(e.target.value.toUpperCase())}
                    placeholder={t.extCleanScanChild.replace('{current}', currentChildren.length + 1).replace('{total}', currentPalletRule.containers_per_pallet)}
                    autoFocus style={{ marginBottom: '10px' }} />
                </form>
                <div>
                  {currentChildren.map((bc, i) => (
                    <div key={i} style={{ fontSize: '13px', color: '#4caf50', padding: '4px 0' }}>✅ {bc}</div>
                  ))}
                </div>
              </>
            )}

            {splitPallets.length > 0 && (
              <div style={{ marginTop: '12px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                <strong style={{ fontSize: '13px' }}>{lang === 'zh' ? '已完成棧板：' : 'Completed pallets:'}</strong>
                {splitPallets.map((p, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                    ✅ {p.palletBarcode} ({p.children.length} {lang === 'zh' ? '桶' : 'drums'})
                  </div>
                ))}
              </div>
            )}

            <button className="btn btn-secondary" style={{ width: '100%', marginTop: '15px' }} onClick={() => setStep('idle')}>{t.btnCancel}</button>
          </div>
        </div>
      )}
    </div>
  );
}
