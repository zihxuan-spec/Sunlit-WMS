import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../config/supabaseClient';

export default function MES({ t, lang, currentUser, showAlert }) {
  const [batches, setBatches] = useState({ pending: [], processing: [], completed: [] });
  const [batchCounts, setBatchCounts] = useState({});
  const [activeBatch, setActiveBatch] = useState(null);
  const [activeBatchCT, setActiveBatchCT] = useState(null); // ← stored at startProduction time
  const [steps, setSteps] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [containers, setContainers] = useState([]);
  const [scannedList, setScannedList] = useState([]);
  const [scanInput, setScanInput] = useState('');
  const [containerTypes, setContainerTypes] = useState([]);
  const [gunStations, setGunStations] = useState([]);
  const [formData, setFormData] = useState({ workOrder: '', gunNumber: '', newPallet: '' });
  const [weightData, setWeightData] = useState({});
  const [packingPallets, setPackingPallets] = useState([]);
  const [currentPackPallet, setCurrentPackPallet] = useState('');
  const [packedDrums, setPackedDrums] = useState([]);
  const [activeFillDrum, setActiveFillDrum] = useState(null);
  const [showComplete, setShowComplete] = useState(false);
  const [completeInfo, setCompleteInfo] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const scanRef = useRef(null);

  useEffect(() => {
    fetchAll();
    const ch = supabase.channel('mes-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, fetchBatches)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  useEffect(() => {
    if (activeBatch && !usePackingUI) setTimeout(() => scanRef.current?.focus(), 100);
  }, [currentStepIdx, activeBatch]);

  const fetchAll = async () => {
    const [{ data: ctData }, { data: gunData }] = await Promise.all([
      supabase.from('container_types').select('*').eq('active', true),
      supabase.from('gun_stations').select('*').eq('active', true).order('code'),
    ]);
    if (ctData) setContainerTypes(ctData);
    if (gunData) setGunStations(gunData);
    await fetchBatches();
  };

  const fetchBatches = async () => {
    setBatchesLoading(true);
    const { data, error } = await supabase
      .from('production_batches')
      .select('*, production_containers(count)')
      .order('created_at', { ascending: false });
    setBatchesLoading(false);
    if (error) { showAlert(lang === 'zh' ? '載入失敗，請重新整理。' : 'Failed to load. Please refresh.'); return; }
    if (data) {
      const countMap = {};
      data.forEach(b => { countMap[b.batch_no] = b.production_containers?.[0]?.count ?? 0; });
      setBatchCounts(countMap);
      setBatches({
        pending:    data.filter(b => b.status === 'pending'),
        processing: data.filter(b => b.status === 'processing'),
        completed:  data.filter(b => b.status === 'completed'),
      });
    }
  };

  const findCT = (code) => containerTypes.find(c => c.code === code) || null;

  const curStep     = () => steps[currentStepIdx];
  const isFillingStep   = () => curStep()?.step_type === 'filling';
  const isPackagingStep = () => curStep()?.step_type === 'packaging';

  // usePackingUI: derived from stored activeBatchCT (reliable — set at startProduction time)
  const usePackingUI = isPackagingStep() && !!(activeBatchCT?.is_pallet || activeBatchCT?.containers_per_pallet);
  const maxPerP      = activeBatchCT?.containers_per_pallet || null;
  const currPDrums   = packingPallets.find(p => p.palletBarcode === currentPackPallet)?.drums || [];

  // ── Dynamic step completion state ──────────────────────────
  const isStepComplete = useMemo(() => {
    if (!activeBatch || !curStep()) return false;
    if (usePackingUI) {
      // Pallet packaging: at least one pallet done, and all containers packed
      const allPacked = containers.length === 0 || packedDrums.length >= containers.length;
      return packingPallets.length > 0 && allPacked;
    }
    if (isFillingStep()) {
      const allScanned  = containers.length > 0 && scannedList.length === containers.length;
      const allWeights  = scannedList.every(bc => { const w = weightData[bc]||{}; return w.empty && w.setting && w.filling; });
      return allScanned && allWeights && !!formData.workOrder && !!formData.gunNumber;
    }
    // Normal + non-pallet Packaging
    return containers.length > 0 && scannedList.length === containers.length;
  }, [activeBatch, currentStepIdx, steps, usePackingUI, containers, scannedList,
      weightData, formData, packingPallets, packedDrums]);

  // ── Start production ──────────────────────────────────────
  const startProduction = async (batch) => {
    // Resolve container type immediately and store in state
    const foundCT = findCT(batch.material_code);
    setActiveBatchCT(foundCT);

    // Load steps from process_step_templates first
    let stepData = null;
    if (batch.container_type_id) {
      const { data: newSteps } = await supabase
        .from('process_step_templates')
        .select('*')
        .eq('container_type_id', batch.container_type_id)
        .order('step_order', { ascending: true });
      if (newSteps?.length) stepData = newSteps;
    }
    // Fallback: legacy table
    if (!stepData?.length) {
      const { data: legacySteps } = await supabase
        .from('material_process_steps')
        .select('*')
        .eq('material_code', batch.material_code)
        .order('step_order', { ascending: true });
      if (legacySteps?.length) {
        stepData = legacySteps.map(s => ({
          ...s,
          step_type: /fill/i.test(s.step_name) ? 'filling'
            : /pack/i.test(s.step_name) ? 'packaging'
            : 'normal'
        }));
      }
    }
    if (!stepData?.length) return showAlert(t.msgNoProcessSteps);

    const { data: contData } = await supabase.from('production_containers').select('*').eq('batch_no', batch.batch_no);
    setSteps(stepData); setContainers(contData || []); setActiveBatch(batch);

    const minStep    = contData?.length ? Math.min(...contData.map(c => c.current_step ?? 1)) - 1 : 0;
    const resumeStep = Math.max(0, minStep);
    setCurrentStepIdx(resumeStep);

    const rType = stepData[resumeStep]?.step_type || 'normal';
    if (contData?.length && rType !== 'packaging') {
      const done = contData.filter(c => (c.current_step ?? 1) > resumeStep + 1).map(c => c.barcode);
      setScannedList(done);
      if (rType === 'filling') {
        const restored = {};
        contData.filter(c => done.includes(c.barcode)).forEach(c => {
          restored[c.barcode] = { empty: c.weight_empty, setting: c.weight_setting, filling: c.weight_filling };
        });
        setWeightData(restored);
        if (contData[0]?.work_order) setFormData(f => ({ ...f, workOrder: contData[0].work_order, gunNumber: contData[0].gun_number || '' }));
      }
    } else { setScannedList([]); setWeightData({}); }

    setPackingPallets([]); setCurrentPackPallet(''); setPackedDrums([]); setActiveFillDrum(null);
    setFormData(f => ({ ...f, newPallet: '' }));

    if (batch.status === 'pending') {
      await supabase.from('production_batches').update({ status: 'processing' }).eq('batch_no', batch.batch_no);
      fetchBatches();
    }
  };

  // ── Scan handlers ─────────────────────────────────────────
  const handleVerify = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    if (!containers.find(c => c.barcode === input)) { showAlert(t.msgNotInTurnover); return; }
    if (scannedList.includes(input)) { showAlert(t.msgAlreadyScanned); return; }
    if (navigator.vibrate) navigator.vibrate(40);
    setScannedList(prev => [...prev, input]); setScanInput('');
    if (isFillingStep()) setActiveFillDrum(input);
  };

  const handlePackScan = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    if (!currentPackPallet) { showAlert(t.msgNewPalletRequired); return; }
    if (containers.length > 0 && !containers.find(c => c.barcode === input)) { showAlert(t.msgNotInTurnover); return; }
    if (packedDrums.includes(input)) { showAlert(t.msgAlreadyScanned); return; }
    if (navigator.vibrate) navigator.vibrate(40);
    const idx = packingPallets.findIndex(p => p.palletBarcode === currentPackPallet);
    let updated = [...packingPallets];
    if (idx === -1) updated.push({ palletBarcode: currentPackPallet, drums: [input] });
    else {
      const drums = [...updated[idx].drums, input];
      updated[idx] = { ...updated[idx], drums };
      if (maxPerP && drums.length >= maxPerP) {
        showAlert(t.msgNewPalletNeeded);
        setCurrentPackPallet(''); setFormData(f => ({ ...f, newPallet: '' }));
      }
    }
    setPackingPallets(updated); setPackedDrums(prev => [...prev, input]); setScanInput('');
  };

  // ── Save / Complete ───────────────────────────────────────
  const handleSaveAndNext = async () => {
    if (isSubmitting) return;

    // Pallet packaging
    if (usePackingUI) {
      if (containers.length > 0 && packedDrums.length < containers.length)
        return showAlert(t.msgVerifyAll + ` (${packedDrums.length}/${containers.length})`);
      if (!packingPallets.length) return showAlert(t.msgNewPalletRequired);
      setIsSubmitting(true);
      const mapRows = packingPallets.flatMap(p => p.drums.map(drum => ({
        parent_pallet: p.palletBarcode, child_barcode: drum, action_type: 'PACK', operator: currentUser
      })));
      if (mapRows.length) {
        const { error } = await supabase.from('pallet_container_map').insert(mapRows);
        if (error) { setIsSubmitting(false); return showAlert(t.msgFail); }
      }
      await Promise.all([
        supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no),
        supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no),
        containers.length > 0
          ? supabase.from('production_containers').update({ current_step: currentStepIdx + 2 }).eq('batch_no', activeBatch.batch_no)
          : Promise.resolve(),
      ]);
      setCompleteInfo({ batchNo: activeBatch.batch_no, material: activeBatch.material_code, ct: activeBatchCT, pallets: packingPallets, totalDrums: packedDrums.length });
      setIsSubmitting(false); setShowComplete(true); setActiveBatch(null); setActiveBatchCT(null); fetchBatches(); return;
    }

    // Verify all scanned (normal + non-pallet packaging)
    if (containers.length > 0 && containers.filter(c => !scannedList.includes(c.barcode)).length > 0)
      return showAlert(t.msgVerifyAll + ` (${scannedList.length}/${containers.length})`);

    // Filling: check weights + form
    if (isFillingStep()) {
      if (!formData.workOrder || !formData.gunNumber) return showAlert(t.msgWorkOrderRequired);
      if (scannedList.some(bc => { const w = weightData[bc]||{}; return !w.empty||!w.setting||!w.filling; })) return showAlert(t.msgFillWeights);
      setIsSubmitting(true);
      const results = await Promise.allSettled(scannedList.map(bc => {
        const w = weightData[bc] || {};
        return supabase.from('production_containers')
          .update({ weight_empty: w.empty, weight_setting: w.setting, weight_filling: w.filling, work_order: formData.workOrder, gun_number: formData.gunNumber, current_step: currentStepIdx + 2 })
          .eq('batch_no', activeBatch.batch_no).eq('barcode', bc);
      }));
      setIsSubmitting(false);
      if (results.some(r => r.status === 'rejected' || r.value?.error)) return showAlert(t.msgFail);
    }

    // Non-pallet packaging → complete
    if (isPackagingStep()) {
      setIsSubmitting(true);
      await Promise.all([
        supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no),
        supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no),
        supabase.from('production_containers').update({ current_step: currentStepIdx + 2 }).eq('batch_no', activeBatch.batch_no),
      ]);
      setCompleteInfo({ batchNo: activeBatch.batch_no, material: activeBatch.material_code, ct: activeBatchCT, pallets: [], totalDrums: containers.length });
      setIsSubmitting(false); setShowComplete(true); setActiveBatch(null); setActiveBatchCT(null); fetchBatches(); return;
    }

    // Normal step advance
    setIsSubmitting(true);
    if (!isFillingStep())
      await supabase.from('production_containers').update({ current_step: currentStepIdx + 2 }).eq('batch_no', activeBatch.batch_no);
    setIsSubmitting(false);
    setCurrentStepIdx(prev => prev + 1); setScannedList([]); setScanInput(''); setActiveFillDrum(null);
  };

  // ── Button appearance ─────────────────────────────────────
  const btnColor = isSubmitting ? '#6d5fd1'
    : isStepComplete ? '#059669'
    : '#8b5cf6';
  const btnLabel = isSubmitting ? (lang === 'zh' ? '儲存中...' : 'Saving...')
    : isPackagingStep() ? t.btnComplete
    : t.btnSaveNext;

  // ── Kanban colors ─────────────────────────────────────────
  const colCfg = {
    pending:    { accent: '#f59e0b', bg: 'rgba(245,158,11,.08)',  label: t.mesPending    },
    processing: { accent: '#8b5cf6', bg: 'rgba(139,92,246,.08)',  label: t.mesProcessing  },
    completed:  { accent: '#10b981', bg: 'rgba(16,185,129,.08)', label: t.mesCompleted   },
  };

  const isLight  = document.documentElement.classList.contains('light');
  const surface  = isLight ? '#fff' : 'var(--dk-surface)';
  const surface2 = 'var(--bg-section)';
  const border   = 'var(--border)';
  const textPrim = isLight ? '#111827' : 'var(--dk-text)';
  const textMut  = isLight ? '#6b7280' : 'var(--dk-text-3)';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">MES {lang === 'zh' ? '生產看板' : 'Production Board'}</div>
          <div className="page-subtitle">{lang === 'zh' ? '即時製程追蹤' : 'Real-time process tracking'}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchBatches}>{lang === 'zh' ? '重新整理' : 'Refresh'}</button>
      </div>

      {batchesLoading ? (
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: 'var(--dk-text-3)' }}>
          {lang === 'zh' ? '載入中...' : 'Loading...'}
        </div>
      ) : (
        <div className="kanban-grid">
          {['pending','processing','completed'].map(status => (
            <div key={status} className="kanban-col">
              <div className="kanban-col-header">
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: colCfg[status].accent }} />
                {colCfg[status].label}
                <span style={{ marginLeft:'auto', background: colCfg[status].bg, color: colCfg[status].accent, padding:'1px 7px', borderRadius:10, fontSize:10, fontWeight:700 }}>
                  {batches[status].length}
                </span>
              </div>
              {batches[status].length === 0 && <div style={{ padding:'20px 14px', fontSize:11, color:'var(--dk-text-4)', textAlign:'center' }}>—</div>}
              {batches[status].map(b => {
                const bCT = findCT(b.material_code);
                return (
                  <div key={b.batch_no} className="kanban-item"
                    style={{ borderLeft: `3px solid ${colCfg[status].accent}`, cursor: status !== 'completed' ? 'pointer' : 'default' }}
                    onClick={() => status !== 'completed' && !isSubmitting && startProduction(b)}>
                    <div className="kanban-batch">{b.batch_no}</div>
                    <div className="kanban-meta">
                      {batchCounts[b.batch_no] > 0
                        ? <span>{batchCounts[b.batch_no]} {bCT?.name || b.material_code}</span>
                        : <span>{bCT?.name || b.material_code}</span>
                      }
                      {status === 'processing' && <span style={{ marginLeft:6, color: colCfg.processing.accent }}>· {lang === 'zh' ? '生產中' : 'In progress'}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Production Modal ── */}
      {activeBatch && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 760, width: '94%', maxHeight: '92vh', overflowY: 'auto', background: surface }}>
            {/* Step progress bar */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ flex: 1, height: 5, borderRadius: 3,
                  background: i < currentStepIdx ? '#10b981' : i === currentStepIdx ? (isStepComplete ? '#10b981' : '#8b5cf6') : 'var(--border)' }} />
              ))}
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
              <div>
                <h3 style={{ fontSize:18, marginBottom:5, color: textPrim, fontWeight:600 }}>{curStep()?.step_name}</h3>
                <div style={{ fontSize:12, color: textMut, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  <span>Step {currentStepIdx+1}/{steps.length}</span>
                  <span>·</span>
                  <span style={{ fontFamily:'monospace', color:'var(--dk-accent)' }}>{activeBatch.batch_no}</span>
                  <span>·</span>
                  <span>{activeBatch.material_code}</span>
                  {containers.length > 0 && <><span>·</span><span>{containers.length} {activeBatchCT?.name || (lang==='zh'?'桶':'items')}</span></>}
                  {activeBatchCT && (
                    <span className="badge badge-gray" style={{ fontSize:9 }}>
                      {activeBatchCT.name}{activeBatchCT.is_reusable ? ' · REUSABLE' : ''}
                    </span>
                  )}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" disabled={isSubmitting} onClick={() => { setActiveBatch(null); setActiveBatchCT(null); }}>{t.btnClose}</button>
            </div>

            {/* ── Filling ── */}
            {isFillingStep() && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16, padding:14, background: surface2, borderRadius:8 }}>
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, color: textMut, display:'block', marginBottom:6 }}>{t.labelWorkOrder} *</label>
                    <input value={formData.workOrder} onChange={e => setFormData(f => ({...f, workOrder: e.target.value}))} />
                  </div>
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, color: textMut, display:'block', marginBottom:6 }}>{t.labelGunNumber} *</label>
                    {gunStations.length > 0 ? (
                      <select value={formData.gunNumber} onChange={e => setFormData(f => ({...f, gunNumber: e.target.value}))}>
                        <option value="">{lang==='zh'?'選擇槍號...':'Select gun...'}</option>
                        {gunStations.map(g => <option key={g.id} value={g.code}>{g.label || g.code}</option>)}
                      </select>
                    ) : (
                      <input value={formData.gunNumber} onChange={e => setFormData(f => ({...f, gunNumber: e.target.value}))} placeholder="GUN-01" />
                    )}
                  </div>
                </div>

                <div style={{ border:`1px solid ${border}`, borderRadius:8, padding:16, marginBottom:16 }}>
                  <div style={{ fontSize:12, color: textMut, marginBottom:10, display:'flex', justifyContent:'space-between' }}>
                    <span>{lang==='zh'?'逐桶掃描':'Scan one by one'} · <strong style={{ color: textPrim }}>{scannedList.length}/{containers.length}</strong></span>
                    {scannedList.length > 0 && scannedList.length < containers.length && (
                      <span style={{ color:'var(--dk-accent)', fontSize:11 }}>{lang==='zh'?'進度已恢復':'Progress restored'}</span>
                    )}
                  </div>
                  <form onSubmit={handleVerify}>
                    <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())}
                      placeholder={lang==='zh'?'掃描桶號...':'Scan barcode...'} autoFocus style={{ marginBottom:8 }} />
                  </form>
                  <div>
                    {containers.map(c => {
                      const done    = scannedList.includes(c.barcode);
                      const isActive = activeFillDrum === c.barcode;
                      const w        = weightData[c.barcode] || {};
                      const hasW     = w.empty && w.setting && w.filling;
                      return (
                        <div key={c.id} style={{ padding:'9px 0', borderBottom:`1px solid ${border}` }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontFamily:'monospace', fontSize:13, fontWeight:700,
                              color: done ? '#10b981' : textMut }}>
                              {done ? '+' : '○'} {c.barcode}
                            </span>
                            {done && hasW && !isActive && (
                              <span style={{ fontSize:11, color: textMut, marginLeft:'auto' }}>{w.empty}/{w.setting}/{w.filling} kg</span>
                            )}
                            {done && (
                              <button style={{ fontSize:11, color:'var(--dk-accent)', background:'none', border:'none', cursor:'pointer',
                                marginLeft: (hasW && !isActive) ? 8 : 'auto', padding:'2px 6px' }}
                                onClick={() => setActiveFillDrum(isActive ? null : c.barcode)}>
                                {isActive ? (lang==='zh'?'收起':'Collapse') : (lang==='zh'?'編輯':'Edit')}
                              </button>
                            )}
                          </div>
                          {done && isActive && (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:10 }}>
                              {[['empty', t.labelEmptyWeight],['setting', t.labelSettingWeight],['filling', t.labelFillingWeight]].map(([k, label]) => (
                                <div key={k}>
                                  <div style={{ fontSize:11, color: textMut, marginBottom:4 }}>{label}</div>
                                  <input type="number" placeholder="0.00" value={w[k]||''} style={{ padding:'8px 10px', fontSize:14 }}
                                    onChange={e => setWeightData(wd => ({...wd, [c.barcode]:{...wd[c.barcode],[k]:e.target.value}}))} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ── Packaging (pallet) ── */}
            {usePackingUI && (
              <div>
                <div style={{ padding:'10px 14px', background: isStepComplete ? 'rgba(16,185,129,.1)' : 'rgba(59,130,246,.1)',
                  borderRadius:8, marginBottom:14, fontSize:13, color: textPrim, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>
                    {lang==='zh'?'進度':'Progress'}:&nbsp;
                    <strong style={{ color: isStepComplete ? '#10b981' : textPrim }}>
                      {packedDrums.length}{containers.length > 0 ? `/${containers.length}` : ''}
                    </strong>
                    &nbsp;{activeBatchCT?.name || (lang==='zh'?'個':'items')}
                    {maxPerP && <> · Max <strong>{maxPerP}</strong>/pallet</>}
                  </span>
                  {isStepComplete && <span style={{ color:'#10b981', fontSize:12, fontWeight:600 }}>✓ {lang==='zh'?'可完工':'Ready'}</span>}
                </div>

                <div style={{ display:'flex', gap:8, marginBottom:12, alignItems:'flex-end' }}>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:12, color: textMut, display:'block', marginBottom:5, fontWeight:600 }}>
                      {lang==='zh'?'棧板條碼 *':'Pallet barcode *'}
                    </label>
                    <input value={formData.newPallet} onChange={e => setFormData(f => ({...f, newPallet: e.target.value.toUpperCase()}))}
                      placeholder={lang==='zh'?'掃描或輸入棧板條碼...':'Scan or enter pallet barcode...'}
                      style={{ margin:0 }} />
                  </div>
                  <button className="btn btn-primary" style={{ flexShrink:0, marginBottom:0 }}
                    onClick={() => {
                      if (!formData.newPallet.trim()) return showAlert(t.msgNewPalletRequired);
                      if (packingPallets.find(p => p.palletBarcode === formData.newPallet)) return showAlert(lang==='zh'?'此棧板已使用':'Pallet already used');
                      setCurrentPackPallet(formData.newPallet.trim());
                    }}>
                    {lang==='zh'?'設定':'Set'}
                  </button>
                </div>

                {currentPackPallet && (
                  <div style={{ padding:'8px 12px', background: surface2, borderRadius:6, marginBottom:12,
                    fontSize:12, color:'var(--dk-accent)', display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontFamily:'monospace', fontWeight:700 }}>{currentPackPallet}</span>
                    <span style={{ color: textMut }}>— {currPDrums.length}{maxPerP ? `/${maxPerP}`:''} {lang==='zh'?'個':'items'}</span>
                    {maxPerP && currPDrums.length >= maxPerP && <span style={{ color:'#10b981' }}>Full</span>}
                  </div>
                )}

                <div style={{ border:`2px solid ${currentPackPallet ? 'var(--dk-accent)' : border}`, borderRadius:8, padding:14, marginBottom:14 }}>
                  <div style={{ fontSize:12, color: textMut, marginBottom:8, fontWeight:600 }}>
                    {lang==='zh'?'掃描加入目前棧板：':'Scan drum into current pallet:'}
                    {!currentPackPallet && (
                      <span style={{ color:'var(--dk-warn)', marginLeft:8, fontWeight:400 }}>
                        {lang==='zh'?'請先設定棧板條碼':'Set pallet barcode first'}
                      </span>
                    )}
                  </div>
                  <form onSubmit={handlePackScan}>
                    <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())}
                      placeholder={lang==='zh'?'掃描桶號...':'Scan drum barcode...'} autoFocus style={{ margin:0 }} />
                  </form>
                </div>

                {packingPallets.map((p, i) => (
                  <div key={i} style={{ padding:'9px 12px', background: surface2, borderRadius:6, marginBottom:6, fontSize:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontFamily:'monospace', color:'var(--dk-accent)', fontWeight:700 }}>{p.palletBarcode}</span>
                      <span style={{ color: textMut }}>{p.drums.length}{maxPerP ? `/${maxPerP}` : ''} {lang==='zh'?'個':'items'}</span>
                      {maxPerP && p.drums.length >= maxPerP && <span style={{ color:'#10b981', fontSize:11 }}>✓ Full</span>}
                    </div>
                    <div style={{ color: textMut, marginTop:4, fontSize:11, lineHeight:1.6 }}>{p.drums.join(' · ')}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Normal scan ── */}
            {!isFillingStep() && !usePackingUI && (
              <div style={{ border:`1px solid ${border}`, borderRadius:8, padding:16, marginBottom:16 }}>
                <div style={{ fontSize:12, color: textMut, marginBottom:10, display:'flex', justifyContent:'space-between' }}>
                  <span>
                    {t.labelScanned}: <strong style={{ color: isStepComplete ? '#10b981' : textPrim }}>
                      {scannedList.length} / {containers.length}
                    </strong>
                  </span>
                  {isStepComplete && <span style={{ color:'#10b981', fontSize:12, fontWeight:600 }}>✓ {lang==='zh'?'可完工':'Ready'}</span>}
                </div>
                <form onSubmit={handleVerify}>
                  <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())}
                    autoFocus placeholder={lang==='zh'?'掃描桶號驗證...':'Scan barcode...'} style={{ marginBottom:8 }} />
                </form>
                <div>
                  {containers.map(c => (
                    <div key={c.id} style={{ padding:'8px 0', borderBottom:`1px solid ${border}`,
                      fontFamily:'monospace', fontSize:13,
                      color: scannedList.includes(c.barcode) ? '#10b981' : textMut, fontWeight:600 }}>
                      {scannedList.includes(c.barcode) ? '+ ' : '○ '}{c.barcode}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Action button ── */}
            <button
              style={{ width:'100%', padding:14, fontSize:15, fontWeight:600,
                background: btnColor, color:'#fff', border:'none', borderRadius:8,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? .8 : 1,
                transition: 'background .3s' }}
              disabled={isSubmitting}
              onClick={handleSaveAndNext}>
              {btnLabel}
            </button>
          </div>
        </div>
      )}

      {/* ── Completion Modal ── */}
      {showComplete && completeInfo && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth:460, textAlign:'center', background: surface, border:`1px solid ${border}` }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'#10b981',
              margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center',
              color:'#fff', fontSize:26, fontWeight:700 }}>✓</div>
            <h3 style={{ color:'#10b981', fontSize:20, marginBottom:10 }}>{lang==='zh'?'生產完工！':'Production Complete!'}</h3>
            <div style={{ background: surface2, borderRadius:8, padding:16, margin:'12px 0', textAlign:'left' }}>
              <div style={{ fontSize:13, marginBottom:6 }}>
                <span style={{ color: textMut }}>Batch: </span>
                <span style={{ fontFamily:'monospace', color:'var(--dk-accent)', fontWeight:700 }}>{completeInfo.batchNo}</span>
              </div>
              <div style={{ fontSize:13, marginBottom:6 }}>
                <span style={{ color: textMut }}>{lang==='zh'?'包材':'Type'}: </span>
                <span className="badge badge-gray">{completeInfo.ct?.name || completeInfo.material}</span>
              </div>
              <div style={{ fontSize:13, marginBottom:6 }}>
                <span style={{ color: textMut }}>{lang==='zh'?'總數量':'Total'}: </span>
                <strong style={{ color: textPrim }}>{completeInfo.totalDrums}</strong>
              </div>
              {completeInfo.pallets.map((p, i) => (
                <div key={i} style={{ fontSize:11, color: textMut, marginTop:4 }}>
                  {p.palletBarcode} · {p.drums.length} {lang==='zh'?'個':'items'}
                </div>
              ))}
            </div>
            <button className="btn btn-success" style={{ width:'100%', padding:14 }} onClick={() => setShowComplete(false)}>
              {t.btnClose}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
