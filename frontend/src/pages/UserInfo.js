import React, { useState } from 'react';
import Sidebar from '../components/ui/Sidebar';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import '../styles/dashboard.css';

export default function UserInfo({ logout }) {
  const [collapsed, setCollapsed] = useState(false);
  const username = localStorage.getItem('username') || 'User';
  const role = localStorage.getItem('role') || 'user';

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(localStorage.getItem('full_name') || username);
  const [email, setEmail] = useState(localStorage.getItem('email') || 'user@example.com');
  const [twofa, setTwofa] = useState(false);

  return (
    <div className="cp-root">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} username={username} role={role} onLogout={logout} />
      <main className={"cp-main " + (collapsed ? 'collapsed' : '')}>
        <h1>My Profile</h1>
        <div className="columns">
          <div style={{ flex: 1 }}>
            <Card>
              <h3>Account</h3>
              <div className="field"><strong>Name:</strong> {name}</div>
              <div className="field"><strong>Email:</strong> {email}</div>
              <div className="field"><strong>Role:</strong> {role}</div>
              <div className="field"><strong>Account Created:</strong> {new Date().toLocaleDateString()}</div>
              <div style={{ marginTop: 12 }}>
                <button className="btn" onClick={() => setEditing(true)}>Edit Profile</button>
                <button className="btn secondary" onClick={() => setTwofa(t => !t)}>{twofa ? 'Disable 2FA' : 'Enable 2FA'}</button>
              </div>
            </Card>

            <Card>
              <h3>Activity</h3>
              <ul className="activity-list">
                <li>Logged in from Windows — {new Date().toLocaleString()}</li>
                <li>Changed password — {new Date().toLocaleString()}</li>
              </ul>
            </Card>
          </div>

          <div style={{ width: 320 }}>
            <Card>
              <h3>Avatar</h3>
              <div className="avatar-large">{(name && name[0]) || 'U'}</div>
              <input type="file" />
            </Card>

            <Card>
              <h3>My Websites</h3>
              <ul>
                <li>example.com — Approved</li>
              </ul>
            </Card>
          </div>
        </div>

        <Modal open={editing} title="Edit profile" onClose={() => setEditing(false)} actions={<><button className="btn" onClick={() => setEditing(false)}>Save</button><button className="btn secondary" onClick={() => setEditing(false)}>Cancel</button></>}>
          <div className="form-row"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="form-row"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </Modal>
      </main>
    </div>
  );
}
