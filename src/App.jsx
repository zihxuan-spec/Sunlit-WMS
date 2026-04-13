import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './config/supabaseClient';
import { dict } from './config/i18n';
import MES from './pages/MES';
import ReusableTracking from './pages/ReusableTracking';
import Login from './components/Login';
import Navbar from './components/Navbar';
import GlobalModal from './components/Modals/GlobalModal';
import WarehouseMap from './components/WarehouseMap';
import Dashboard from './pages/Dashboard';
import Inbound from './pages/Inbound';
import Outbound from './pages/Outbound';
import Turnover from './pages/Turnover';
import ZebraScanner from './pages/ZebraScanner';
import ZebraTool from './components/ZebraTool';
import ProductionRecord from './pages/ProductionRecord';
import Admin from './pages/Admin';
import SparePart from './pages/SparePart';

export default function App() {
  const [lang, setLang] = useState('en');
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('Warehouse');
  const [authReady, setAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [modal, setModal] = useState({ isOpen: false, type: 'alert', title: '', msg: '', onConfirm: null, onAltConfirm: null, btnConfirm: '', btnAlt: '', btnCancel: '' });
  const [shelves, setShelves] = useState([]);
  const [turnoverItems, setTurnoverItems] = useState([]);
  const [containerTypes, setContainerTypes] = useState([]);
  const [inProductionCount, setInProductionCount] = useState(0);
  const [shelvesLoading, setShelvesLoading] = useState(true);
  const [realtimeOk, setRealtimeOk] = useState(true);
  const [activeWarehouse, setActiveWarehouse] = useState('North Warehouse');
  const [activeZone, setActiveZone] = useState('');
  const [mapZoom, setMapZoom] = useState(1);
  const [inboundDate, setInboundDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [pendingItems, setPendingItemsState] = useState([]);
  const [outboundAssignItems, setOutboundAssignItemsState] = useState([]);
  const [selectedPending, setSelectedPending] = useState(null);
  const [selectedOutboundAssign, setSelectedOutboundAssign] = useState(null);
  const [inboundTransferSelected, setInboundTransferSelected] = useState([]);
  const [outboundPending, setOutboundPending] = useState([]);
  const [outboundNotFound, setOutboundNotFound] = useState([]);

  const viewRef = useRef(currentView);
  const shelvesRef = useRef(shelves);
  const turnoverRef = useRef(turnoverItems);
  const pendingItemsRef = useRef(pendingItems);
  const outPendingRef = useRef(outboundPending);
  const outAssignRef = useRef(outboundAssignItems);
  useEffect(() => { viewRef.current = currentView; }, [currentView]);
  useEffect(() => { shelvesRef.current = shelves; }, [shelves]);
  useEffect(() => { turnoverRef.current = turnoverItems; }, [turnoverItems]);
  useEffect(() => { pendingItemsRef.current = pendingItems; }, [pendingItems]);
  useEffect(() => { outPendingRef.current = outboundPending; }, [outboundPending]);
  useEffect(() => { outAssignRef.current = outboundAssignItems; }, [outboundAssignItems]);

  // Always light mode
  useEffect(() => { document.documentElement.classList.add('light'); }, []);

  // Reset ALL state to blank before applying new session — prevents previous user's UI flash
  const resetState = useCallback(() => {
    setCurrentUser(null);
    setUserRole('Warehouse');
    setCurrentView('dashboard');
    setShelves([]);
    setTurnoverItems([]);
    setPendingItemsState([]);
    setOutboundAssignItemsState([]);
    setOutboundPending([]);
    setOutboundNotFound([]);
    setInboundTransferSelected([]);
    setSelectedPending(null);
    setSelectedOutboundAssign(null);
    setShelvesLoading(true);
  }, []);

  const applySession = useCallback((session) => {
    if (!session?.user) return;
    // Step 1: Reset everything first (prevents flash of prev user's view)
    resetState();
    const fallbackName = (session.user.email || '').split('@')[0] || 'User';
    // Step 2: Set new user with fallback immediately
    setCurrentUser(fallbackName);
    setUserRole('Warehouse');
    // Step 3: Enrich from profiles in background — also sets correct view for role
    supabase.from('profiles').select('name, role').eq('id', session.user.id).single()
      .then(({ data }) => {
        if (data?.name) setCurrentUser(data.name);
        if (data?.role) {
          setUserRole(data.role);
          // Redirect QC/Facility to sparepart immediately on login
          if (['QC', 'Facility'].includes(data.role)) setCurrentView('sparepart');
        }
      })
      .catch(() => {});
  }, [resetState]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        applySession(session);
        setAuthReady(true);
      } else if (event === 'SIGNED_OUT') {
        resetState();
        setAuthReady(false);
        // Brief delay to show loading screen before login form (cleaner UX)
        setTimeout(() => setAuthReady(true), 100);
      }
    });
    supabase.auth.getSession()
      .then(({ data: { session } }) => { if (session?.user) applySession(session); setAuthReady(true); })
      .catch(() => setAuthReady(true));
    const fallback = setTimeout(() => setAuthReady(true), 8000);
    return () => { subscription.unsubscribe(); clearTimeout(fallback); };
  }, [applySession, resetState]);

  const t = dict[lang];
  const showAlert   = (msg) => setModal({ isOpen: true, type: 'alert', title: t.modalAlert, msg, onConfirm: null, btnConfirm: t.btnClose });
  const showConfirm = (msg, onConfirm) => setModal({ isOpen: true, type: 'confirm', title: t.modalConfirm, msg, onConfirm, btnConfirm: t.btnConfirm });
  const closeModal  = () => setModal(prev => ({ ...prev, isOpen: false }));

  const setPendingItems = useCallback(async (updater) => {
    setPendingItemsState(typeof updater === 'function' ? updater(pendingItems) : updater);
  }, [pendingItems]);
  const setOutboundAssignItems = useCallback(async (updater) => {
    setOutboundAssignItemsState(typeof updater === 'function' ? updater(outboundAssignItems) : updater);
  }, [outboundAssignItems]);

  useEffect(() => {
    if (shelves.length > 0) {
      const zones = [...new Set(shelves.filter(s => s.warehouse === activeWarehouse).map(s => s.zone))].sort();
      if (zones.length > 0 && !zones.includes(activeZone)) setActiveZone(zones[0]);
    }
  }, [shelves, activeWarehouse, activeZone]);

  const fetchShelves = useCallback(async () => {
    const { data } = await supabase.from('shelves').select('id,warehouse,zone,row_idx,col_idx,status,product_barcode,batch_no,batch_date,last_updated_by').order('id', { ascending: true });
    if (data) { setShelves(data); setShelvesLoading(false); }
  }, []);
  const fetchTurnover = useCallback(async () => {
    const { data } = await supabase.from('turnover_inventory').select('*').not('status', 'in', '(shipped,inbound_return)').order('added_at', { ascending: false });
    if (data) setTurnoverItems(data);
  }, []);
  const fetchContainerTypes = useCallback(async () => {
    const { data } = await supabase.from('container_types').select('*').eq('active', true);
    if (data) setContainerTypes(data);
  }, []);
  const getContainerTypeByBarcode = useCallback((barcode) => {
    if (!barcode) return null;
    return containerTypes.find(ct => barcode.startsWith(ct.barcode_prefix)) || null;
  }, [containerTypes]);
  const fetchInboundQueue = useCallback(async () => {
    const { data } = await supabase.from('inbound_queue').select('*').eq('added_by', currentUser).order('created_at', { ascending: true });
    if (data) setPendingItemsState(data.map(r => ({ id: r.id, barcode: r.barcode })));
  }, [currentUser]);
  const addToPendingDB = async (barcodes) => {
    if (!barcodes.length) return;
    const { data } = await supabase.from('inbound_queue').insert(barcodes.map(bc => ({ barcode: bc, added_by: currentUser }))).select();
    if (data) setPendingItemsState(prev => [...prev, ...data.map(r => ({ id: r.id, barcode: r.barcode }))]);
    const { data: rt } = await supabase.from('reusable_tracking').select('barcode').in('barcode', barcodes).eq('current_status', 'ready_to_ship');
    if (rt?.length) await supabase.from('reusable_tracking').update({ current_status: 'in_plant' }).in('barcode', rt.map(r => r.barcode));
  };
  const removeFromPendingDB = async (barcodes) => {
    if (!barcodes.length) return;
    await supabase.from('inbound_queue').delete().in('barcode', barcodes);
    setPendingItemsState(prev => prev.filter(p => !barcodes.includes(p.barcode)));
  };
  const fetchOutboundAssignQueue = useCallback(async () => {
    const { data } = await supabase.from('outbound_assign_queue').select('*').order('created_at', { ascending: true });
    if (data) setOutboundAssignItemsState(data.map(r => ({ id: r.id, barcode: r.barcode, batch_no: r.batch_no })));
  }, []);
  const addToOutboundAssignDB = async (items) => {
    if (!items.length) return;
    const { data } = await supabase.from('outbound_assign_queue').insert(items.map(i => ({ barcode: i.barcode, batch_no: i.batch_no, added_by: currentUser }))).select();
    if (data) setOutboundAssignItemsState(prev => [...prev, ...data.map(r => ({ id: r.id, barcode: r.barcode, batch_no: r.batch_no }))]);
  };
  const removeFromOutboundAssignDB = async (ids) => {
    if (!ids.length) return;
    await supabase.from('outbound_assign_queue').delete().in('id', ids);
    setOutboundAssignItemsState(prev => prev.filter(p => !ids.includes(p.id)));
  };
  const writeHistory = async (records) => { await supabase.from('shelf_history').insert(records); };
  const beep = useCallback(() => {
    try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(); o.connect(ctx.destination); o.frequency.value = 880; o.start(); o.stop(ctx.currentTime + 0.07); } catch {}
    if (navigator.vibrate) navigator.vibrate(40);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    fetchShelves(); fetchTurnover(); fetchContainerTypes(); fetchInboundQueue(); fetchOutboundAssignQueue();
    const ch = supabase.channel('wms-main')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shelves' }, (p) => { setShelves(prev => prev.map(s => s.id === p.new.id ? { ...s, ...p.new } : s)); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shelves' }, fetchShelves)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnover_inventory' }, fetchTurnover)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbound_queue' }, fetchInboundQueue)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outbound_assign_queue' }, fetchOutboundAssignQueue)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, async () => {
        const { data } = await supabase.from('production_batches').select('batch_no').eq('status', 'processing');
        if (data) setInProductionCount(data.length);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cloud_scanner' }, (p) => {
        if (p.new.operator === currentUser && viewRef.current !== 'zebra') { handleSmartScan(p.new.barcode); supabase.from('cloud_scanner').delete().eq('id', p.new.id).then(); }
      }).subscribe((status) => {
        if (status === 'SUBSCRIBED') { setRealtimeOk(true); fetchShelves(); fetchTurnover(); fetchInboundQueue(); fetchOutboundAssignQueue(); }
        else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) setRealtimeOk(false);
      });
    supabase.from('production_batches').select('batch_no').eq('status', 'processing').then(({ data }) => { if (data) setInProductionCount(data.length); });
    return () => supabase.removeChannel(ch);
  }, [currentUser]);

  const handleSmartScan = (bc) => {
    if (viewRef.current === 'outbound') {
      let avail = shelvesRef.current.filter(s => s.status === 'occupied' && !outPendingRef.current.find(p => p.id === s.id) && s.warehouse === 'South Warehouse');
      let match = avail.filter(s => s.batch_no === bc || s.product_barcode === bc);
      if (match.length > 0) { setOutboundPending(prev => [...prev, ...match].sort((a,b) => a.zone!==b.zone?a.zone.localeCompare(b.zone):a.row_idx-b.row_idx)); setActiveZone(match[0].zone); }
      else {
        const nm = shelvesRef.current.filter(s => s.warehouse==='North Warehouse' && (s.batch_no===bc||s.product_barcode===bc));
        if (nm.length) { setOutboundNotFound(p=>p.includes(bc)?p:[...p,bc]); showAlert(lang==='zh'?`此批號在北倉 ${nm[0].id}，請先移至南倉再出貨。`:`Barcode found in North WH at ${nm[0].id}. Move to South WH first.`); }
        else if (!outPendingRef.current.some(p=>p.batch_no===bc||p.product_barcode===bc)) setOutboundNotFound(p=>p.includes(bc)?p:[...p,bc]);
      }
    } else {
      const ex = [...shelvesRef.current.filter(s=>s.status==='occupied'&&s.product_barcode).map(s=>s.product_barcode),...turnoverRef.current.map(i=>i.product_barcode),...pendingItemsRef.current.map(p=>p.barcode),...outAssignRef.current.map(i=>i.barcode)];
      if (ex.includes(bc)) return showAlert(t.msgDupSingle.replace('{bc}',bc));
      addToPendingDB([bc]); setSelectedPending(bc);
      if (viewRef.current!=='inbound') { setCurrentView('inbound'); setActiveWarehouse('North Warehouse'); }
    }
  };

  useEffect(() => {
    if (!currentUser||currentView==='zebra') return;
    let buf=''; let tmr;
    const onKey=(e)=>{
      if(e.ctrlKey||e.altKey||e.metaKey||modal.isOpen||e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
      if(e.key==='Enter'){if(buf.trim())handleSmartScan(buf.trim());buf='';return;}
      if(e.key.length===1&&/[a-zA-Z0-9\-]/.test(e.key)){buf+=e.key;clearTimeout(tmr);tmr=setTimeout(()=>{buf='';},50);}
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  }, [currentView,currentUser,modal.isOpen]);

  const handleAddPendingInbound = async (batchInput) => {
    const items = batchInput.split('\n').map(s=>s.trim()).filter(Boolean);
    const ex = [...shelves.filter(s=>s.status==='occupied'&&s.product_barcode).map(s=>s.product_barcode),...turnoverItems.map(i=>i.product_barcode),...pendingItems.map(p=>p.barcode),...outboundAssignItems.map(i=>i.barcode)];
    const newItems=[]; const dups=[];
    items.forEach(item=>{if(ex.includes(item)||newItems.includes(item))dups.push(item);else newItems.push(item);});
    if(dups.length>0) showAlert(t.msgDupFilter.replace('{n}',dups.length).replace('{list}',dups.slice(0,3).join(', ')+(dups.length>3?'...':'')));
    if(newItems.length>0) await addToPendingDB(newItems);
  };
  const handleRequestRemovePending = (e, itemToRemove) => {
    if(e) e.stopPropagation();
    const items = itemToRemove?[itemToRemove]:pendingItems.map(p=>p.barcode);
    if(!items.length) return;
    const barcodes = typeof items[0]==='string'?items:items.map(p=>p.barcode);
    setModal({isOpen:true,type:'three-way',title:t.modalAlert,msg:t.msgRemovePendingControl.replace('{n}',barcodes.length),btnConfirm:t.btnReturnToTurnover,btnAlt:t.btnDiscard,btnCancel:t.btnCancel,
      onConfirm:async()=>{await supabase.from('turnover_inventory').insert(barcodes.map(bc=>({product_barcode:bc,batch_date:inboundDate,added_by:currentUser})));await removeFromPendingDB(barcodes);fetchTurnover();setSelectedPending(null);showAlert(t.msgAutoSuccess);},
      onAltConfirm:async()=>{await removeFromPendingDB(barcodes);setSelectedPending(null);}});
  };
  const handleAutoAssign = async (zoneStr) => {
    const empty = shelves.filter(s=>s.warehouse==='North Warehouse'&&s.zone===zoneStr&&s.status==='empty');
    if(!empty.length) return showAlert(t.msgNoSpace);
    const n = Math.min(pendingItems.length,empty.length); const toAssign=pendingItems.slice(0,n);
    showConfirm(t.msgAutoConfirm.replace('{n}',n).replace('{z}',zoneStr),async()=>{
      const results = await Promise.allSettled(toAssign.map((item,i)=>supabase.from('shelves').update({status:'occupied',product_barcode:item.barcode,batch_date:inboundDate,last_updated_by:currentUser}).eq('id',empty[i].id)));
      const succeeded=toAssign.filter((_,i)=>results[i].status==='fulfilled'&&!results[i].value.error);
      const failed=toAssign.filter((_,i)=>results[i].status==='rejected'||results[i].value.error);
      if(succeeded.length>0){await writeHistory(succeeded.map((item,i)=>({shelf_id:empty[toAssign.indexOf(item)].id,action:'inbound',product_barcode:item.barcode,operator:currentUser,batch_date:inboundDate})));await removeFromPendingDB(succeeded.map(p=>p.barcode));beep();}
      if(failed.length>0) showAlert(`${succeeded.length} assigned. ${failed.length} failed.`); else showAlert(t.msgAutoSuccess);
      setSelectedPending(null);
    });
  };
  const handleShelfClickInbound = async (shelf) => {
    if(shelf==='transfer_all'){if(!inboundTransferSelected.length)return;showConfirm(t.msgTransferTurnoverConfirm.replace('{n}',inboundTransferSelected.length),async()=>{await Promise.all(inboundTransferSelected.map(s=>supabase.from('shelves').update({status:'empty',product_barcode:null,batch_no:null,batch_date:null,last_updated_by:currentUser}).eq('id',s.id)));await writeHistory(inboundTransferSelected.map(s=>({shelf_id:s.id,action:'outbound_turnover',product_barcode:s.product_barcode,operator:currentUser})));await supabase.from('turnover_inventory').insert(inboundTransferSelected.map(s=>({product_barcode:s.product_barcode,batch_date:s.batch_date,added_by:currentUser})));fetchTurnover();setInboundTransferSelected([]);beep();showAlert(t.msgAutoSuccess);});return;}
    if(shelf.status==='occupied'){setInboundTransferSelected(prev=>prev.find(p=>p.id===shelf.id)?prev.filter(p=>p.id!==shelf.id):[...prev,shelf]);return;}
    if(selectedPending){const{error}=await supabase.from('shelves').update({status:'occupied',product_barcode:selectedPending,batch_date:inboundDate,last_updated_by:currentUser}).eq('id',shelf.id);if(!error){await writeHistory([{shelf_id:shelf.id,action:'inbound',product_barcode:selectedPending,operator:currentUser,batch_date:inboundDate}]);await removeFromPendingDB([selectedPending]);beep();setSelectedPending(null);}else showAlert(t.msgFail);return;}
    showAlert(t.msgSelectFirst);
  };
  const handleAddOutboundList = (input) => {
    const barcodes=[...new Set(input.split('\n').map(s=>s.trim()).filter(Boolean))]; let found=[]; let notFound=[];
    let avail=shelves.filter(s=>s.status==='occupied'&&!outboundPending.find(p=>p.id===s.id)&&s.warehouse==='South Warehouse');
    barcodes.forEach(bc=>{const match=avail.filter(s=>s.batch_no===bc||s.product_barcode===bc);if(match.length){found.push(...match);avail=avail.filter(s=>!match.map(m=>m.id).includes(s.id));}else if(!outboundPending.some(p=>p.batch_no===bc||p.product_barcode===bc)){const nm=shelves.filter(s=>s.warehouse==='North Warehouse'&&(s.batch_no===bc||s.product_barcode===bc));if(nm.length)showAlert(lang==='zh'?`批號 ${bc} 在北倉 ${nm[0].id}，請先移至南倉。`:`${bc} found in North WH at ${nm[0].id}. Move to South WH first.`);else notFound.push(bc);}});
    const newP=[...outboundPending,...found].sort((a,b)=>a.zone!==b.zone?a.zone.localeCompare(b.zone):a.row_idx-b.row_idx);
    setOutboundPending(newP);setOutboundNotFound([...outboundNotFound,...notFound]);if(newP.length)setActiveZone(newP[0].zone);
  };
  const handleRequestRemoveOutboundAssign = (e,itemToRemove) => {
    if(e) e.stopPropagation(); const items=itemToRemove?[itemToRemove]:outboundAssignItems; if(!items.length)return;
    showConfirm(t.msgRemoveOutboundAssignControl.replace('{n}',items.length),async()=>{await supabase.from('turnover_inventory').insert(items.map(o=>({product_barcode:o.barcode,batch_date:inboundDate,added_by:currentUser})));await removeFromOutboundAssignDB(items.map(i=>i.id));fetchTurnover();setSelectedOutboundAssign(null);showAlert(t.msgAutoSuccess);});
  };
  const handleAutoAssignOutbound = async (zoneStr) => {
    const empty=shelves.filter(s=>s.warehouse==='South Warehouse'&&s.zone===zoneStr&&s.status==='empty'); if(!empty.length)return showAlert(t.msgNoSpace);
    const n=Math.min(outboundAssignItems.length,empty.length); const toAssign=outboundAssignItems.slice(0,n); const today=new Date().toISOString().split('T')[0];
    showConfirm(t.msgAutoConfirm.replace('{n}',n).replace('{z}',zoneStr),async()=>{await Promise.all(toAssign.map((obj,i)=>supabase.from('shelves').update({status:'occupied',product_barcode:obj.barcode,batch_no:obj.batch_no,batch_date:today,last_updated_by:currentUser}).eq('id',empty[i].id)));await writeHistory(toAssign.map((obj,i)=>({shelf_id:empty[i].id,action:'inbound',product_barcode:obj.barcode,batch_no:obj.batch_no,operator:currentUser,batch_date:today})));await removeFromOutboundAssignDB(toAssign.map(i=>i.id));setSelectedOutboundAssign(null);beep();showAlert(t.msgAutoSuccess);});
  };
  const handleShelfClickOutbound = async (shelf) => {
    if(shelf.status==='empty'&&selectedOutboundAssign){const target=outboundAssignItems.find(i=>i.id===selectedOutboundAssign);if(!target)return;const today=new Date().toISOString().split('T')[0];const{error}=await supabase.from('shelves').update({status:'occupied',product_barcode:target.barcode,batch_no:target.batch_no,batch_date:today,last_updated_by:currentUser}).eq('id',shelf.id);if(!error){await writeHistory([{shelf_id:shelf.id,action:'inbound',product_barcode:target.barcode,batch_no:target.batch_no,operator:currentUser,batch_date:today}]);await removeFromOutboundAssignDB([target.id]);beep();setSelectedOutboundAssign(null);}else showAlert(t.msgFail);return;}
    if(shelf.status==='occupied'){setOutboundPending(prev=>prev.find(p=>p.id===shelf.id)?prev.filter(p=>p.id!==shelf.id):[...prev,shelf]);}else{showAlert(outboundAssignItems.length?t.msgSelectFirst:t.msgEmptyPick);}
  };
  const handlePickAllFound = async (customerName='') => {
    if(!outboundPending.length)return;
    await Promise.all(outboundPending.map(s=>supabase.from('shelves').update({status:'empty',product_barcode:null,batch_no:null,batch_date:null,last_updated_by:currentUser}).eq('id',s.id)));
    await writeHistory(outboundPending.map(s=>({shelf_id:s.id,action:'outbound_customer',product_barcode:s.product_barcode,batch_no:s.batch_no,operator:currentUser})));
    const recyclable=outboundPending.filter(s=>getContainerTypeByBarcode(s.product_barcode)?.is_reusable);
    if(recyclable.length){const{data:ex}=await supabase.from('reusable_tracking').select('barcode,use_count').in('barcode',recyclable.map(s=>s.product_barcode));const exMap=Object.fromEntries((ex||[]).map(e=>[e.barcode,e.use_count]));await supabase.from('reusable_tracking').upsert(recyclable.map(s=>({barcode:s.product_barcode,use_count:(exMap[s.product_barcode]||0)+1,current_status:'ready_to_ship',last_shipped_at:new Date().toISOString()})),{onConflict:'barcode'});}
    const batchNos=[...new Set(outboundPending.map(s=>s.batch_no).filter(Boolean))]; const shippedAt=new Date().toISOString();
    if(batchNos.length){await Promise.all([...batchNos.map(bNo=>supabase.from('turnover_inventory').update({status:'shipped',updated_at:shippedAt}).eq('batch_no',bNo)),...batchNos.map(bNo=>supabase.from('production_batches').update({status:'shipped',customer:customerName,shipped_at:shippedAt}).eq('batch_no',bNo))]);}
    beep();setOutboundPending([]);fetchTurnover();showAlert(t.msgAutoSuccess);
  };
  const handleLogout = async () => { await supabase.auth.signOut(); };
  // QC/Facility redirect handled in applySession to avoid flash

  if (!authReady) return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#f2f2f7',gap:14}}>
      <div style={{width:32,height:32,border:'3px solid #e5e7eb',borderTopColor:'#2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <div style={{fontSize:13,color:'#9ca3af'}}>Loading...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!currentUser) return (
    <><Login t={t} lang={lang} setLang={setLang} showAlert={showAlert}/><GlobalModal modal={modal} closeModal={closeModal} t={t}/></>
  );

  return (
    <div className="app-shell">
      <GlobalModal modal={modal} closeModal={closeModal} t={t}/>
      <Navbar currentUser={currentUser} userRole={userRole} handleLogout={handleLogout} lang={lang} setLang={setLang} currentView={currentView} setCurrentView={setCurrentView} t={t} realtimeOk={realtimeOk}/>
      <div className="main-content">
        {currentView==='production_record'&&<ProductionRecord t={t} lang={lang}/>}
        {currentView==='admin'&&userRole==='Admin'&&<Admin lang={lang} showAlert={showAlert} showConfirm={showConfirm} currentUser={currentUser}/>}
        {currentView==='sparepart'&&['Admin','QC','Facility','Production'].includes(userRole)&&<SparePart lang={lang} currentUser={currentUser} userRole={userRole} showAlert={showAlert} showConfirm={showConfirm}/>}
        {currentView==='dashboard'&&<Dashboard t={t} lang={lang} shelves={shelves} turnoverItems={turnoverItems} inProductionCount={inProductionCount} showAlert={showAlert} onRefresh={async()=>{await fetchShelves();await fetchTurnover();}}/>}
        {currentView==='zebra'&&<ZebraScanner t={t} currentUser={currentUser}/>}
        {currentView==='reusable'&&<ReusableTracking t={t} lang={lang} showAlert={showAlert}/>}
        {currentView==='mes'&&<MES t={t} lang={lang} currentUser={currentUser} showAlert={showAlert}/>}
        {currentView==='turnover'&&<Turnover t={t} lang={lang} currentUser={currentUser} turnoverItems={turnoverItems} fetchTurnover={fetchTurnover} showAlert={showAlert} showConfirm={showConfirm} addToOutboundAssignDB={addToOutboundAssignDB} setCurrentView={setCurrentView} setActiveWarehouse={setActiveWarehouse} addToPendingDB={addToPendingDB}/>}
        {currentView==='inbound'&&<Inbound t={t} lang={lang} currentUser={currentUser} shelves={shelves} shelvesLoading={shelvesLoading} turnoverItems={turnoverItems} pendingItems={pendingItems} selectedPending={selectedPending} setSelectedPending={setSelectedPending} outboundAssignItems={outboundAssignItems} inboundTransferSelected={inboundTransferSelected} setInboundTransferSelected={setInboundTransferSelected} activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse} activeZone={activeZone} setActiveZone={setActiveZone} showAlert={showAlert} showConfirm={showConfirm} handleRequestRemovePending={handleRequestRemovePending} handleAutoAssign={handleAutoAssign} handleAddPendingInbound={handleAddPendingInbound} handleShelfClickInbound={handleShelfClickInbound} inboundDate={inboundDate} setInboundDate={setInboundDate}/>}
        {currentView==='outbound'&&<Outbound t={t} lang={lang} currentUser={currentUser} shelves={shelves} outboundAssignItems={outboundAssignItems} outboundPending={outboundPending} setOutboundPending={setOutboundPending} outboundNotFound={outboundNotFound} setOutboundNotFound={setOutboundNotFound} activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse} activeZone={activeZone} setActiveZone={setActiveZone} selectedOutboundAssign={selectedOutboundAssign} setSelectedOutboundAssign={setSelectedOutboundAssign} handleAutoAssignOutbound={handleAutoAssignOutbound} handleRequestRemoveOutboundAssign={handleRequestRemoveOutboundAssign} handleAddOutboundList={handleAddOutboundList} handleShelfClickOutbound={handleShelfClickOutbound} handlePickAllFound={handlePickAllFound}/>}
        {currentView==='map'&&<WarehouseMap t={t} lang={lang} currentView="map" shelves={shelves} activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse} activeZone={activeZone} setActiveZone={setActiveZone} mapZoom={mapZoom} setMapZoom={setMapZoom}/>}
        <ZebraTool t={t} currentUser={currentUser} lang={lang}/>
      </div>
    </div>
  );
}
