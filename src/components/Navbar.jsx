import React from 'react';

export default function Navbar({ currentUser, handleLogout, lang, setLang, currentView, setCurrentView, t }) {
  
  // 為了確保切換頁面時能順便設定預設的倉庫，我們包裝一下切換邏輯
  const handleNavClick = (viewName) => {
    setCurrentView(viewName);
  };

  return (
    <>
      <div className="top-header">
        <h1 style={{ margin: 0, fontSize: '28px' }}>{t.appTitle}</h1>
        <div className="header-actions">
          <div className="user-badge">👤 {currentUser}</div>
          <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            🌐 {t.switchLang}
          </button>
          <button className="btn btn-danger" style={{ padding: '8px 12px' }} onClick={handleLogout}>
            {t.logout}
          </button>
        </div>
      </div>
      
      <div className="nav-bar">
        <button className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => handleNavClick('dashboard')}>{t.navDash}</button>
        <button className={`nav-btn ${currentView === 'inbound' ? 'active' : ''}`} onClick={() => handleNavClick('inbound')}>{t.navIn}</button>
        <button className={`nav-btn ${currentView === 'turnover' ? 'active' : ''}`} onClick={() => handleNavClick('turnover')}>{t.navTurnover}</button>
        <button className={`nav-btn ${currentView === 'outbound' ? 'active' : ''}`} onClick={() => handleNavClick('outbound')}>{t.navOut}</button>
        <button className={`nav-btn ${currentView === 'map' ? 'active' : ''}`} onClick={() => handleNavClick('map')}>{t.navMap}</button>
        <button className={`nav-btn zebra-btn ${currentView === 'zebra' ? 'active' : ''}`} onClick={() => handleNavClick('zebra')}>{t.navZebra}</button>
      </div>
    </>
  );
}