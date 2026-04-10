import React, { useState, useEffect } from 'react';
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
  // Packaging multi-pallet state
  const [packingPallets, setPackingPallets] = useState([]); // [{palletBarcode, drums:[]}]
  const [currentPackPallet, setCurrentPackPallet] = useState('');
  const [packedDrums, setPackedDrums] = useState([]); // all drums packed so far

  useEffect(() => { fetchBatches(); fetchRules(); }, []);

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

  const getPalletRule = (materialCode) => palletRules.find(r => materialCode && materialCode.startsWith(r.prefix));

  const startProduction = async (batch) => {
    const { data: stepData } = await supabase.from('material_process_steps').select('*').eq('material_code', batch.material_code).order('step_order', { ascending: true });
    if (!stepData || stepData.length === 0) return showAlert(t.msgNoProcessSteps);
    const { data: contData } = await supabase.from('production_containers').select('*').eq('batch_no', batch.batch_no);

    setSteps(stepData);
    setContainers(contData || []);
    setActiveBatch(batch);
    setCurrentStepIdx(0);
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

  const isFillingStep = () => steps[currentStepIdx]?.step_name?.toLowerCase().includes('filling');
  const isPackagingStep = () => steps[currentStepIdx]?.step_name?.toLowerCase().includes('packaging');

  const handleVerify = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;

    if (isFillingStep() && (!formData.workOrder || !formData.gunNumber)) {
      return showAlert(t.msgWorkOrderRequired);
    }
    const match = containers.find(c => c.barcode === input);
    if (!match) return showAlert(t.msgNotInTurnover);
    if (scannedList.includes(input)) return showAlert(t.msgAlreadyScanned);
    setScannedList([...scannedList, input]);
    setScanInput('');
  };

  // Packaging: scan a drum into the current pallet
  const handlePackScan = (e) => {
    e.preventDefault();
    const input = scanInput.trim().toUpperCase();
    if (!input) return;
    if (!currentPackPallet) return showAlert(t.msgNewPalletRequired);

    const rule = getPalletRule(activeBatch.material_code);
    const maxPerPallet = rule ? rule.containers_per_pallet : 4;

    const match = containers.find(c => c.barcode === input);
    if (!match) return showAlert(t.msgNotInTurnover);
    if (packedDrums.includes(input)) return showAlert(t.msgAlreadyScanned);

    // Find current pallet group
    const palletIdx = packingPallets.findIndex(p => p.palletBarcode === currentPackPallet);
    let updatedPallets = [...packingPallets];
    if (palletIdx === -1) {
      updatedPallets.push({ palletBarcode: currentPackPallet, drums: [input] });
    } else {
      const drums = [...updatedPallets[palletIdx].drums, input];
      updatedPallets[palletIdx] = { ...updatedPallets[palletIdx], drums };
      if (drums.length >= maxPerPallet) {
        showAlert(t.msgNewPalletNeeded);
        setCurrentPackPallet('');
        setFormData(f => ({ ...f, newPallet: '' }));
      }
    }
    setPackingPallets(updatedPallets);
    setPackedDrums([...packedDrums, input]);
    setScanInput('');
  };

  const handleSaveAndNext = async () => {
    // Validate scanning complete
    if (!isPackagingStep() && scannedList.length < containers.length) {
      return showAlert(t.msgVerifyAll);
    }

    const currentStep = steps[currentStepIdx];

    // Filling: save weight data
    if (isFillingStep()) {
      const missingWeight = scannedList.some(bc => {
        const w = weightData[bc] || {};
        return !w.empty || !w.setting || !w.filling;
      });
      if (missingWeight) return showAlert(t.msgFillWeights);

      for (const bc of scannedList) {
        const w = weightData[bc] || {};
        const { error } = await supabase.from('production_containers')
          .update({ weight_empty: w.empty, weight_setting: w.setting, weight_filling: w.filling, current_step: currentStepIdx + 2 })
          .eq('batch_no', activeBatch.batch_no).eq('barcode', bc);
        if (error) return showAlert(t.msgFail);
      }
    }

    // Packaging: multi-pallet finalization
    if (isPackagingStep()) {
      if (packedDrums.length < containers.length) return showAlert(t.msgAllPalletsComplete + ` (${packedDrums.length}/${containers.length})`);
      if (packingPallets.length === 0) return showAlert(t.msgNewPalletRequired);

      // Write pallet_container_map for each pallet
      const mapRows = packingPallets.flatMap(p =>
        p.drums.map(drum => ({
          parent_pallet: p.palletBarcode,
          child_barcode: drum,
          action_type: 'PACK',
          operator: currentUser
        }))
      );
      if (mapRows.length > 0) {
        const { error } = await supabase.from('pallet_container_map').insert(mapRows);
        if (error) return showAlert(t.msgFail);
      }

      // Update batch to completed
      await supabase.from('production_batches').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      // Update turnover containers to completed
      await supabase.from('turnover_inventory').update({ status: 'completed' }).eq('batch_no', activeBatch.batch_no);
      // Update production_containers step
      await supabase.from('production_containers')
        .update({ current_step: currentStepIdx + 2 })
        .eq('batch_no', activeBatch.batch_no);

      showAlert(t.msgAutoSuccess);
      setActiveBatch(null);
      fetchBatches();
      return;
    }

    // Normal step: advance
    await supabase.from('production_containers')
      .update({ current_step: currentStepIdx + 2 })
      .eq('batch_no', activeBatch.batch_no);

    setCurrentStepIdx(prev => prev + 1);
    setScannedList([]);
    setScanInput('');
  };

  const rule = activeBatch ? getPalletRule(activeBatch.material_code) : null;
  const maxPerPallet = rule ? rule.containers_per_pallet : 4;
  const currentPalletDrums = packingPallets.find(p => p.palletBarcode === currentPackPallet)?.drums || [];

  const statusLabels = {
    pending: t.mesPending,
    processing: t.mesProcessing,
    completed: t.mesCompleted
  };

  return (
    <div className="card" style={{ padding: '20px' }}>
      <h2 style={{ color: '#9c27b0', borderBottom: '2px solid #9c27b0', paddingBottom: '10px' }}>⚙️ MES {lang === 'zh' ? '生產看板' : 'Production Board'}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginTop: '20px' }}>
        {['pending', 'processing', 'completed'].map(status => (
          <div key={status} style={{ background: '#f5f5f5', padding: '15px', borderRadius: '10px', minHeight: '400px' }}>
            <h4 style={{ borderBottom: '1px solid #ccc', paddingBottom: '8px', marginTop: 0 }}>
              {statusLabels[status]}
            </h4>
            {batches[status].map(b => (
              <div key={b.batch_no}
                onClick={() => status !== 'completed' && startProduction(b)}
                style={{
                  background: '#fff', padding: '12px', marginBottom: '10px', borderRadius: '6px',
                  cursor: status !== 'completed' ? 'pointer' : 'default',
                  borderLeft: `5px solid ${status === 'pending' ? '#ff9800' : status === 'processing' ? '#9c27b0' : '#4caf50'}`
                }}>
                <strong style={{ fontSize: '14px' }}>{b.batch_no}</strong>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '3px' }}>{b.material_code}</div>
                {status === 'processing' && <div style={{ fontSize: '11px', color: '#9c27b0', marginTop: '3px' }}>▶ In progress</div>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Production Modal ── */}
      {activeBatch && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', width: '90%', maxWidth: '720px', borderRadius: '15px', padding: '28px', maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#1976d2' }}>{steps[currentStepIdx]?.step_name}</h3>
                <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                  {t.labelStep} {currentStepIdx + 1} / {steps.length} &nbsp;|&nbsp; Batch: {activeBatch.batch_no}
                </div>
              </div>
              <button onClick={() => setActiveBatch(null)} className="btn btn-secondary" style={{ padding: '8px 14px' }}>
                {t.btnClose}
              </button>
            </div>

            {/* Filling extras */}
            {isFillingStep() && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', background: '#f5f5f5', padding: '12px', borderRadius: '8px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 'bold' }}>{t.labelWorkOrder}</label>
                  <input type="text" value={formData.workOrder} onChange={e => setFormData({ ...formData, workOrder: e.target.value })} style={{ marginTop: '4px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 'bold' }}>{t.labelGunNumber}</label>
                  <input type="text" value={formData.gunNumber} onChange={e => setFormData({ ...formData, gunNumber: e.target.value })} style={{ marginTop: '4px' }} />
                </div>
              </div>
            )}

            {/* Packaging multi-pallet UI */}
            {isPackagingStep() ? (
              <div>
                <div style={{ background: '#e3f2fd', borderRadius: '8px', padding: '12px', marginBottom: '14px', fontSize: '14px' }}>
                  <strong>{lang === 'zh' ? '進度' : 'Progress'}:</strong> {packedDrums.length} / {containers.length} {lang === 'zh' ? '桶已裝棧板' : 'drums packed'} &nbsp;|&nbsp;
                  <strong>{lang === 'zh' ? '最多' : 'Max'} {maxPerPallet} {lang === 'zh' ? '桶/棧板' : 'drums/pallet'}</strong>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 'bold' }}>{t.labelNewPallet}</label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <input type="text" value={formData.newPallet}
                      onChange={e => setFormData({ ...formData, newPallet: e.target.value.toUpperCase() })}
                      placeholder={t.labelNewPallet} style={{ flex: 1 }} />
                    <button className="btn" style={{ padding: '8px 14px', flexShrink: 0 }}
                      onClick={() => {
                        if (!formData.newPallet) return showAlert(t.msgNewPalletRequired);
                        if (packingPallets.find(p => p.palletBarcode === formData.newPallet)) return showAlert(t.msgAlreadyScanned);
                        setCurrentPackPallet(formData.newPallet);
                      }}>
                      Set
                    </button>
                  </div>
                  {currentPackPallet && (
                    <div style={{ fontSize: '12px', color: '#1976d2', marginTop: '4px' }}>
                      ▶ Active: {currentPackPallet} ({currentPalletDrums.length}/{maxPerPallet})
                    </div>
                  )}
                </div>

                <form onSubmit={handlePackScan}>
                  <input type="text" value={scanInput}
                    onChange={e => setScanInput(e.target.value.toUpperCase())}
                    placeholder={lang === 'zh' ? '掃描桶號加入棧板...' : 'Scan drum into pallet...'}
                    autoFocus />
                </form>

                {/* Pallet summary */}
                {packingPallets.map((p, i) => (
                  <div key={i} style={{ background: '#f5f5f5', borderRadius: '6px', padding: '8px 12px', marginTop: '8px', fontSize: '13px' }}>
                    <strong>📦 {p.palletBarcode}</strong> — {p.drums.length} drums
                    {p.drums.length >= maxPerPallet && <span style={{ color: '#4caf50', marginLeft: '8px' }}>✅ Full</span>}
                    <div style={{ marginTop: '4px', color: '#555' }}>{p.drums.join(', ')}</div>
                  </div>
                ))}
              </div>
            ) : (
              /* Normal scan area */
              <div style={{ border: '2px solid #f44336', padding: '16px', borderRadius: '10px', marginBottom: '16px' }}>
                <div style={{ marginBottom: '8px', fontSize: '14px', color: '#555' }}>
                  {t.labelScanned}: {scannedList.length} / {containers.length}
                </div>
                <form onSubmit={handleVerify}>
                  <input type="text" value={scanInput}
                    onChange={e => setScanInput(e.target.value.toUpperCase())}
                    autoFocus placeholder={lang === 'zh' ? '掃描桶號...' : 'Scan drum barcode...'} />
                </form>
                <div style={{ marginTop: '10px' }}>
                  {containers.map(c => (
                    <div key={c.id} style={{ borderBottom: '1px solid #eee', padding: '8px 0' }}>
                      <span style={{ color: scannedList.includes(c.barcode) ? '#4caf50' : '#bbb' }}>
                        {scannedList.includes(c.barcode) ? '✅' : '⚪'} {c.barcode}
                      </span>
                      {scannedList.includes(c.barcode) && isFillingStep() && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '6px' }}>
                          <div>
                            <label style={{ fontSize: '11px', color: '#666' }}>{t.labelEmptyWeight}</label>
                            <input type="number" placeholder="0.00" style={{ padding: '6px', fontSize: '14px' }}
                              onChange={e => setWeightData({ ...weightData, [c.barcode]: { ...weightData[c.barcode], empty: e.target.value } })} />
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', color: '#666' }}>{t.labelSettingWeight}</label>
                            <input type="number" placeholder="0.00" style={{ padding: '6px', fontSize: '14px' }}
                              onChange={e => setWeightData({ ...weightData, [c.barcode]: { ...weightData[c.barcode], setting: e.target.value } })} />
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', color: '#666' }}>{t.labelFillingWeight}</label>
                            <input type="number" placeholder="0.00" style={{ padding: '6px', fontSize: '14px' }}
                              onChange={e => setWeightData({ ...weightData, [c.barcode]: { ...weightData[c.barcode], filling: e.target.value } })} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Save / Next button */}
            <button className="btn"
              style={{ width: '100%', background: isPackagingStep() ? '#2e7d32' : '#9c27b0', padding: '14px', marginTop: '10px', fontSize: '16px' }}
              onClick={handleSaveAndNext}>
              {isPackagingStep() ? t.btnComplete : t.btnSaveNext}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
