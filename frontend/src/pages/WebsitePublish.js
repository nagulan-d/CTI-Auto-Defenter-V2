import React, { useState } from 'react';
import Sidebar from '../components/ui/Sidebar';
import Card from '../components/ui/Card';
import '../styles/dashboard.css';

function validateUrl(value) {
  try { new URL(value); return true; } catch { return false; }
}

export default function WebsitePublish({ logout }) {
  const [collapsed, setCollapsed] = useState(false);
  const username = localStorage.getItem('username') || 'User';
  const role = localStorage.getItem('role') || 'user';

  const [sites, setSites] = useState(() => JSON.parse(localStorage.getItem('sites') || '[]'));
  const [form, setForm] = useState({ url: '', category: '', monitoring: 'basic', notes: '' });
  const [error, setError] = useState('');

  const limit = (localStorage.getItem('subscribed') === 'true') ? 5 : 1;

  function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.url || !validateUrl(form.url)) return setError('Enter a valid URL');
    if (sites.length >= limit) return setError('Limit reached');
    const next = [...sites, { ...form, id: Date.now(), status: 'Pending', lastScanned: null, score: null }];
    setSites(next);
    localStorage.setItem('sites', JSON.stringify(next));
    // send to admin endpoint (placeholder)
    setForm({ url: '', category: '', monitoring: 'basic', notes: '' });
  }

  return (
    <div className="cp-root">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} username={username} role={role} onLogout={logout} />
      <main className={"cp-main " + (collapsed ? 'collapsed' : '')}>
        <h1>Website Publish</h1>

        <section className="columns">
          <div style={{ flex: 1 }}>
            <Card>
              <h3>Add Website</h3>
              <form onSubmit={submit} className="form">
                <label>Website URL</label>
                <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
                <label>Category</label>
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                <label>Monitoring</label>
                <select value={form.monitoring} onChange={(e) => setForm({ ...form, monitoring: e.target.value })}>
                  <option value="basic">Basic</option>
                  <option value="advanced">Advanced</option>
                </select>
                <label>Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                {error && <div className="error small">{error}</div>}
                <div style={{ marginTop: 10 }}>
                  <button className="btn" type="submit">Add Website</button>
                </div>
              </form>
            </Card>

            <Card>
              <h3>Your Websites</h3>
              <table className="site-table">
                <thead><tr><th>URL</th><th>Status</th><th>Last Scan</th><th>Score</th></tr></thead>
                <tbody>
                  {sites.map(s => (
                    <tr key={s.id}><td>{s.url}</td><td>{s.status}</td><td>{s.lastScanned || '—'}</td><td>{s.score || '—'}</td></tr>
                  ))}
                </tbody>
              </table>
              {sites.length >= limit && <div className="upgrade">Upgrade to add more websites & unlock full monitoring data.</div>}
            </Card>
          </div>

          <div style={{ width: 320 }}>
            <Card>
              <h3>Subscription</h3>
              <div className="small">{localStorage.getItem('subscribed') === 'true' ? 'Subscribed' : 'Unsubscribed'}</div>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
