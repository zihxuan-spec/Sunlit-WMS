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

  // Pallet splitting state
  const [currentPalletInput, setCurrentPalletInput] = useState('');
  const [currentPalletRule, setCurrentPalletRule] = useState(null);
  const [splitPallets, setSplitPallets] = useState([]); // [{ palletBarcode, children: [] }]
  const [currentChildren, setCurrentChildren] = useState([]);
  const [palletScanInput, setPalletScanInput] = useState('');

  useEffect(() => {
    fetchPalletRules();
  }, []);

  const fetchPalletRules = async () => {
    const { data } = await supabase.from('pallet_barcode_rules').select('*');
    if (data) setPalletRules(data);
  };

  // Items still waiting to be cleaned (no batch_no, status raw/null)
  const rawItems = turnoverItems.filter(i => !i.batch_no && (i.status === 'raw' || !i.status));
  // Items pending production
  const pendingItems = turnoverItems.filter(i => i.status === 'pending');
  // Completed batches (grouped)
  const completedBatches = turnoverItems
    .filter(i => i.status === 'completed')
    .reduce((acc, curr) => {
      if (!acc[curr.batch_no]) acc[curr.batch_no] = { bNo: curr.batch_no, code: curr.material_code, items: [] };
      acc[curr.batch_no].items.push(curr);
      return acc;
    }, {});

  const getPalletRule = (barcode) => palletRules.find(r => barcode.startsWith(r.prefix));

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
    // Check if batch already exists
    const { data } = await supabase.from('production_batches').select('batch_no').eq('batch_no', bNo).single();
    if (data) return showAlert(t.msgBatchExists);

    // Determine if any selected item is a pallet
    const selectedItems = rawItems.filter(i => selectedIds.includes(i.id));
    const hasPallet = selectedItems.some(i => getPalletRule(i.product_barcode));

    if (hasPallet) {
      setStep('splitting');
    } else {
      setStep('scanning');
    }
  };

  // ── Normal (non-pallet) scanning ──────────────────────────────────────
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
      finalizeBatch(selectedItems, batchNoInput.trim().toUpperCase(), []);
    }
  };

  // ── Pallet splitting scanning ─────────────────────────────────────────
  const handlePalletScan = (e) => {
    e.preventDefault();
    const input = palletScanInput.trim().toUpperCase();
    if (!input) return;

    if (!currentPalletRule) {
      // Expect a parent pallet barcode
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
      // Scanning child drums
      if (currentChildren.includes(input)) return showAlert(t.msgAlreadyScanned);
      const newChildren = [...currentChildren, input];
      setCurrentChildren(newChildren);
      setPalletScanInput('');

      if (newChildren.length >= currentPalletRule.containers_per_pallet) {
        // Pallet complete
        const newSplitPallets = [...splitPallets, { palletBarcode: currentPalletInput, children: newChildren }];
        setSplitPallets(newSplitPallets);
        setCurrentPalletInput('');
        setCurrentPalletRule(null);
        setCurrentChildren([]);

        // Check if all selected pallets are done
        const selectedItems = rawItems.filter(i => selectedIds.includes(i.id));
        const allParentBarcodes = selectedItems.map(i => i.product_barcode);
        const doneBarcodes = newSplitPallets.map(p => p.palletBarcode);
        const remaining = allParentBarcodes.filter(b => !doneBarcodes.includes(b));
        if (remaining.length === 0) {
          finalizeSplitBatch(selectedItems, batchNoInput.trim().toUpperCase(), newSplitPallets);
        } else {
          showAlert(t.msgSplitSuccess + ` (${remaining.length} remaining)`);
        }
      }
    }
  };

  const finalizeBatch = async (selectedItems, bNo, splitData) => {
    const materialCode = selectedItems[0]?.material_code || '';
    const { error: batchErr } = await supabase.from('production_batches').insert([{
      batch_no: bNo, material_code: materialCode, status: 'pending', operator: currentUser
    }]);
    if (batchErr) return showAlert(t.msgFail);

    await supabase.from('production_containers').insert(
      selectedItems.map(i => ({ batch_no: bNo, barcode: i.product_barcode, current_step: 1 }))
    );
    await supabase.from('turnover_inventory').update({
      status: 'pending', batch_no: bNo, updated_at: new Date().toISOString()
    }).in('id', selectedIds);

    setStep('idle');
    setSelectedIds([]);
    setScannedItems([]);
    fetchTurnover();
    showAlert(t.msgCleanComplete);
  };

  const finalizeSplitBatch = async (selectedItems, bNo, splitPalletsData) => {
    const materialCode = selectedItems[0]?.material_code || '';
    const { error: batchErr } = await supabase.from('production_batches').insert([{
      batch_no: bNo, material_code: materialCode, status: 'pending', operator: currentUser
    }]);
    if (batchErr) return showAlert(t.msgFail);

    // All child barcodes become production containers
    const allChildren = splitPalletsData.flatMap(p => p.children);
    if (allChildren.length > 0) {
      await supabase.from('production_containers').insert(
        allChildren.map(bc => ({ batch_no: bNo, barcode: bc, current_step: 1 }))
      );
    }

    // Write pallet_container_map
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

    // Update turnover: parent pallet entries → pending
    await supabase.from('turnover_inventory').update({
      status: 'pending', batch_no: bNo, updated_at: new Date().toISOString()
    }).in('id', selectedIds);

    setStep('idle');
    setSelectedIds([]);
    setSplitPallets([]);
    setCurrentChildren([]);
    setCurrentPalletRule(null);
    fetchTurnover();
    showAlert(t.msgSplitComplete);
  };

  const handleMoveToOutbound = (bNo, items) => {
    showConfirm(
      `Move batch ${bNo} (${items.length} items) to Outbound?`,
      async () => {
        const { error } = await supabase.from('turnover_inventory')
          .update({ location: 'Outbound', updated_at: new Date().toISOString() })
          .eq('batch_no', bNo);
        if (error) return showAlert(t.msgFail);

        // Push to outboundAssignItems so Outbound page shows them
        const outItems = items.map(i => ({ id: i.id, barcode: i.product_barcode, batch_no: i.batch_no }));
        setOutboundAssignItems(prev => {
          const existing = prev.map(p => p.id);
          const newItems = outItems.filter(o => !existing.includes(o.id));
          return [...prev, ...newItems];
        });
        fetchTurnover();
        setCurrentView('outbound');
        setActiveWarehouse('South Warehouse');
        showAlert(t.msgAutoSuccess);
      }
    );
  };

  const selectedItems = rawItems.filter(i => selectedIds.includes(i.id));
  const totalToScan = selectedItems.length;

  return (
    <div className="card" style={{ padding: '20px' }}>
      <h2 style={{ color: '#9c27b0', borderBottom: '2px solid #9c27b0', paddingBottom: '10px' }}>
        🏭 {t.turnoverTitle}
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '20px' }}>
        {/* Column 1: Waiting for cleaning */}
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '10px', minHeight: '400px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 style={{ margin: 0 }}>🧹 {t.btnExtCleaning} ({rawItems.length})</h4>
            <button className="btn" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={handleStartCleaning}>
              {t.btnExtCleaning}
            </button>
          </div>
          {rawItems.map(item => (
            <div key={item.id}
              onClick={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}
              style={{
                background: selectedIds.includes(item.id) ? '#e1f5fe' : '#fff',
                padding: '10px', marginBottom: '8px', cursor: 'pointer', borderRadius: '6px',
                border: selectedIds.includes(item.id) ? '2px solid #03a9f4' : '1px solid #eee'
              }}>
              <strong style={{ fontSize: '13px' }}>{item.product_barcode}</strong>
              {item.material_code && <div style={{ fontSize: '11px', color: '#666' }}>{item.material_code}</div>}
              {getPalletRule(item.product_barcode) && (
                <span style={{ fontSize: '10px', background: '#ff9800', color: '#fff', borderRadius: '4px', padding: '1px 6px', marginTop: '2px', display: 'inline-block' }}>
                  PALLET
                </span>
              )}
            </div>
          ))}
          {rawItems.length === 0 && <div style={{ color: '#aaa', textAlign: 'center', marginTop: '30px' }}>{t.turnoverEmpty}</div>}
        </div>

        {/* Column 2: Pending production */}
        <div style={{ background: '#fff3e0', padding: '15px', borderRadius: '10px' }}>
          <h4>⚙️ Pending ({pendingItems.length})</h4>
          {pendingItems.map(item => (
            <div key={item.id} style={{ background: '#fff', padding: '10px', marginBottom: '8px', borderRadius: '6px', borderLeft: '5px solid #ff9800' }}>
              <strong style={{ fontSize: '13px' }}>{item.product_barcode}</strong>
              <div style={{ fontSize: '11px', color: '#666' }}>Batch: {item.batch_no}</div>
            </div>
          ))}
        </div>

        {/* Column 3: Completed batches */}
        <div style={{ background: '#e8f5e9', padding: '15px', borderRadius: '10px' }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#2e7d32' }}>✅ Completed</h4>
          {Object.values(completedBatches).map(b => (
            <div key={b.bNo} style={{ background: '#fff', padding: '10px', marginBottom: '8px', borderRadius: '6px', border: '1px solid #a5d6a7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: '13px' }}>🔢 {b.bNo}</strong>
                  <div style={{ fontSize: '11px', color: '#555' }}>{b.items.length} {lang === 'zh' ? '桶' : 'drums'}</div>
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
          <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', width: '360px' }}>
            <h3>🏷️ {t.labelBatchNo}</h3>
            <p style={{ color: '#666', fontSize: '14px' }}>
              {selectedIds.length} {lang === 'zh' ? '個項目' : 'items'} selected
            </p>
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
              <strong>Batch:</strong> {batchNoInput} &nbsp;|&nbsp;
              <strong>{t.labelPalletNo}s done:</strong> {splitPallets.length} / {selectedIds.length}
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
                <strong style={{ fontSize: '13px' }}>Completed pallets:</strong>
                {splitPallets.map((p, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
                    ✅ {p.palletBarcode} ({p.children.length} drums)
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
