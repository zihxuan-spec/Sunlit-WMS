import React from 'react';

const NAV_ITEMS = {
  warehouse: [
    { key: 'dashboard', icon: '⊞', label: { en: 'Dashboard', zh: '總覽' } },
    { key: 'inbound',   icon: '↓',  label: { en: 'Inbound',   zh: '入庫' } },
    { key: 'turnover',  icon: '⇄',  label: { en: 'Turnover',  zh: '週轉' } },
    { key: 'outbound',  icon: '↑',  label: { en: 'Outbound',  zh: '出庫' } },
    { key: 'map',       icon: '⊙',  label: { en: 'Map',       zh: '地圖' } },
    { key: 'zebra',     icon: '▤',  label: { en: 'Zebra',     zh: '掃描' } },
  ],
  production: [
    { key: 'mes',      icon: '⚙',  label: { en: 'MES',      zh: 'MES' } },
    { key: 'reusable', icon: '↻',  label: { en: 'Reusable', zh: '循環' } },
  ],
};

const DOT_COLORS = {
  dashboard: '#3b82f6', inbound: '#6b7280', turnover: '#f59e0b',
  outbound: '#6b7280', map: '#6b7280', zebra: '#374151',
  mes: '#8b5cf6', reusable: '#14b8a6',
};

export default function Navbar({ currentUser, userRole, handleLogout, lang, setLang, currentView, setCurrentView, t, theme, toggleTheme }) {
  const isWH   = userRole === 'Admin' || userRole === 'Warehouse';
  const isProd = userRole === 'Admin' || userRole === 'Production';

  const allItems = [
    ...(isWH   ? NAV_ITEMS.warehouse  : []),
    ...(isProd ? NAV_ITEMS.production : []),
  ];

  // Visible items for bottom tabbar (max 6 on mobile)
  const mobileItems = allItems.slice(0, 6);

  const roleClass = { Admin: 'role-admin', Warehouse: 'role-warehouse', Production: 'role-prod' }[userRole] || 'role-warehouse';

  return (
    <>
      {/* ── Desktop topbar ── */}
      <div className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-mark">W</div>
          Sunlit WMS · MES
        </div>
        <div className="topbar-divider" />
        <span className="topbar-env">Production</span>
        <div className="topbar-right">
          <span className="topbar-user">{currentUser}</span>
          <span className={`topbar-role ${roleClass}`}>{userRole}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={toggleTheme} title="Toggle theme"
            style={{ fontSize: 14, padding: '5px 10px' }}>
            {theme === 'dark' ? '☀' : '◑'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444', borderColor: '#ef444433' }} onClick={handleLogout}>
            {t.logout}
          </button>
        </div>
      </div>

      {/* ── Desktop sidebar ── */}
      <div className="sidebar">
        {isWH && (
          <>
            <div className="sidebar-section">Warehouse</div>
            {NAV_ITEMS.warehouse.map(item => (
              <div key={item.key} className={`nav-item ${currentView === item.key ? 'active' : ''}`}
                onClick={() => setCurrentView(item.key)}>
                <div className="nav-dot" style={{ background: DOT_COLORS[item.key] }} />
                {item.label[lang] || item.label.en}
              </div>
            ))}
          </>
        )}
        {isProd && (
          <>
            <div className="sidebar-section">Production</div>
            {NAV_ITEMS.production.map(item => (
              <div key={item.key} className={`nav-item ${currentView === item.key ? 'active' : ''}`}
                onClick={() => setCurrentView(item.key)}>
                <div className="nav-dot" style={{ background: DOT_COLORS[item.key] }} />
                {item.label[lang] || item.label.en}
              </div>
            ))}
          </>
        )}
        <div className="sidebar-footer">
          <div className="sidebar-status">
            <div className="status-live" />
            Connected · Realtime on
          </div>
        </div>
      </div>

      {/* ── Mobile topbar ── */}
      <div className="mobile-topbar" style={{ display: 'none' }}>
        <div className="mobile-logo">
          <div className="mobile-logo-mark">W</div>
          Sunlit WMS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button style={{ background: 'transparent', border: 'none', fontSize: 14, color: 'var(--lt-text-2)', cursor: 'pointer' }}
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {lang === 'zh' ? 'EN' : '中'}
          </button>
          <div className="mobile-user">{currentUser}</div>
        </div>
      </div>

      {/* ── Mobile bottom tabbar ── */}
      <div className="bottom-tabbar" style={{ display: 'none' }}>
        {mobileItems.map(item => (
          <button key={item.key} className={`tab-btn ${currentView === item.key ? 'active' : ''}`}
            onClick={() => setCurrentView(item.key)}>
            <div className="tab-icon-wrap">{item.icon}</div>
            <span className="tab-label">{item.label[lang] || item.label.en}</span>
          </button>
        ))}
        {/* Logout on mobile if space */}
        {mobileItems.length < 6 && (
          <button className="tab-btn" onClick={handleLogout}>
            <div className="tab-icon-wrap">⏏</div>
            <span className="tab-label">{t.logout}</span>
          </button>
        )}
      </div>
    </>
  );
}
