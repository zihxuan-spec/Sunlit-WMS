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

export default function App() {
  const [lang, setLang] = useState('en');
  const [theme, setTheme] = useState(() => localStorage.getItem('wms_theme') || 'light');

  useEffect(() => {
    if (theme === 'light') document.documentElement.classList.add('light');
    else document.documentElement.classList.remove('light');
    localStorage.setItem('wms_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const t = dict[lang];
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('Warehouse');
  const [currentView, setCurrentView] = useState('dashboard');

  const [modal, setModal] = useState({ isOpen: false, type: 'alert', title: '', msg: '', onConfirm: null, onAltConfirm: null, btnConfirm: '', btnAlt: '', btnCancel: '' });
  const showAlert   = (msg) => setModal({ isOpen: true, type: 'alert',   title: t.modalAlert,   msg, onConfirm: null, btnConfirm: t.btnClose });
  const showConfirm = (msg, onConfirm) => setModal({ isOpen: true, type: 'confirm', title: t.modalConfirm, msg, onConfirm, btnConfirm: t.btnConfirm });
  const closeModal  = () => setModal(prev => ({ ...prev, isOpen: false }));

  const [shelves, setShelves] = useState([]);
  const [turnoverItems, setTurnoverItems] = useState([]);
  const [recycledRules, setRecycledRules] = useState([]);
  const [inProductionCount, setInProductionCount] = useState(0);

  const [activeWarehouse, setActiveWarehouse] = useState('North Warehouse');
  const [activeZone, setActiveZone] = useState('');
  const [mapZoom, setMapZoom] = useState(1);
  const [inboundDate, setInboundDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [pendingItems, setPendingItems] = useState(() => { try { return JSON.parse(localStorage.getItem('wms_pendingItems')) || []; } catch { return []; } });
  const [outboundAssignItems, setOutboundAssignItems] = useState(() => { try { return JSON.parse(localStorage.getItem('wms_outboundAssignItems')) || []; } catch { return []; } });
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
  useEffect(() => { localStorage.setItem('wms_pendingItems', JSON.stringify(pendingItems)); }, [pendingItems]);
  useEffect(() => { localStorage.setItem('wms_outboundAssignItems', JSON.stringify(outboundAssignItems)); }, [outboundAssignItems]);

  useEffect(() => {
    if (shelves.length > 0) {
      const zones = [...new Set(shelves.filter(s => s.warehouse === activeWarehouse).map(s => s.zone))].sort();
      if (zones.length > 0 && !zones.includes(activeZone)) setActiveZone(zones[0]);
    }
  }, [shelves, activeWarehouse, activeZone]);

  const fetchShelves = useCallback(async () => {
    const { data } = await supabase.from('shelves').select('id,warehouse,zone,row_idx,col_idx,status,product_barcode,batch_no,batch_date,last_updated_by').order('id', { ascending: true });
    if (data) setShelves(data);
  }, []);
  const fetchTurnover = useCallback(async () => {
    const { data } = await supabase.from('turnover_inventory').select('*')
      .not('status', 'in', '(shipped,inbound_return)')
      .order('added_at', { ascending: false });
    if (data) setTurnoverItems(data);
  }, []);
  const fetchRecycledRules = useCallback(async () => {
    const { data } = await supabase.from('recycled_container_rules').select('*');
    if (data) setRecycledRules(data);
  }, []);
  const writeHistory = async (records) => { await supabase.from('shelf_history').insert(records); };

  const beep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); o.connect(ctx.destination);
      o.frequency.value = 880; o.start(); o.stop(ctx.currentTime + 0.07);
    } catch {}
    if (navigator.vibrate) navigator.vibrate(40);
  }, []);

  useEffect(() => {
    fetchShelves(); fetchTurnover(); fetchRecycledRules();
    const ch = supabase.channel('wms-main')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shelves' }, (p) => {
        setShelves(prev => prev.map(s => s.id === p.new.id ? { ...s, ...p.new } : s));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shelves' }, fetchShelves)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnover_inventory' }, fetchTurnover)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, async () => {
        const { data } = await supabase.from('production_batches').select('batch_no').eq('status', 'processing');
        if (data) setInProductionCount(data.length);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cloud_scanner' }, (p) => {
        if (p.new.operator === currentUser && viewRef.current !== 'zebra') {
          handleSmartScan(p.new.barcode);
          supabase.from('cloud_scanner').delete().eq('id', p.new.id).then();
        }
      }).subscribe();
    supabase.from('production_batches').select('batch_no').eq('status', 'processing').then(({ data }) => {
      if (data) setInProductionCount(data.length);
    });
    return () => supabase.removeChannel(ch);
  }, [currentUser]);

  const handleSmartScan = (bc) => {
    if (viewRef.current === 'outbound') {
      let avail = shelvesRef.current.filter(s => s.status === 'occupied' && !outPendingRef.current.find(p => p.id === s.id) && s.warehouse === 'South Warehouse');
      let match = avail.filter(s => s.batch_no === bc || s.product_barcode === bc);
      if (match.length > 0) {
        setOutboundPending(prev => [...prev, ...match].sort((a, b) => a.zone !== b.zone ? a.zone.localeCompare(b.zone) : a.row_idx - b.row_idx));
        setActiveZone(match[0].zone);
      } else {
        if (!outPendingRef.current.some(p => p.batch_no === bc || p.product_barcode === bc))
          setOutboundNotFound(prev => prev.includes(bc) ? prev : [...prev, bc]);
      }
    } else {
      const existing = [
        ...shelvesRef.current.filter(s => s.status === 'occupied' && s.product_barcode).map(s => s.product_barcode),
        ...turnoverRef.current.map(i => i.product_barcode),
        ...pendingItemsRef.current,
        ...outAssignRef.current.map(i => i.barcode)
      ];
      if (existing.includes(bc)) return showAlert(t.msgDupSingle.replace('{bc}', bc));
      setPendingItems(prev => prev.includes(bc) ? prev : [...prev, bc]);
      setSelectedPending(bc);
      if (viewRef.current !== 'inbound') { setCurrentView('inbound'); setActiveWarehouse('North Warehouse'); }
    }
  };

  useEffect(() => {
    if (!currentUser || currentView === 'zebra') return;
    let buf = ''; let tmr;
    const onKey = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey || modal.isOpen || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Enter') { if (buf.trim()) handleSmartScan(buf.trim()); buf = ''; return; }
      if (e.key.length === 1 && /[a-zA-Z0-9\-]/.test(e.key)) { buf += e.key; clearTimeout(tmr); tmr = setTimeout(() => { buf = ''; }, 50); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentView, currentUser, modal.isOpen]);

  const handleAddPendingInbound = (batchInput) => {
    const items = batchInput.split('\n').map(s => s.trim()).filter(Boolean);
    const existing = [...shelves.filter(s => s.status === 'occupied' && s.product_barcode).map(s => s.product_barcode), ...turnoverItems.map(i => i.product_barcode), ...pendingItems, ...outboundAssignItems.map(i => i.barcode)];
    const newItems = []; const dups = [];
    items.forEach(item => { if (existing.includes(item) || newItems.includes(item)) dups.push(item); else newItems.push(item); });
    if (dups.length > 0) showAlert(t.msgDupFilter.replace('{n}', dups.length).replace('{list}', dups.slice(0, 3).join(', ') + (dups.length > 3 ? '...' : '')));
    if (newItems.length > 0) setPendingItems([...pendingItems, ...newItems]);
  };

  const handleRequestRemovePending = (e, itemToRemove) => {
    if (e) e.stopPropagation();
    const items = itemToRemove ? [itemToRemove] : pendingItems;
    if (!items.length) return;
    setModal({ isOpen: true, type: 'three-way', title: t.modalAlert, msg: t.msgRemovePendingControl.replace('{n}', items.length),
      btnConfirm: t.btnReturnToTurnover, btnAlt: t.btnDiscard, btnCancel: t.btnCancel,
      onConfirm: async () => {
        await supabase.from('turnover_inventory').insert(items.map(bc => ({ product_barcode: bc, batch_date: inboundDate, added_by: currentUser })));
        fetchTurnover(); setPendingItems(prev => prev.filter(p => !items.includes(p))); setSelectedPending(null); showAlert(t.msgAutoSuccess);
      },
      onAltConfirm: () => { setPendingItems(prev => prev.filter(p => !items.includes(p))); setSelectedPending(null); }
    });
  };

  const handleAutoAssign = async (zoneStr) => {
    const empty = shelves.filter(s => s.zone === zoneStr && s.status === 'empty');
    if (!empty.length) return showAlert(t.msgNoSpace);
    const n = Math.min(pendingItems.length, empty.length);
    const toAssign = pendingItems.slice(0, n);
    showConfirm(t.msgAutoConfirm.replace('{n}', n).replace('{z}', zoneStr), async () => {
      await Promise.all(toAssign.map((bc, i) => supabase.from('shelves').update({ status: 'occupied', product_barcode: bc, batch_date: inboundDate, last_updated_by: currentUser }).eq('id', empty[i].id)));
      await writeHistory(toAssign.map((bc, i) => ({ shelf_id: empty[i].id, action: 'inbound', product_barcode: bc, operator: currentUser, batch_date: inboundDate })));
      beep(); setPendingItems(pendingItems.slice(n)); setSelectedPending(null); showAlert(t.msgAutoSuccess);
    });
  };

  const handleShelfClickInbound = async (shelf) => {
    if (shelf === 'transfer_all') {
      if (!inboundTransferSelected.length) return;
      showConfirm(t.msgTransferTurnoverConfirm.replace('{n}', inboundTransferSelected.length), async () => {
        await Promise.all(inboundTransferSelected.map(s => supabase.from('shelves').update({ status: 'empty', product_barcode: null, batch_no: null, batch_date: null, last_updated_by: currentUser }).eq('id', s.id)));
        await writeHistory(inboundTransferSelected.map(s => ({ shelf_id: s.id, action: 'outbound_turnover', product_barcode: s.product_barcode, operator: currentUser })));
        await supabase.from('turnover_inventory').insert(inboundTransferSelected.map(s => ({ product_barcode: s.product_barcode, batch_date: s.batch_date, added_by: currentUser })));
        fetchTurnover(); setInboundTransferSelected([]); beep(); showAlert(t.msgAutoSuccess);
      });
      return;
    }
    if (shelf.status === 'occupied') { setInboundTransferSelected(prev => prev.find(p => p.id === shelf.id) ? prev.filter(p => p.id !== shelf.id) : [...prev, shelf]); return; }
    if (selectedPending) {
      const { error } = await supabase.from('shelves').update({ status: 'occupied', product_barcode: selectedPending, batch_date: inboundDate, last_updated_by: currentUser }).eq('id', shelf.id);
      if (!error) {
        await writeHistory([{ shelf_id: shelf.id, action: 'inbound', product_barcode: selectedPending, operator: currentUser, batch_date: inboundDate }]);
        beep(); setPendingItems(pendingItems.filter(i => i !== selectedPending)); setSelectedPending(null);
      } else showAlert(t.msgFail);
      return;
    }
    showAlert(t.msgSelectFirst);
  };

  const handleAddOutboundList = (input) => {
    const barcodes = [...new Set(input.split('\n').map(s => s.trim()).filter(Boolean))];
    let found = []; let notFound = [];
    let avail = shelves.filter(s => s.status === 'occupied' && !outboundPending.find(p => p.id === s.id) && s.warehouse === 'South Warehouse');
    barcodes.forEach(bc => {
      const match = avail.filter(s => s.batch_no === bc || s.product_barcode === bc);
      if (match.length) { found.push(...match); avail = avail.filter(s => !match.map(m => m.id).includes(s.id)); }
      else if (!outboundPending.some(p => p.batch_no === bc || p.product_barcode === bc)) notFound.push(bc);
    });
    const newP = [...outboundPending, ...found].sort((a, b) => a.zone !== b.zone ? a.zone.localeCompare(b.zone) : a.row_idx - b.row_idx);
    setOutboundPending(newP); setOutboundNotFound([...outboundNotFound, ...notFound]);
    if (newP.length) setActiveZone(newP[0].zone);
  };

  const handleRequestRemoveOutboundAssign = (e, itemToRemove) => {
    if (e) e.stopPropagation();
    const items = itemToRemove ? [itemToRemove] : outboundAssignItems;
    if (!items.length) return;
    showConfirm(t.msgRemoveOutboundAssignControl.replace('{n}', items.length), async () => {
      await supabase.from('turnover_inventory').insert(items.map(o => ({ product_barcode: o.barcode, batch_date: inboundDate, added_by: currentUser })));
      fetchTurnover(); setOutboundAssignItems(prev => prev.filter(p => !items.find(i => i.id === p.id))); setSelectedOutboundAssign(null); showAlert(t.msgAutoSuccess);
    });
  };

  const handleAutoAssignOutbound = async (zoneStr) => {
    const empty = shelves.filter(s => s.warehouse === 'South Warehouse' && s.zone === zoneStr && s.status === 'empty');
    if (!empty.length) return showAlert(t.msgNoSpace);
    const n = Math.min(outboundAssignItems.length, empty.length);
    const toAssign = outboundAssignItems.slice(0, n);
    const today = new Date().toISOString().split('T')[0];
    showConfirm(t.msgAutoConfirm.replace('{n}', n).replace('{z}', zoneStr), async () => {
      await Promise.all(toAssign.map((obj, i) => supabase.from('shelves').update({ status: 'occupied', product_barcode: obj.barcode, batch_no: obj.batch_no, batch_date: today, last_updated_by: currentUser }).eq('id', empty[i].id)));
      await writeHistory(toAssign.map((obj, i) => ({ shelf_id: empty[i].id, action: 'inbound', product_barcode: obj.barcode, batch_no: obj.batch_no, operator: currentUser, batch_date: today })));
      setOutboundAssignItems(outboundAssignItems.slice(n)); setSelectedOutboundAssign(null); beep(); showAlert(t.msgAutoSuccess);
    });
  };

  const handleShelfClickOutbound = async (shelf) => {
    if (shelf.status === 'empty' && selectedOutboundAssign) {
      const target = outboundAssignItems.find(i => i.id === selectedOutboundAssign);
      if (!target) return;
      const today = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('shelves').update({ status: 'occupied', product_barcode: target.barcode, batch_no: target.batch_no, batch_date: today, last_updated_by: currentUser }).eq('id', shelf.id);
      if (!error) {
        await writeHistory([{ shelf_id: shelf.id, action: 'inbound', product_barcode: target.barcode, batch_no: target.batch_no, operator: currentUser, batch_date: today }]);
        beep(); setOutboundAssignItems(outboundAssignItems.filter(i => i.id !== selectedOutboundAssign)); setSelectedOutboundAssign(null);
      } else showAlert(t.msgFail);
      return;
    }
    if (shelf.status === 'occupied') {
      setOutboundPending(prev => prev.find(p => p.id === shelf.id) ? prev.filter(p => p.id !== shelf.id) : [...prev, shelf]);
    } else {
      showAlert(outboundAssignItems.length ? t.msgSelectFirst : t.msgEmptyPick);
    }
  };

  const handlePickAllFound = (customerName = '') => {
    if (!outboundPending.length) return;
    showConfirm(t.msgShipConfirm.replace('{n}', outboundPending.length), async () => {
      await Promise.all(outboundPending.map(s => supabase.from('shelves').update({ status: 'empty', product_barcode: null, batch_no: null, batch_date: null, last_updated_by: currentUser }).eq('id', s.id)));
      await writeHistory(outboundPending.map(s => ({ shelf_id: s.id, action: 'outbound_customer', product_barcode: s.product_barcode, batch_no: s.batch_no, operator: currentUser })));
      if (recycledRules.length) {
        await Promise.all(outboundPending.map(async s => {
          const bc = s.product_barcode; if (!bc) return;
          const rule = recycledRules.find(r => bc.startsWith(r.prefix)); if (!rule) return;
          const { data: ex } = await supabase.from('reusable_tracking').select('*').eq('barcode', bc).maybeSingle();
          if (ex) await supabase.from('reusable_tracking').update({ use_count: ex.use_count + 1, current_status: 'ready_to_ship', last_shipped_at: new Date().toISOString() }).eq('barcode', bc);
          else await supabase.from('reusable_tracking').insert({ barcode: bc, use_count: 1, current_status: 'ready_to_ship', last_shipped_at: new Date().toISOString() });
        }));
      }
      // Mark turnover_inventory & production_batches as shipped
      const batchNos = [...new Set(outboundPending.map(s => s.batch_no).filter(Boolean))];
      const shippedAt = new Date().toISOString();
      if (batchNos.length) {
        await Promise.all(batchNos.map(bNo =>
          supabase.from('turnover_inventory')
            .update({ status: 'shipped', updated_at: shippedAt })
            .eq('batch_no', bNo)
        ));
        await Promise.all(batchNos.map(bNo =>
          supabase.from('production_batches')
            .update({ status: 'shipped', customer: customerName, shipped_at: shippedAt })
            .eq('batch_no', bNo)
        ));
      }
      beep(); setOutboundPending([]); fetchTurnover(); showAlert(t.msgAutoSuccess);
    });
  };

  const handleLogout = () => {
    setCurrentUser(null); setPendingItems([]); setOutboundAssignItems([]);
    localStorage.removeItem('wms_pendingItems'); localStorage.removeItem('wms_outboundAssignItems');
  };

  if (!currentUser) return (
    <>
      <Login onLogin={(name, role) => { setCurrentUser(name); setUserRole(role); }} t={t} lang={lang} setLang={setLang} showAlert={showAlert} />
      <GlobalModal modal={modal} closeModal={closeModal} t={t} />
    </>
  );

  return (
    <div className="app-shell">
      <GlobalModal modal={modal} closeModal={closeModal} t={t} />
      <Navbar currentUser={currentUser} userRole={userRole} handleLogout={handleLogout} lang={lang} setLang={setLang} currentView={currentView} setCurrentView={setCurrentView} t={t} theme={theme} toggleTheme={toggleTheme} />

      <div className="main-content">
        {currentView === 'production_record' && <ProductionRecord t={t} lang={lang} />}
        {currentView === 'dashboard' && <Dashboard t={t} lang={lang} shelves={shelves} turnoverItems={turnoverItems} inProductionCount={inProductionCount} showAlert={showAlert} />}
        {currentView === 'zebra'     && <ZebraScanner t={t} currentUser={currentUser} />}
        {currentView === 'reusable'  && <ReusableTracking t={t} lang={lang} showAlert={showAlert} />}
        {currentView === 'mes'       && <MES t={t} lang={lang} currentUser={currentUser} showAlert={showAlert} />}
        {currentView === 'turnover'  && <Turnover t={t} lang={lang} currentUser={currentUser} turnoverItems={turnoverItems} fetchTurnover={fetchTurnover} showAlert={showAlert} showConfirm={showConfirm} setOutboundAssignItems={setOutboundAssignItems} setCurrentView={setCurrentView} setActiveWarehouse={setActiveWarehouse} setPendingItems={setPendingItems} />}
        {currentView === 'inbound'   && <Inbound t={t} lang={lang} currentUser={currentUser} shelves={shelves} turnoverItems={turnoverItems} pendingItems={pendingItems} setPendingItems={setPendingItems} selectedPending={selectedPending} setSelectedPending={setSelectedPending} outboundAssignItems={outboundAssignItems} inboundTransferSelected={inboundTransferSelected} setInboundTransferSelected={setInboundTransferSelected} activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse} activeZone={activeZone} setActiveZone={setActiveZone} showAlert={showAlert} showConfirm={showConfirm} handleRequestRemovePending={handleRequestRemovePending} handleAutoAssign={handleAutoAssign} handleAddPendingInbound={handleAddPendingInbound} handleShelfClickInbound={handleShelfClickInbound} inboundDate={inboundDate} setInboundDate={setInboundDate} />}
        {currentView === 'outbound'  && <Outbound t={t} lang={lang} currentUser={currentUser} shelves={shelves} outboundAssignItems={outboundAssignItems} outboundPending={outboundPending} setOutboundPending={setOutboundPending} outboundNotFound={outboundNotFound} setOutboundNotFound={setOutboundNotFound} activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse} activeZone={activeZone} setActiveZone={setActiveZone} selectedOutboundAssign={selectedOutboundAssign} setSelectedOutboundAssign={setSelectedOutboundAssign} handleAutoAssignOutbound={handleAutoAssignOutbound} handleRequestRemoveOutboundAssign={handleRequestRemoveOutboundAssign} handleAddOutboundList={handleAddOutboundList} handleShelfClickOutbound={handleShelfClickOutbound} handlePickAllFound={handlePickAllFound} />}
        {/* Always-visible Zebra Tool FAB */}
      <ZebraTool t={t} currentUser={currentUser} lang={lang} />

      {currentView === 'map'       && <WarehouseMap t={t} lang={lang} currentView="map" shelves={shelves} activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse} activeZone={activeZone} setActiveZone={setActiveZone} mapZoom={mapZoom} setMapZoom={setMapZoom} />}
      </div>
    </div>
  );
}
