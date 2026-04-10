import React from 'react';

export default function Navbar({ currentUser, userRole, handleLogout, lang, setLang, currentView, setCurrentView, t }) {
  return (
    <>
      <div className="top-header">
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>{t.appTitle}</h1>
        <div className="header-actions">
          <div className="user-badge"
            style={{ background: userRole === 'Admin' ? '#ffebee' : userRole === 'Production' ? '#f3e5f5' : 'var(--bg-section-blue)',
                     color: userRole === 'Admin' ? '#c62828' : userRole === 'Production' ? '#6a1b9a' : 'var(--primary)' }}>
            👤 {currentUser} <span style={{ opacity: 0.7, fontSize: '12px' }}>({userRole})</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>🌐 {t.switchLang}</button>
          <button className="btn btn-danger btn-sm" onClick={handleLogout}>{t.logout}</button>
        </div>
      </div>

      <div className="nav-bar">
        {(userRole === 'Admin' || userRole === 'Warehouse') && (<>
          <button className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}>{t.navDash}</button>
          <button className={`nav-btn ${currentView === 'inbound' ? 'active' : ''}`} onClick={() => setCurrentView('inbound')}>{t.navIn}</button>
          <button className={`nav-btn ${currentView === 'turnover' ? 'active' : ''}`} onClick={() => setCurrentView('turnover')}>{t.navTurnover}</button>
          <button className={`nav-btn ${currentView === 'outbound' ? 'active' : ''}`} onClick={() => setCurrentView('outbound')}>{t.navOut}</button>
          <button className={`nav-btn ${currentView === 'map' ? 'active' : ''}`} onClick={() => setCurrentView('map')}>{t.navMap}</button>
          <button className={`nav-btn zebra-btn ${currentView === 'zebra' ? 'active' : ''}`} onClick={() => setCurrentView('zebra')}>{t.navZebra}</button>
        </>)}
        {(userRole === 'Admin' || userRole === 'Production') && (<>
          <button className={`nav-btn nav-mes ${currentView === 'mes' ? 'active' : ''}`} onClick={() => setCurrentView('mes')}>{t.navMES}</button>
          <button className={`nav-btn nav-reusable ${currentView === 'reusable' ? 'active' : ''}`} onClick={() => setCurrentView('reusable')}>{t.navReusable}</button>
        </>)}
      </div>
    </>
  );
}
