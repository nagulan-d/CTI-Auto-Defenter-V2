import React, { useEffect, useState } from 'react';
import Sidebar from '../components/ui/Sidebar';
import Card from '../components/ui/Card';
import '../styles/dashboard.css';

export default function Overview({ token, logout }) {
  const [collapsed, setCollapsed] = useState(false);
  const username = localStorage.getItem('username') || 'User';
  const role = localStorage.getItem('role') || 'user';

  const [otxFeed, setOtxFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // simple polling for OTX (requires REACT_APP_OTX_KEY in env or localStorage 'otx_key')
  useEffect(() => {
    let mounted = true;
    const key = process.env.REACT_APP_OTX_KEY || localStorage.getItem('otx_key');

    async function fetchOtx() {
      setLoading(true);
      setError(null);
      try {
        if (!key) {
          // no key — use sample data
          if (!mounted) return;
          setOtxFeed([
            { title: 'Sample IoC: 1.2.3.4', category: 'IP', ts: new Date().toISOString(), trend: 'high' },
            { title: 'Sample Malware family X', category: 'Malware', ts: new Date().toISOString(), trend: 'medium' },
          ]);
        } else {
          const res = await fetch('https://otx.alienvault.com/api/v1/pulses?limit=10', {
            headers: { 'X-OTX-API-KEY': key },
          });
          if (!res.ok) throw new Error('OTX fetch failed: ' + res.status);
          const json = await res.json();
          if (!mounted) return;
          // map pulses to simplified feed
          const items = (json.results || json.pulses || []).slice(0, 10).map((p) => ({ title: p.name || p.title, category: p.indicator_types ? p.indicator_types.join(',') : 'misc', ts: p.modified, trend: p.risk?.toLowerCase?.() || 'unknown' }));
          setOtxFeed(items);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err.message || String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchOtx();
    const interval = setInterval(fetchOtx, 1000 * 60 * 2); // 2 minutes
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return (
    <div className="cp-root">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} username={username} role={role} onLogout={logout} />

      <main className={"cp-main " + (collapsed ? 'collapsed' : '')}>
        <div className="top-row">
          <div>
            <h1 className="page-title">Welcome back, {username}</h1>
            <div className="muted">Role: {role} • {new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <section className="grid-4">
          <Card>
            <h3>Threats Detected Today</h3>
            <div className="big-metric">{Math.floor(Math.random() * 20)}</div>
          </Card>
          <Card>
            <h3>OTX Sync Status</h3>
            <div className="small">{loading ? 'Syncing…' : error ? 'Error' : 'OK'}</div>
            {error && <div className="error small">{error}</div>}
          </Card>
          <Card>
            <h3>Latest Alerts</h3>
            <div className="small">{otxFeed.length} recent</div>
          </Card>
          <Card>
            <h3>Firewall Actions</h3>
            <div className="small">{Math.floor(Math.random() * 100)}</div>
          </Card>
        </section>

        <section>
          <h2>Live OTX Feed</h2>
          <div className="feed">
            {loading ? (
              <div className="skeleton-list">
                {[1,2,3,4].map(i => <div className="skeleton" key={i}></div>)}
              </div>
            ) : error ? (
              <Card className="error-card"><div>Error loading OTX feed: {error}</div></Card>
            ) : (
              otxFeed.map((it, idx) => (
                <Card key={idx} className="feed-item">
                  <div className="feed-title">{it.title}</div>
                  <div className="feed-meta">{it.category} • {new Date(it.ts || Date.now()).toLocaleString()}</div>
                </Card>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
