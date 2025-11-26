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
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

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
            <h3>Total OTX Items</h3>
            <div className="big-metric">{otxFeed.length}</div>
          </Card>
          <Card>
            <h3>OTX Status</h3>
            <div className="small">{loading ? 'Syncing…' : error ? 'Error' : 'Connected'}</div>
            {error && <div className="error small">{error}</div>}
          </Card>
          <Card>
            <h3>Latest Threat</h3>
            <div className="small">{otxFeed[0]?.title || '—'}</div>
            <div className="feed-meta small">{otxFeed[0] ? new Date(otxFeed[0].ts || Date.now()).toLocaleString() : ''}</div>
          </Card>
          <Card>
            <h3>Filter</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">All categories</option>
                <option value="high">High risk</option>
                <option value="medium">Medium risk</option>
                <option value="low">Low risk</option>
              </select>
            </div>
          </Card>
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Live OTX Feed</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input placeholder="Search OTX feed..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: 8, borderRadius: 6, border: '1px solid rgba(255,255,255,0.04)', background: 'transparent', color: 'inherit' }} />
              <button className="btn" onClick={() => { /* manual refresh */ window.location.reload(); }}>Refresh</button>
            </div>
          </div>

          {loading ? (
            <div className="skeleton-list">
              {[1,2,3,4].map(i => <div className="skeleton" key={i}></div>)}
            </div>
          ) : error ? (
            <Card className="error-card"><div>Error loading OTX feed: {error}</div></Card>
          ) : (
            <div>
              <div style={{ marginBottom: 8, color: 'var(--muted)' }}>Showing {otxFeed.length} items</div>
              <div className="feed">
                {otxFeed
                  .filter(it => {
                    if (filter === 'all') return true;
                    if (['high','medium','low'].includes(filter)) return (it.trend || '').toLowerCase() === filter;
                    return true;
                  })
                  .filter(it => {
                    if (!search) return true;
                    return (it.title || '').toLowerCase().includes(search.toLowerCase()) || (it.category || '').toLowerCase().includes(search.toLowerCase());
                  })
                  .map((it, idx) => (
                    <Card key={idx} className="feed-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="feed-title">{it.title}</div>
                          <div className="feed-meta">{it.category} • {new Date(it.ts || Date.now()).toLocaleString()}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: it.trend === 'high' ? '#ff6b6b' : it.trend === 'medium' ? '#ffb020' : 'var(--neon-green)', fontWeight: 700 }}>{it.trend}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{it.source || ''}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 13 }}>{it.description || ''}</div>
                    </Card>
                  ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
