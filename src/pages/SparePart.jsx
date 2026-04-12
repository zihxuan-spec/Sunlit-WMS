import React, { useState, useEffect, useRef, useCallback } from 'react';
import { spareSupabase as supabase } from '../config/spareClient';
import { Chart, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import * as XLSX from 'xlsx';

Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const PAGE_SIZE = 50;
const DEPARTMENTS = ['QC', 'Facility'];

export default function SparePart({ lang, currentUser, userRole, showAlert, showConfirm }) {
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [adminDept, setAdminDept] = useState('All');
  const [inventory, setInventory] = useState([]);
  const [invTotal, setInvTotal] = useState(0);
  const [invPage, setInvPage] = useState(1);
  const [invSearch, setInvSearch] = useState('');
  const [invFilter, setInvFilter] = useState('all');
  const [sortCol, setSortCol] = useState('part_number');
  const [sortAsc, setSortAsc] = useState(true);
  const [master, setMaster] = useState([]);
  const [masterTotal, setMasterTotal] = useState(0);
  const [masterPage, setMasterPage] = useState(1);
  const [masterSearch, setMasterSearch] = useState('');
  const [dashStats, setDashStats] = useState({ crit:0, low:0, total:0, todayIn:0, todayOut:0 });
  const [recentHist, setRecentHist] = useState([]);
  const [top5, setTop5] = useState([]);
  const [deadStock, setDeadStock] = useState([]);
  const healthRef = useRef(null); const trendRef = useRef(null);
  const healthInst = useRef(null); const trendInst = useRef(null);
  const [txOpen, setTxOpen] = useState(false);
  const [txType, setTxType] = useState('receive');
  const [txRef, setTxRef] = useState('');
  const [txUser, setTxUser] = useState('');
  const [txRows, setTxRows] = useState([{ id:'', info:'', qty:'', loc:'' }]);
  const [txSubmitting, setTxSubmitting] = useState(false);
  const acTimer = useRef(null);
  const [acData, setAcData] = useState({ rowIdx:-1, items:[] });
  const [detOpen, setDetOpen] = useState(false);
  const [detItem, setDetItem] = useState(null);
  const [detHist, setDetHist] = useState([]);
  const [editLoc, setEditLoc] = useState(null);
  const [masterModal, setMasterModal] = useState(null);
  const [masterForm, setMasterForm] = useState({ part_number:'', model:'', description:'', unit:'PCS', safety_stock:'0', department:'' });
  const [masterFb, setMasterFb] = useState('');
  const [masterSubmitting, setMasterSubmitting] = useState(false);

  const isAdmin = userRole === 'Admin';
  const dept = isAdmin ? adminDept : userRole;
  const L = (en, zh) => lang === 'zh' ? zh : en;
  const applyDept = (q) => dept !== 'All' ? q.eq('department', dept) : q;

  const fetchInventory = useCallback(async (reset = false) => {
    if (reset) setInvPage(1);
    setLoading(true);
    let q = applyDept(supabase.from('view_sp_inventory').select('*', { count:'exact' }));
    if (invSearch) q = q.or(`part_number.ilike.%${invSearch}%,model.ilike.%${invSearch}%,description.ilike.%${invSearch}%`);
    if (invFilter === 'crit') q = q.eq('is_critical', true);
    if (invFilter === 'low') q = q.eq('is_low', true);
    q = q.order(sortCol, { ascending: sortAsc });
    const pg = reset ? 1 : invPage;
    const { data, count } = await q.range((pg-1)*PAGE_SIZE, pg*PAGE_SIZE-1);
    setInventory(data||[]); setInvTotal(count||0); setLoading(false);
  }, [dept, invSearch, invFilter, sortCol, sortAsc, invPage]);

  const fetchMaster = useCallback(async (reset = false) => {
    if (reset) setMasterPage(1);
    setLoading(true);
    let q = applyDept(supabase.from('sp_master').select('*', { count:'exact' }).eq('active', true));
    if (masterSearch) q = q.or(`part_number.ilike.%${masterSearch}%,model.ilike.%${masterSearch}%,description.ilike.%${masterSearch}%`);
    const pg = reset ? 1 : masterPage;
    const { data, count } = await q.range((pg-1)*PAGE_SIZE, pg*PAGE_SIZE-1).order('part_number');
    setMaster(data||[]); setMasterTotal(count||0); setLoading(false);
  }, [dept, masterSearch, masterPage]);

  const fetchDashboard = useCallback(async () => {
    const { data: inv } = await applyDept(supabase.from('view_sp_inventory').select('*'));
    let crit=0, low=0; const invMap={};
    (inv||[]).forEach(i => { invMap[i.part_number]=i; if(i.is_critical) crit++; else if(i.is_low) low++; });
    const d30=new Date(); d30.setDate(d30.getDate()-30);
    let qh = supabase.from('sp_history').select('*').gte('timestamp', d30.toISOString()).order('timestamp',{ascending:false}).limit(500);
    if (dept !== 'All') { const pns=Object.keys(invMap); qh = pns.length ? qh.in('part_number',pns) : qh.eq('part_number','__NONE__'); }
    const { data: hist } = await qh;
    const today=new Date().toISOString().split('T')[0];
    let todayIn=0, todayOut=0; const trend={}; const moveCount={};
    for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);trend[d.toISOString().split('T')[0]]={in:0,out:0};}
    (hist||[]).forEach(h=>{
      const ds=h.timestamp.split('T')[0],q=Number(h.quantity),abs=Math.abs(q);
      if(ds===today){if(q>0)todayIn++;else if(q<0)todayOut++;}
      if(trend[ds]){if(q>0)trend[ds].in+=abs;else trend[ds].out+=abs;}
      moveCount[h.part_number]=(moveCount[h.part_number]||0)+abs;
    });
    setDashStats({crit,low,total:(inv||[]).length,todayIn,todayOut});
    setRecentHist((hist||[]).slice(0,15));
    setTop5(Object.entries(moveCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([pn,cnt])=>({pn,cnt})));
    setDeadStock(Object.values(invMap).filter(i=>i.stock>0&&!moveCount[i.part_number]).sort((a,b)=>b.stock-a.stock).slice(0,8));
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--dk-text-3').trim()||'#64748b';
    setTimeout(()=>{
      
      if(healthInst.current) healthInst.current.destroy();
      if(trendInst.current) trendInst.current.destroy();
      const safe=(inv||[]).filter(i=>!i.is_critical&&!i.is_low&&i.stock>0).length;
      if(healthRef.current) healthInst.current=new Chart(healthRef.current,{type:'doughnut',data:{labels:[L('Critical','缺料'),L('Low','低庫存'),L('Safe','安全')],datasets:[{data:[crit,low,safe],backgroundColor:['#ef4444','#f59e0b','#10b981'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{position:'right',labels:{color:textColor,boxWidth:12,font:{size:11}}}}}});
      if(trendRef.current) trendInst.current=new Chart(trendRef.current,{type:'bar',data:{labels:Object.keys(trend).map(d=>d.slice(5)),datasets:[{label:L('In','入庫'),data:Object.values(trend).map(v=>v.in),backgroundColor:'#10b981',borderRadius:3},{label:L('Out','出庫'),data:Object.values(trend).map(v=>v.out),backgroundColor:'#3b82f6',borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{color:textColor,boxWidth:12,font:{size:11}}}},scales:{x:{grid:{display:false},ticks:{color:textColor}},y:{ticks:{precision:0,color:textColor},grid:{color:'rgba(100,116,139,.2)'}}}}});
    },100);
  }, [dept, lang]);

  useEffect(()=>{
    fetchDashboard(); fetchInventory(true); if(isAdmin) fetchMaster(true);
    const ch=supabase.channel('sp-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'sp_inventory'},()=>{fetchDashboard();fetchInventory();})
      .on('postgres_changes',{event:'*',schema:'public',table:'sp_history'},fetchDashboard)
      .on('postgres_changes',{event:'*',schema:'public',table:'sp_master'},()=>isAdmin&&fetchMaster())
      .subscribe();
    return ()=>supabase.removeChannel(ch);
  },[dept]);

  useEffect(()=>{fetchInventory(true);},[invSearch,invFilter,sortCol,sortAsc]);
  useEffect(()=>{fetchInventory();},[invPage]);
  useEffect(()=>{if(isAdmin)fetchMaster(true);},[masterSearch]);
  useEffect(()=>{if(isAdmin)fetchMaster();},[masterPage]);
  useEffect(()=>{if(tab==='dashboard')fetchDashboard();},[tab]);

  const openTx=(type)=>{setTxType(type);setTxRef('');setTxUser(currentUser||'');setTxRows([{id:'',info:'',qty:'',loc:''}]);setAcData({rowIdx:-1,items:[]});setTxOpen(true);};

  const resolveRow=async(idx,pn)=>{
    if(!pn) return;
    const{data}=await supabase.from('view_sp_inventory').select('*').eq('part_number',pn).maybeSingle();
    if(data){setTxRows(r=>r.map((x,i)=>i===idx?{...x,info:data.description||data.model,loc:data.location||''}:x));}
    else{const{data:md}=await supabase.from('sp_master').select('*').eq('part_number',pn).eq('active',true).maybeSingle();
      if(md) setTxRows(r=>r.map((x,i)=>i===idx?{...x,info:md.description||md.model}:x));
      else showAlert(L('Part not found','找不到此料號'));}
  };

  const handleAc=(idx,val)=>{
    clearTimeout(acTimer.current); if(!val){setAcData({rowIdx:-1,items:[]});return;}
    acTimer.current=setTimeout(async()=>{
      const{data}=await applyDept(supabase.from('sp_master').select('part_number,model').eq('active',true)).or(`part_number.ilike.%${val}%,model.ilike.%${val}%`).limit(8);
      setAcData({rowIdx:idx,items:data||[]});
    },250);
  };

  const submitTx=async()=>{
    if(!txRef.trim()||!txUser.trim()){showAlert(L('Fill in reference and operator','請填寫單號與操作人員'));return;}
    const items=[];
    for(let i=0;i<txRows.length;i++){
      const r=txRows[i];
      if(!r.id.trim()||!r.qty||Number(r.qty)<=0){showAlert(L(`Row ${i+1}: invalid`,`第${i+1}行資料不完整`));return;}
      if(txType==='receive'&&!r.loc.trim()){showAlert(L(`Row ${i+1}: location required`,`第${i+1}行需填儲位`));return;}
      items.push({id:r.id.trim(),qty:Number(r.qty),loc:r.loc.trim()});
    }
    showConfirm(L('Post these transactions?','確定過帳？'),async()=>{
      setTxSubmitting(true);
      const{error}=await supabase.rpc('process_sp_transaction',{tx_type:txType,tx_ref:txRef,tx_user:txUser,tx_items:items});
      setTxSubmitting(false);
      if(error) showAlert(`${L('Failed','失敗')}: ${error.message}`);
      else{setTxOpen(false);fetchDashboard();fetchInventory();}
    });
  };

  const openDetail=async(item)=>{
    setDetItem(item);setEditLoc(null);
    const{data}=await supabase.from('sp_history').select('*').eq('part_number',item.part_number).order('timestamp',{ascending:false}).limit(20);
    setDetHist(data||[]);setDetOpen(true);
  };

  const saveLocation=async(newLoc)=>{
    if(newLoc===detItem.location){setEditLoc(null);return;}
    const{data:inv}=await supabase.from('sp_inventory').select('stock').eq('part_number',detItem.part_number).maybeSingle();
    if(inv) await supabase.from('sp_inventory').update({location:newLoc,updated_at:new Date().toISOString()}).eq('part_number',detItem.part_number);
    else await supabase.from('sp_inventory').insert({part_number:detItem.part_number,location:newLoc,stock:0});
    await supabase.from('sp_history').insert({part_number:detItem.part_number,action:'Location Change',quantity:0,reference:`${detItem.location||'—'} → ${newLoc}`,operator_user:currentUser});
    setDetItem(d=>({...d,location:newLoc}));setEditLoc(null);fetchInventory();
  };

  const openCreate=()=>{setMasterForm({part_number:'',model:'',description:'',unit:'PCS',safety_stock:'0',department:dept!=='All'?dept:''});setMasterFb('');setMasterModal('create');};
  const openEdit=(item)=>{setMasterForm({part_number:item.part_number,model:item.model||'',description:item.description||'',unit:item.unit||'PCS',safety_stock:String(item.safety_stock||0),department:item.department});setMasterFb('');setMasterModal(item);};

  const checkPn=async(pn)=>{
    if(!pn||masterModal!=='create'){setMasterFb('');return;}
    const{data}=await supabase.from('sp_master').select('part_number').eq('part_number',pn).maybeSingle();
    setMasterFb(data?L('⚠ Already exists','⚠ 料號已存在'):L('✓ Available','✓ 可用'));
  };

  const submitMaster=async()=>{
    const{part_number,model,description,unit,safety_stock,department}=masterForm;
    if(!part_number.trim()){showAlert(L('Part number required','料號為必填'));return;}
    if(!department){showAlert(L('Select department','請選擇部門'));return;}
    setMasterSubmitting(true);
    const payload={model,description,unit,safety_stock:parseInt(safety_stock)||0,department};
    const{error}=masterModal==='create'
      ?await supabase.from('sp_master').insert({part_number:part_number.trim(),...payload})
      :await supabase.from('sp_master').update(payload).eq('part_number',part_number);
    setMasterSubmitting(false);
    if(error){showAlert(error.message);return;}
    setMasterModal(null);fetchMaster(true);
  };

  const deleteMaster=(item)=>showConfirm(L(`Delete "${item.part_number}"?`,`確定刪除「${item.part_number}」？`),async()=>{
    const{data:chk}=await supabase.from('sp_inventory').select('stock').eq('part_number',item.part_number).maybeSingle();
    if(chk?.stock>0){showAlert(L(`Cannot delete — has stock (${chk.stock})`,`尚有庫存 (${chk.stock})，無法刪除`));return;}
    await supabase.from('sp_master').update({active:false}).eq('part_number',item.part_number);
    fetchMaster(true);
  });

  const exportExcel=async(type)=>{
    const{data}=await applyDept(supabase.from(type==='inventory'?'view_sp_inventory':'sp_master').select('*'));
    if(!data?.length) return;
    const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Sheet1');
    XLSX.writeFile(wb,`SP_${type}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const sortToggle=(col)=>{setSortCol(col);setSortAsc(sortCol===col?!sortAsc:true);};
  const invPages=Math.ceil(invTotal/PAGE_SIZE)||1;
  const masterPages=Math.ceil(masterTotal/PAGE_SIZE)||1;
  const fmtDate=(d)=>new Date(d).toLocaleString(lang==='zh'?'zh-TW':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const deptBadge=(d)=>d==='QC'?<span className="badge badge-blue">{d}</span>:<span className="badge badge-purple">{d}</span>;
  const statusBadge=(item)=>item.is_critical?<span className="badge badge-red">{L('Critical','缺料')}</span>:item.is_low?<span className="badge badge-amber">{L('Low','低庫存')}</span>:<span className="badge badge-green">{L('OK','正常')}</span>;

  const lbl={fontSize:12,fontWeight:600,color:'var(--dk-text-3)',display:'block',marginBottom:4};
  const thStyle={padding:'8px 12px',textAlign:'left',fontWeight:600,fontSize:11,color:'var(--dk-text-3)',textTransform:'uppercase',letterSpacing:'.4px',background:'var(--dk-surface2)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'};
  const tdStyle={padding:'9px 12px',borderBottom:'1px solid var(--border)',verticalAlign:'middle'};

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{L('Spare Part Management','備品管理')}</div>
          <div className="page-subtitle">{L('Inventory · Transactions · Analytics','庫存 · 交易 · 分析')}</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {isAdmin&&<select value={adminDept} onChange={e=>setAdminDept(e.target.value)} style={{fontSize:12,padding:'5px 10px'}}>
            <option value="All">{L('All Depts','全部')}</option>
            {DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
          </select>}
          <button className="btn btn-primary btn-sm" onClick={()=>openTx('receive')}>＋ {L('Goods Receipt','收貨入庫')}</button>
          <button className="btn btn-danger btn-sm" onClick={()=>openTx('issue')}>－ {L('Goods Issue','發貨領料')}</button>
          {isAdmin&&<button className="btn btn-ghost btn-sm" onClick={openCreate}>+ {L('New Part','新增物料')}</button>}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:16}}>
        {[['dashboard',L('Dashboard','看板')],['inventory',L('Inventory','庫存')],...(isAdmin?[['master',L('Master Data','物料主檔')]]:[])]
          .map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} style={{padding:'10px 18px',fontSize:13,fontWeight:500,border:'none',background:'transparent',cursor:'pointer',color:tab===key?'var(--dk-accent)':'var(--dk-text-3)',borderBottom:`2px solid ${tab===key?'var(--dk-accent)':'transparent'}`,marginBottom:-1,transition:'color .15s'}}>
              {label}
            </button>
          ))}
        {loading&&<span style={{marginLeft:'auto',alignSelf:'center',fontSize:11,color:'var(--dk-text-3)',paddingRight:16}}>{L('Loading...','載入中...')}</span>}
      </div>

      {/* DASHBOARD */}
      {tab==='dashboard'&&<div>
        <div className="metrics-grid" style={{marginBottom:16}}>
          {[[L('Critical','缺料警告'),dashStats.crit,'#ef4444',()=>{setTab('inventory');setInvFilter('crit');}],
            [L('Low Stock','低庫存'),dashStats.low,'#f59e0b',()=>{setTab('inventory');setInvFilter('low');}],
            [L('Total Items','物料總數'),dashStats.total,'var(--dk-accent)',()=>setTab('inventory')],
            [L('Today In','今日入庫'),dashStats.todayIn,'#10b981',null],
            [L('Today Out','今日出庫'),dashStats.todayOut,'var(--dk-text-2)',null]
          ].map(([label,val,color,onClick])=>(
            <div key={label} className="metric-card" style={{cursor:onClick?'pointer':'default'}} onClick={onClick||undefined}>
              <div className="metric-label">{label}</div>
              <div className="metric-value" style={{fontSize:28,color}}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14,marginBottom:14}}>
          <div className="card"><div className="card-title" style={{marginBottom:12}}>{L('Inventory Health','庫存健康度')}</div><div style={{height:160}}><canvas ref={healthRef}/></div></div>
          <div className="card"><div className="card-title" style={{marginBottom:12}}>{L('7-Day Trend','7日趨勢')}</div><div style={{height:160}}><canvas ref={trendRef}/></div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14,marginBottom:14}}>
          <div className="card">
            <div className="card-title" style={{marginBottom:10}}>🔥 {L('Top 5 Moving (30d)','高消耗排行')}</div>
            {top5.length?top5.map(({pn,cnt},i)=>(
              <div key={pn} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{width:22,height:22,borderRadius:'50%',background:'var(--dk-danger-bg)',color:'var(--dk-danger)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,fontSize:13,fontWeight:600,color:'var(--dk-text)'}}>{pn}</div>
                <div style={{fontWeight:700,color:'var(--dk-accent)',fontSize:13}}>{cnt} <span style={{fontSize:10,fontWeight:400,color:'var(--dk-text-3)'}}>mvmt</span></div>
              </div>
            )):<div style={{fontSize:12,color:'var(--dk-text-3)',padding:'12px 0'}}>{L('No movements','無異動')}</div>}
          </div>
          <div className="card">
            <div className="card-title" style={{marginBottom:10}}>💤 {L('Dead Stock (30d)','呆滯料預警')}</div>
            {deadStock.length?deadStock.map(d=>(
              <div key={d.part_number} style={{padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span style={{fontWeight:600,fontSize:13,color:'var(--dk-text)'}}>{d.part_number}</span>
                  <span style={{fontWeight:700,color:'#f59e0b'}}>Stock: {d.stock}</span>
                </div>
                <div style={{fontSize:11,color:'var(--dk-text-3)',marginTop:2}}>{d.model} · <span className="badge badge-gray" style={{fontSize:9}}>{d.location||L('No loc','未設儲位')}</span></div>
              </div>
            )):<div style={{fontSize:12,color:'#10b981',padding:'12px 0'}}>✓ {L('All stock is active','所有庫存均有流動')}</div>}
          </div>
        </div>
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontSize:12,fontWeight:700,color:'var(--dk-text-2)',textTransform:'uppercase',letterSpacing:'.5px'}}>{L('Recent Movements','最近異動')}</div>
          <div className="history-table-container">
            <table className="history-table">
              <thead><tr><th>{L('Part','料號')}</th><th>{L('Action','動作')}</th><th>{L('Qty','數量')}</th><th>{L('Reference','單號')}</th><th>{L('Operator','操作員')}</th><th>{L('Time','時間')}</th></tr></thead>
              <tbody>
                {recentHist.map((h,i)=>{const c=h.quantity>0?'#10b981':h.quantity<0?'#ef4444':'var(--dk-text-3)';return(
                  <tr key={i}>
                    <td style={{fontFamily:'monospace',fontWeight:700,color:'var(--dk-accent)'}}>{h.part_number}</td>
                    <td>{h.action}</td>
                    <td style={{fontWeight:700,color:c}}>{h.quantity>0?'+':''}{h.quantity}</td>
                    <td style={{color:'var(--dk-text-3)'}}>{h.reference||'—'}</td>
                    <td>{h.operator_user}</td>
                    <td style={{whiteSpace:'nowrap'}}>{fmtDate(h.timestamp)}</td>
                  </tr>
                );})}
                {!recentHist.length&&<tr><td colSpan={6} style={{textAlign:'center',padding:20,color:'var(--dk-text-3)'}}>{L('No data','無資料')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>}

      {/* INVENTORY */}
      {tab==='inventory'&&<div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:12}}>
          <input placeholder={L('Search part / model / description...','搜尋料號、型號、品名...')} value={invSearch} onChange={e=>setInvSearch(e.target.value)} style={{flex:1,minWidth:180,maxWidth:280}}/>
          {['all','crit','low'].map(f=><button key={f} className={`btn btn-sm ${invFilter===f?'btn-primary':'btn-ghost'}`} onClick={()=>setInvFilter(f)}>{f==='all'?L('All','全部'):f==='crit'?L('Critical','缺料'):L('Low','低庫存')}</button>)}
          <div style={{marginLeft:'auto',display:'flex',gap:6}}>
            <button className="btn btn-success btn-sm" onClick={()=>exportExcel('inventory')}>⬇ Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>fetchInventory(true)}>↻</button>
          </div>
        </div>
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div className="history-table-container" style={{maxHeight:'none'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:640}}>
              <thead><tr>
                <th style={{...thStyle,width:28}}></th>
                {[['part_number',L('Part No','料號')],['model',L('Model','型號')],['description',L('Description','品名')],['location','Loc'],['stock',L('Stock','庫存')]].map(([col,label])=>(
                  <th key={col} style={{...thStyle,cursor:'pointer'}} onClick={()=>sortToggle(col)}>{label} {sortCol===col?(sortAsc?'▲':'▼'):''}</th>
                ))}
                <th style={thStyle}>{L('Dept','部門')}</th><th style={thStyle}></th>
              </tr></thead>
              <tbody>
                {inventory.map(item=>(
                  <tr key={item.part_number} style={{cursor:'pointer'}} onClick={()=>openDetail(item)}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--dk-surface2)'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={{...tdStyle,textAlign:'center'}}><div style={{width:8,height:8,borderRadius:'50%',background:item.is_critical?'#ef4444':item.is_low?'#f59e0b':'#10b981',margin:'0 auto'}}/></td>
                    <td style={{...tdStyle,fontFamily:'monospace',fontWeight:700,color:'var(--dk-accent)'}}>{item.part_number}</td>
                    <td style={{...tdStyle,fontSize:12}}>{item.model}</td>
                    <td style={{...tdStyle,fontSize:12,color:'var(--dk-text-3)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.description}</td>
                    <td style={{...tdStyle,textAlign:'center'}}><span className="badge badge-gray" style={{fontFamily:'monospace'}}>{item.location||'—'}</span></td>
                    <td style={{...tdStyle,textAlign:'center',fontWeight:700,color:item.is_critical?'#ef4444':item.is_low?'#f59e0b':'var(--dk-text)'}}>{item.stock}</td>
                    <td style={tdStyle}>{deptBadge(item.department)}</td>
                    <td style={{...tdStyle,textAlign:'center',color:'var(--dk-accent)',fontSize:11,fontWeight:600}}>{L('View','查看')}</td>
                  </tr>
                ))}
                {!inventory.length&&<tr><td colSpan={8} style={{textAlign:'center',padding:30,color:'var(--dk-text-3)'}}>{L('No data','無資料')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10,justifyContent:'center'}}>
          <button className="btn btn-ghost btn-sm" disabled={invPage<=1} onClick={()=>setInvPage(p=>p-1)}>◀</button>
          <span style={{fontSize:12,color:'var(--dk-text-3)'}}>{L('Page','第')} {invPage} / {invPages} ({invTotal})</span>
          <button className="btn btn-ghost btn-sm" disabled={invPage>=invPages} onClick={()=>setInvPage(p=>p+1)}>▶</button>
        </div>
      </div>}

      {/* MASTER */}
      {tab==='master'&&isAdmin&&<div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:12}}>
          <input placeholder={L('Search...','搜尋...')} value={masterSearch} onChange={e=>setMasterSearch(e.target.value)} style={{flex:1,minWidth:180,maxWidth:280}}/>
          <div style={{marginLeft:'auto',display:'flex',gap:6}}>
            <button className="btn btn-success btn-sm" onClick={()=>exportExcel('master')}>⬇ Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>fetchMaster(true)}>↻</button>
          </div>
        </div>
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div className="history-table-container" style={{maxHeight:'none'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
              <thead><tr>{[L('Part No','料號'),L('Model','型號'),L('Description','品名'),L('Unit','單位'),L('Safety','安全量'),L('Dept','部門'),''].map((h,i)=><th key={i} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {master.map(item=>(
                  <tr key={item.part_number} onMouseEnter={e=>e.currentTarget.style.background='var(--dk-surface2)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
                    <td style={{...tdStyle,fontFamily:'monospace',fontWeight:700,color:'var(--dk-accent)'}}>{item.part_number}</td>
                    <td style={tdStyle}>{item.model}</td>
                    <td style={{...tdStyle,color:'var(--dk-text-3)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.description}</td>
                    <td style={{...tdStyle,textAlign:'center'}}>{item.unit}</td>
                    <td style={{...tdStyle,textAlign:'center'}}>{item.safety_stock}</td>
                    <td style={tdStyle}>{deptBadge(item.department)}</td>
                    <td style={tdStyle}>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(item)}>{L('Edit','編輯')}</button>
                        <button className="btn btn-ghost btn-sm" style={{color:'var(--dk-danger)'}} onClick={()=>deleteMaster(item)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!master.length&&<tr><td colSpan={7} style={{textAlign:'center',padding:30,color:'var(--dk-text-3)'}}>{L('No data','無資料')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10,justifyContent:'center'}}>
          <button className="btn btn-ghost btn-sm" disabled={masterPage<=1} onClick={()=>setMasterPage(p=>p-1)}>◀</button>
          <span style={{fontSize:12,color:'var(--dk-text-3)'}}>{L('Page','第')} {masterPage} / {masterPages} ({masterTotal})</span>
          <button className="btn btn-ghost btn-sm" disabled={masterPage>=masterPages} onClick={()=>setMasterPage(p=>p+1)}>▶</button>
        </div>
      </div>}

      {/* TRANSACTION MODAL */}
      {txOpen&&<div className="modal-overlay"><div className="modal-card" style={{maxWidth:700,width:'95%',maxHeight:'92vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{margin:0}}>{txType==='receive'?L('Goods Receipt','收貨入庫'):L('Goods Issue','發貨領料')}</h3>
          <button className="btn btn-ghost btn-sm" onClick={()=>setTxOpen(false)}>✕</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
          <div><label style={lbl}>{L('PO / Reference *','單號/用途 *')}</label><input value={txRef} onChange={e=>setTxRef(e.target.value)} style={{width:'100%',boxSizing:'border-box'}}/></div>
          <div><label style={lbl}>{L('Operator *','操作人員 *')}</label><input value={txUser} onChange={e=>setTxUser(e.target.value)} style={{width:'100%',boxSizing:'border-box'}}/></div>
          <div><label style={lbl}>{L('Date','日期')}</label><input type="date" defaultValue={new Date().toISOString().split('T')[0]} readOnly style={{width:'100%',boxSizing:'border-box',background:'var(--dk-surface2)'}}/></div>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}>
            <thead><tr>{[L('Part Number','料號'),L('Description','品名'),L('Qty','數量'),'Loc',''].map((h,i)=><th key={i} style={{...thStyle,width:i===2?80:i===3?90:i===4?28:undefined}}>{h}</th>)}</tr></thead>
            <tbody>{txRows.map((row,idx)=>(
              <tr key={idx}>
                <td style={{...tdStyle,position:'relative'}}>
                  <input value={row.id} placeholder={L('Part number...','料號...')} style={{width:'100%',boxSizing:'border-box',margin:0,textTransform:'uppercase'}}
                    onChange={e=>{const v=e.target.value.toUpperCase();setTxRows(r=>r.map((x,i)=>i===idx?{...x,id:v}:x));handleAc(idx,v);}}
                    onBlur={e=>{resolveRow(idx,e.target.value);setTimeout(()=>setAcData({rowIdx:-1,items:[]}),200);}}/>
                  {acData.rowIdx===idx&&acData.items.length>0&&<div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--dk-surface)',border:'1px solid var(--border)',borderRadius:6,zIndex:9999,maxHeight:140,overflowY:'auto',boxShadow:'0 8px 24px rgba(0,0,0,.4)'}}>
                    {acData.items.map(ac=><div key={ac.part_number} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid var(--border)'}}
                      onMouseDown={()=>{setTxRows(r=>r.map((x,i)=>i===idx?{...x,id:ac.part_number}:x));setAcData({rowIdx:-1,items:[]});resolveRow(idx,ac.part_number);}}>
                      <div style={{fontFamily:'monospace',fontWeight:700,color:'var(--dk-accent)'}}>{ac.part_number}</div>
                      <div style={{fontSize:11,color:'var(--dk-text-3)'}}>{ac.model}</div>
                    </div>)}
                  </div>}
                </td>
                <td style={tdStyle}><input value={row.info} readOnly style={{width:'100%',boxSizing:'border-box',margin:0,background:'var(--dk-surface2)',color:'var(--dk-text-3)'}}/></td>
                <td style={tdStyle}><input type="number" min="1" value={row.qty} style={{width:'100%',boxSizing:'border-box',margin:0}} onChange={e=>setTxRows(r=>r.map((x,i)=>i===idx?{...x,qty:e.target.value}:x))}/></td>
                <td style={tdStyle}><input value={row.loc} readOnly={txType==='issue'} style={{width:'100%',boxSizing:'border-box',margin:0,...(txType==='issue'?{background:'var(--dk-surface2)',color:'var(--dk-text-3)'}:{})}} onChange={e=>setTxRows(r=>r.map((x,i)=>i===idx?{...x,loc:e.target.value}:x))}/></td>
                <td style={{...tdStyle,textAlign:'center'}}>{txRows.length>1&&<span style={{cursor:'pointer',color:'var(--dk-text-4)',fontSize:16}} onClick={()=>setTxRows(r=>r.filter((_,i)=>i!==idx))}>✕</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{display:'flex',gap:8,marginTop:12,alignItems:'center'}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setTxRows(r=>[...r,{id:'',info:'',qty:'',loc:''}])}>+ {L('Add Line','新增行')}</button>
          <div style={{marginLeft:'auto',display:'flex',gap:8}}>
            <button className="btn btn-ghost" onClick={()=>setTxOpen(false)}>{L('Cancel','取消')}</button>
            <button className={`btn ${txType==='receive'?'btn-primary':'btn-danger'}`} disabled={txSubmitting} onClick={submitTx}>{txSubmitting?L('Posting...','過帳中...'):L('Post','過帳')}</button>
          </div>
        </div>
      </div></div>}

      {/* DETAIL MODAL */}
      {detOpen&&detItem&&<div className="modal-overlay"><div className="modal-card" style={{maxWidth:520,width:'95%',maxHeight:'92vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <h3 style={{margin:0,fontFamily:'monospace',color:'var(--dk-accent)'}}>{detItem.part_number}</h3>
            <div style={{fontSize:12,color:'var(--dk-text-3)',marginTop:2}}>{detItem.model}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setDetOpen(false)}>✕</button>
        </div>
        <div style={{background:'var(--dk-surface2)',borderRadius:8,padding:14,marginBottom:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,fontSize:13}}>
          <div><span style={{color:'var(--dk-text-3)'}}>{L('Stock','庫存')}: </span><strong style={{fontSize:22,color:'var(--dk-accent)'}}>{detItem.stock??0}</strong> <span style={{fontSize:11,color:'var(--dk-text-3)'}}>{detItem.unit}</span></div>
          <div><span style={{color:'var(--dk-text-3)'}}>{L('Status','狀態')}: </span>{statusBadge(detItem)}</div>
          <div style={{gridColumn:'1/-1'}}><span style={{color:'var(--dk-text-3)'}}>{L('Description','品名')}: </span><span style={{color:'var(--dk-text)'}}>{detItem.description}</span></div>
          <div>
            <span style={{color:'var(--dk-text-3)'}}>{L('Location','儲位')}: </span>
            {editLoc!==null?(<span style={{display:'inline-flex',alignItems:'center',gap:6}}>
              <input value={editLoc} onChange={e=>setEditLoc(e.target.value)} autoFocus style={{width:80,padding:'3px 8px',fontSize:13,margin:0}} onKeyDown={e=>e.key==='Enter'&&saveLocation(editLoc)}/>
              <span style={{cursor:'pointer',color:'#10b981'}} onClick={()=>saveLocation(editLoc)}>✔</span>
              <span style={{cursor:'pointer',color:'var(--dk-danger)'}} onClick={()=>setEditLoc(null)}>✕</span>
            </span>):(<span style={{cursor:'pointer'}} onClick={()=>setEditLoc(detItem.location||'')}>
              {detItem.location?<span className="badge badge-gray" style={{fontFamily:'monospace'}}>{detItem.location}</span>:<span style={{color:'var(--dk-text-3)'}}>—</span>}
              <span style={{fontSize:11,marginLeft:4}}>✏️</span>
            </span>)}
          </div>
          <div>{deptBadge(detItem.department)}</div>
        </div>
        <div style={{fontSize:11,fontWeight:700,color:'var(--dk-text-3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>{L('History','異動記錄')}</div>
        <div className="history-table-container" style={{maxHeight:260}}>
          <table className="history-table">
            <thead><tr><th>{L('Action','動作')}</th><th>{L('Qty','數量')}</th><th>{L('Reference','單號')}</th><th>{L('Operator','操作員')}</th><th>{L('Date','日期')}</th></tr></thead>
            <tbody>
              {detHist.map((h,i)=>{const c=h.quantity>0?'#10b981':h.quantity<0?'#ef4444':'var(--dk-text-3)';return(
                <tr key={i}><td>{h.action}</td><td style={{fontWeight:700,color:c}}>{h.quantity>0?'+':''}{h.quantity}</td><td style={{color:'var(--dk-text-3)'}}>{h.reference||'—'}</td><td>{h.operator_user}</td><td style={{whiteSpace:'nowrap'}}>{fmtDate(h.timestamp)}</td></tr>
              );})}
              {!detHist.length&&<tr><td colSpan={5} style={{textAlign:'center',padding:20,color:'var(--dk-text-3)'}}>{L('No history','無紀錄')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div></div>}

      {/* MASTER MODAL */}
      {masterModal&&<div className="modal-overlay"><div className="modal-card" style={{maxWidth:460,width:'95%'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{margin:0}}>{masterModal==='create'?L('New Material','新增物料'):L('Edit Material','編輯物料')}</h3>
          <button className="btn btn-ghost btn-sm" onClick={()=>setMasterModal(null)}>✕</button>
        </div>
        <div style={{display:'grid',gap:12}}>
          {[['part_number',L('Part Number *','料號 *'),'text',masterModal!=='create'],['model',L('Model','型號'),'text',false],['description',L('Description','品名描述'),'text',false],['unit',L('Unit','單位'),'text',false],['safety_stock',L('Safety Stock','安全庫存'),'number',false]].map(([key,label,type,ro])=>(
            <div key={key}>
              <label style={lbl}>{label}</label>
              <input type={type} value={masterForm[key]} readOnly={ro} style={{width:'100%',boxSizing:'border-box',...(ro?{background:'var(--dk-surface2)',color:'var(--dk-text-3)'}:{})}}
                onChange={e=>{setMasterForm(f=>({...f,[key]:e.target.value}));if(key==='part_number')checkPn(e.target.value);}}/>
              {key==='part_number'&&masterFb&&<span style={{fontSize:11,color:masterFb.includes('✓')?'#10b981':'#ef4444'}}>{masterFb}</span>}
            </div>
          ))}
          <div>
            <label style={lbl}>{L('Department *','部門 *')}</label>
            <select value={masterForm.department} onChange={e=>setMasterForm(f=>({...f,department:e.target.value}))} style={{width:'100%',boxSizing:'border-box'}}>
              <option value="">{L('Select...','選擇...')}</option>
              {DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:16}}>
          <button className="btn btn-ghost" onClick={()=>setMasterModal(null)}>{L('Cancel','取消')}</button>
          <button className="btn btn-primary" disabled={masterSubmitting} onClick={submitMaster}>{masterSubmitting?'...':masterModal==='create'?L('Create','建立'):L('Save','儲存')}</button>
        </div>
      </div></div>}
    </div>
  );
}
