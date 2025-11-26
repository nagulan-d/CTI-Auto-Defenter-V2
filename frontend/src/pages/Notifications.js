import React, { useState } from 'react';
import Sidebar from '../components/ui/Sidebar';
import Card from '../components/ui/Card';
import '../styles/dashboard.css';

export default function Notifications({ logout }) {
  const [collapsed, setCollapsed] = useState(false);
  const username = localStorage.getItem('username') || 'User';
  const role = localStorage.getItem('role') || 'user';

  const [notes, setNotes] = useState([
    { id: 1, type: 'Critical', title: 'Threat detected', body: 'Malicious IP blocked', ts: new Date().toISOString() },
    { id: 2, type: 'Info', title: 'OTX Sync', body: 'OTX updated successfully', ts: new Date().toISOString() },
  ]);

  return (
    <div className="cp-root">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} username={username} role={role} onLogout={logout} />
      <main className={"cp-main " + (collapsed ? 'collapsed' : '')}>
        <h1>Notifications</h1>
        <section>
          <Card>
            <ul className="notifications-list">
              {notes.map(n => (
                <li key={n.id} className={"note " + n.type.toLowerCase()}>
                  <div className="note-left">
                    <div className="note-type">{n.type}</div>
                  </div>
                  <div className="note-main">
                    <div className="note-title">{n.title}</div>
                    <div className="note-body">{n.body}</div>
                  </div>
                  <div className="note-actions">
                    <div className="note-ts">{new Date(n.ts).toLocaleString()}</div>
                    <button className="btn small">View</button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </main>
    </div>
  );
}
