import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({
  t, lang, currentUser,
  turnoverItems, fetchTurnover,
  showAlert, showConfirm,
  setOutboundAssignItems, setCurrentView, setActiveWarehouse,
  setPendingItems
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchNoInput, setBatchNoInput] = useState('');
  const [step, setStep] = useState('idle');
  const [scannedItems, setScannedItems] = useState([]);
  const [scanInput, setScanInput] = useState('');
  const [palletRules, setPalletRules] = useState([]);
  const [barcodeRules, setBarcodeRules] = useState([]);
  const [currentPalletInput, setCurrentPalletInput] = useState('');
  const [currentPalletRule, setCurrentPalletRule] = useState(null);
  const [splitPallets, setSplitPallets] = useState([]);
  const [currentChildren, setCurrentChildren] = useState([]);
  const [palletScanInput, setPalletScanInput] = useState('');
  const scanRef = useRef(null);
  const palletRef = useRef(null);

  useEffect(() => { fetchAllRules(); }, []);

  // Auto-focus scan inputs when step changes
  useEffect(() => {
    if (step === 'scanning') setTimeout(() => scanRef.current?.focus(), 100);
    if (step === 'splitting') setTimeout(() => palletRef.current?.focus(), 100);
  }, [step, currentPalletRule]);

  const fetchAllRules = async () => {
    const [{ data: pd }, { data: bd }] = await Promise.all([
      supabase.from('pallet_barcode_rules').select('*'),
      supabase.from('barcode_material_rules').select('*')
    ]);
    if (pd) setPalletRules(pd);
    if (bd) setBarcodeRules(bd);
  };

  const getMaterialCode = (barcode) => {
    if (!barcode) return '';
    const pm = palletRules.find(r => barcode.startsWith(r.prefix));
    if (pm?.material_code) return pm.material_code;
    const bm = barcodeRules.find(r => barcode.startsWith(r.prefix));
    return bm ? bm.material_code : '';
  };
  const getPalletRule = (barcode) => palletRules.find(r => barcode && barcode.startsWith(r.prefix));

  const rawItems        = turnoverItems.filter(i => !i.batch_no && (i.status === 'raw' || !i.status));
  const pendingBatches  = turnoverItems.filter(i => i.status === 'pending').reduce((acc, cur) => {
    if (!acc[cur.batch_no]) acc[cur.batch_no] = { bNo: cur.batch_no, code: cur.material_code, items: [] };
    acc[cur.batch_no].items.push(cur); return acc;
  }, {});
  const completedBatches = turnoverItems.filter(i => i.status === 'completed').reduce((acc, cur) => {
    if (!acc[cur.batch_no]) acc[cur.batch_no] = { bNo: cur.batch_no, code: cur.material_code, items: [] };
    acc[cur.batch_no].items.push(cur); return acc;
  }, {});

  const selectedItems = rawItems.filter(i => selectedIds.includes(i.id));
  const detectedCodes = [...new Set(selectedItems.map(i => getMaterialCode(i.product_barcode)).filter(Boolean))];

  const resetStep = () => {
    setStep('idle'); setScannedItems([]); setSplitPallets([]);
    setCurrentChildren([]); setCurrentPalletInput(''); setCurrentPalletRule(null);
  };

  // Return to inbound: put selected items back into pendingItems
  const handleReturnToInbound = () => {
    if (!selectedIds.length) return showAlert(t.msgSelectFirst);
    showConfirm(
      lang === 'zh'
        ? `將 ${selectedIds.length} 個包材退回入庫等待區？`
        : `Return ${selectedIds.length} item(s) to inbound queue?`,
      async () => {
        // Mark as inbound_return so they disappear from turnover
        await supabase.from('turnover_inventory')
          .update({ status: 'inbound_return', updated_at: new Date().toISOString() })
          .in('id', selectedIds);
        // Re-add to pendingItems in App state
        const barcodes = selectedItems.map(i => i.product_barcode);
        if (setPendingItems) setPendingItems(prev => [...new Set([...prev, ...barcodes])]);
        setSelectedIds([]);
        fetchTurnover();
        setCurrentView('inbound');
        showAlert(lang === 'zh' ? '已退回入庫區，請重新指派貨架。' : 'Returned to inbound. Please reassign shelf.');
      }
    );
  };

  const handleStartCleaning = () => {
    if (!selectedIds.length) return showAlert(t.msgSelectFirst);
    setBatchNoInput(''); setScannedItems([]); setSplitPallets([]);
    setCurrentChildren([]); setCurrentPalletInput(''); setCurrentPalletRule(null);
    setStep('batch_input');
  };

  const handleBatchNoConfirm = async () => {
    const bNo = batchNoInput.trim().toUpperCase();
    if (!bNo) return showAlert(t.msgNoBatchNo);
    const { data } = await supabase.from('production_batches').select('batch_no').eq('batch_no', bNo).maybeSingle();
    if (data) return showAlert(t.msgBatchExists);
    const pallets = selectedItems.filter(i => getPalletRule(i.product_barcode));
    const singles = selectedItems.filter(i => !getPalletRule(i.product_barcode));
    if (detectedCodes.length > 1) return showAlert(lang === 'zh' ? `選取的包材對應不同物料 (${detectedCodes.join(', ')})，請分開處理。` : `Mixed materials (${detectedCodes.join(', ')}). Process separately.`);
    if (pallets.length > 0 && singles.length > 0) return showAlert(lang === 'zh' ? '選取中混有棧板和單桶，請分開處理。' : 'Mixed pallets and drums. Process separately.');
    if (!detectedCodes.length) return showAlert(lang === 'zh' ? '無法從條碼判斷物料代碼，請確認規則設定。' : 'Cannot determine material code. Check barcode rules.');
    setStep(pallets.length > 0 ? 'splitting' : 'scanning');
  };

  const handleVerifyScan = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    if (!selectedItems.find(i => i.product_barcode === input)) {
      showAlert(t.msgNotInTurnover);
      return;
    }
    if (scannedItems.includes(input)) {
      showAlert(t.msgAlreadyScanned);
      return;
    }
    if (navigator.vibrate) navigator.vibrate(40);
    const newScanned = [...scannedItems, input];
    setScannedItems(newScanned); setScanInput('');
    if (newScanned.length === selectedItems.length) finalizeBatch(selectedItems, batchNoInput.trim().toUpperCase(), [...selectedIds]);
  };

  const handlePalletScan = (e) => {
    e.preventDefault();
    const input = palletScanInput.trim().toUpperCase();
    if (!input) return;
    if (!currentPalletRule) {
      const rule = getPalletRule(input);
      if (!rule) { showAlert(t.msgInvalidPallet); return; }
      if (!selectedItems.find(i => i.product_barcode === input)) { showAlert(t.msgPalletNotFound); return; }
      setCurrentPalletInput(input); setCurrentPalletRule(rule); setCurrentChildren([]); setPalletScanInput('');
    } else {
      if (currentChildren.includes(input)) { showAlert(t.msgAlreadyScanned); return; }
      if (navigator.vibrate) navigator.vibrate(40);
      const newChildren = [...currentChildren, input];
      setCurrentChildren(newChildren); setPalletScanInput('');
      if (newChildren.length >= currentPalletRule.containers_per_pallet) {
        const newSplit = [...splitPallets, { palletBarcode: currentPalletInput, children: newChildren }];
        setSplitPallets(newSplit); setCurrentPalletInput(''); setCurrentPalletRule(null); setCurrentChildren([]);
        const remaining = selectedItems.map(i => i.product_barcode).filter(b => !newSplit.map(p => p.palletBarcode).includes(b));
        if (!remaining.length) finalizeSplitBatch(selectedItems, batchNoInput.trim().toUpperCase(), newSplit, [...selectedIds]);
        else showAlert(lang === 'zh' ? `棧板拆解完成。還有 ${remaining.length} 個棧板待拆。` : `Done. ${remaining.length} pallet(s) remaining.`);
      }
    }
  };

  const finalizeBatch = async (items, bNo, ids) => {
    const mc = getMaterialCode(items[0]?.product_barcode || '');
    if (!mc) return showAlert(lang === 'zh' ? '無法判斷物料代碼。' : 'Cannot determine material code.');
    const { error } = await supabase.from('production_batches').insert([{ batch_no: bNo, material_code: mc, status: 'pending', operator: currentUser }]);
    if (error) return showAlert(t.msgFail);
    await supabase.from('production_containers').insert(items.map(i => ({ batch_no: bNo, barcode: i.product_barcode, current_step: 1 })));
    await supabase.from('turnover_inventory').update({ status: 'pending', batch_no: bNo, updated_at: new Date().toISOString() }).in('id', ids);
    resetStep(); setSelectedIds([]); fetchTurnover(); showAlert(t.msgCleanComplete);
  };

  const finalizeSplitBatch = async (items, bNo, splitData, ids) => {
    const mc = getMaterialCode(items[0]?.product_barcode || '');
    if (!mc) return showAlert(lang === 'zh' ? '無法判斷物料代碼。' : 'Cannot determine material code.');
    const { error } = await supabase.from('production_batches').insert([{ batch_no: bNo, material_code: mc, status: 'pending', operator: currentUser }]);
    if (error) return showAlert(t.msgFail);
    const allChildren = splitData.flatMap(p => p.children);
    if (allChildren.length) await supabase.from('production_containers').insert(allChildren.map(bc => ({ batch_no: bNo, barcode: bc, current_step: 1 })));
    const mapRows = splitData.flatMap(p => p.children.map(child => ({ parent_pallet: p.palletBarcode, child_barcode: child, action_type: 'SPLIT', operator: currentUser })));
    if (mapRows.length) await supabase.from('pallet_container_map').insert(mapRows);
    await supabase.from('turnover_inventory').update({ status: 'pending', batch_no: bNo, updated_at: new Date().toISOString() }).in('id', ids);
    resetStep(); setSelectedIds([]); fetchTurnover(); showAlert(t.msgSplitComplete);
  };

  const handleMoveToOutbound = (bNo, items) => {
    showConfirm(lang === 'zh' ? `確定將批次 ${bNo} (${items.length} 桶) 移至出貨區？` : `Move batch ${bNo} (${items.length} items) to Outbound?`, async () => {
      const { error } = await supabase.from('turnover_inventory').update({ location: 'Outbound', updated_at: new Date().toISOString() }).eq('batch_no', bNo);
      if (error) return showAlert(t.msgFail);
      setOutboundAssignItems(prev => {
        const ex = prev.map(p => p.id);
        return [...prev, ...items.map(i => ({ id: i.id, barcode: i.product_barcode, batch_no: i.batch_no })).filter(o => !ex.includes(o.id))];
      });
      fetchTurnover(); setCurrentView('outbound'); setActiveWarehouse('South Warehouse'); showAlert(t.msgAutoSuccess);
    });
  };

  // Shared styles (light-mode aware)
  const surface  = 'var(--lt-surface, var(--dk-surface))';
  const surface2 = 'var(--bg-section)';
  const border   = 'var(--border)';
  const textPrim = 'var(--dk-text)';
  const textMut  = 'var(--dk-text-3)';

  const colH = (accent) => ({
    display:'flex', alignItems:'center', gap:8,
    padding:'11px 14px', borderBottom:`1px solid ${border}`,
    fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px',
    color:'var(--dk-text-2)',
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{lang === 'zh' ? '週轉倉' : 'Turnover'}</div>
          <div className="page-subtitle">{lang === 'zh' ? '包材清潔與批次管理' : 'Cleaning & batch management'}</div>
        </div>
        {selectedIds.length > 0 && (
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost btn-sm" onClick={handleReturnToInbound}>
              {lang === 'zh' ? '退回入庫' : 'Return to Inbound'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleStartCleaning}>
              {t.btnExtCleaning} ({selectedIds.length})
            </button>
          </div>
        )}
      </div>

      {/* Material detection banner */}
      {selectedIds.length > 0 && (
        <div style={{ marginBottom:12, padding:'8px 14px', borderRadius:6, fontSize:12,
          background: detectedCodes.length === 1 ? 'var(--dk-success-bg)' : 'var(--dk-warn-bg)',
          color: detectedCodes.length === 1 ? '#4ade80' : '#fbbf24',
          border:`1px solid ${detectedCodes.length === 1 ? 'rgba(16,185,129,.3)' : 'rgba(245,158,11,.3)'}` }}>
          {detectedCodes.length === 1
            ? `${lang==='zh'?'物料':'Material'}: ${detectedCodes[0]} · ${selectedIds.length} ${lang==='zh'?'已選':'selected'}`
            : detectedCodes.length === 0
              ? lang==='zh'?'無法判斷物料，請確認規則設定':'Cannot detect material — check rule settings'
              : `${lang==='zh'?'混合物料':'Mixed'}: ${detectedCodes.join(', ')} — ${lang==='zh'?'請分開處理':'process separately'}`
          }
        </div>
      )}

      <div className="kanban-grid">

        {/* Col 1: Awaiting cleaning */}
        <div className="kanban-col" style={{ background: surface }}>
          <div style={colH('#f59e0b')}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#f59e0b' }} />
            {lang==='zh'?'待清潔':'Awaiting Cleaning'}
            <span style={{ marginLeft:'auto', background:'rgba(245,158,11,.15)', color:'#fbbf24', padding:'1px 7px', borderRadius:10, fontSize:10 }}>
              {rawItems.length}
            </span>
          </div>
          <div style={{ padding:'8px 10px', overflowY:'auto', maxHeight:420 }}>
            {rawItems.length === 0 && (
              <div style={{ padding:'24px 0', textAlign:'center', fontSize:12, color: textMut }}>{t.turnoverEmpty}</div>
            )}
            {rawItems.map(item => {
              const sel = selectedIds.includes(item.id);
              const mc = getMaterialCode(item.product_barcode);
              const isPallet = !!getPalletRule(item.product_barcode);
              return (
                <div key={item.id}
                  onClick={() => setSelectedIds(prev => sel ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                  style={{ padding:'9px 12px', marginBottom:4, borderRadius:6, cursor:'pointer',
                    background: sel ? 'var(--dk-accent-bg)' : surface2,
                    border:`1px solid ${sel ? 'var(--dk-accent)' : 'transparent'}` }}>
                  <div style={{ fontFamily:'monospace', fontSize:12, fontWeight:700,
                    color: sel ? '#93c5fd' : textPrim }}>
                    {item.product_barcode}
                  </div>
                  <div style={{ display:'flex', gap:5, marginTop:3 }}>
                    {mc && <span className="badge badge-gray" style={{ fontSize:9 }}>{mc}</span>}
                    {isPallet && <span className="badge badge-amber" style={{ fontSize:9 }}>PALLET</span>}
                    {!mc && <span style={{ fontSize:10, color:'var(--dk-danger)' }}>Unknown</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Col 2: Pending production — grouped by batch */}
        <div className="kanban-col" style={{ background: surface }}>
          <div style={colH('#8b5cf6')}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#8b5cf6' }} />
            {t.mesPending}
            <span style={{ marginLeft:'auto', background:'rgba(139,92,246,.15)', color:'#a78bfa', padding:'1px 7px', borderRadius:10, fontSize:10 }}>
              {Object.keys(pendingBatches).length}
            </span>
          </div>
          <div style={{ padding:'8px 10px', overflowY:'auto', maxHeight:420 }}>
            {Object.values(pendingBatches).map(b => (
              <div key={b.bNo} style={{ padding:'9px 12px', marginBottom:4, borderRadius:6, borderLeft:'3px solid #8b5cf6', background: surface2 }}>
                <div style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color: textPrim }}>{b.bNo}</div>
                <div style={{ display:'flex', gap:5, marginTop:3, alignItems:'center' }}>
                  {b.code && <span className="badge badge-purple" style={{ fontSize:9 }}>{b.code}</span>}
                  <span style={{ fontSize:10, color: textMut }}>{b.items.length} {lang==='zh'?'桶':'drums'}</span>
                </div>
              </div>
            ))}
            {Object.keys(pendingBatches).length === 0 && (
              <div style={{ padding:'24px 0', textAlign:'center', fontSize:12, color: textMut }}>—</div>
            )}
          </div>
        </div>

        {/* Col 3: Completed — grouped by batch */}
        <div className="kanban-col" style={{ background: surface }}>
          <div style={colH('#10b981')}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#10b981' }} />
            {t.mesCompleted}
            <span style={{ marginLeft:'auto', background:'rgba(16,185,129,.15)', color:'#34d399', padding:'1px 7px', borderRadius:10, fontSize:10 }}>
              {Object.keys(completedBatches).length}
            </span>
          </div>
          <div style={{ padding:'8px 10px', overflowY:'auto', maxHeight:420 }}>
            {Object.values(completedBatches).map(b => (
              <div key={b.bNo} style={{ padding:'10px 12px', marginBottom:4, borderRadius:6, background: surface2, borderLeft:'3px solid #10b981' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color: textPrim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.bNo}</div>
                    <div style={{ display:'flex', gap:5, marginTop:3, flexWrap:'wrap' }}>
                      {b.code && <span className="badge badge-green" style={{ fontSize:9 }}>{b.code}</span>}
                      <span style={{ fontSize:10, color: textMut }}>{b.items.length} {lang==='zh'?'桶':'drums'}</span>
                    </div>
                  </div>
                  <button className="btn btn-success btn-sm" style={{ flexShrink:0, fontSize:11, padding:'5px 10px', minHeight:'unset' }}
                    onClick={() => handleMoveToOutbound(b.bNo, b.items)}>
                    {lang==='zh'?'轉出貨':'Outbound'}
                  </button>
                </div>
              </div>
            ))}
            {Object.keys(completedBatches).length === 0 && (
              <div style={{ padding:'24px 0', textAlign:'center', fontSize:12, color: textMut }}>—</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Batch No. Modal ── */}
      {step === 'batch_input' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth:420, background: surface }}>
            <h3 style={{ color: textPrim }}>{t.labelBatchNo}</h3>
            <div style={{ fontSize:12, color: textMut, marginBottom:8 }}>
              {selectedIds.length} {lang==='zh'?'個項目已選取':'items selected'}
            </div>
            {detectedCodes.length === 1 && (
              <div style={{ padding:'8px 12px', background:'var(--dk-success-bg)', borderRadius:6, marginBottom:12, fontSize:12, color:'#4ade80' }}>
                {lang==='zh'?'自動判斷物料':'Auto-detected'}: <strong>{detectedCodes[0]}</strong>
              </div>
            )}
            <input value={batchNoInput} onChange={e => setBatchNoInput(e.target.value.toUpperCase())}
              placeholder={t.batchInputPlaceholder} autoFocus />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setStep('idle')}>{t.btnCancel}</button>
              <button className="btn btn-primary" onClick={handleBatchNoConfirm}>{t.btnConfirm}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scan Modal ── */}
      {step === 'scanning' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth:460, background: surface }}>
            <h3 style={{ color: textPrim }}>
              External Cleaning — <span style={{ fontFamily:'monospace', color:'var(--dk-accent)' }}>{batchNoInput}</span>
            </h3>
            {detectedCodes.length === 1 && <span className="badge badge-green" style={{ marginBottom:12, display:'inline-block' }}>{detectedCodes[0]}</span>}
            <div style={{ fontSize:12, color: textMut, marginBottom:10 }}>
              {t.labelScanned}: <strong style={{ color: textPrim }}>{scannedItems.length} / {selectedItems.length}</strong>
            </div>
            <form onSubmit={handleVerifyScan}>
              <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())}
                placeholder={`${t.labelScanPrompt}...`} autoFocus />
            </form>
            <div style={{ marginTop:8 }}>
              {selectedItems.map(i => (
                <div key={i.id} style={{ padding:'7px 0', borderBottom:`1px solid ${border}`, fontSize:12, fontFamily:'monospace',
                  color: scannedItems.includes(i.product_barcode) ? '#10b981' : textMut }}>
                  {scannedItems.includes(i.product_barcode) ? '+' : '○'} {i.product_barcode}
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop:16 }}>
              <button className="btn btn-ghost" onClick={resetStep}>{t.btnCancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pallet Split Modal ── */}
      {step === 'splitting' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth:500, background: surface }}>
            <h3 style={{ color: textPrim }}>{t.extCleanTitle}</h3>
            <div style={{ padding:'8px 12px', background:'var(--dk-accent-bg)', borderRadius:6, marginBottom:14, fontSize:12, color:'#93c5fd' }}>
              Batch: <strong>{batchNoInput}</strong> · Done: {splitPallets.length}/{selectedIds.length}
              {detectedCodes.length === 1 && <> · {detectedCodes[0]}</>}
            </div>
            {!currentPalletRule ? (
              <>
                <div style={{ fontSize:12, color: textMut, marginBottom:8 }}>{t.extCleanScanPallet}</div>
                <form onSubmit={handlePalletScan}>
                  <input ref={palletRef} value={palletScanInput} onChange={e => setPalletScanInput(e.target.value.toUpperCase())}
                    placeholder={t.extCleanScanPallet} autoFocus />
                </form>
              </>
            ) : (
              <>
                <div style={{ padding:'10px 12px', background: surface2, borderRadius:6, marginBottom:12, fontSize:12 }}>
                  <div style={{ color: textMut }}>{t.labelPalletNo}: <strong style={{ fontFamily:'monospace', color:'#93c5fd' }}>{currentPalletInput}</strong></div>
                  <div style={{ color: textMut, marginTop:3 }}>{t.labelScanned}: <strong style={{ color: textPrim }}>{currentChildren.length} / {currentPalletRule.containers_per_pallet}</strong></div>
                </div>
                <form onSubmit={handlePalletScan}>
                  <input ref={palletRef} value={palletScanInput} onChange={e => setPalletScanInput(e.target.value.toUpperCase())}
                    placeholder={t.extCleanScanChild.replace('{current}', currentChildren.length+1).replace('{total}', currentPalletRule.containers_per_pallet)}
                    autoFocus />
                </form>
                {currentChildren.map((bc,i) => (
                  <div key={i} style={{ fontSize:12, fontFamily:'monospace', color:'#10b981', padding:'3px 0' }}>+ {bc}</div>
                ))}
              </>
            )}
            {splitPallets.length > 0 && (
              <div style={{ marginTop:14, borderTop:`1px solid ${border}`, paddingTop:10 }}>
                <div style={{ fontSize:11, color: textMut, marginBottom:4 }}>{lang==='zh'?'已完成：':'Completed:'}</div>
                {splitPallets.map((p,i) => (
                  <div key={i} style={{ fontSize:11, fontFamily:'monospace', color:'#10b981', marginBottom:2 }}>
                    + {p.palletBarcode} ({p.children.length} drums)
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions" style={{ marginTop:16 }}>
              <button className="btn btn-ghost" onClick={resetStep}>{t.btnCancel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
