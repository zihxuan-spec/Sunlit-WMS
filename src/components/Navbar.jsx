import React from 'react';

// ── Navigation structure ──────────────────────────────────
const NAV_GROUPS = [
  {
    key: 'report',
    label: 'Report',
    color: '#3b82f6',
    roles: ['Admin', 'Warehouse', 'Production'],
    items: [
      { key: 'dashboard',        label: { en: 'Dashboard',         zh: '儀表板'   } },
      { key: 'production_record',label: { en: 'Production Record', zh: '生產記錄' } },
    ],
  },
  {
    key: 'warehouse',
    label: 'Warehouse',
    color: '#f59e0b',
    roles: ['Admin', 'Warehouse'],
    items: [
      { key: 'inbound',  label: { en: 'Inbound',  zh: '入庫' } },
      { key: 'turnover', label: { en: 'Turnover', zh: '週轉' } },
      { key: 'outbound', label: { en: 'Outbound', zh: '出庫' } },
      { key: 'map',      label: { en: 'Live Map', zh: '地圖' } },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    color: '#8b5cf6',
    roles: ['Admin', 'Production'],
    items: [
      { key: 'mes',      label: { en: 'MES Board',        zh: 'MES'  } },
      { key: 'reusable', label: { en: 'Reusable Tracking',zh: '循環' } },
    ],
  },
  {
    key: 'tool',
    label: 'Tool',
    color: '#14b8a6',
    roles: ['Admin', 'Warehouse', 'Production'],
    items: [
      { key: 'zebra', label: { en: 'Zebra Scanner', zh: 'Zebra' } },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    color: '#e11d48',
    roles: ['Admin'],
    items: [
      { key: 'admin', label: { en: 'Settings', zh: '系統設定' } },
    ],
  },
];

const DOT_COLORS = {
  dashboard:'#3b82f6', production_record:'#60a5fa',
  inbound:'#f59e0b', turnover:'#f59e0b', outbound:'#f59e0b', map:'#f59e0b',
  mes:'#8b5cf6', reusable:'#8b5cf6',
  zebra:'#14b8a6',
  admin:'#e11d48',
};

export default function Navbar({ currentUser, userRole, handleLogout, lang, setLang, currentView, setCurrentView, t, theme, toggleTheme, realtimeOk }) {
  const visibleGroups = NAV_GROUPS.filter(g => g.roles.includes(userRole));

  // Mobile tab items: flatten all visible items, max 5
  const mobileItems = visibleGroups.flatMap(g => g.items).slice(0, 5);

  const roleClass = { Admin: 'role-admin', Warehouse: 'role-warehouse', Production: 'role-prod' }[userRole] || 'role-warehouse';

  return (
    <>
      {/* ── Desktop topbar ── */}
      <div className="topbar">
        <div className="topbar-logo">
          {/* Company logo: place your logo file at /public/logo.png and set COMPANY_LOGO=true */}
          {window.__COMPANY_LOGO__
            ? <img src="/logo.png" alt="Logo" style={{ height: 28, objectFit: 'contain', marginRight: 2 }} />
            : <div className="topbar-logo-mark">S</div>
          }
          <span className="topbar-logo-name">Sunlit WMS</span>
        </div>
        <div className="topbar-divider" />
        <span className="topbar-env">Production</span>
        <div className="topbar-right">
          <span className="topbar-user">{currentUser}</span>
          <span className={`topbar-role ${roleClass}`}>{userRole}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={toggleTheme} style={{ fontSize: 13, padding: '5px 10px' }}>
            {theme === 'dark' ? 'LT' : 'DK'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444', borderColor: '#ef444433' }} onClick={handleLogout}>
            {t.logout}
          </button>
        </div>
      </div>

      {/* ── Desktop sidebar ── */}
      <div className="sidebar">
        {visibleGroups.map(group => (
          <React.Fragment key={group.key}>
            <div className="sidebar-section" style={{ color: group.color }}>{group.label}</div>
            {group.items.map(item => (
              <div key={item.key}
                className={`nav-item ${currentView === item.key ? 'active' : ''}`}
                onClick={() => setCurrentView(item.key)}>
                <div className="nav-dot" style={{ background: DOT_COLORS[item.key] || group.color }} />
                {item.label[lang] || item.label.en}
              </div>
            ))}
          </React.Fragment>
        ))}
        <div className="sidebar-footer">
          <div className="sidebar-status">
            <div className="status-live" style={{ background: realtimeOk ? '#10b981' : '#f59e0b' }} />
            {realtimeOk ? 'Connected · Realtime on' : 'Reconnecting...'}
          </div>
        </div>
      </div>

      {/* ── Mobile topbar ── */}
      <div className="mobile-topbar" style={{ display: 'none' }}>
        <div className="mobile-logo">
          {window.__COMPANY_LOGO__
            ? <img src="/logo.png" alt="Logo" style={{ height: 22, objectFit: 'contain' }} />
            : <div className="mobile-logo-mark">S</div>
          }
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--lt-text)' }}>Sunlit WMS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button style={{ background: 'transparent', border: 'none', fontSize: 13, color: 'var(--lt-text-2)', cursor: 'pointer' }}
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
            <div className="tab-icon-wrap" style={{ fontSize: 10, fontWeight: 700 }}>
              {item.key === 'dashboard' ? 'RPT' :
               item.key === 'production_record' ? 'REC' :
               item.key === 'inbound' ? 'IN' :
               item.key === 'turnover' ? 'TV' :
               item.key === 'outbound' ? 'OUT' :
               item.key === 'map' ? 'MAP' :
               item.key === 'mes' ? 'MES' :
               item.key === 'reusable' ? 'RCY' :
               item.key === 'zebra' ? 'ZBR' : ''}
            </div>
            <span className="tab-label">{item.label[lang] || item.label.en}</span>
          </button>
        ))}
      </div>
    </>
  );
}
