import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { socket } from '../api/socket.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '◈', end: true },
  { to: '/campaigns', label: 'Campaigns', icon: '✉' },
  { to: '/students', label: 'Students', icon: '◍' },
  { to: '/templates', label: 'Templates', icon: '❏' },
  { to: '/reports', label: 'Reports', icon: '📊' },
];

const TITLES = {
  '/': 'Dashboard',
  '/campaigns': 'Campaigns',
  '/students': 'Students',
  '/templates': 'Message Templates',
  '/reports': 'Reports & Analytics',
};

export default function Layout({ children }) {
  const { admin, logout } = useAuth();
  const { pathname } = useLocation();
  const [live, setLive] = useState(socket.connected);

  useEffect(() => {
    const on = () => setLive(true);
    const off = () => setLive(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);

  const title =
    TITLES[pathname] ||
    (pathname.startsWith('/campaigns/') ? 'Campaign Detail' : 'WhatsApp Campaign Manager');

  const initials = (admin?.name || 'A')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">🟢</div>
          <div>
            WA Campaigns
            <small>EdTech Notification System</small>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-label">Main</div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <span className="ico">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="foot">
          Meta WhatsApp Cloud API
          <br />
          Queue · BullMQ + Redis
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="page-title">{title}</div>
          <div className="right">
            <span className={`live-dot ${live ? '' : 'off'}`}>
              <span className="pulse" />
              {live ? 'Live' : 'Offline'}
            </span>
            <div className="avatar" title={admin?.email}>{initials}</div>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
