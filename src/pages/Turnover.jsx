import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabaseClient';

export default function Turnover({
  t, lang, currentUser,
  turnoverItems, fetchTurnover,
  showAlert, showConfirm,
  addToOutboundAssignDB, setCurrentView, setActiveWarehouse,
  addToPendingDB
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchNoInput, setBatchNoInput] = useState('');
  const [step, setStep] = useState('idle');
  const [scannedItems, setScannedItems] = useState([]);
  const [scanInput, setScanInput] = useState('');
  const [containerTypes, setContainerTypes] = useState([]);  // ← 單一來源
  const [currentPalletInput, setCurrentPalletInput] = useState('');
  const [currentPalletRule, setCurrentPalletRule] = useState(null);
  const [splitPallets, setSplitPallets] = useState([]);
  const [currentChildren, setCurrentChildren] = useState([]);
  const [palletScanInput, setPalletScanInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scanRef = useRef(null);
  const palletRef = useRef(null);

  useEffect(() => { fetchContainerTypes(); }, []);
  useEffect(() => {
    if (step === 'scanning') setTimeout(() => scanRef.current?.focus(), 100);
    if (step === 'splitting') setTimeout(() => palletRef.current?.focus(), 100);
  }, [step, currentPalletRule]);

  // ── 單一資料來源：container_types ─────────────────────────
  const fetchContainerTypes = async () => {
    const { data } = await supabase
      .from('container_types')
      .select('*')
      .eq('active', true);
    if (data) setContainerTypes(data);
  };

  // 從條碼判斷 container_type（唯一入口）
  const getContainerType = (barcode) => {
    if (!barcode) return null;
    return containerTypes.find(ct => barcode.startsWith(ct.barcode_prefix)) || null;
  };

  const getMaterialCode = (barcode) => getContainerType(barcode)?.code || '';
  const isPallet = (barcode) => getContainerType(barcode)?.is_pallet || false;
  const getPalletDef = (barcode) => {
    const ct = getContainerType(barcode);
    return ct?.is_pallet ? ct : null;
  };

  // ── Kanban data ──────────────────────────────────────────
  const rawItems = turnoverItems.filter(i => !i.batch_no && (i.status === 'raw' || !i.status));
  const pendingBatches = turnoverItems.filter(i => i.status === 'pending').reduce((acc, cur) => {
    if (!acc[cur.batch_no]) acc[cur.batch_no] = { bNo: cur.batch_no, code: cur.material_code, items: [] };
    acc[cur.batch_no].items.push(cur); return acc;
  }, {});
  const completedBatches = turnoverItems.filter(i => i.status === 'completed').reduce((acc, cur) => {
    if (!acc[cur.batch_no]) acc[cur.batch_no] = { bNo: cur.batch_no, code: cur.material_code, items: [] };
    acc[cur.batch_no].items.push(cur); return acc;
  }, {});

  const selectedItems = rawItems.filter(i => selectedIds.includes(i.id));
  const detectedTypes = [...new Map(
    selectedItems.map(i => getContainerType(i.product_barcode)).filter(Boolean).map(ct => [ct.code, ct])
  ).values()];

  const resetStep = () => {
    setStep('idle'); setScannedItems([]); setSplitPallets([]);
    setCurrentChildren([]); setCurrentPalletInput(''); setCurrentPalletRule(null);
  };

  // ── Actions ──────────────────────────────────────────────
  const handleReturnToInbound = () => {
    if (!selectedIds.length) return showAlert(t.msgSelectFirst);
    showConfirm(
      lang === 'zh' ? `將 ${selectedIds.length} 個包材退回入庫等待區？` : `Return ${selectedIds.length} item(s) to inbound queue?`,
      async () => {
        await supabase.from('turnover_inventory')
          .update({ status: 'inbound_return', updated_at: new Date().toISOString() })
          .in('id', selectedIds);
        if (addToPendingDB) await addToPendingDB(selectedItems.map(i => i.product_barcode));
        setSelectedIds([]); fetchTurnover();
        setCurrentView('inbound');
        showAlert(lang === 'zh' ? '已退回入庫區。' : 'Returned to inbound queue.');
      }
    );
  };

  const handleStartCleaning = () => {
    if (!selectedIds.length) return showAlert(t.msgSelectFirst);
    if (detectedTypes.length === 0) return showAlert(lang === 'zh' ? '無法判斷包材類型，請確認 container_types 設定。' : 'Cannot detect container type. Check container_types config.');
    if (detectedTypes.length > 1) return showAlert(lang === 'zh' ? `選取了不同包材 (${detectedTypes.map(c=>c.code).join(', ')})，請分開處理。` : `Mixed container types (${detectedTypes.map(c=>c.code).join(', ')}). Process separately.`);
    const palletItems = selectedItems.filter(i => isPallet(i.product_barcode));
    const singleItems = selectedItems.filter(i => !isPallet(i.product_barcode));
    if (palletItems.length > 0 && singleItems.length > 0) return showAlert(lang === 'zh' ? '不能同時選取棧板和單桶，請分開處理。' : 'Cannot mix pallets and single drums. Process separately.');
    setBatchNoInput(''); setScannedItems([]); setSplitPallets([]);
    setCurrentChildren([]); setCurrentPalletInput(''); setCurrentPalletRule(null);
    setStep('batch_input');
  };

  const handleBatchNoConfirm = async () => {
    const bNo = batchNoInput.trim().toUpperCase();
    if (!bNo) return showAlert(t.msgNoBatchNo);
    const { data } = await supabase.from('production_batches').select('batch_no').eq('batch_no', bNo).maybeSingle();
    if (data) return showAlert(t.msgBatchExists);
    const hasPallets = selectedItems.some(i => isPallet(i.product_barcode));
    setStep(hasPallets ? 'splitting' : 'scanning');
  };

  const handleVerifyScan = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    if (!selectedItems.find(i => i.product_barcode === input)) { showAlert(t.msgNotInTurnover); return; }
    if (scannedItems.includes(input)) { showAlert(t.msgAlreadyScanned); return; }
    if (navigator.vibrate) navigator.vibrate(40);
    const next = [...scannedItems, input];
    setScannedItems(next); setScanInput('');
    if (next.length === selectedItems.length) finalizeBatch(selectedItems, batchNoInput.trim().toUpperCase(), [...selectedIds]);
  };

  const handlePalletScan = (e) => {
    e.preventDefault();
    const input = palletScanInput.trim().toUpperCase();
    if (!input) return;
    if (!currentPalletRule) {
      const def = getPalletDef(input);
      if (!def) { showAlert(t.msgInvalidPallet); return; }
      if (!selectedItems.find(i => i.product_barcode === input)) { showAlert(t.msgPalletNotFound); return; }
      setCurrentPalletInput(input); setCurrentPalletRule(def); setCurrentChildren([]); setPalletScanInput('');
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
        else showAlert(lang === 'zh' ? `棧板完成。還有 ${remaining.length} 個棧板待拆。` : `Done. ${remaining.length} pallet(s) remaining.`);
      }
    }
  };

  const finalizeBatch = async (items, bNo, ids) => {
    const ct = getContainerType(items[0]?.product_barcode || '');
    if (!ct) return showAlert(lang === 'zh' ? '無法判斷包材類型。' : 'Cannot detect container type.');
    // Atomic: all-or-nothing via RPC
    const { error } = await supabase.rpc('finalize_batch', {
      p_batch_no:          bNo,
      p_material_code:     ct.code,
      p_container_type_id: ct.id,
      p_operator:          currentUser,
      p_barcodes:          items.map(i => i.product_barcode),
      p_turnover_ids:      ids,
    });
    if (error) return showAlert(lang === 'zh' ? `建立批次失敗：${error.message}` : `Failed: ${error.message}`);
    resetStep(); setSelectedIds([]); fetchTurnover(); showAlert(t.msgCleanComplete);
  };

  const finalizeSplitBatch = async (items, bNo, splitData, ids) => {
    const ct = getContainerType(items[0]?.product_barcode || '');
    if (!ct) return showAlert(lang === 'zh' ? '無法判斷包材類型。' : 'Cannot detect container type.');
    const allChildren  = splitData.flatMap(p => p.children);
    const palletForEach = splitData.flatMap(p => p.children.map(() => p.palletBarcode));
    // Atomic via RPC
    const { error } = await supabase.rpc('finalize_split_batch', {
      p_batch_no:          bNo,
      p_material_code:     ct.code,
      p_container_type_id: ct.id,
      p_operator:          currentUser,
      p_child_barcodes:    allChildren,
      p_pallet_barcodes:   palletForEach,
      p_turnover_ids:      ids,
    });
    if (error) return showAlert(lang === 'zh' ? `建立批次失敗：${error.message}` : `Failed: ${error.message}`);
    resetStep(); setSelectedIds([]); fetchTurnover(); showAlert(t.msgSplitComplete);
  };

  const handleMoveToOutbound = async (bNo, items) => {
    showConfirm(
      lang === 'zh' ? `確定將批次 ${bNo} (${items.length} 桶) 移至出貨區？` : `Move batch ${bNo} (${items.length} items) to Outbound?`,
      async () => {
        setIsSubmitting(true);
        const { error } = await supabase.from('turnover_inventory').update({ location: 'Outbound', updated_at: new Date().toISOString() }).eq('batch_no', bNo);
        if (error) { setIsSubmitting(false); return showAlert(t.msgFail); }
        if (addToOutboundAssignDB) await addToOutboundAssignDB(items.map(i => ({ barcode: i.product_barcode, batch_no: i.batch_no })));
        fetchTurnover(); setCurrentView('outbound'); setActiveWarehouse('South Warehouse');
        setIsSubmitting(false); showAlert(t.msgAutoSuccess);
      }
    );
  };

  // ── Styles ───────────────────────────────────────────────
  const isLight = document.documentElement.classList.contains('light');
  const surface  = isLight ? '#ffffff' : 'var(--dk-surface)';
  const surface2 = 'var(--bg-section)';
  const border   = 'var(--border)';
  const textPrim = isLight ? '#111827' : 'var(--dk-text)';
  const textMut  = isLight ? '#6b7280' : 'var(--dk-text-3)';
  const accentBg = isLight ? '#dbeafe' : 'var(--dk-accent-bg)';
  const accentTx = isLight ? '#1d4ed8' : '#93c5fd';

  const colH = (accent) => ({
    display:'flex', alignItems:'center', gap:8,
    padding:'11px 14px', borderBottom:`1px solid ${border}`,
    fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color: textPrim,
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
            <button className="btn btn-primary btn-sm" disabled={isSubmitting} onClick={handleStartCleaning}>
              {t.btnExtCleaning} ({selectedIds.length})
            </button>
          </div>
        )}
      </div>

      {/* Detection banner */}
      {selectedIds.length > 0 && (
        <div style={{ marginBottom:12, padding:'9px 14px', borderRadius:6, fontSize:12,
          background: detectedTypes.length === 1 ? 'var(--dk-success-bg)' : 'var(--dk-warn-bg)',
          color: detectedTypes.length === 1 ? '#4ade80' : '#fbbf24',
          border:`1px solid ${detectedTypes.length === 1 ? 'rgba(16,185,129,.3)' : 'rgba(245,158,11,.3)'}` }}>
          {detectedTypes.length === 1
            ? `${lang==='zh'?'包材':'Type'}: ${detectedTypes[0].code} · ${selectedIds.length} ${lang==='zh'?'已選':'selected'}`
            : detectedTypes.length === 0
              ? lang==='zh' ? '無法判斷包材類型，請確認 container_types 設定' : 'Cannot detect type — check container_types config'
              : `${lang==='zh'?'混合類型':'Mixed'}: ${detectedTypes.map(c=>c.code).join(', ')} — ${lang==='zh'?'請分開處理':'process separately'}`
          }
        </div>
      )}

      <div className="kanban-grid">
        {/* Awaiting Cleaning */}
        <div className="kanban-col" style={{ background: surface }}>
          <div style={colH('#f59e0b')}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#f59e0b' }} />
            {lang==='zh'?'待清潔':'Awaiting Cleaning'}
            <span style={{ marginLeft:'auto', background:'rgba(245,158,11,.15)', color:'#fbbf24', padding:'1px 7px', borderRadius:10, fontSize:10 }}>
              {rawItems.length}
            </span>
          </div>
          <div style={{ padding:'8px 10px', overflowY:'auto', maxHeight:420 }}>
            {rawItems.length === 0 && <div style={{ padding:'24px 0', textAlign:'center', fontSize:12, color: textMut }}>{t.turnoverEmpty}</div>}
            {rawItems.map(item => {
              const sel = selectedIds.includes(item.id);
              const ct = getContainerType(item.product_barcode);
              return (
                <div key={item.id}
                  onClick={() => setSelectedIds(prev => sel ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                  style={{ padding:'9px 12px', marginBottom:4, borderRadius:6, cursor:'pointer',
                    background: sel ? accentBg : surface2,
                    border:`1px solid ${sel ? 'var(--dk-accent)' : 'transparent'}` }}>
                  <div style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color: sel ? accentTx : textPrim }}>
                    {item.product_barcode}
                  </div>
                  <div style={{ display:'flex', gap:5, marginTop:3, flexWrap:'wrap' }}>
                    {ct ? (
                      <>
                        <span className="badge badge-gray" style={{ fontSize:9 }}>{ct.code}</span>
                        {ct.is_pallet && <span className="badge badge-amber" style={{ fontSize:9 }}>PALLET</span>}
                        {ct.is_reusable && <span className="badge badge-green" style={{ fontSize:9 }}>REUSABLE</span>}

                      </>
                    ) : (
                      <span style={{ fontSize:10, color:'var(--dk-danger)' }}>Unknown type</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pending production */}
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
                <div style={{ display:'flex', gap:5, marginTop:3 }}>
                  {(() => { const ct = containerTypes.find(x => x.code === b.code); return ct ? <span className="badge badge-purple" style={{ fontSize:9 }}>{ct.name}</span> : b.code ? <span className="badge badge-purple" style={{ fontSize:9 }}>{b.code}</span> : null; })()}
                  <span style={{ fontSize:10, color: textMut }}>{b.items.length} {lang==='zh'?'個':'pcs'}</span>
                </div>
              </div>
            ))}
            {Object.keys(pendingBatches).length === 0 && <div style={{ padding:'24px 0', textAlign:'center', fontSize:12, color: textMut }}>—</div>}
          </div>
        </div>

        {/* Completed */}
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
                      {(() => { const ct = containerTypes.find(x => x.code === b.code); return ct ? <span className="badge badge-green" style={{ fontSize:9 }}>{ct.name}</span> : b.code ? <span className="badge badge-green" style={{ fontSize:9 }}>{b.code}</span> : null; })()}
                      <span style={{ fontSize:10, color: textMut }}>{b.items.length} {lang==='zh'?'個':'pcs'}</span>
                    </div>
                  </div>
                  <button className="btn btn-success btn-sm"
                    style={{ flexShrink:0, fontSize:11, padding:'5px 10px', minHeight:'unset' }}
                    disabled={isSubmitting}
                    onClick={async () => { setIsSubmitting(true); await handleMoveToOutbound(b.bNo, b.items); setIsSubmitting(false); }}>
                    {lang==='zh'?'轉出貨':'Outbound'}
                  </button>
                </div>
              </div>
            ))}
            {Object.keys(completedBatches).length === 0 && <div style={{ padding:'24px 0', textAlign:'center', fontSize:12, color: textMut }}>—</div>}
          </div>
        </div>
      </div>

      {/* Batch No. Modal */}
      {step === 'batch_input' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth:420, background: surface }}>
            <h3 style={{ color: textPrim }}>{t.labelBatchNo}</h3>
            <div style={{ fontSize:12, color: textMut, marginBottom:8 }}>
              {selectedIds.length} {lang==='zh'?'個項目已選取':'items selected'}
            </div>
            {detectedTypes.length === 1 && (
              <div style={{ padding:'8px 12px', background:'var(--dk-success-bg)', borderRadius:6, marginBottom:12, fontSize:12, color:'#4ade80' }}>
                {lang==='zh'?'包材類型':'Type'}: <strong>{detectedTypes[0].code}</strong>
                {detectedTypes[0].customers?.name && <> · {detectedTypes[0].customers.name}</>}
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

      {/* Scan Modal */}
      {step === 'scanning' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth:460, background: surface }}>
            <h3 style={{ color: textPrim }}>
              External Cleaning — <span style={{ fontFamily:'monospace', color:'var(--dk-accent)' }}>{batchNoInput}</span>
            </h3>
            {detectedTypes.length === 1 && <span className="badge badge-green" style={{ marginBottom:12, display:'inline-block' }}>{detectedTypes[0].code}</span>}
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

      {/* Pallet Split Modal */}
      {step === 'splitting' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth:500, background: surface }}>
            <h3 style={{ color: textPrim }}>{t.extCleanTitle}</h3>
            <div style={{ padding:'8px 12px', background:'var(--dk-accent-bg)', borderRadius:6, marginBottom:14, fontSize:12, color:accentTx }}>
              Batch: <strong>{batchNoInput}</strong> · Done: {splitPallets.length}/{selectedIds.length}
              {detectedTypes.length === 1 && <> · {detectedTypes[0].code} ({detectedTypes[0].containers_per_pallet} drums/pallet)</>}
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
                  <div style={{ color: textMut }}>{t.labelPalletNo}: <strong style={{ fontFamily:'monospace', color:accentTx }}>{currentPalletInput}</strong></div>
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
