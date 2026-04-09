import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './config/supabaseClient';
import { dict } from './config/i18n';
import MES from './pages/MES';

// 引入元件
import Login from './components/Login';
import Navbar from './components/Navbar';
import GlobalModal from './components/Modals/GlobalModal';
import WarehouseMap from './components/WarehouseMap';

// 引入頁面
import Dashboard from './pages/Dashboard';
import Inbound from './pages/Inbound';
import Outbound from './pages/Outbound';
import Turnover from './pages/Turnover';
import ZebraScanner from './pages/ZebraScanner';

export default function App() {
  const [lang, setLang] = useState('en'); 
  const t = dict[lang];
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('Warehouse');
  const [currentView, setCurrentView] = useState('dashboard'); 

  // Modal State
  const [modal, setModal] = useState({ isOpen: false, type: 'alert', title: '', msg: '', onConfirm: null, onAltConfirm: null, btnConfirm: '', btnAlt: '', btnCancel: '' });
  const showAlert = (msg) => setModal({ isOpen: true, type: 'alert', title: t.modalAlert, msg, onConfirm: null, btnConfirm: t.btnClose });
  const showConfirm = (msg, onConfirm) => setModal({ isOpen: true, type: 'confirm', title: t.modalConfirm, msg, onConfirm, btnConfirm: t.btnConfirm });
  const closeModal = () => setModal({ ...modal, isOpen: false });

  // 核心資料庫 State
  const [shelves, setShelves] = useState([]);
  const [turnoverItems, setTurnoverItems] = useState([]);
  
  // 地圖控制 State
  const [activeWarehouse, setActiveWarehouse] = useState('North Warehouse');
  const [activeZone, setActiveZone] = useState('');

  // 跨頁面工作區 State
  const [pendingItems, setPendingItems] = useState(() => { try { return JSON.parse(localStorage.getItem('wms_pendingItems')) || []; } catch(e) { return []; } });
  const [outboundAssignItems, setOutboundAssignItems] = useState(() => { try { return JSON.parse(localStorage.getItem('wms_outboundAssignItems')) || []; } catch(e) { return []; } });
  const [selectedPending, setSelectedPending] = useState(null);
  const [selectedOutboundAssign, setSelectedOutboundAssign] = useState(null);
  const [inboundTransferSelected, setInboundTransferSelected] = useState([]); 
  const [outboundPending, setOutboundPending] = useState([]); 
  const [outboundNotFound, setOutboundNotFound] = useState([]); 

  // Refs (給鍵盤與 Socket 事件用)
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

  // Zone 切換邏輯
  useEffect(() => {
    if (shelves.length > 0) {
      const currentWhZones = Array.from(new Set(shelves.filter(s => s.warehouse === activeWarehouse).map(s => s.zone))).sort();
      if (currentWhZones.length > 0 && !currentWhZones.includes(activeZone)) setActiveZone(currentWhZones[0]);
    }
  }, [shelves, activeWarehouse, activeZone]);

  // 取資料與 Socket
  const fetchShelves = async () => {
    const { data } = await supabase.from('shelves').select('*').limit(10000).order('id', { ascending: true });
    if (data) setShelves(data);
  };
  const fetchTurnover = async () => {
    const { data } = await supabase.from('turnover_inventory').select('*').order('added_at', { ascending: false });
    if (data) setTurnoverItems(data);
  };
  
  const writeHistory = async (records) => {
    await supabase.from('shelf_history').insert(records);
  };

  useEffect(() => {
    fetchShelves(); fetchTurnover();
    const channel = supabase.channel('custom-all-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shelves' }, fetchShelves)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnover_inventory' }, fetchTurnover)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cloud_scanner' }, (payload) => {
         if (payload.new.operator === currentUser && viewRef.current !== 'zebra') {
            handleSmartScan(payload.new.barcode);
            supabase.from('cloud_scanner').delete().eq('id', payload.new.id).then();
         }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [currentUser]);

  // 鍵盤監聽 (Zebra Scanner)
  const handleSmartScan = (barcodeToSearch) => {
    if (viewRef.current === 'outbound') {
       let availableShelves = shelvesRef.current.filter(s => s.status === 'occupied' && !outPendingRef.current.find(p => p.id === s.id) && s.warehouse === 'South Warehouse');
       let matching = availableShelves.filter(s => s.batch_no === barcodeToSearch || s.product_barcode === barcodeToSearch);
       if (matching.length > 0) {
           setOutboundPending(prev => {
               const newArr = [...prev, ...matching];
               newArr.sort((a, b) => { if(a.zone !== b.zone) return a.zone.localeCompare(b.zone); return a.row_idx - b.row_idx; });
               return newArr;
           });
           setActiveZone(matching[0].zone);
       } else {
           const alreadySelected = outPendingRef.current.some(p => p.batch_no === barcodeToSearch || p.product_barcode === barcodeToSearch);
           if (!alreadySelected) setOutboundNotFound(prev => prev.includes(barcodeToSearch) ? prev : [...prev, barcodeToSearch]);
       }
    } else {
       const existingBarcodes = [...shelvesRef.current.filter(s => s.status === 'occupied' && s.product_barcode).map(s => s.product_barcode), ...turnoverRef.current.map(t => t.product_barcode), ...pendingItemsRef.current, ...outAssignRef.current.map(i => i.barcode)];
       if (existingBarcodes.includes(barcodeToSearch)) return showAlert(t.msgDupSingle.replace('{bc}', barcodeToSearch));

       setPendingItems(prev => prev.includes(barcodeToSearch) ? prev : [...prev, barcodeToSearch]);
       setSelectedPending(barcodeToSearch);
       if (viewRef.current !== 'inbound') { setCurrentView('inbound'); setActiveWarehouse('North Warehouse'); }
    }
  };

  useEffect(() => {
    if (!currentUser || currentView === 'zebra') return; 
    let buffer = ''; let timer;
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey || modal.isOpen || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; 
      if (e.key === 'Enter') { if (buffer.trim()) handleSmartScan(buffer.trim()); buffer = ''; return; }
      if (e.key.length === 1 && /[a-zA-Z0-9\-]/.test(e.key)) {
        buffer += e.key; clearTimeout(timer); timer = setTimeout(() => { buffer = ''; }, 50); 
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, currentUser, modal.isOpen]);

  // ---- Inbound 共用方法 ----
  const handleAddPendingInbound = (batchInput) => {
    const items = batchInput.split('\n').map(s => s.trim()).filter(Boolean);
    const existingBarcodes = [...shelves.filter(s => s.status === 'occupied' && s.product_barcode).map(s => s.product_barcode), ...turnoverItems.map(t => t.product_barcode), ...pendingItems, ...outboundAssignItems.map(i => i.barcode)];
    const newItems = []; const duplicates = [];
    items.forEach(item => { if (existingBarcodes.includes(item) || newItems.includes(item)) duplicates.push(item); else newItems.push(item); });
    if (duplicates.length > 0) showAlert(t.msgDupFilter.replace('{n}', duplicates.length).replace('{list}', duplicates.slice(0, 3).join(', ') + (duplicates.length > 3 ? '...' : '')));
    if (newItems.length > 0) setPendingItems([...pendingItems, ...newItems]);
  };

  const handleRequestRemovePending = (e, itemToRemove) => {
     if (e) e.stopPropagation();
     const items = itemToRemove ? [itemToRemove] : pendingItems;
     if (items.length === 0) return;
     setModal({
       isOpen: true, type: 'three-way', title: t.modalAlert, msg: t.msgRemovePendingControl.replace('{n}', items.length), btnConfirm: t.btnReturnToTurnover, btnAlt: t.btnDiscard, btnCancel: t.btnCancel,
       onConfirm: async () => {
          const todayDate = new Date().toISOString().split('T')[0];
          await supabase.from('turnover_inventory').insert(items.map(bc => ({ product_barcode: bc, batch_date: todayDate, added_by: currentUser })));
          fetchTurnover();
          setPendingItems(prev => prev.filter(p => !items.includes(p)));
          setSelectedPending(null); showAlert(t.msgAutoSuccess);
       },
       onAltConfirm: () => { setPendingItems(prev => prev.filter(p => !items.includes(p))); setSelectedPending(null); }
     });
  };

  const handleAutoAssign = async (zoneStr) => {
    const emptyShelves = shelves.filter(s => s.zone === zoneStr && s.status === 'empty');
    if (emptyShelves.length === 0) return showAlert(t.msgNoSpace);
    const assignCount = Math.min(pendingItems.length, emptyShelves.length);
    const itemsToAssign = pendingItems.slice(0, assignCount);
    const todayDate = new Date().toISOString().split('T')[0];
    
    showConfirm(t.msgAutoConfirm.replace('{n}', assignCount).replace('{z}', zoneStr), async () => {
      await Promise.all(itemsToAssign.map((bc, idx) => supabase.from('shelves').update({ status: 'occupied', product_barcode: bc, batch_date: todayDate, last_updated_by: currentUser }).eq('id', emptyShelves[idx].id)));
      await writeHistory(itemsToAssign.map((bc, idx) => ({ shelf_id: emptyShelves[idx].id, action: 'inbound', product_barcode: bc, operator: currentUser, batch_date: todayDate })));
      setPendingItems(pendingItems.slice(assignCount)); setSelectedPending(null); showAlert(t.msgAutoSuccess); fetchShelves();
    });
  };

  const handleShelfClickInbound = async (shelf) => {
    if (shelf === 'transfer_all') {
      if(inboundTransferSelected.length === 0) return;
      showConfirm(t.msgTransferTurnoverConfirm.replace('{n}', inboundTransferSelected.length), async () => {
        await Promise.all(inboundTransferSelected.map(s => supabase.from('shelves').update({ status: 'empty', product_barcode: null, batch_no: null, batch_date: null, last_updated_by: currentUser }).eq('id', s.id)));
        await writeHistory(inboundTransferSelected.map(s => ({ shelf_id: s.id, action: 'outbound_turnover', product_barcode: s.product_barcode, operator: currentUser })));
        await supabase.from('turnover_inventory').insert(inboundTransferSelected.map(s => ({ product_barcode: s.product_barcode, batch_date: s.batch_date, added_by: currentUser })));
        fetchTurnover(); setInboundTransferSelected([]); showAlert(t.msgAutoSuccess); fetchShelves();
      });
      return;
    }
    if (shelf.status === 'occupied') {
       setInboundTransferSelected(prev => prev.find(p => p.id === shelf.id) ? prev.filter(p => p.id !== shelf.id) : [...prev, shelf]);
       return; 
    }
    if (selectedPending) {
      const todayDate = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('shelves').update({ status: 'occupied', product_barcode: selectedPending, batch_date: todayDate, last_updated_by: currentUser }).eq('id', shelf.id);
      if (!error) {
        await writeHistory([{ shelf_id: shelf.id, action: 'inbound', product_barcode: selectedPending, operator: currentUser, batch_date: todayDate }]);
        setPendingItems(pendingItems.filter(item => item !== selectedPending)); setSelectedPending(null); fetchShelves();
      } else showAlert(t.msgFail);
      return;
    }
    showAlert(t.msgSelectFirst);
  };

  // ---- Outbound 共用方法 ----
  const handleAddOutboundList = (outboundInput) => {
    const barcodes = [...new Set(outboundInput.split('\n').map(s => s.trim()).filter(Boolean))];
    let tempFound = []; let tempNotFound = [];
    let availableShelves = shelves.filter(s => s.status === 'occupied' && !outboundPending.find(p => p.id === s.id) && s.warehouse === 'South Warehouse');
    barcodes.forEach(bc => {
      let matching = availableShelves.filter(s => s.batch_no === bc || s.product_barcode === bc);
      if (matching.length > 0) { tempFound.push(...matching); availableShelves = availableShelves.filter(s => !matching.map(m=>m.id).includes(s.id)); }
      else if (!outboundPending.some(p => p.batch_no === bc || p.product_barcode === bc)) tempNotFound.push(bc);
    });
    let newPending = [...outboundPending, ...tempFound].sort((a, b) => { if(a.zone !== b.zone) return a.zone.localeCompare(b.zone); return a.row_idx - b.row_idx; });
    setOutboundPending(newPending); setOutboundNotFound([...outboundNotFound, ...tempNotFound]);
    if (newPending.length > 0) setActiveZone(newPending[0].zone); 
  };

  const handleRequestRemoveOutboundAssign = (e, itemObjToRemove) => {
     if (e) e.stopPropagation();
     const items = itemObjToRemove ? [itemObjToRemove] : outboundAssignItems;
     if (items.length === 0) return;
     showConfirm(t.msgRemoveOutboundAssignControl.replace('{n}', items.length), async () => {
         const todayDate = new Date().toISOString().split('T')[0];
         await supabase.from('turnover_inventory').insert(items.map(obj => ({ product_barcode: obj.barcode, batch_date: todayDate, added_by: currentUser })));
         fetchTurnover();
         setOutboundAssignItems(prev => prev.filter(p => !items.find(i => i.id === p.id)));
         setSelectedOutboundAssign(null); showAlert(t.msgAutoSuccess);
     });
  };

  const handleAutoAssignOutbound = async (zoneStr) => {
    const emptyShelves = shelves.filter(s => s.warehouse === 'South Warehouse' && s.zone === zoneStr && s.status === 'empty');
    if (emptyShelves.length === 0) return showAlert(t.msgNoSpace);
    const assignCount = Math.min(outboundAssignItems.length, emptyShelves.length);
    const itemsToAssign = outboundAssignItems.slice(0, assignCount);
    const todayDate = new Date().toISOString().split('T')[0];
    showConfirm(t.msgAutoConfirm.replace('{n}', assignCount).replace('{z}', zoneStr), async () => {
      await Promise.all(itemsToAssign.map((itemObj, idx) => supabase.from('shelves').update({ status: 'occupied', product_barcode: itemObj.barcode, batch_no: itemObj.batch_no, batch_date: todayDate, last_updated_by: currentUser }).eq('id', emptyShelves[idx].id)));
      await writeHistory(itemsToAssign.map((itemObj, idx) => ({ shelf_id: emptyShelves[idx].id, action: 'inbound', product_barcode: itemObj.barcode, batch_no: itemObj.batch_no, operator: currentUser, batch_date: todayDate })));
      setOutboundAssignItems(outboundAssignItems.slice(assignCount)); setSelectedOutboundAssign(null); showAlert(t.msgAutoSuccess); fetchShelves();
    });
  };

  const handleShelfClickOutbound = async (shelf) => {
    if (shelf.status === 'empty' && selectedOutboundAssign) {
      const targetObj = outboundAssignItems.find(i => i.id === selectedOutboundAssign);
      if (!targetObj) return;
      const todayDate = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('shelves').update({ status: 'occupied', product_barcode: targetObj.barcode, batch_no: targetObj.batch_no, batch_date: todayDate, last_updated_by: currentUser }).eq('id', shelf.id);
      if (!error) {
        await writeHistory([{ shelf_id: shelf.id, action: 'inbound', product_barcode: targetObj.barcode, batch_no: targetObj.batch_no, operator: currentUser, batch_date: todayDate }]);
        setOutboundAssignItems(outboundAssignItems.filter(item => item.id !== selectedOutboundAssign)); setSelectedOutboundAssign(null); fetchShelves();
      } else showAlert(t.msgFail);
      return;
    }
    if (shelf.status === 'occupied') {
       setOutboundPending(prev => prev.find(p => p.id === shelf.id) ? prev.filter(p => p.id !== shelf.id) : [...prev, shelf]);
    } else {
       if (outboundAssignItems.length > 0) showAlert(t.msgSelectFirst); else showAlert(t.msgEmptyPick);
    }
  };

  const handlePickAllFound = () => {
    if(outboundPending.length === 0) return;
    showConfirm(t.msgShipConfirm.replace('{n}', outboundPending.length), async () => {
      await Promise.all(outboundPending.map(shelf => supabase.from('shelves').update({ status: 'empty', product_barcode: null, batch_no: null, batch_date: null, last_updated_by: currentUser }).eq('id', shelf.id)));
      await writeHistory(outboundPending.map(shelf => ({ shelf_id: shelf.id, action: 'outbound_customer', product_barcode: shelf.product_barcode, batch_no: shelf.batch_no, operator: currentUser })));
      setOutboundPending([]); showAlert(t.msgAutoSuccess); fetchShelves();
    });
  };

  // 登出邏輯
  const handleLogout = () => {
    setCurrentUser(null); setPendingItems([]); setOutboundAssignItems([]);
    localStorage.removeItem('wms_pendingItems'); localStorage.removeItem('wms_outboundAssignItems');
  };

  // Render -----------------------------
  if (!currentUser) return <><Login onLogin={(name, role) => { setCurrentUser(name); setUserRole(role); }} t={t} lang={lang} setLang={setLang} showAlert={showAlert} />;

  return (
    <div>
      <GlobalModal modal={modal} closeModal={closeModal} t={t} />
      <Navbar currentUser={currentUser} handleLogout={handleLogout} lang={lang} setLang={setLang} currentView={currentView} setCurrentView={setCurrentView} t={t} />

      {currentView === 'dashboard' && <Dashboard t={t} lang={lang} shelves={shelves} turnoverItems={turnoverItems} showAlert={showAlert} />}
      {currentView === 'zebra' && <ZebraScanner t={t} currentUser={currentUser} />}
      {currentView === 'turnover' && <Turnover t={t} lang={lang} turnoverItems={turnoverItems} fetchTurnover={fetchTurnover} showAlert={showAlert} showConfirm={showConfirm} setPendingItems={setPendingItems} setOutboundAssignItems={setOutboundAssignItems} setCurrentView={setCurrentView} setActiveWarehouse={setActiveWarehouse} />}
      {currentView === 'mes' && <MES t={t} lang={lang} currentUser={currentUser} showAlert={showAlert} />}
      
      {currentView === 'inbound' && (
        <Inbound 
          t={t} lang={lang} currentUser={currentUser} shelves={shelves} turnoverItems={turnoverItems}
          pendingItems={pendingItems} setPendingItems={setPendingItems} selectedPending={selectedPending} setSelectedPending={setSelectedPending}
          outboundAssignItems={outboundAssignItems} inboundTransferSelected={inboundTransferSelected} setInboundTransferSelected={setInboundTransferSelected}
          activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse} activeZone={activeZone} setActiveZone={setActiveZone}
          showAlert={showAlert} showConfirm={showConfirm} handleRequestRemovePending={handleRequestRemovePending} handleAutoAssign={handleAutoAssign}
          handleAddPendingInbound={handleAddPendingInbound} handleShelfClickInbound={handleShelfClickInbound}
        />
      )}

      {currentView === 'outbound' && (
        <Outbound 
          t={t} lang={lang} currentUser={currentUser} shelves={shelves} 
          outboundAssignItems={outboundAssignItems} outboundPending={outboundPending} setOutboundPending={setOutboundPending}
          outboundNotFound={outboundNotFound} setOutboundNotFound={setOutboundNotFound}
          activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse} activeZone={activeZone} setActiveZone={setActiveZone}
          selectedOutboundAssign={selectedOutboundAssign} setSelectedOutboundAssign={setSelectedOutboundAssign}
          handleAutoAssignOutbound={handleAutoAssignOutbound} handleRequestRemoveOutboundAssign={handleRequestRemoveOutboundAssign}
          handleAddOutboundList={handleAddOutboundList} handleShelfClickOutbound={handleShelfClickOutbound} handlePickAllFound={handlePickAllFound}
        />
      )}

      {currentView === 'map' && (
        <WarehouseMap 
          t={t} lang={lang} currentView="map" shelves={shelves}
          activeWarehouse={activeWarehouse} setActiveWarehouse={setActiveWarehouse} activeZone={activeZone} setActiveZone={setActiveZone}
        />
      )}
    </div>
  );
}
