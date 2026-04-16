import React, { useState, useEffect } from 'react';
import { supabase } from '../config/supabaseClient';

// ── Shared helpers ────────────────────────────────────────────
const useTable = (table, query = (q) => q) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetch = async () => {
    setLoading(true);
    const { data: d } = await query(supabase.from(table).select('*'));
    if (d) setData(d);
    setLoading(false);
  };
  useEffect(() => { fetch(); }, []);
  return { data, loading, refetch: fetch };
};

const TABS = [
  { key: 'containers', label: { en: 'Container Types', zh: '包材類型' }, icon: '▦' },
  { key: 'customers',  label: { en: 'Customers',       zh: '客戶'     }, icon: '◉' },
  { key: 'guns',       label: { en: 'Gun Stations',    zh: '槍號設定' }, icon: '⊕' },
  { key: 'shelves',    label: { en: 'Shelf Layout',    zh: '貨架設定' }, icon: '⊞' },
  { key: 'spmaster',   label: { en: 'SP Master Data',  zh: '備品主檔' }, icon: '◈' },
  { key: 'spdepts',    label: { en: 'SP Departments',  zh: '備品部門' }, icon: '◫' },
];

export default function Admin({ lang, showAlert, showConfirm, currentUser }) {
  const [tab, setTab] = useState('containers');

  const L = (en, zh) => lang === 'zh' ? zh : en;

  const tabLabel = (t) => t.label[lang] || t.label.en;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{L('System Settings', '系統設定')}</div>
          <div className="page-subtitle">{L('Manage all configurable data', '管理所有可設定的資料')}</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding:'9px 16px', fontSize:13, fontWeight:500, border:'none',
              background:'transparent', cursor:'pointer',
              color: tab === t.key ? 'var(--dk-accent)' : 'var(--dk-text-3)',
              borderBottom: tab === t.key ? '2px solid var(--dk-accent)' : '2px solid transparent',
              marginBottom:-1, transition:'color .15s' }}>
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {tab === 'containers' && <ContainersTab lang={lang} L={L} showAlert={showAlert} showConfirm={showConfirm} />}
      {tab === 'customers'  && <CustomersTab  lang={lang} L={L} showAlert={showAlert} showConfirm={showConfirm} />}

      {tab === 'guns'       && <GunsTab       lang={lang} L={L} showAlert={showAlert} showConfirm={showConfirm} />}
      {tab === 'shelves'    && <ShelvesTab    lang={lang} L={L} showAlert={showAlert} showConfirm={showConfirm} />}
      {tab === 'spmaster'   && <SpMasterTab   lang={lang} L={L} showAlert={showAlert} showConfirm={showConfirm} />}
      {tab === 'spdepts'    && <SpDepartmentsTab lang={lang} L={L} showAlert={showAlert} showConfirm={showConfirm} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 1: Container Types + Process Steps
// ════════════════════════════════════════════════════════════
function ContainersTab({ lang, L, showAlert, showConfirm }) {
  const { data: cts, loading, refetch } = useTable('container_types', q => q.order('code'));
  const [selectedCT, setSelectedCT] = useState(null);
  const [steps, setSteps] = useState([]);
  const [newStep, setNewStep] = useState({ step_name:'', step_type:'normal' });
  const [showNewCT, setShowNewCT] = useState(false);
  const [newCT, setNewCT] = useState({ code:'', name:'', barcode_prefix:'', is_pallet:false, containers_per_pallet:'', is_reusable:false, max_uses:'', warn_at_uses:'', fill_min:'', fill_max:'' });
  const [submitting, setSubmitting] = useState(false);
  const [editCT, setEditCT] = useState(null);

  useEffect(() => { if (!selectedCT && cts.length) setSelectedCT(cts[0]); }, [cts]);
  useEffect(() => { if (selectedCT) fetchSteps(selectedCT.id); }, [selectedCT]);

  const fetchSteps = async (id) => {
    const { data } = await supabase.from('process_step_templates').select('*').eq('container_type_id', id).order('step_order');
    if (data) setSteps(data);
  };

  const stColor = (t) => ({ normal:'#6b7280', filling:'#8b5cf6', packaging:'#10b981' }[t]||'#6b7280');
  const stLabel = (t) => ({ normal: L('Normal scan','一般掃描'), filling: L('Filling','充填'), packaging: L('Packaging','包裝') }[t]||t);

  const addStep = async () => {
    if (!newStep.step_name.trim()) return showAlert(L('Enter step name','請輸入步驟名稱'));
    setSubmitting(true);
    const max = steps.length ? Math.max(...steps.map(s=>s.step_order)) : 0;
    const { error } = await supabase.from('process_step_templates').insert({ container_type_id:selectedCT.id, step_order:max+1, step_name:newStep.step_name.trim(), step_type:newStep.step_type });
    setSubmitting(false);
    if (error) return showAlert(error.message);
    setNewStep({ step_name:'', step_type:'normal' });
    fetchSteps(selectedCT.id);
  };

  const deleteStep = (step) => showConfirm(L(`Delete step "${step.step_name}"?`,`確定刪除「${step.step_name}」？`), async () => {
    await supabase.from('process_step_templates').delete().eq('id', step.id);
    const rem = steps.filter(s=>s.id!==step.id).map((s,i)=>({...s,step_order:i+1}));
    await Promise.all(rem.map(s=>supabase.from('process_step_templates').update({step_order:s.step_order}).eq('id',s.id)));
    fetchSteps(selectedCT.id);
  });

  const moveStep = async (step, dir) => {
    const idx = steps.findIndex(s=>s.id===step.id), swapIdx=idx+dir;
    if (swapIdx<0||swapIdx>=steps.length) return;
    const a=steps[idx], b=steps[swapIdx];
    // Optimistic UI update first — feels instant
    const newSteps = [...steps];
    newSteps[idx] = {...a, step_order: b.step_order};
    newSteps[swapIdx] = {...b, step_order: a.step_order};
    newSteps.sort((x,y)=>x.step_order-y.step_order);
    setSteps(newSteps);
    // Use a temp step_order (99999) to avoid unique constraint collision during swap
    const tmp = 99999;
    await supabase.from('process_step_templates').update({step_order: tmp}).eq('id', a.id);
    await supabase.from('process_step_templates').update({step_order: a.step_order}).eq('id', b.id);
    await supabase.from('process_step_templates').update({step_order: b.step_order}).eq('id', a.id);
    fetchSteps(selectedCT.id);
  };

  const updateStepType = async (step, t) => {
    await supabase.from('process_step_templates').update({step_type:t}).eq('id',step.id);
    fetchSteps(selectedCT.id);
  };

  const addCT = async () => {
    const { code, name, barcode_prefix } = newCT;
    if (!code.trim()||!name.trim()||!barcode_prefix.trim()) return showAlert(L('Fill in code, name, and prefix','請填寫代碼、名稱、條碼前綴'));
    setSubmitting(true);
    const { error } = await supabase.from('container_types').insert({ code:code.trim().toUpperCase(), name:name.trim(), barcode_prefix:barcode_prefix.trim(), is_pallet:newCT.is_pallet, containers_per_pallet:newCT.containers_per_pallet?parseInt(newCT.containers_per_pallet):null, is_reusable:newCT.is_reusable, max_uses:newCT.max_uses?parseInt(newCT.max_uses):null, warn_at_uses:newCT.warn_at_uses?parseInt(newCT.warn_at_uses):null, active:true });
    setSubmitting(false);
    if (error) return showAlert(error.message);
    setNewCT({ code:'', name:'', barcode_prefix:'', is_pallet:false, containers_per_pallet:'', is_reusable:false, max_uses:'', warn_at_uses:'' });
    setShowNewCT(false);
    refetch();
  };

  const saveCTEdit = async () => {
    if (!editCT) return;
    setSubmitting(true);
    const { error } = await supabase.from('container_types').update({ name:editCT.name, barcode_prefix:editCT.barcode_prefix, is_pallet:editCT.is_pallet, containers_per_pallet:editCT.containers_per_pallet?parseInt(editCT.containers_per_pallet):null, is_reusable:editCT.is_reusable, max_uses:editCT.max_uses?parseInt(editCT.max_uses):null, warn_at_uses:editCT.warn_at_uses?parseInt(editCT.warn_at_uses):null }).eq('id', editCT.id);
    setSubmitting(false);
    if (error) return showAlert(error.message);
    setEditCT(null); refetch(); fetchSteps(editCT.id);
  };

  const toggleActive = (ct) => showConfirm(L(`${ct.active?'Deactivate':'Activate'} "${ct.name}"?`,`確定${ct.active?'停用':'啟用'}「${ct.name}」？`), async () => {
    await supabase.from('container_types').update({active:!ct.active}).eq('id',ct.id); refetch();
  });

  const inp = { margin:0, fontSize:13 };
  const lbl = { fontSize:11, fontWeight:600, color:'var(--dk-text-3)', display:'block', marginBottom:4 };

  return (
    <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:16, alignItems:'start' }}>
      {/* Left */}
      <div>
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--dk-text-3)', textTransform:'uppercase', letterSpacing:'.5px' }}>{L('Container Types','包材類型')}</span>
            <button className="btn btn-primary btn-sm" style={{ fontSize:11, padding:'4px 10px', minHeight:'unset' }} onClick={()=>setShowNewCT(v=>!v)}>+</button>
          </div>
          {loading ? <div style={{ padding:20, textAlign:'center', fontSize:12, color:'var(--dk-text-3)' }}>...</div>
          : cts.map(ct => (
            <div key={ct.id} onClick={()=>{ setSelectedCT(ct); setEditCT(null); }}
              style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)', opacity:ct.active?1:.45,
                background: selectedCT?.id===ct.id ? '#eff6ff' : 'transparent' }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color: selectedCT?.id===ct.id?'var(--dk-accent)':'var(--dk-text)' }}>{ct.code}</span>
                {ct.is_pallet && <span className="badge badge-amber" style={{ fontSize:9 }}>PALLET</span>}
                {ct.is_reusable && <span className="badge badge-green" style={{ fontSize:9 }}>REUSE</span>}
                {!ct.active && <span className="badge badge-gray" style={{ fontSize:9 }}>OFF</span>}
              </div>
              <div style={{ fontSize:11, color:'var(--dk-text-3)', marginTop:2 }}>{ct.name}</div>
              <div style={{ fontSize:10, color:'var(--dk-text-4)', fontFamily:'monospace' }}>{ct.barcode_prefix}*</div>
            </div>
          ))}
        </div>
        {showNewCT && (
          <div className="card" style={{ marginTop:12 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--dk-text)', marginBottom:12 }}>{L('New Container Type','新增包材類型')}</div>
            <div style={{ display:'grid', gap:10 }}>
              {[['code',L('Code *','代碼 *'),'AZT',true],['name',L('Name *','名稱 *'),'AZ Tote'],['barcode_prefix',L('Barcode prefix *','條碼前綴 *'),'AZT-']].map(([k,label,ph,upper])=>(
                <div key={k}><label style={lbl}>{label}</label>
                  <input value={newCT[k]} onChange={e=>setNewCT(v=>({...v,[k]:upper?e.target.value.toUpperCase():e.target.value}))} placeholder={ph} style={inp} /></div>
              ))}
              <div style={{ display:'flex', gap:14 }}>
                <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, cursor:'pointer' }}><input type="checkbox" checked={newCT.is_pallet} onChange={e=>setNewCT(v=>({...v,is_pallet:e.target.checked}))} />{L('Pallet','棧板入庫')}</label>
                <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, cursor:'pointer' }}><input type="checkbox" checked={newCT.is_reusable} onChange={e=>setNewCT(v=>({...v,is_reusable:e.target.checked}))} />{L('Reusable','循環包材')}</label>
              </div>
              {newCT.is_pallet && <div><label style={lbl}>{L('Drums/pallet','桶數/棧板')}</label><input type="number" value={newCT.containers_per_pallet} onChange={e=>setNewCT(v=>({...v,containers_per_pallet:e.target.value}))} placeholder="20" style={inp} /></div>}
              {newCT.is_reusable && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div><label style={lbl}>{L('Max uses','最多次數')}</label><input type="number" value={newCT.max_uses} onChange={e=>setNewCT(v=>({...v,max_uses:e.target.value}))} placeholder="20" style={inp} /></div>
                  <div><label style={lbl}>{L('Warn at','警告次數')}</label><input type="number" value={newCT.warn_at_uses} onChange={e=>setNewCT(v=>({...v,warn_at_uses:e.target.value}))} placeholder="18" style={inp} /></div>
                </div>
              )}
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <div><label style={lbl}>{L('Fill Min kg','充填下限 kg')}</label><input type="number" step="0.1" value={newCT.fill_min} onChange={e=>setNewCT(v=>({...v,fill_min:e.target.value}))} placeholder="18.0" style={inp} /></div>
                <div><label style={lbl}>{L('Fill Max kg','充填上限 kg')}</label><input type="number" step="0.1" value={newCT.fill_max} onChange={e=>setNewCT(v=>({...v,fill_max:e.target.value}))} placeholder="22.0" style={inp} /></div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setShowNewCT(false)}>{L('Cancel','取消')}</button>
                <button className="btn btn-primary btn-sm" disabled={submitting} onClick={addCT}>{submitting?'...':L('Create','建立')}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right */}
      {selectedCT && (
        <div>
          {/* CT detail / edit */}
          <div className="card" style={{ marginBottom:14 }}>
            {editCT ? (
              <div style={{ display:'grid', gap:10 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--dk-text)', marginBottom:4 }}>{L('Edit','編輯')} — <span style={{ fontFamily:'monospace', color:'var(--dk-accent)' }}>{selectedCT.code}</span></div>
                {[['name',L('Name','名稱')],['barcode_prefix',L('Barcode prefix','條碼前綴')]].map(([k,label])=>(
                  <div key={k}><label style={lbl}>{label}</label>
                    <input value={editCT[k]||''} onChange={e=>setEditCT(v=>({...v,[k]:e.target.value}))} style={inp} /></div>
                ))}
                <div style={{ display:'flex', gap:14 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, cursor:'pointer' }}><input type="checkbox" checked={editCT.is_pallet} onChange={e=>setEditCT(v=>({...v,is_pallet:e.target.checked}))} />{L('Pallet','棧板入庫')}</label>
                  <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, cursor:'pointer' }}><input type="checkbox" checked={editCT.is_reusable} onChange={e=>setEditCT(v=>({...v,is_reusable:e.target.checked}))} />{L('Reusable','循環包材')}</label>
                </div>
                {editCT.is_pallet && <div><label style={lbl}>{L('Drums/pallet','桶數/棧板')}</label><input type="number" value={editCT.containers_per_pallet||''} onChange={e=>setEditCT(v=>({...v,containers_per_pallet:e.target.value}))} style={inp} /></div>}
                {editCT.is_reusable && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div><label style={lbl}>{L('Max uses','最多次數')}</label><input type="number" value={editCT.max_uses||''} onChange={e=>setEditCT(v=>({...v,max_uses:e.target.value}))} style={inp} /></div>
                    <div><label style={lbl}>{L('Warn at','警告次數')}</label><input type="number" value={editCT.warn_at_uses||''} onChange={e=>setEditCT(v=>({...v,warn_at_uses:e.target.value}))} style={inp} /></div><div><label style={lbl}>{L('Fill Min kg','充填下限 kg')}</label><input type="number" step="0.1" value={editCT.fill_min||''} onChange={e=>setEditCT(v=>({...v,fill_min:e.target.value}))} style={inp} /></div><div><label style={lbl}>{L('Fill Max kg','充填上限 kg')}</label><input type="number" step="0.1" value={editCT.fill_max||''} onChange={e=>setEditCT(v=>({...v,fill_max:e.target.value}))} style={inp} /></div>
                  </div>
                )}
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditCT(null)}>{L('Cancel','取消')}</button>
                  <button className="btn btn-primary btn-sm" disabled={submitting} onClick={saveCTEdit}>{submitting?'...':L('Save','儲存')}</button>
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontFamily:'monospace', fontSize:16, fontWeight:700, color:'var(--dk-accent)' }}>{selectedCT.code}</span>
                    <span style={{ fontSize:14, color:'var(--dk-text)' }}>{selectedCT.name}</span>
                    {selectedCT.is_pallet && <span className="badge badge-amber">{selectedCT.containers_per_pallet} {L('drums/pallet','桶/棧板')}</span>}
                    {selectedCT.is_reusable && <span className="badge badge-green">Max {selectedCT.max_uses??'∞'} {L('uses','次')}</span>}
                  </div>
                  <div style={{ fontSize:11, color:'var(--dk-text-3)', fontFamily:'monospace' }}>{selectedCT.barcode_prefix}*</div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditCT({...selectedCT})}>{L('Edit','編輯')}</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: selectedCT.active?'var(--dk-danger)':'#10b981' }} onClick={()=>toggleActive(selectedCT)}>
                    {selectedCT.active?L('Deactivate','停用'):L('Activate','啟用')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:14 }}>
            <div style={{ padding:'11px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--dk-text-2)', textTransform:'uppercase', letterSpacing:'.5px' }}>
              {L('Process Steps','製程步驟')} <span style={{ fontWeight:400, color:'var(--dk-text-3)' }}>({steps.length})</span>
            </div>
            {steps.length===0
              ? <div style={{ padding:28, textAlign:'center', fontSize:12, color:'var(--dk-text-3)' }}>{L('No steps yet. Add below.','尚無步驟，請在下方新增。')}</div>
              : steps.map((step,idx) => (
              <div key={step.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderBottom:idx<steps.length-1?'1px solid var(--border)':'none' }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:stColor(step.step_type), display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>{step.step_order}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--dk-text)' }}>{step.step_name}</div>
                  <div style={{ fontSize:11, color:'var(--dk-text-3)', marginTop:1 }}>{stLabel(step.step_type)}</div>
                </div>
                <select value={step.step_type} onChange={e=>updateStepType(step,e.target.value)}
                  style={{ margin:0, fontSize:11, padding:'5px 8px', width:155, border:'1px solid var(--border)', borderRadius:6, color:stColor(step.step_type), fontWeight:600 }}>
                  <option value="normal">{L('Normal scan','一般掃描')}</option>
                  <option value="filling">{L('Filling','充填（重量）')}</option>
                  <option value="packaging">{L('Packaging','包裝（棧板）')}</option>
                </select>
                <div style={{ display:'flex', gap:3 }}>
                  {[[-1,'↑'],[1,'↓']].map(([d,lbl])=>(
                    <button key={d} onClick={()=>moveStep(step,d)} disabled={(d===-1&&idx===0)||(d===1&&idx===steps.length-1)}
                      style={{ width:26, height:26, border:'1px solid var(--border)', borderRadius:4, background:'none', cursor:'pointer', opacity:((d===-1&&idx===0)||(d===1&&idx===steps.length-1))?.3:1, fontSize:13, color:'var(--dk-text-3)' }}>{lbl}</button>
                  ))}
                </div>
                <button onClick={()=>deleteStep(step)}
                  style={{ width:26, height:26, border:'none', borderRadius:4, background:'rgba(239,68,68,.1)', color:'#dc2626', cursor:'pointer', fontSize:16, lineHeight:1 }}>×</button>
              </div>
            ))}
          </div>

          {/* Add step */}
          <div className="card">
            <div style={{ fontSize:12, fontWeight:700, color:'var(--dk-text)', marginBottom:12 }}>+ {L('Add Step','新增步驟')}</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
              <div style={{ flex:1, minWidth:160 }}>
                <label style={lbl}>{L('Step name','步驟名稱')}</label>
                <input value={newStep.step_name} onChange={e=>setNewStep(v=>({...v,step_name:e.target.value}))}
                  placeholder={L('e.g. External Cleaning','例如：外部清洗')} style={inp}
                  onKeyDown={e=>e.key==='Enter'&&addStep()} />
              </div>
              <div style={{ minWidth:175 }}>
                <label style={lbl}>{L('Step type','步驟類型')}</label>
                <select value={newStep.step_type} onChange={e=>setNewStep(v=>({...v,step_type:e.target.value}))} style={{ ...inp, margin:0 }}>
                  <option value="normal">{L('Normal scan','一般掃描（逐桶確認）')}</option>
                  <option value="filling">{L('Filling (weights)','充填（輸入重量）')}</option>
                  <option value="packaging">{L('Packaging (pallet)','包裝（棧板打包）')}</option>
                </select>
              </div>
              <button className="btn btn-primary" disabled={submitting||!newStep.step_name.trim()} onClick={addStep} style={{ marginBottom:0 }}>
                {submitting?'...':L('Add','新增')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 2: Customers
// ════════════════════════════════════════════════════════════
function CustomersTab({ lang, L, showAlert, showConfirm }) {
  const { data, loading, refetch } = useTable('customers', q => q.order('name'));
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const add = async () => {
    if (!newName.trim()) return showAlert(L('Enter customer name','請輸入客戶名稱'));
    setSubmitting(true);
    const { error } = await supabase.from('customers').insert({ name: newName.trim() });
    setSubmitting(false);
    if (error) return showAlert(error.message);
    setNewName(''); refetch();
  };

  const save = async () => {
    if (!editName.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from('customers').update({ name: editName.trim() }).eq('id', editId);
    setSubmitting(false);
    if (error) return showAlert(error.message);
    setEditId(null); refetch();
  };

  const del = (c) => showConfirm(L(`Delete "${c.name}"?`,`確定刪除「${c.name}」？`), async () => {
    await supabase.from('customers').delete().eq('id', c.id); refetch();
  });

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:14 }}>
        <div style={{ padding:'11px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--dk-text-2)', textTransform:'uppercase', letterSpacing:'.5px' }}>
          {L('Customers','客戶清單')} <span style={{ fontWeight:400, color:'var(--dk-text-3)' }}>({data.length})</span>
        </div>
        {loading ? <div style={{ padding:28, textAlign:'center', fontSize:12, color:'var(--dk-text-3)' }}>...</div>
        : data.length === 0 ? <div style={{ padding:28, textAlign:'center', fontSize:12, color:'var(--dk-text-3)' }}>{L('No customers yet','尚無客戶')}</div>
        : data.map((c, idx) => (
          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:idx<data.length-1?'1px solid var(--border)':'none' }}>
            {editId === c.id ? (
              <>
                <input value={editName} onChange={e=>setEditName(e.target.value)} style={{ flex:1, margin:0, fontSize:13 }} onKeyDown={e=>e.key==='Enter'&&save()} autoFocus />
                <button className="btn btn-ghost btn-sm" onClick={()=>setEditId(null)}>{L('Cancel','取消')}</button>
                <button className="btn btn-primary btn-sm" disabled={submitting} onClick={save}>{L('Save','儲存')}</button>
              </>
            ) : (
              <>
                <span style={{ flex:1, fontSize:13, color:'var(--dk-text)', fontWeight:500 }}>{c.name}</span>
                <button className="btn btn-ghost btn-sm" onClick={()=>{ setEditId(c.id); setEditName(c.name); }}>{L('Edit','編輯')}</button>
                <button className="btn btn-ghost btn-sm" style={{ color:'var(--dk-danger)' }} onClick={()=>del(c)}>{L('Delete','刪除')}</button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="card">
        <div style={{ fontSize:12, fontWeight:700, color:'var(--dk-text)', marginBottom:10 }}>+ {L('Add Customer','新增客戶')}</div>
        <div style={{ display:'flex', gap:8 }}>
          <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder={L('Customer name','客戶名稱')} style={{ flex:1, margin:0, fontSize:13 }} onKeyDown={e=>e.key==='Enter'&&add()} />
          <button className="btn btn-primary" disabled={submitting||!newName.trim()} onClick={add} style={{ marginBottom:0 }}>{submitting?'...':L('Add','新增')}</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
function GunsTab({ lang, L, showAlert, showConfirm }) {
  const { data, loading, refetch } = useTable('gun_stations', q => q.order('code'));
  const [newGun, setNewGun] = useState({ code:'', label:'' });
  const [editId, setEditId] = useState(null);
  const [editGun, setEditGun] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const add = async () => {
    if (!newGun.code.trim()) return showAlert(L('Enter gun code','請輸入槍號代碼'));
    setSubmitting(true);
    const { error } = await supabase.from('gun_stations').insert({ code:newGun.code.trim().toUpperCase(), label:newGun.label.trim()||newGun.code.trim(), active:true });
    setSubmitting(false);
    if (error) return showAlert(error.message);
    setNewGun({ code:'', label:'' }); refetch();
  };

  const save = async () => {
    if (!editGun) return;
    setSubmitting(true);
    const { error } = await supabase.from('gun_stations').update({ code:editGun.code, label:editGun.label, active:editGun.active }).eq('id', editGun.id);
    setSubmitting(false);
    if (error) return showAlert(error.message);
    setEditId(null); refetch();
  };

  const del = (g) => showConfirm(L(`Delete "${g.code}"?`,`確定刪除「${g.code}」？`), async () => {
    await supabase.from('gun_stations').delete().eq('id', g.id); refetch();
  });

  const inp = { margin:0, fontSize:13 };
  const lbl = { fontSize:11, fontWeight:600, color:'var(--dk-text-3)', display:'block', marginBottom:4 };

  return (
    <div style={{ maxWidth:520 }}>
      <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:14 }}>
        <div style={{ padding:'11px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--dk-text-2)', textTransform:'uppercase', letterSpacing:'.5px' }}>
          {L('Gun Stations','槍號設定')} <span style={{ fontWeight:400, color:'var(--dk-text-3)' }}>({data.length})</span>
        </div>
        {loading ? <div style={{ padding:28, textAlign:'center', fontSize:12, color:'var(--dk-text-3)' }}>...</div>
        : data.map((g, idx) => (
          <div key={g.id} style={{ padding:'11px 16px', borderBottom:idx<data.length-1?'1px solid var(--border)':'none', opacity:g.active?1:.5 }}>
            {editId===g.id ? (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, alignItems:'end' }}>
                <div><label style={lbl}>{L('Code','代碼')}</label><input value={editGun.code} onChange={e=>setEditGun(v=>({...v,code:e.target.value.toUpperCase()}))} style={inp} /></div>
                <div><label style={lbl}>{L('Display label','顯示名稱')}</label><input value={editGun.label||''} onChange={e=>setEditGun(v=>({...v,label:e.target.value}))} style={inp} /></div>
                <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, cursor:'pointer' }}>
                  <input type="checkbox" checked={editGun.active} onChange={e=>setEditGun(v=>({...v,active:e.target.checked}))} />{L('Active','啟用')}
                </label>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditId(null)}>{L('Cancel','取消')}</button>
                  <button className="btn btn-primary btn-sm" disabled={submitting} onClick={save}>{L('Save','儲存')}</button>
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontFamily:'monospace', fontSize:13, fontWeight:700, color:'var(--dk-accent)', minWidth:80 }}>{g.code}</span>
                <span style={{ flex:1, fontSize:13, color:'var(--dk-text)' }}>{g.label||g.code}</span>
                {!g.active && <span className="badge badge-gray" style={{ fontSize:9 }}>OFF</span>}
                <button className="btn btn-ghost btn-sm" onClick={()=>{ setEditId(g.id); setEditGun({...g}); }}>{L('Edit','編輯')}</button>
                <button className="btn btn-ghost btn-sm" style={{ color:'var(--dk-danger)' }} onClick={()=>del(g)}>{L('Delete','刪除')}</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="card">
        <div style={{ fontSize:12, fontWeight:700, color:'var(--dk-text)', marginBottom:12 }}>+ {L('Add Gun Station','新增槍號')}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, alignItems:'end' }}>
          <div><label style={lbl}>{L('Code *','代碼 *')}</label><input value={newGun.code} onChange={e=>setNewGun(v=>({...v,code:e.target.value.toUpperCase()}))} placeholder="GUN-04" style={inp} /></div>
          <div><label style={lbl}>{L('Display label','顯示名稱')}</label><input value={newGun.label} onChange={e=>setNewGun(v=>({...v,label:e.target.value}))} placeholder="Gun Station 4" style={inp} /></div>
          <div style={{ gridColumn:'1/-1' }}>
            <button className="btn btn-primary" disabled={submitting||!newGun.code.trim()} onClick={add} style={{ marginBottom:0 }}>
              {submitting?'...':L('Add','新增')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Tab 5: Shelf Layout
// ════════════════════════════════════════════════════════════
function ShelvesTab({ lang, L, showAlert, showConfirm }) {
  const { data, loading, refetch } = useTable('shelves', q => q.order('id'));
  const [newShelf, setNewShelf] = useState({ id:'', warehouse:'North Warehouse', zone:'A', row_idx:'1', col_idx:'1' });
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');

  const warehouses = ['North Warehouse','South Warehouse'];

  const zones = [...new Set(data.map(s=>s.zone).filter(Boolean))].sort();
  const filteredData = data.filter(s => !filter || s.warehouse===filter);

  const byWH = (wh) => filteredData.filter(s=>s.warehouse===wh);

  const add = async () => {
    if (!newShelf.id.trim()) return showAlert(L('Enter shelf ID','請輸入貨架ID'));
    setSubmitting(true);
    const { error } = await supabase.from('shelves').insert({ id:newShelf.id.trim().toUpperCase(), warehouse:newShelf.warehouse, zone:newShelf.zone.trim().toUpperCase(), row_idx:parseInt(newShelf.row_idx)||1, col_idx:parseInt(newShelf.col_idx)||1, status:'empty' });
    setSubmitting(false);
    if (error) return showAlert(error.message);
    setNewShelf(v=>({ ...v, id:'' })); refetch();
  };

  const del = (s) => {
    if (s.status==='occupied') return showAlert(L(`Cannot delete occupied shelf "${s.id}"`,`貨架「${s.id}」有包材，無法刪除`));
    showConfirm(L(`Delete shelf "${s.id}"?`,`確定刪除貨架「${s.id}」？`), async () => {
      await supabase.from('shelves').delete().eq('id', s.id); refetch();
    });
  };

  const inp = { margin:0, fontSize:13 };
  const lbl = { fontSize:11, fontWeight:600, color:'var(--dk-text-3)', display:'block', marginBottom:4 };

  return (
    <div>
      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {[['Total',L('Total shelves','總貨架'),data.length,'var(--dk-text)'],
          ['N',L('North WH','北倉'),data.filter(s=>s.warehouse==='North Warehouse').length,'#3b82f6'],
          ['S',L('South WH','南倉'),data.filter(s=>s.warehouse==='South Warehouse').length,'#f59e0b'],
          ['OCC',L('Occupied','已使用'),data.filter(s=>s.status==='occupied').length,'#10b981'],
        ].map(([k,label,val,color])=>(
          <div key={k} className="metric-card">
            <div className="metric-label">{label}</div>
            <div className="metric-value" style={{ fontSize:24, color }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16, alignItems:'start' }}>
        {/* Shelf list */}
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:10 }}>
            <button className={`btn btn-sm ${!filter?'btn-primary':'btn-ghost'}`} onClick={()=>setFilter('')}>{L('All','全部')}</button>
            {warehouses.map(w=>(
              <button key={w} className={`btn btn-sm ${filter===w?'btn-primary':'btn-ghost'}`} onClick={()=>setFilter(w)}>
                {w==='North Warehouse'?L('North WH','北倉'):L('South WH','南倉')} ({data.filter(s=>s.warehouse===w).length})
              </button>
            ))}
          </div>
          {loading ? <div style={{ padding:28, textAlign:'center', fontSize:12, color:'var(--dk-text-3)' }}>...</div>
          : warehouses.filter(w=>!filter||filter===w).map(wh => {
            const whData = byWH(wh);
            if (!whData.length) return null;
            const whZones = [...new Set(whData.map(s=>s.zone))].sort();
            return (
              <div key={wh} className="card" style={{ padding:0, overflow:'hidden', marginBottom:12 }}>
                <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:700, color:'var(--dk-text-2)', background:'var(--bg-section)' }}>
                  {wh==='North Warehouse'?L('North Warehouse','北倉'):L('South Warehouse','南倉')} — {whData.length} {L('shelves','個貨架')}
                </div>
                {whZones.map(zone => {
                  const zoneData = whData.filter(s=>s.zone===zone);
                  return (
                    <div key={zone}>
                      <div style={{ padding:'7px 16px', background:'var(--bg-section)', fontSize:11, fontWeight:600, color:'var(--dk-text-3)', borderBottom:'1px solid var(--border)' }}>
                        {L('Zone','區')} {zone} ({zoneData.length})
                      </div>
                      {zoneData.map((s,idx) => (
                        <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 16px', borderBottom:idx<zoneData.length-1?'1px solid var(--border)':'none' }}>
                          <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color:'var(--dk-text)', minWidth:100 }}>{s.id}</span>
                          <span style={{ fontSize:11, color:'var(--dk-text-3)' }}>R{s.row_idx} C{s.col_idx}</span>
                          <span className={`badge ${s.status==='occupied'?'badge-green':'badge-gray'}`} style={{ fontSize:9 }}>
                            {s.status==='occupied'?L('Occupied','使用中'):L('Empty','空位')}
                          </span>
                          {s.status==='occupied' && <span style={{ fontSize:10, color:'var(--dk-text-3)', fontFamily:'monospace', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.product_barcode}</span>}
                          <button className="btn btn-ghost btn-sm" style={{ fontSize:11, color:'var(--dk-danger)', padding:'3px 8px', minHeight:'unset' }} onClick={()=>del(s)}>
                            {L('Delete','刪除')}
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Add shelf */}
        <div>
          <div className="card">
            <div style={{ fontSize:12, fontWeight:700, color:'var(--dk-text)', marginBottom:12 }}>+ {L('Add Shelf','新增貨架')}</div>
            <div style={{ display:'grid', gap:10 }}>
              <div><label style={lbl}>{L('Shelf ID *','貨架ID *')}</label>
                <input value={newShelf.id} onChange={e=>setNewShelf(v=>({...v,id:e.target.value.toUpperCase()}))} placeholder="A-1-1-1" style={inp} /></div>
              <div><label style={lbl}>{L('Warehouse','倉庫')}</label>
                <select value={newShelf.warehouse} onChange={e=>setNewShelf(v=>({...v,warehouse:e.target.value}))} style={{ ...inp, margin:0 }}>
                  {warehouses.map(w=><option key={w} value={w}>{w==='North Warehouse'?L('North Warehouse','北倉'):L('South Warehouse','南倉')}</option>)}
                </select>
              </div>
              <div><label style={lbl}>{L('Zone','區域')}</label>
                <input value={newShelf.zone} onChange={e=>setNewShelf(v=>({...v,zone:e.target.value.toUpperCase()}))} placeholder="A" style={inp} /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div><label style={lbl}>{L('Row','列')}</label><input type="number" value={newShelf.row_idx} onChange={e=>setNewShelf(v=>({...v,row_idx:e.target.value}))} style={inp} /></div>
                <div><label style={lbl}>{L('Col','行')}</label><input type="number" value={newShelf.col_idx} onChange={e=>setNewShelf(v=>({...v,col_idx:e.target.value}))} style={inp} /></div>
              </div>
              <button className="btn btn-primary" disabled={submitting||!newShelf.id.trim()} onClick={add} style={{ marginBottom:0 }}>
                {submitting?'...':L('Add Shelf','新增貨架')}
              </button>
            </div>
          </div>
          <div className="card" style={{ marginTop:12, fontSize:11, color:'var(--dk-text-3)', lineHeight:1.7 }}>
            <strong style={{ color:'var(--dk-text-2)' }}>{L('Shelf ID format:','貨架ID格式：')}</strong><br/>
            {L('Recommended: Zone-Row-Col-Level','建議：區域-列-行-層')} <br/>
            {L('e.g. A-1-1-1, B-3-2-4','例如：A-1-1-1、B-3-2-4')}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SP Master Data Tab
// ════════════════════════════════════════════════════════════
function SpMasterTab({ lang, L, showAlert, showConfirm }) {
  const [master, setMaster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('All');
  const [modal, setModal] = useState(null); // null | 'create' | item
  const [form, setForm] = useState({ part_number:'', model:'', description:'', unit:'PCS', safety_stock:'0', departments:[] });
  const [fb, setFb] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    supabase.from('sp_departments').select('name').eq('active', true).order('sort_order')
      .then(({ data }) => { if (data?.length) setDepartments(data.map(d => d.name)); });
  }, []);

  useEffect(() => { fetchMaster(); }, [search, filterDept]);

  const fetchMaster = async () => {
    setLoading(true);
    let q = supabase.from('sp_master').select('*', { count: 'exact' }).eq('active', true).order('part_number');
    if (filterDept !== 'All') q = q.contains('departments', [filterDept]);
    if (search) q = q.or(`part_number.ilike.%${search}%,model.ilike.%${search}%,description.ilike.%${search}%`);
    const { data } = await q;
    setMaster(data || []);
    setLoading(false);
  };

  const openCreate = () => { setForm({ part_number:'', model:'', description:'', unit:'PCS', safety_stock:'0', departments:[] }); setFb(''); setModal('create'); };
  const openEdit = (item) => { setForm({ part_number:item.part_number, model:item.model||'', description:item.description||'', unit:item.unit||'PCS', safety_stock:String(item.safety_stock||0), departments:Array.isArray(item.departments)?item.departments:[] }); setFb(''); setModal(item); };

  const checkPn = async (pn) => {
    if (!pn || modal !== 'create') { setFb(''); return; }
    const { data } = await supabase.from('sp_master').select('part_number').eq('part_number', pn).maybeSingle();
    setFb(data ? L('⚠ Already exists','⚠ 料號已存在') : L('✓ Available','✓ 可用'));
  };

  const submit = async () => {
    const { part_number, model, description, unit, safety_stock, departments: formDepts } = form;
    if (!part_number.trim()) { showAlert(L('Part number required','料號為必填')); return; }
    if (!formDepts || formDepts.length === 0) { showAlert(L('Select at least one department','請至少選擇一個部門')); return; }
    setSubmitting(true);
    const payload = { model, description, unit, safety_stock: parseInt(safety_stock)||0, departments: formDepts };
    const { error } = modal === 'create'
      ? await supabase.from('sp_master').insert({ part_number: part_number.trim(), ...payload })
      : await supabase.from('sp_master').update(payload).eq('part_number', part_number);
    setSubmitting(false);
    if (error) { showAlert(error.message); return; }
    setModal(null); fetchMaster();
  };

  const del = (item) => showConfirm(
    L(`Delete "${item.part_number}"?`, `確定刪除「${item.part_number}」？`),
    async () => {
      // Check stock ACROSS ALL departments, not just first row — same part may exist in multiple depts
      const { data: stockRows } = await supabase.from('sp_inventory').select('stock,department').eq('part_number', item.part_number);
      const totalStock = (stockRows||[]).reduce((sum,r) => sum + (Number(r.stock)||0), 0);
      if (totalStock > 0) {
        const breakdown = (stockRows||[]).filter(r => (Number(r.stock)||0) > 0)
          .map(r => `${r.department||'—'}:${r.stock}`).join(', ');
        showAlert(L(
          `Cannot delete — has stock (${totalStock}): ${breakdown}`,
          `尚有庫存 (${totalStock})，無法刪除：${breakdown}`
        ));
        return;
      }
      await supabase.from('sp_master').update({ active: false }).eq('part_number', item.part_number);
      fetchMaster();
    }
  );

  const inp = { margin:0, fontSize:13 };
  const lbl = { fontSize:11, fontWeight:600, color:'var(--dk-text-3)', display:'block', marginBottom:4 };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:14 }}>
        <input placeholder={L('Search part / model...','搜尋料號、型號...')} value={search}
          onChange={e => setSearch(e.target.value)} style={{ width:220, ...inp }} />
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ ...inp, margin:0 }}>
          <option value="All">{L('All Depts','全部')}</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={openCreate} style={{ marginLeft:'auto' }}>
          + {L('New Part','新增物料')}
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:32, textAlign:'center', fontSize:13, color:'var(--dk-text-3)' }}>{L('Loading...','載入中...')}</div>
        ) : (
          <div className="history-table-container" style={{ maxHeight:'none' }}>
            <table className="history-table" style={{ minWidth:600 }}>
              <thead><tr>
                <th>{L('Part Number','料號')}</th>
                <th>{L('Model','型號')}</th>
                <th>{L('Description','品名描述')}</th>
                <th style={{ textAlign:'center' }}>{L('Unit','單位')}</th>
                <th style={{ textAlign:'center' }}>{L('Safety Stock','安全庫存')}</th>
                <th>{L('Dept','部門')}</th>
                <th></th>
              </tr></thead>
              <tbody>
                {master.map(item => (
                  <tr key={item.part_number}
                    onMouseEnter={e => e.currentTarget.style.background='var(--dk-surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background=''}>
                    <td style={{ fontFamily:'monospace', fontWeight:700, color:'var(--dk-accent)' }}>{item.part_number}</td>
                    <td>{item.model}</td>
                    <td style={{ color:'var(--dk-text-3)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.description}</td>
                    <td style={{ textAlign:'center' }}>{item.unit}</td>
                    <td style={{ textAlign:'center' }}>{item.safety_stock}</td>
                    <td>
                      {(() => {
                        const arr = Array.isArray(item.departments)?item.departments:[];
                        const PALETTES=[{background:'#fef3c7',color:'#b45309'},{background:'#d1fae5',color:'#065f46'},{background:'#ede9fe',color:'#7c3aed'},{background:'#dbeafe',color:'#1d4ed8'},{background:'#fce7f3',color:'#9d174d'}];
                        // Stable hash of dept name → same name always gets same color, regardless of departments list order
                        const clr = (d) => {
                          let h = 0;
                          for (let i = 0; i < d.length; i++) h = ((h << 5) - h + d.charCodeAt(i)) | 0;
                          return PALETTES[Math.abs(h) % PALETTES.length];
                        };
                        return <span style={{display:'flex',gap:4,flexWrap:'wrap'}}>{arr.map(d=><span key={d} style={{...clr(d),padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:600}}>{d}</span>)}</span>;
                      })()}
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>{L('Edit','編輯')}</button>
                        <button className="btn btn-ghost btn-sm" style={{ color:'var(--dk-danger)' }} onClick={() => del(item)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!master.length && (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:28, color:'var(--dk-text-3)' }}>
                    {L('No data','無資料')}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth:460, width:'95%' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ margin:0 }}>{modal === 'create' ? L('New Material','新增備品物料') : L('Edit Material','編輯備品物料')}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div style={{ display:'grid', gap:12 }}>
              {[
                ['part_number', L('Part Number *','料號 *'), 'text', modal !== 'create'],
                ['model',       L('Model','型號'),          'text', false],
                ['description', L('Description','品名描述'), 'text', false],
                ['unit',        L('Unit','單位'),            'text', false],
                ['safety_stock',L('Safety Stock','安全庫存'),'number', false],
              ].map(([key, label, type, ro]) => (
                <div key={key}>
                  <label style={lbl}>{label}</label>
                  <input type={type} value={form[key]} readOnly={ro}
                    style={{ ...inp, width:'100%', boxSizing:'border-box', ...(ro?{background:'var(--dk-surface2)',color:'var(--dk-text-3)'}:{}) }}
                    onChange={e => { setForm(f=>({...f,[key]:e.target.value})); if(key==='part_number') checkPn(e.target.value); }} />
                  {key==='part_number' && fb && (
                    <span style={{ fontSize:11, color: fb.includes('✓')?'#10b981':'#ef4444' }}>{fb}</span>
                  )}
                </div>
              ))}
              <div>
                <label style={lbl}>{L('Department *','部門 *')} <span style={{fontWeight:400,color:'var(--lt-text-3)',fontSize:11}}>{L('(multi-select)','（可多選）')}</span></label>
                <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:4}}>
                  {departments.map(d => {
                    const checked = (form.departments||[]).includes(d);
                    const clr = d==='QC'?{bg:'#fef3c7',cl:'#b45309'}:d==='Facility'?{bg:'#d1fae5',cl:'#065f46'}:d==='Production'?{bg:'#ede9fe',cl:'#7c3aed'}:{bg:'#f3f4f6',cl:'#6b7280'};
                    return (
                      <label key={d} style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',padding:'6px 12px',borderRadius:6,border:`1px solid ${checked?clr.cl:'#e5e7eb'}`,background:checked?clr.bg:'#fff',transition:'all .1s'}}>
                        <input type="checkbox" checked={checked}
                          onChange={e => setForm(f => ({...f, departments: e.target.checked ? [...(f.departments||[]),d] : (f.departments||[]).filter(x=>x!==d)}))}
                          style={{display:'none'}}/>
                        <span style={{color:checked?clr.cl:'#6b7280',fontWeight:checked?700:400,fontSize:13}}>{d}</span>
                        {checked && <span style={{fontSize:11,color:clr.cl}}>✓</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>{L('Cancel','取消')}</button>
              <button className="btn btn-primary" disabled={submitting} onClick={submit}>
                {submitting ? '...' : modal==='create' ? L('Create','建立') : L('Save','儲存')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SP Departments Tab — Admin can add/remove departments
// ════════════════════════════════════════════════════════════
function SpDepartmentsTab({ lang, L, showAlert, showConfirm }) {
  const [depts, setDepts] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchDepts = async () => {
    setLoading(true);
    const { data } = await supabase.from('sp_departments').select('*').order('sort_order');
    setDepts(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchDepts(); }, []);

  const addDept = async () => {
    const name = newName.trim();
    if (!name) { showAlert(L('Enter department name', '請輸入部門名稱')); return; }
    // Reject duplicate (including soft-deleted) to avoid unique-constraint failures and confusion
    if (depts.some(d => d.name === name)) {
      showAlert(L(`Department "${name}" already exists`, `部門「${name}」已存在`));
      return;
    }
    const maxOrder = depts.length ? Math.max(...depts.map(d => d.sort_order)) : 0;
    const { error } = await supabase.from('sp_departments').insert({ name, sort_order: maxOrder + 1 });
    if (error) { showAlert(error.message); return; }
    setNewName(''); fetchDepts();
  };

  const toggleActive = async (dept) => {
    const { error } = await supabase.from('sp_departments').update({ active: !dept.active }).eq('id', dept.id);
    if (error) { showAlert(error.message); return; }
    fetchDepts();
  };

  const deleteDept = (dept) => showConfirm(
    L(`Delete "${dept.name}"?`, `確定刪除「${dept.name}」？`),
    async () => {
      // Check references before deletion to avoid orphaning sp_master.departments / sp_inventory.department
      const [{ count: masterRefs }, { count: invRefs }] = await Promise.all([
        supabase.from('sp_master').select('part_number', { count: 'exact', head: true }).contains('departments', [dept.name]),
        supabase.from('sp_inventory').select('part_number', { count: 'exact', head: true }).eq('department', dept.name),
      ]);
      const hasRefs = (masterRefs || 0) > 0 || (invRefs || 0) > 0;

      if (hasRefs) {
        // Soft-delete only — keep row so existing references remain valid
        const { error } = await supabase.from('sp_departments').update({ active: false }).eq('id', dept.id);
        if (error) { showAlert(error.message); return; }
        showAlert(L(
          `Department is referenced by ${masterRefs||0} master record(s) and ${invRefs||0} inventory record(s). Deactivated instead of deleted.`,
          `此部門被 ${masterRefs||0} 筆主檔及 ${invRefs||0} 筆庫存引用，已改為停用而非刪除。`
        ));
        fetchDepts();
        return;
      }

      // No references — safe to hard delete
      const { error } = await supabase.from('sp_departments').delete().eq('id', dept.id);
      if (error) { showAlert(error.message); return; }
      fetchDepts();
    }
  );

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={newName} onChange={e => setNewName(e.target.value)}
          placeholder={L('New department name...', '新部門名稱...')}
          style={{ flex: 1, maxWidth: 280, fontSize: 13, margin: 0 }}
          onKeyDown={e => e.key === 'Enter' && addDept()}
        />
        <button className="btn btn-primary btn-sm" onClick={addDept}>
          + {L('Add', '新增')}
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--dk-text-3)' }}>{L('Loading...', '載入中...')}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--dk-surface2)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--dk-text-3)', textTransform: 'uppercase' }}>{L('Department', '部門名稱')}</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, fontSize: 11, color: 'var(--dk-text-3)', textTransform: 'uppercase' }}>{L('Status', '狀態')}</th>
                <th style={{ padding: '10px 16px', width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {depts.map(dept => (
                <tr key={dept.id}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--dk-surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--dk-text)' }}>{dept.name}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span className={`badge ${dept.active ? 'badge-green' : 'badge-gray'}`}>
                      {dept.active ? L('Active', '啟用') : L('Disabled', '停用')}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(dept)}>
                        {dept.active ? L('Disable', '停用') : L('Enable', '啟用')}
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--dk-danger)' }} onClick={() => deleteDept(dept)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!depts.length && (
                <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--dk-text-3)' }}>{L('No departments', '尚無部門')}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
