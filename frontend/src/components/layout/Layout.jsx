import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWs } from '../../context/WsContext';
import api from '../../services/api';
import './Layout.css';

const NAV = [
  { to: '/', icon: '⊞', label: 'Dashboard', exact: true },
  { to: '/players', icon: '♟', label: 'Players' },
  { to: '/posts', icon: '📍', label: 'Find Game' },
  { to: '/events', icon: '🏆', label: 'Events' },
  { to: '/games', icon: '📊', label: 'Games' },
  { to: '/messages', icon: '✉', label: 'Messages' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { subscribe } = useWs();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api.notifications.unreadCount().then((d) => setUnread(d.count)).catch(() => {});
  }, []);

  useEffect(() => {
    return subscribe('notification', () => {
      setUnread((n) => n + 1);
    });
  }, [subscribe]);

  return (
    <div className="layout">
      <header className="header">
        <div className="header-brand" onClick={() => navigate('/')}>
          <span className="brand-icon">♔</span>
          <span className="brand-name">LocalChess</span>
        </div>
        <nav className="header-nav">
          {NAV.map(({ to, icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="header-right">
          <button
            className="notif-btn"
            onClick={() => navigate('/settings#notifications')}
          >
            🔔
            {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <div className="user-menu-wrapper">
            <button
              className="user-menu-btn"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <div className="user-avatar">
                {user?.avatar_url
                  ? <img src={user.avatar_url} alt="" />
                  : <span>{user?.username?.[0]?.toUpperCase()}</span>
                }
              </div>
              <span className="user-name">{user?.username}</span>
              <span>▾</span>
            </button>
            {menuOpen && (
              <div className="user-dropdown" onClick={() => setMenuOpen(false)}>
                <NavLink to={`/profile/${user?.id}`}>My Profile</NavLink>
                <NavLink to="/settings">Settings</NavLink>
                <NavLink to="/calibration">Rating Calibration</NavLink>
                <hr />
                <button onClick={logout}>Sign Out</button>
              </div>
            )}
          </div>
        </div>
        <button className="mobile-menu-btn" onClick={() => setMenuOpen((o) => !o)}>☰</button>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
