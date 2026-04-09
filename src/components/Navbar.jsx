import React from 'react';

export default function Navbar({ currentUser, userRole, handleLogout, lang, setLang, currentView, setCurrentView, t }) {
  const handleNavClick = (viewName) => setCurrentView(viewName);

  return (
    <>
      <div className="top-header">
        <h1 style={{ margin: 0, fontSize: '28px' }}>{t.appTitle}</h1>
        <div className="header-actions">
          <div className="user-badge" style={{background: userRole === 'Admin' ? '#ffebee' : '#e3f2fd', color: userRole === 'Admin' ? '#c62828' : '#0071e3'}}>
             👤 {currentUser} ({userRole})
          </div>
          <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>🌐 {t.switchLang}</button>
          <button className="btn btn-danger" style={{ padding: '8px 12px' }} onClick={handleLogout}>{t.logout}</button>
        </div>
      </div>
      
      <div className="nav-bar">
        {/* 只有 Admin 或 Warehouse 看得到 WMS 功能 */}
        {(userRole === 'Admin' || userRole === 'Warehouse') && (
          <>
            <button className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => handleNavClick('dashboard')}>{t.navDash}</button>
            <button className={`nav-btn ${currentView === 'inbound' ? 'active' : ''}`} onClick={() => handleNavClick('inbound')}>{t.navIn}</button>
            <button className={`nav-btn ${currentView === 'turnover' ? 'active' : ''}`} onClick={() => handleNavClick('turnover')}>{t.navTurnover}</button>
            <button className={`nav-btn ${currentView === 'outbound' ? 'active' : ''}`} onClick={() => handleNavClick('outbound')}>{t.navOut}</button>
            <button className={`nav-btn ${currentView === 'map' ? 'active' : ''}`} onClick={() => handleNavClick('map')}>{t.navMap}</button>
            <button className={`nav-btn zebra-btn ${currentView === 'zebra' ? 'active' : ''}`} onClick={() => handleNavClick('zebra')}>{t.navZebra}</button>
          </>
        )}

        {/* 只有 Admin 或 Production 看得到 MES 功能 */}
        {(userRole === 'Admin' || userRole === 'Production') && (
          <>
            <button className={`nav-btn ${currentView === 'mes' ? 'active' : ''}`} style={{background: currentView === 'mes' ? '#9c27b0' : '#e1bee7', color: currentView === 'mes' ? '#fff' : '#4a148c'}} onClick={() => handleNavClick('mes')}>{t.navMES}</button>
            <button className={`nav-btn ${currentView === 'reusable' ? 'active' : ''}`} style={{background: currentView === 'reusable' ? '#009688' : '#b2dfdb', color: currentView === 'reusable' ? '#fff' : '#004d40'}} onClick={() => handleNavClick('reusable')}>{t.navReusable}</button>
          </>
        )}
      </div>
    </>
  );
}
