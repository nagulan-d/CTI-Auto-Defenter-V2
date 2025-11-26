import React, { useEffect, useState } from "react";
import ThreatCard from "./ThreatCardNew";
import Sidebar from "./ui/Sidebar";
import "../styles/dashboard.css";

function ThreatDashboard({ logout }) {
  const [threats, setThreats] = useState([]);
  const [users, setUsers] = useState([]);
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [role, setRole] = useState(localStorage.getItem("role") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [collapsed, setCollapsed] = useState(false);
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
    <div className="cp-root">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} username={username} role={role} onLogout={logout} />

      <main className={"cp-main " + (collapsed ? 'collapsed' : '')}>
        <div className="top-row">
          <div>
            <h1 className="page-title">Security Dashboard</h1>
            <div className="muted">Summary of active threats and recent detections</div>
          </div>
        </div>

        <section className="grid-4">
          <div className="cp-card">
            <h3>Active Threats</h3>
            <div className="big-metric">{activeCount}</div>
          </div>
          <div className="cp-card">
            <h3>Blocked IPs</h3>
            <div className="small">{blockedIPs ? blockedIPs : '—'}</div>
          </div>
          <div className="cp-card">
            <h3>System Status</h3>
            <div className="small" style={{ color: '#10b981' }}>online</div>
          </div>
          <div className="cp-card">
            <h3>Users Online</h3>
            <div className="small">{usersOnline}</div>
          </div>
        </section>

        <section>
          <div className="cp-card">
            <div className="controls" style={{ marginBottom: '12px', display: 'flex', gap: 8 }}>
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
        </section>
      </main>
    </div>
  );
}

export default ThreatDashboard;
