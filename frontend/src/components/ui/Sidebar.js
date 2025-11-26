import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

export default function Sidebar({ collapsed, setCollapsed, username, role, onLogout }) {
  const navigate = useNavigate();

  const menu = [
    { to: '/overview', label: 'Overview', icon: '🏠' },
    { to: '/threats', label: 'Threats', icon: '⚠️' },
    { to: '/sites', label: 'My Sites', icon: '🗂️' },
    { to: '/publish', label: 'Publish', icon: '🚀' },
    { to: '/analytics', label: 'Analytics', icon: '📊' },
    { to: '/integrations', label: 'Integrations', icon: '🔗' },
    { to: '/notifications', label: 'Notifications', icon: '🔔' },
    { to: '/settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <aside className={"cp-sidebar " + (collapsed ? 'collapsed' : '')} aria-label="Main sidebar">
      <div className="cp-sidebar-top">
        <div className="brand" onClick={() => navigate('/overview')}>
          <div className="logo">CP</div>
          {!collapsed && <div className="brand-text">CyberProtect</div>}
        </div>
        <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <nav className="cp-nav">
        {menu.map((m) => (
          <NavLink key={m.to} to={m.to} className={({ isActive }) => 'cp-nav-item' + (isActive ? ' active' : '')} title={collapsed ? m.label : ''}>
            <span className="cp-icon">{m.icon}</span>
            {!collapsed && <span className="cp-label">{m.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="cp-sidebar-bottom">
        <div className="user-row" title={username}>
          <div className="avatar">{(username && username[0]) || 'U'}</div>
          {!collapsed && (
            <div className="user-meta">
              <div className="user-name">{username || 'Guest'}</div>
              <div className="user-role">{role || 'User'}</div>
            </div>
          )}
        </div>
        <div className="bottom-actions">
          {!collapsed && <button className="link-btn" onClick={() => navigate('/profile')}>Account</button>}
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </div>
    </aside>
  );
}
