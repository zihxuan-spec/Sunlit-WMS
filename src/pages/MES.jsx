import React, { useState, useEffect, useRef, useMemo } from 'react';
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
    fetchBatches();
    fetchRules();
    const channel = supabase.channel('mes-batches-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, fetchBatches)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // Auto-focus scan input when step changes or item scanned
  useEffect(() => {
    if (activeBatch && !isPackagingStep()) {
      setTimeout(() => scanRef.current?.focus(), 100);
    }
  }, [currentStepIdx, scannedList.length, activeBatch]);

  const fetchRules = async () => {
    const { data } = await supabase.from('pallet_barcode_rules').select('*');
    if (data) setPalletRules(data);
  };

  const fetchBatches = async () => {
    const { data, error } = await supabase.from('production_batches').select('*').order('created_at', { ascending: false });
    if (error) { showAlert(t.msgFail); return; }
    if (data) {
      setBatches({
        pending: data.filter(b => b.status === 'pending'),
        processing: data.filter(b => b.status === 'processing'),
        completed: data.filter(b => b.status === 'completed'),
      });
    }
  };

  const getPalletRule = (materialCode) => palletRules.find(r => r.material_code && r.material_code === materialCode);
  const isFillingStep = () => steps[currentStepIdx]?.step_name?.toLowerCase().includes('filling');
  const isPackagingStep = () => steps[currentStepIdx]?.step_name?.toLowerCase().includes('packaging');

  const startProduction = async (batch) => {
    const { data: stepData } = await supabase.from('material_process_steps').select('*').eq('material_code', batch.material_code).order('step_order', { ascending: true });
    if (!stepData || stepData.length === 0) return showAlert(t.msgNoProcessSteps);
    const { data: contData } = await supabase.from('production_containers').select('*').eq('batch_no', batch.batch_no);

    setSteps(stepData);
    setContainers(contData || []);
    setActiveBatch(batch);
    const minStep = contData && contData.length > 0 ? Math.min(...contData.map(c => c.current_step ?? 1)) - 1 : 0;
    setCurrentStepIdx(Math.max(0, minStep));
    setScannedList([]);
    setWeightData({});
    setPackingPallets([]);
    setCurrentPackPallet('');
    setPackedDrums([]);
    setFormData({ workOrder: '', gunNumber: '', newPallet: '' });

    if (batch.status === 'pending') {
      await supabase.from('production_batches').update({ status: 'processing' }).eq('batch_no', batch.batch_no);
      fetchBatches();
    }
  };

  const handleVerify = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    if (isFillingStep() && (!formData.workOrder || !formData.gunNumber)) return showAlert(t.msgWorkOrderRequired);
    const match = containers.find(c => c.barcode === input);
    if (!match) return showAlert(t.msgNotInTurnover);
    if (scannedList.includes(input)) return showAlert(t.msgAlreadyScanned);
    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(40);
    setScannedList(prev => [...prev, input]);
    setScanInput('');
  };

  const handlePackScan = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    if (!currentPackPallet) return showAlert(t.msgNewPalletRequired);
    const rule = getPalletRule(activeBatch.material_code);
    const maxPerPallet = rule ? rule.containers_per_pallet : 4;
    if (!containers.find(c => c.barcode === input)) return showAlert(t.msgNotInTurnover);
    if (packedDrums.includes(input)) return showAlert(t.msgAlreadyScanned);
    if (navigator.vibrate) navigator.vibrate(40);

    const palletIdx = packingPallets.findIndex(p => p.palletBarcode === currentPackPallet);
    let updated = [...packingPallets];
    if (palletIdx === -1) {
      updated.push({ palletBarcode: currentPackPallet, drums: [input] });
    } else {
      const drums = [...updated[palletIdx].drums, input];
      updated[palletIdx] = { ...updated[palletIdx], drums };
      if (drums.length >= maxPerPallet) {
        showAlert(t.msgNewPalletNeeded);
        setCurrentPackPallet('');
        setFormData(f => ({ ...f, newPallet: '' }));
      }
    }
    setPackingPallets(updated);
    setPackedDrums(prev => [...prev, input]);
    setScanInput('');
  };

  const handleSaveAndNext = async () => {
    const rule = getPalletRule(activeBatch?.material_code);

    if (isPackagingStep() && rule) {
      if (packedDrums.length < containers.length) return showAlert(t.msgVerifyAll + ` (${packedDrums.length}/${containers.length})`);
      if (packingPallets.length === 0) return showAlert(t.msgNewPalletRequired);

      const mapRows = packingPallets.flatMap(p => p.drums.map(drum => ({ parent_pallet: p.palletBarcode, child_barcode: drum, action_type: 'PACK', operator: currentUser })));
      if (mapRows.length > 0) {
        const { error } = await supabase.from('pallet_container_map').insert(mapRows);
        if (error) return showAlert(t.msgFail);
      }
      await supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      await supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      await supabase.from('production_containers').update({ current_step: currentStepIdx + 2 }).eq('batch_no', activeBatch.batch_no);

      setCompleteInfo({ batchNo: activeBatch.batch_no, pallets: packingPallets, totalDrums: packedDrums.length });
      setShowComplete(true);
      setActiveBatch(null);
      fetchBatches();
      return;
    }

    if (!isPackagingStep() && scannedList.length < containers.length) return showAlert(t.msgVerifyAll);

    if (isFillingStep()) {
      const missingWeight = scannedList.some(bc => { const w = weightData[bc] || {}; return !w.empty || !w.setting || !w.filling; });
      if (missingWeight) return showAlert(t.msgFillWeights);
      const results = await Promise.all(scannedList.map(bc => {
        const w = weightData[bc] || {};
        return supabase.from('production_containers')
          .update({ weight_empty: w.empty, weight_setting: w.setting, weight_filling: w.filling, work_order: formData.workOrder, gun_number: formData.gunNumber, current_step: currentStepIdx + 2 })
          .eq('batch_no', activeBatch.batch_no).eq('barcode', bc);
      }));
      if (results.some(r => r.error)) return showAlert(t.msgFail);
    }

    if (isPackagingStep() && !rule) {
      await supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      await supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      await supabase.from('production_containers').update({ current_step: currentStepIdx + 2 }).eq('batch_no', activeBatch.batch_no);
      setCompleteInfo({ batchNo: activeBatch.batch_no, pallets: [], totalDrums: containers.length });
      setShowComplete(true);
      setActiveBatch(null);
      fetchBatches();
      return;
    }

    await supabase.from('production_containers').update({ current_step: currentStepIdx + 2 }).eq('batch_no', activeBatch.batch_no);
    setCurrentStepIdx(prev => prev + 1);
    setScannedList([]);
    setScanInput('');
  };

  const rule = activeBatch ? getPalletRule(activeBatch.material_code) : null;
  const maxPerPallet = rule ? rule.containers_per_pallet : 4;
  const currentPalletDrums = packingPallets.find(p => p.palletBarcode === currentPackPallet)?.drums || [];

  const statusLabels = { pending: t.mesPending, processing: t.mesProcessing, completed: t.mesCompleted };
  const colColors = { pending: '#ff9800', processing: '#9c27b0', completed: '#4caf50' };

  return (
    <div className="card" style={{ padding: '20px' }}>
      <h2 style={{ color: '#9c27b0', borderBottom: '2px solid #9c27b0', paddingBottom: '10px', marginTop: 0 }}>
        ⚙️ MES {lang === 'zh' ? '生產看板' : 'Production Board'}
      </h2>

      <div className="kanban-grid">
        {['pending', 'processing', 'completed'].map(status => (
          <div key={status} className="kanban-col" style={{ background: status === 'pending' ? 'var(--bg-section-warm)' : status === 'processing' ? 'var(--bg-section-purple)' : 'var(--bg-section-green)' }}>
            <h4 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginTop: 0, color: colColors[status], fontSize: '14px' }}>
              {statusLabels[status]} ({batches[status].length})
            </h4>
            {batches[status].map(b => (
              <div key={b.batch_no} className="kanban-item"
                style={{ borderLeft: `4px solid ${colColors[status]}`, cursor: status !== 'completed' ? 'pointer' : 'default' }}
                onClick={() => status !== 'completed' && startProduction(b)}>
                <div style={{ fontWeight: 700, fontSize: '13px' }}>{b.batch_no}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{b.material_code}</div>
                {status === 'processing' && <div style={{ fontSize: '11px', color: '#9c27b0', marginTop: '3px' }}>▶ {lang === 'zh' ? '生產中' : 'In progress'}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Production Modal */}
      {activeBatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.82)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg-card)', width: '92%', maxWidth: '740px', borderRadius: 'var(--radius-xl)', padding: '28px', maxHeight: '92vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
            {/* Step progress bar */}
            <div className="step-bar">
              {steps.map((s, i) => (
                <div key={i} className={`step-dot ${i < currentStepIdx ? 'done' : i === currentStepIdx ? 'active' : ''}`} title={s.step_name} />
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#1976d2', fontSize: '20px' }}>{steps[currentStepIdx]?.step_name}</h3>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '5px' }}>
                  {t.labelStep} {currentStepIdx + 1} / {steps.length} &nbsp;·&nbsp; {t.labelBatchNo}: <strong>{activeBatch.batch_no}</strong> &nbsp;·&nbsp; 📦 {activeBatch.material_code}
                </div>
              </div>
              <button onClick={() => setActiveBatch(null)} className="btn btn-secondary btn-sm">{t.btnClose}</button>
            </div>

            {/* Filling extras */}
            {isFillingStep() && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', background: 'var(--bg-section)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t.labelWorkOrder} *</label>
                  <input type="text" value={formData.workOrder} onChange={e => setFormData({ ...formData, workOrder: e.target.value })} style={{ marginTop: '4px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t.labelGunNumber} *</label>
                  <input type="text" value={formData.gunNumber} onChange={e => setFormData({ ...formData, gunNumber: e.target.value })} style={{ marginTop: '4px' }} />
                </div>
              </div>
            )}

            {/* Packaging with pallet rule */}
            {isPackagingStep() && rule ? (
              <div>
                <div style={{ background: 'var(--bg-section-blue)', borderRadius: 'var(--radius-md)', padding: '12px', marginBottom: '14px', fontSize: '13px' }}>
                  <strong>{lang === 'zh' ? '進度' : 'Progress'}:</strong> {packedDrums.length} / {containers.length} &nbsp;|&nbsp; {lang === 'zh' ? '最多' : 'Max'} <strong>{maxPerPallet}</strong> {lang === 'zh' ? '桶/棧板' : 'drums/pallet'}
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t.labelNewPallet} *</label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <input type="text" value={formData.newPallet} onChange={e => setFormData({ ...formData, newPallet: e.target.value.toUpperCase() })} placeholder={t.labelNewPallet} style={{ flex: 1 }} />
                    <button className="btn btn-sm" onClick={() => {
                      if (!formData.newPallet) return showAlert(t.msgNewPalletRequired);
                      if (packingPallets.find(p => p.palletBarcode === formData.newPallet)) return showAlert(t.msgAlreadyScanned);
                      setCurrentPackPallet(formData.newPallet);
                    }}>{lang === 'zh' ? '設定' : 'Set'}</button>
                  </div>
                  {currentPackPallet && (
                    <div style={{ fontSize: '12px', color: '#1976d2', marginTop: '4px' }}>
                      ▶ {lang === 'zh' ? '目前棧板' : 'Active'}: {currentPackPallet} ({currentPalletDrums.length}/{maxPerPallet}) {currentPalletDrums.length >= maxPerPallet ? '✅' : ''}
                    </div>
                  )}
                </div>
                <form onSubmit={handlePackScan}>
                  <input ref={scanRef} type="text" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} placeholder={lang === 'zh' ? '掃描桶號加入棧板...' : 'Scan drum into pallet...'} autoFocus />
                </form>
                {packingPallets.map((p, i) => (
                  <div key={i} style={{ background: 'var(--bg-section)', borderRadius: 'var(--radius-md)', padding: '8px 12px', marginTop: '8px', fontSize: '12px' }}>
                    <strong>📦 {p.palletBarcode}</strong> — {p.drums.length} {lang === 'zh' ? '桶' : 'drums'}
                    {p.drums.length >= maxPerPallet && <span style={{ color: 'var(--success)', marginLeft: '8px' }}>✅ {lang === 'zh' ? '已滿' : 'Full'}</span>}
                    <div style={{ marginTop: '3px', color: 'var(--text-muted)', fontSize: '11px' }}>{p.drums.join(' · ')}</div>
                  </div>
                ))}
              </div>
            ) : (
              /* Normal scan area */
              <div style={{ border: '2px solid var(--danger)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                <div style={{ marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {t.labelScanned}: <strong>{scannedList.length} / {containers.length}</strong>
                </div>
                <form onSubmit={handleVerify}>
                  <input ref={scanRef} type="text" value={scanInput} onChange={e => setScanInput(e.target.value.toUpperCase())} autoFocus placeholder={lang === 'zh' ? '掃描桶號...' : 'Scan drum barcode...'} />
                </form>
                <div style={{ marginTop: '10px' }}>
                  {containers.map(c => (
                    <div key={c.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0' }}>
                      <span style={{ color: scannedList.includes(c.barcode) ? 'var(--success)' : 'var(--border)', fontWeight: 600 }}>
                        {scannedList.includes(c.barcode) ? '✅' : '⚪'} {c.barcode}
                      </span>
                      {scannedList.includes(c.barcode) && isFillingStep() && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '6px' }}>
                          {[['empty', t.labelEmptyWeight], ['setting', t.labelSettingWeight], ['filling', t.labelFillingWeight]].map(([key, label]) => (
                            <div key={key}>
                              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</label>
                              <input type="number" placeholder="0.00" style={{ padding: '7px', fontSize: '14px' }}
                                onChange={e => setWeightData(w => ({ ...w, [c.barcode]: { ...w[c.barcode], [key]: e.target.value } }))} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn" style={{ width: '100%', background: isPackagingStep() ? '#2e7d32' : '#9c27b0', padding: '14px', marginTop: '10px', fontSize: '16px' }} onClick={handleSaveAndNext}>
              {isPackagingStep() ? t.btnComplete : t.btnSaveNext}
            </button>
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {showComplete && completeInfo && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.82)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: 'var(--bg-card)', width: '90%', maxWidth: '500px', borderRadius: 'var(--radius-xl)', padding: '32px', textAlign: 'center', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '52px', marginBottom: '12px' }}>🎉</div>
            <h2 style={{ color: 'var(--success)', margin: '0 0 8px 0' }}>{lang === 'zh' ? '生產完工！' : 'Production Complete!'}</h2>
            <div style={{ background: 'var(--bg-section)', borderRadius: 'var(--radius-md)', padding: '16px', margin: '16px 0', textAlign: 'left' }}>
              <div style={{ fontSize: '13px', marginBottom: '6px' }}><strong>{t.labelBatchNo}:</strong> {completeInfo.batchNo}</div>
              <div style={{ fontSize: '13px', marginBottom: '6px' }}><strong>{lang === 'zh' ? '總桶數' : 'Total drums'}:</strong> {completeInfo.totalDrums}</div>
              {completeInfo.pallets.length > 0 && (
                <div>
                  <strong style={{ fontSize: '13px' }}>{lang === 'zh' ? '出貨棧板：' : 'Output pallets:'}</strong>
                  {completeInfo.pallets.map((p, i) => (
                    <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      📦 {p.palletBarcode} ({p.drums.length} {lang === 'zh' ? '桶' : 'drums'})
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="btn btn-success" style={{ width: '100%', padding: '14px', fontSize: '16px' }} onClick={() => setShowComplete(false)}>
              {lang === 'zh' ? '確認關閉' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
