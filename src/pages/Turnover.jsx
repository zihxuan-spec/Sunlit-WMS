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

  useEffect(() => { fetchAllRules(); }, []);

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

  const rawItems       = turnoverItems.filter(i => !i.batch_no && (i.status === 'raw' || !i.status));
  const pendingItems   = turnoverItems.filter(i => i.status === 'pending');
  const completedBatches = turnoverItems.filter(i => i.status === 'completed').reduce((acc, curr) => {
    if (!acc[curr.batch_no]) acc[curr.batch_no] = { bNo: curr.batch_no, code: curr.material_code, items: [] };
    acc[curr.batch_no].items.push(curr);
    return acc;
  }, {});

  const selectedItems = rawItems.filter(i => selectedIds.includes(i.id));
  const detectedCodes = [...new Set(selectedItems.map(i => getMaterialCode(i.product_barcode)).filter(Boolean))];

  const handleStartCleaning = () => {
    if (!selectedIds.length) return showAlert(t.msgSelectFirst);
    setBatchNoInput(''); setScannedItems([]); setSplitPallets([]);
    setCurrentChildren([]); setCurrentPalletInput(''); setCurrentPalletRule(null);
    setStep('batch_input');
  };

  const handleBatchNoConfirm = async () => {
    const bNo = batchNoInput.trim().toUpperCase();
    if (!bNo) return showAlert(t.msgNoBatchNo);
    const { data } = await supabase.from('production_batches').select('batch_no').eq('batch_no', bNo).single();
    if (data) return showAlert(t.msgBatchExists);
    const pallets = selectedItems.filter(i => getPalletRule(i.product_barcode));
    const singles = selectedItems.filter(i => !getPalletRule(i.product_barcode));
    if (detectedCodes.length > 1) return showAlert(lang === 'zh' ? `選取的包材對應到不同物料 (${detectedCodes.join(', ')})，請分開處理。` : `Selected items map to different materials (${detectedCodes.join(', ')}). Process separately.`);
    if (pallets.length > 0 && singles.length > 0) return showAlert(lang === 'zh' ? `選取中混有棧板 (${pallets.length}) 和單桶 (${singles.length})，請分開處理。` : `Mixed selection: ${pallets.length} pallet(s) and ${singles.length} single drum(s). Process separately.`);
    if (detectedCodes.length === 0) return showAlert(lang === 'zh' ? '無法從條碼判斷物料代碼，請確認規則設定。' : 'Cannot determine material code. Check barcode rules.');
    setStep(pallets.length > 0 ? 'splitting' : 'scanning');
  };

  const handleVerifyScan = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    if (!selectedItems.find(i => i.product_barcode === input)) return showAlert(t.msgNotInTurnover);
    if (scannedItems.includes(input)) return showAlert(t.msgAlreadyScanned);
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
      if (!rule) return showAlert(t.msgInvalidPallet);
      if (!selectedItems.find(i => i.product_barcode === input)) return showAlert(t.msgPalletNotFound);
      setCurrentPalletInput(input); setCurrentPalletRule(rule); setCurrentChildren([]); setPalletScanInput('');
    } else {
      if (currentChildren.includes(input)) return showAlert(t.msgAlreadyScanned);
      const newChildren = [...currentChildren, input];
      setCurrentChildren(newChildren); setPalletScanInput('');
      if (newChildren.length >= currentPalletRule.containers_per_pallet) {
        const newSplit = [...splitPallets, { palletBarcode: currentPalletInput, children: newChildren }];
        setSplitPallets(newSplit); setCurrentPalletInput(''); setCurrentPalletRule(null); setCurrentChildren([]);
        const remaining = selectedItems.map(i => i.product_barcode).filter(b => !newSplit.map(p => p.palletBarcode).includes(b));
        if (!remaining.length) finalizeSplitBatch(selectedItems, batchNoInput.trim().toUpperCase(), newSplit, [...selectedIds]);
        else showAlert(lang === 'zh' ? `棧板拆解完成。還有 ${remaining.length} 個棧板待拆。` : `Pallet split done. ${remaining.length} pallet(s) remaining.`);
      }
    }
  };

  const finalizeBatch = async (items, bNo, ids) => {
    const mc = getMaterialCode(items[0]?.product_barcode || '');
    if (!mc) return showAlert(lang === 'zh' ? '無法判斷物料代碼，請確認規則設定。' : 'Cannot determine material code. Check rule settings.');
    const { error } = await supabase.from('production_batches').insert([{ batch_no: bNo, material_code: mc, status: 'pending', operator: currentUser }]);
    if (error) return showAlert(t.msgFail);
    await supabase.from('production_containers').insert(items.map(i => ({ batch_no: bNo, barcode: i.product_barcode, current_step: 1 })));
    await supabase.from('turnover_inventory').update({ status: 'pending', batch_no: bNo, updated_at: new Date().toISOString() }).in('id', ids);
    setStep('idle'); setSelectedIds([]); setScannedItems([]); fetchTurnover(); showAlert(t.msgCleanComplete);
  };

  const finalizeSplitBatch = async (items, bNo, splitData, ids) => {
    const mc = getMaterialCode(items[0]?.product_barcode || '');
    if (!mc) return showAlert(lang === 'zh' ? '無法判斷物料代碼，請確認 pallet_barcode_rules 設定。' : 'Cannot determine material code. Check pallet_barcode_rules.');
    const { error } = await supabase.from('production_batches').insert([{ batch_no: bNo, material_code: mc, status: 'pending', operator: currentUser }]);
    if (error) return showAlert(t.msgFail);
    const allChildren = splitData.flatMap(p => p.children);
    if (allChildren.length) await supabase.from('production_containers').insert(allChildren.map(bc => ({ batch_no: bNo, barcode: bc, current_step: 1 })));
    const mapRows = splitData.flatMap(p => p.children.map(child => ({ parent_pallet: p.palletBarcode, child_barcode: child, action_type: 'SPLIT', operator: currentUser })));
    if (mapRows.length) await supabase.from('pallet_container_map').insert(mapRows);
    await supabase.from('turnover_inventory').update({ status: 'pending', batch_no: bNo, updated_at: new Date().toISOString() }).in('id', ids);
    setStep('idle'); setSelectedIds([]); setSplitPallets([]); setCurrentChildren([]); setCurrentPalletRule(null); fetchTurnover(); showAlert(t.msgSplitComplete);
  };

  const handleMoveToOutbound = (bNo, items) => {
    showConfirm(lang === 'zh' ? `確定將批次 ${bNo} (${items.length} 桶) 移至出貨區？` : `Move batch ${bNo} (${items.length} items) to Outbound?`, async () => {
      const { error } = await supabase.from('turnover_inventory').update({ location: 'Outbound', updated_at: new Date().toISOString() }).eq('batch_no', bNo);
      if (error) return showAlert(t.msgFail);
      setOutboundAssignItems(prev => { const ex = prev.map(p => p.id); return [...prev, ...items.map(i => ({ id: i.id, barcode: i.product_barcode, batch_no: i.batch_no })).filter(o => !ex.includes(o.id))]; });
      fetchTurnover(); setCurrentView('outbound'); setActiveWarehouse('South Warehouse'); showAlert(t.msgAutoSuccess);
    });
  };

  const var_warn = 'rgba(245,158,11,.3)';

  // ── shared modal card style ──
  const modalCard = {
    background: 'var(--dk-surface)', border: '1px solid var(--dk-border2)',
    borderRadius: 16, padding: 28, width: '94%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto'
  };

  // ── column header style ──
  const colH = (accent) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '11px 14px', borderBottom: '1px solid var(--dk-border)',
    fontSize: 11, fontWeight: 700, color: 'var(--dk-text-2)',
    textTransform: 'uppercase', letterSpacing: '.5px'
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{lang === 'zh' ? '週轉倉' : 'Turnover'}</div>
          <div className="page-subtitle">{lang === 'zh' ? '包材清潔與批次管理' : 'Cleaning & batch management'}</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleStartCleaning} disabled={!selectedIds.length}>
          {t.btnExtCleaning} {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
        </button>
      </div>

      {/* Material detection banner */}
      {selectedIds.length > 0 && (
        <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 6, fontSize: 12,
          background: detectedCodes.length === 1 ? 'var(--dk-success-bg)' : 'var(--dk-warn-bg)',
          color: detectedCodes.length === 1 ? '#4ade80' : '#fbbf24',
          border: `1px solid ${detectedCodes.length === 1 ? 'var(--dk-success)' : var_warn}` }}>
          {detectedCodes.length === 1
            ? `${lang === 'zh' ? '物料' : 'Material'}: ${detectedCodes[0]} · ${selectedIds.length} ${lang === 'zh' ? '已選' : 'selected'}`
            : detectedCodes.length === 0
              ? lang === 'zh' ? '無法判斷物料，請確認規則設定' : 'Cannot detect material — check rule settings'
              : `${lang === 'zh' ? '混合物料' : 'Mixed materials'}: ${detectedCodes.join(', ')} — ${lang === 'zh' ? '請分開處理' : 'process separately'}`
          }
        </div>
      )}

      <div className="kanban-grid">
        {/* Col 1: Awaiting cleaning */}
        <div className="kanban-col">
          <div style={colH('#f59e0b')}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} />
            {lang === 'zh' ? '待清潔' : 'Awaiting Cleaning'}
            <span style={{ marginLeft: 'auto', background: 'rgba(245,158,11,.15)', color: '#fbbf24', padding: '1px 7px', borderRadius: 10, fontSize: 10 }}>
              {rawItems.length}
            </span>
          </div>
          <div style={{ padding: '8px 10px', overflowY: 'auto', maxHeight: 400 }}>
            {rawItems.length === 0 && (
              <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--dk-text-4)' }}>{t.turnoverEmpty}</div>
            )}
            {rawItems.map(item => {
              const selected = selectedIds.includes(item.id);
              const mc = getMaterialCode(item.product_barcode);
              const isPallet = !!getPalletRule(item.product_barcode);
              return (
                <div key={item.id} onClick={() => setSelectedIds(prev => selected ? prev.filter(id => id !== item.id) : [...prev, item.id])}
                  style={{ padding: '9px 12px', marginBottom: 4, borderRadius: 6, cursor: 'pointer', transition: 'background .1s',
                    background: selected ? 'var(--dk-accent-bg)' : 'var(--dk-surface2)',
                    border: `1px solid ${selected ? 'var(--dk-accent)' : 'transparent'}` }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: selected ? '#93c5fd' : 'var(--dk-text)' }}>
                    {item.product_barcode}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                    {mc && <span className="badge badge-gray" style={{ fontSize: 9 }}>{mc}</span>}
                    {isPallet && <span className="badge badge-amber" style={{ fontSize: 9 }}>PALLET</span>}
                    {!mc && <span style={{ fontSize: 10, color: 'var(--dk-danger)' }}>Unknown material</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Col 2: Pending production */}
        <div className="kanban-col">
          <div style={colH('#8b5cf6')}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#8b5cf6' }} />
            {t.mesPending}
            <span style={{ marginLeft: 'auto', background: 'rgba(139,92,246,.15)', color: '#a78bfa', padding: '1px 7px', borderRadius: 10, fontSize: 10 }}>
              {pendingItems.length}
            </span>
          </div>
          <div style={{ padding: '8px 10px', overflowY: 'auto', maxHeight: 400 }}>
            {pendingItems.map(item => (
              <div key={item.id} style={{ padding: '9px 12px', marginBottom: 4, borderRadius: 6, background: 'var(--dk-surface2)', borderLeft: '3px solid #8b5cf6' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--dk-text)' }}>{item.product_barcode}</div>
                <div style={{ fontSize: 10, color: 'var(--dk-text-3)', marginTop: 2 }}>{t.labelBatchNo}: {item.batch_no}</div>
                {item.material_code && <span className="badge badge-purple" style={{ fontSize: 9, marginTop: 3 }}>{item.material_code}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Col 3: Completed */}
        <div className="kanban-col">
          <div style={colH('#10b981')}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
            {t.mesCompleted}
            <span style={{ marginLeft: 'auto', background: 'rgba(16,185,129,.15)', color: '#34d399', padding: '1px 7px', borderRadius: 10, fontSize: 10 }}>
              {Object.keys(completedBatches).length}
            </span>
          </div>
          <div style={{ padding: '8px 10px', overflowY: 'auto', maxHeight: 400 }}>
            {Object.values(completedBatches).map(b => (
              <div key={b.bNo} style={{ padding: '10px 12px', marginBottom: 4, borderRadius: 6, background: 'var(--dk-surface2)', borderLeft: '3px solid #10b981' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--dk-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.bNo}</div>
                    <div style={{ fontSize: 10, color: 'var(--dk-text-3)', marginTop: 2 }}>{b.items.length} {lang === 'zh' ? '桶' : 'drums'}</div>
                    {b.code && <span className="badge badge-green" style={{ fontSize: 9, marginTop: 3 }}>{b.code}</span>}
                  </div>
                  <button className="btn btn-success btn-sm" style={{ flexShrink: 0, fontSize: 11, padding: '5px 10px' }}
                    onClick={() => handleMoveToOutbound(b.bNo, b.items)}>
                    {lang === 'zh' ? '轉出貨' : 'Outbound'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Batch No. Modal ── */}
      {step === 'batch_input' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 420 }}>
            <h3>{t.labelBatchNo}</h3>
            <div style={{ fontSize: 12, color: 'var(--dk-text-3)', marginBottom: 8 }}>
              {selectedIds.length} {lang === 'zh' ? '個項目已選取' : 'items selected'}
            </div>
            {detectedCodes.length === 1 && (
              <div style={{ padding: '8px 12px', background: 'var(--dk-success-bg)', borderRadius: 6, marginBottom: 12, fontSize: 12, color: '#4ade80' }}>
                {lang === 'zh' ? '自動判斷物料' : 'Auto-detected material'}: <strong>{detectedCodes[0]}</strong>
              </div>
            )}
            <input value={batchNoInput} onChange={e => setBatchNoInput(e.target.value.toUpperCase())} placeholder={t.batchInputPlaceholder} autoFocus />
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
          <div className="modal-card" style={{ maxWidth: 460 }}>
            <h3>External Cleaning — <span style={{ fontFamily: 'monospace', color: 'var(--dk-accent)' }}>{batchNoInput}</span></h3>
            {detectedCodes.length === 1 && <span className="badge badge-green" style={{ marginBottom: 12, display: 'inline-block' }}>{detectedCodes[0]}</span>}
            <div style={{ fontSize: 12, color: 'var(--dk-text-3)', marginBottom: 10 }}>{t.labelScanned}: <strong style={{ color: 'var(--dk-text)' }}>{scannedItems.length} / {selectedItems.length}</strong></div>
            <form onSubmit={handleVerifyScan}>
              <input value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} placeholder={`${t.labelScanPrompt}...`} autoFocus />
            </form>
            <div style={{ marginTop: 8 }}>
              {selectedItems.map(i => (
                <div key={i.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--dk-border)', fontSize: 12, fontFamily: 'monospace',
                  color: scannedItems.includes(i.product_barcode) ? '#10b981' : 'var(--dk-text-4)' }}>
                  {scannedItems.includes(i.product_barcode) ? '+' : '-'} {i.product_barcode}
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setStep('idle')}>{t.btnCancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pallet Split Modal ── */}
      {step === 'splitting' && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <h3>{t.extCleanTitle}</h3>
            <div style={{ padding: '8px 12px', background: 'var(--dk-accent-bg)', borderRadius: 6, marginBottom: 14, fontSize: 12, color: '#93c5fd' }}>
              {t.labelBatchNo}: <strong>{batchNoInput}</strong> &nbsp;·&nbsp;
              {lang === 'zh' ? '棧板完成' : 'Pallets done'}: {splitPallets.length}/{selectedIds.length}
              {detectedCodes.length === 1 && <> &nbsp;·&nbsp; {detectedCodes[0]}</>}
            </div>

            {!currentPalletRule ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--dk-text-2)', marginBottom: 8 }}>{t.extCleanScanPallet}</div>
                <form onSubmit={handlePalletScan}>
                  <input value={palletScanInput} onChange={e => setPalletScanInput(e.target.value.toUpperCase())} placeholder={t.extCleanScanPallet} autoFocus />
                </form>
              </>
            ) : (
              <>
                <div style={{ padding: '10px 12px', background: 'var(--dk-surface2)', borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
                  <div style={{ color: 'var(--dk-text-3)', marginBottom: 3 }}>{t.labelPalletNo}: <strong style={{ fontFamily: 'monospace', color: '#93c5fd' }}>{currentPalletInput}</strong></div>
                  <div style={{ color: 'var(--dk-text-3)' }}>{t.labelScanned}: <strong style={{ color: 'var(--dk-text)' }}>{currentChildren.length} / {currentPalletRule.containers_per_pallet}</strong></div>
                </div>
                <form onSubmit={handlePalletScan}>
                  <input value={palletScanInput} onChange={e => setPalletScanInput(e.target.value.toUpperCase())}
                    placeholder={t.extCleanScanChild.replace('{current}', currentChildren.length + 1).replace('{total}', currentPalletRule.containers_per_pallet)} autoFocus />
                </form>
                <div style={{ marginTop: 6 }}>
                  {currentChildren.map((bc, i) => (
                    <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', color: '#10b981', padding: '3px 0' }}>+ {bc}</div>
                  ))}
                </div>
              </>
            )}

            {splitPallets.length > 0 && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--dk-border)', paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--dk-text-3)', marginBottom: 6 }}>{lang === 'zh' ? '已完成棧板：' : 'Completed pallets:'}</div>
                {splitPallets.map((p, i) => (
                  <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: '#10b981', marginBottom: 2 }}>
                    + {p.palletBarcode} ({p.children.length} {lang === 'zh' ? '桶' : 'drums'})
                  </div>
                ))}
              </div>
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setStep('idle')}>{t.btnCancel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

