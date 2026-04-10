import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabaseClient';

export default function MES({ t, lang, currentUser, showAlert }) {
  const [batches, setBatches] = useState({ pending: [], processing: [], completed: [] });
  const [activeBatch, setActiveBatch] = useState(null);
  const [steps, setSteps] = useState([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [containers, setContainers] = useState([]);
  const [scannedList, setScannedList] = useState([]);
  const [scanInput, setScanInput] = useState('');
  const [palletRules, setPalletRules] = useState([]);
  const [formData, setFormData] = useState({ workOrder: '', gunNumber: '', newPallet: '' });
  const [weightData, setWeightData] = useState({});
  const [packingPallets, setPackingPallets] = useState([]);
  const [currentPackPallet, setCurrentPackPallet] = useState('');
  const [packedDrums, setPackedDrums] = useState([]);
  const [showComplete, setShowComplete] = useState(false);
  const [completeInfo, setCompleteInfo] = useState(null);
  const scanRef = useRef(null);

  useEffect(() => {
    fetchBatches(); fetchRules();
    const ch = supabase.channel('mes-ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, fetchBatches)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  useEffect(() => {
    if (activeBatch && !isPackagingStep()) setTimeout(() => scanRef.current?.focus(), 100);
  }, [currentStepIdx, scannedList.length, activeBatch]);

  const fetchRules = async () => {
    const { data } = await supabase.from('pallet_barcode_rules').select('*');
    if (data) setPalletRules(data);
  };
  const fetchBatches = async () => {
    const { data, error } = await supabase.from('production_batches').select('*').order('created_at', { ascending: false });
    if (error) { showAlert(t.msgFail); return; }
    if (data) setBatches({ pending: data.filter(b => b.status === 'pending'), processing: data.filter(b => b.status === 'processing'), completed: data.filter(b => b.status === 'completed') });
  };

  const getPalletRule = (mc) => palletRules.find(r => r.material_code && r.material_code === mc);
  const isFillingStep   = () => steps[currentStepIdx]?.step_name?.toLowerCase().includes('filling');
  const isPackagingStep = () => steps[currentStepIdx]?.step_name?.toLowerCase().includes('packaging');

  const startProduction = async (batch) => {
    const { data: stepData } = await supabase.from('material_process_steps').select('*').eq('material_code', batch.material_code).order('step_order', { ascending: true });
    if (!stepData?.length) return showAlert(t.msgNoProcessSteps);
    const { data: contData } = await supabase.from('production_containers').select('*').eq('batch_no', batch.batch_no);
    setSteps(stepData); setContainers(contData || []); setActiveBatch(batch);
    const minStep = contData?.length ? Math.min(...contData.map(c => c.current_step ?? 1)) - 1 : 0;
    setCurrentStepIdx(Math.max(0, minStep));
    setScannedList([]); setWeightData({}); setPackingPallets([]); setCurrentPackPallet(''); setPackedDrums([]);
    setFormData({ workOrder: '', gunNumber: '', newPallet: '' });
    if (batch.status === 'pending') { await supabase.from('production_batches').update({ status: 'processing' }).eq('batch_no', batch.batch_no); fetchBatches(); }
  };

  const handleVerify = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    if (isFillingStep() && (!formData.workOrder || !formData.gunNumber)) return showAlert(t.msgWorkOrderRequired);
    if (!containers.find(c => c.barcode === input)) return showAlert(t.msgNotInTurnover);
    if (scannedList.includes(input)) return showAlert(t.msgAlreadyScanned);
    if (navigator.vibrate) navigator.vibrate(40);
    setScannedList(prev => [...prev, input]); setScanInput('');
  };

  const handlePackScan = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    if (!currentPackPallet) return showAlert(t.msgNewPalletRequired);
    const rule = getPalletRule(activeBatch.material_code);
    const max = rule ? rule.containers_per_pallet : 4;
    if (!containers.find(c => c.barcode === input)) return showAlert(t.msgNotInTurnover);
    if (packedDrums.includes(input)) return showAlert(t.msgAlreadyScanned);
    if (navigator.vibrate) navigator.vibrate(40);
    const idx = packingPallets.findIndex(p => p.palletBarcode === currentPackPallet);
    let updated = [...packingPallets];
    if (idx === -1) { updated.push({ palletBarcode: currentPackPallet, drums: [input] }); }
    else {
      const drums = [...updated[idx].drums, input];
      updated[idx] = { ...updated[idx], drums };
      if (drums.length >= max) { showAlert(t.msgNewPalletNeeded); setCurrentPackPallet(''); setFormData(f => ({ ...f, newPallet: '' })); }
    }
    setPackingPallets(updated); setPackedDrums(prev => [...prev, input]); setScanInput('');
  };

  const handleSaveAndNext = async () => {
    const rule = getPalletRule(activeBatch?.material_code);
    if (isPackagingStep() && rule) {
      if (packedDrums.length < containers.length) return showAlert(t.msgVerifyAll + ` (${packedDrums.length}/${containers.length})`);
      if (!packingPallets.length) return showAlert(t.msgNewPalletRequired);
      const mapRows = packingPallets.flatMap(p => p.drums.map(drum => ({ parent_pallet: p.palletBarcode, child_barcode: drum, action_type: 'PACK', operator: currentUser })));
      if (mapRows.length) { const { error } = await supabase.from('pallet_container_map').insert(mapRows); if (error) return showAlert(t.msgFail); }
      await supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      await supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      await supabase.from('production_containers').update({ current_step: currentStepIdx + 2 }).eq('batch_no', activeBatch.batch_no);
      setCompleteInfo({ batchNo: activeBatch.batch_no, pallets: packingPallets, totalDrums: packedDrums.length });
      setShowComplete(true); setActiveBatch(null); fetchBatches(); return;
    }
    if (!isPackagingStep() && scannedList.length < containers.length) return showAlert(t.msgVerifyAll);
    if (isFillingStep()) {
      if (scannedList.some(bc => { const w = weightData[bc]||{}; return !w.empty||!w.setting||!w.filling; })) return showAlert(t.msgFillWeights);
      const results = await Promise.all(scannedList.map(bc => {
        const w = weightData[bc]||{};
        return supabase.from('production_containers').update({ weight_empty: w.empty, weight_setting: w.setting, weight_filling: w.filling, work_order: formData.workOrder, gun_number: formData.gunNumber, current_step: currentStepIdx + 2 }).eq('batch_no', activeBatch.batch_no).eq('barcode', bc);
      }));
      if (results.some(r => r.error)) return showAlert(t.msgFail);
    }
    if (isPackagingStep() && !rule) {
      await supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      await supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      await supabase.from('production_containers').update({ current_step: currentStepIdx + 2 }).eq('batch_no', activeBatch.batch_no);
      setCompleteInfo({ batchNo: activeBatch.batch_no, pallets: [], totalDrums: containers.length });
      setShowComplete(true); setActiveBatch(null); fetchBatches(); return;
    }
    await supabase.from('production_containers').update({ current_step: currentStepIdx + 2 }).eq('batch_no', activeBatch.batch_no);
    setCurrentStepIdx(prev => prev + 1); setScannedList([]); setScanInput('');
  };

  const rule = activeBatch ? getPalletRule(activeBatch.material_code) : null;
  const maxPerPallet = rule ? rule.containers_per_pallet : 4;
  const currentPalletDrums = packingPallets.find(p => p.palletBarcode === currentPackPallet)?.drums || [];

  const colConfig = {
    pending:    { label: t.mesPending,    accent: '#f59e0b', bg: 'rgba(245,158,11,.08)' },
    processing: { label: t.mesProcessing, accent: '#8b5cf6', bg: 'rgba(139,92,246,.08)' },
    completed:  { label: t.mesCompleted,  accent: '#10b981', bg: 'rgba(16,185,129,.08)' },
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">MES {lang === 'zh' ? '生產看板' : 'Production Board'}</div>
          <div className="page-subtitle">{lang === 'zh' ? '即時製程追蹤' : 'Real-time process tracking'}</div>
        </div>
      </div>

      <div className="kanban-grid">
        {['pending','processing','completed'].map(status => (
          <div key={status} className="kanban-col">
            <div className="kanban-col-header">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: colConfig[status].accent, flexShrink: 0 }} />
              {colConfig[status].label}
              <span style={{ marginLeft: 'auto', background: colConfig[status].bg, color: colConfig[status].accent, padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                {batches[status].length}
              </span>
            </div>
            {batches[status].map(b => (
              <div key={b.batch_no} className="kanban-item"
                style={{ borderLeft: `3px solid ${colConfig[status].accent}`, cursor: status !== 'completed' ? 'pointer' : 'default' }}
                onClick={() => status !== 'completed' && startProduction(b)}>
                <div className="kanban-batch">{b.batch_no}</div>
                <div className="kanban-meta">{b.material_code}{status === 'processing' ? ` · ${lang === 'zh' ? '生產中' : 'In progress'}` : ''}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Production Modal */}
      {activeBatch && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 760, width: '94%', maxHeight: '92vh', overflowY: 'auto' }}>
            {/* Step progress */}
            <div className="step-bar" style={{ marginBottom: 16 }}>
              {steps.map((s, i) => <div key={i} className={`step-dot ${i < currentStepIdx ? 'done' : i === currentStepIdx ? 'active' : ''}`} title={s.step_name} />)}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 4 }}>{steps[currentStepIdx]?.step_name}</h3>
                <div style={{ fontSize: 12, color: 'var(--dk-text-3)' }}>
                  {t.labelStep} {currentStepIdx + 1}/{steps.length} · {t.labelBatchNo}: <span style={{ fontFamily: 'monospace', color: 'var(--dk-accent)' }}>{activeBatch.batch_no}</span> · {activeBatch.material_code}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setActiveBatch(null)}>{t.btnClose}</button>
            </div>

            {/* Filling extras */}
            {isFillingStep() && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16, padding: 14, background: 'var(--dk-surface2)', borderRadius: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--dk-text-3)', display: 'block', marginBottom: 4 }}>{t.labelWorkOrder} *</label>
                  <input value={formData.workOrder} onChange={e => setFormData(f => ({ ...f, workOrder: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--dk-text-3)', display: 'block', marginBottom: 4 }}>{t.labelGunNumber} *</label>
                  <input value={formData.gunNumber} onChange={e => setFormData(f => ({ ...f, gunNumber: e.target.value }))} />
                </div>
              </div>
            )}

            {/* Packaging mode */}
            {isPackagingStep() && rule ? (
              <div>
                <div style={{ padding: '10px 14px', background: 'var(--dk-accent-bg)', borderRadius: 8, marginBottom: 14, fontSize: 12, color: '#93c5fd' }}>
                  {lang === 'zh' ? '進度' : 'Progress'}: <strong>{packedDrums.length}/{containers.length}</strong> · {lang === 'zh' ? '最多' : 'Max'} <strong>{maxPerPallet}</strong> {lang === 'zh' ? '桶/棧板' : 'drums/pallet'}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input value={formData.newPallet} onChange={e => setFormData(f => ({ ...f, newPallet: e.target.value.toUpperCase() }))} placeholder={t.labelNewPallet} style={{ flex: 1 }} />
                  <button className="btn btn-primary btn-sm" onClick={() => {
                    if (!formData.newPallet) return showAlert(t.msgNewPalletRequired);
                    if (packingPallets.find(p => p.palletBarcode === formData.newPallet)) return showAlert(t.msgAlreadyScanned);
                    setCurrentPackPallet(formData.newPallet);
                  }}>{lang === 'zh' ? '設定' : 'Set'}</button>
                </div>
                {currentPackPallet && (
                  <div style={{ fontSize: 11, color: 'var(--dk-accent)', marginBottom: 10 }}>
                    Active: <strong>{currentPackPallet}</strong> ({currentPalletDrums.length}/{maxPerPallet})
                  </div>
                )}
                <form onSubmit={handlePackScan}>
                  <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} placeholder={lang === 'zh' ? '掃描桶號加入棧板...' : 'Scan drum into pallet...'} autoFocus />
                </form>
                {packingPallets.map((p, i) => (
                  <div key={i} style={{ padding: '8px 12px', background: 'var(--dk-surface2)', borderRadius: 6, marginTop: 6, fontSize: 11 }}>
                    <span style={{ fontFamily: 'monospace', color: '#93c5fd' }}>{p.palletBarcode}</span>
                    <span style={{ color: 'var(--dk-text-3)', marginLeft: 8 }}>{p.drums.length} {lang === 'zh' ? '桶' : 'drums'}</span>
                    {p.drums.length >= maxPerPallet && <span style={{ color: '#10b981', marginLeft: 6 }}>✓ {lang === 'zh' ? '已滿' : 'Full'}</span>}
                    <div style={{ color: 'var(--dk-text-4)', marginTop: 3, fontSize: 10 }}>{p.drums.join(' · ')}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ border: '1px solid var(--dk-border2)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--dk-text-3)', marginBottom: 10 }}>
                  {t.labelScanned}: <strong style={{ color: 'var(--dk-text)' }}>{scannedList.length} / {containers.length}</strong>
                </div>
                <form onSubmit={handleVerify}>
                  <input ref={scanRef} value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} autoFocus placeholder={lang === 'zh' ? '掃描桶號驗證...' : 'Scan barcode to verify...'} />
                </form>
                <div>
                  {containers.map(c => (
                    <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--dk-border)' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: scannedList.includes(c.barcode) ? '#10b981' : 'var(--dk-text-4)', fontWeight: 600 }}>
                        {scannedList.includes(c.barcode) ? '✓ ' : '○ '}{c.barcode}
                      </span>
                      {scannedList.includes(c.barcode) && isFillingStep() && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                          {[['empty', t.labelEmptyWeight], ['setting', t.labelSettingWeight], ['filling', t.labelFillingWeight]].map(([k, label]) => (
                            <div key={k}>
                              <div style={{ fontSize: 10, color: 'var(--dk-text-3)', marginBottom: 3 }}>{label}</div>
                              <input type="number" placeholder="0.00" style={{ padding: '7px 10px', fontSize: 13 }}
                                onChange={e => setWeightData(w => ({ ...w, [c.barcode]: { ...w[c.barcode], [k]: e.target.value } }))} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15, background: isPackagingStep() ? '#059669' : '#8b5cf6' }} onClick={handleSaveAndNext}>
              {isPackagingStep() ? t.btnComplete : t.btnSaveNext}
            </button>
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {showComplete && completeInfo && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 460, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h3 style={{ color: '#10b981', fontSize: 20, marginBottom: 8 }}>{lang === 'zh' ? '生產完工！' : 'Production Complete!'}</h3>
            <div style={{ background: 'var(--dk-surface2)', borderRadius: 8, padding: 16, margin: '14px 0', textAlign: 'left' }}>
              <div style={{ fontSize: 12, marginBottom: 6 }}><span style={{ color: 'var(--dk-text-3)' }}>{t.labelBatchNo}:</span> <span style={{ fontFamily: 'monospace', color: '#93c5fd' }}>{completeInfo.batchNo}</span></div>
              <div style={{ fontSize: 12, marginBottom: 6 }}><span style={{ color: 'var(--dk-text-3)' }}>{lang === 'zh' ? '總桶數' : 'Total drums'}:</span> <strong> {completeInfo.totalDrums}</strong></div>
              {completeInfo.pallets.map((p, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--dk-text-3)', marginTop: 4 }}>
                  {p.palletBarcode} · {p.drums.length} {lang === 'zh' ? '桶' : 'drums'}
                </div>
              ))}
            </div>
            <button className="btn btn-success" style={{ width: '100%', padding: 14 }} onClick={() => setShowComplete(false)}>{t.btnClose}</button>
          </div>
        </div>
      )}
    </div>
  );
}
