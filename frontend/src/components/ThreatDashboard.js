import React, { useEffect, useState } from "react";
import ThreatCard from "./ThreatCardNew";
import "../App.css";

function ThreatDashboard({ logout }) {
  const [threats, setThreats] = useState([]);
  const [users, setUsers] = useState([]);
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [role, setRole] = useState(localStorage.getItem("role") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const username = localStorage.getItem('username') || '';

  // Fetch threats from backend
  useEffect(() => {
    const fetchThreats = async () => {
      try {
        const res = await fetch("http://127.0.0.1:5000/api/threats");
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        setThreats(data);
      } catch (err) {
        setError("Unable to load threats. Check if backend is running.");
      } finally {
        setLoading(false);
      }
    };
    fetchThreats();
  }, []);

  // Fetch users from backend (for sending notifications) — only if admin
  useEffect(() => {
    const fetchUsers = async () => {
      if (!token || role !== "admin") return;
      try {
        const res = await fetch("http://127.0.0.1:5000/api/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
        const data = await res.json();
        setUsers(data);
      } catch (err) {
        console.error("Error fetching users:", err);
      }
    };
    fetchUsers();
  }, [token, role]);

  const getRiskLevel = (score) => {
    if (score >= 80) return { level: "high", color: "red" };
    if (score >= 60) return { level: "medium", color: "orange" };
    return { level: "low", color: "green" };
  };

  const filteredThreats = threats.filter((t) => {
    const matchesSearch =
      t.indicator?.toLowerCase().includes(search.toLowerCase()) ||
      t.title?.toLowerCase().includes(search.toLowerCase());
    const risk = getRiskLevel(t.score).level;
    return (filter === "all" || filter === risk) && matchesSearch;
  });

  if (loading) return <h2 className="center">Loading threats...</h2>;
  if (error) return <h2 className="center error">{error}</h2>;

  // derived metrics
  const activeCount = threats.filter((t) => t.alert).length;
  const blockedIPs = threats.filter((t) => t.type && t.type.toLowerCase().includes("ip")).length;
  const usersOnline = users.length || 1;

  return (
    <div className="container" style={{ display: 'flex', gap: 24 }}>
      <aside style={{ width: sidebarOpen ? 240 : 56, padding: 12, background: '#0f172a', color: '#fff', borderRadius: 8, transition: 'width 160ms ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center' }}>
          {sidebarOpen && <h2 style={{ margin: 0, fontSize: 18 }}>Dashboard</h2>}
          <button onClick={() => setSidebarOpen((s) => !s)} aria-label="Toggle sidebar" title="Toggle sidebar" style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 6 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="5" width="18" height="2" rx="1" fill="#cbd5e1" />
              <rect x="3" y="11" width="18" height="2" rx="1" fill="#cbd5e1" />
              <rect x="3" y="17" width="18" height="2" rx="1" fill="#cbd5e1" />
            </svg>
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <span style={{ width: 18, textAlign: 'center' }}>🏠</span>
            {sidebarOpen && <span>Overview</span>}
          </button>
          <button style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <span style={{ width: 18, textAlign: 'center' }}>⚠️</span>
            {sidebarOpen && <span>Threats</span>}
          </button>
        </nav>

        <div style={{ flex: 1 }} />
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: sidebarOpen ? 'flex-start' : 'center' }}>
          {sidebarOpen && (
            <div style={{ color: '#cbd5e1' }}>
              <div style={{ fontWeight: 600 }}>{username || '—'}</div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>{role || 'user'}</div>
            </div>
          )}
          <button onClick={logout} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>{sidebarOpen ? 'Logout' : '⏻'}</button>
        </div>
      </aside>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1>Security Dashboard</h1>
        </div>

        <div className="dashboard" style={{ gridTemplateColumns: '1fr' }}>
          <div className="main-column">
            <div className="metrics">
              <div className="metric-card">
                <h4>Active Threats</h4>
                <div className="metric-value">{activeCount}</div>
              </div>
              <div className="metric-card">
                <h4>Blocked IPs</h4>
                <div className="metric-value">{blockedIPs ? blockedIPs : '1,245'}</div>
              </div>
              <div className="metric-card">
                <h4>System Status</h4>
                <div className="metric-value" style={{ color: '#10b981' }}>online</div>
              </div>
              <div className="metric-card">
                <h4>Users Online</h4>
                <div className="metric-value">{usersOnline}</div>
              </div>
            </div>

            <div className="recent-panel">
              <div className="controls" style={{ marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Search threats..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ flex: 1 }}
                />
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="high">High Risk</option>
                </select>
              </div>

              <div className="grid">
                {filteredThreats.length === 0 ? (
                  <p>No matching threats found.</p>
                ) : (
                  filteredThreats.map((t, index) => (
                    <ThreatCard key={index} threat={t} users={users} token={token} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThreatDashboard;
