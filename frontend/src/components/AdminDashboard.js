import React, { useEffect, useState } from "react";
import ThreatCard from "./ThreatCardNew";
import Sidebar from "./ui/Sidebar";
import "../styles/dashboard.css";

function AdminDashboard({ logout }) {
  const [users, setUsers] = useState([]);
  const [threats, setThreats] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingThreats, setLoadingThreats] = useState(true);
  const [errorUsers, setErrorUsers] = useState(null);
  const [errorThreats, setErrorThreats] = useState(null);

  // UI filters for admin
  const [userQuery, setUserQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");

  // Threat filters
  const [threatSearch, setThreatSearch] = useState("");
  const [threatFilter, setThreatFilter] = useState("all");

  const token = localStorage.getItem("token");  // Get token for API calls
  const role = localStorage.getItem("role") || "";
  const [currentView, setCurrentView] = useState("users"); // 'users' or 'threats'
  const [collapsed, setCollapsed] = useState(false);
  const username = localStorage.getItem('username') || '';
  

  // Fetch users (admin only)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const adminKey = localStorage.getItem("admin_api_key");
        if (adminKey) headers["X-ADMIN-KEY"] = adminKey;

        const res = await fetch("http://127.0.0.1:5000/api/users", {
          headers,
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        setUsers(data);
      } catch (err) {
        setErrorUsers("Unable to load users. Check backend.");
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [token]);

  // Fetch threats
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchThreats = async () => {
    setLoadingThreats(true);
    setErrorThreats(null);
    try {
      const res = await fetch("http://127.0.0.1:5000/api/threats");
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setThreats(data);
      setLastUpdated(new Date());
    } catch (err) {
      setErrorThreats("Unable to load threats. Check backend.");
    } finally {
      setLoadingThreats(false);
    }
  };

  useEffect(() => {
    // initial fetch (only once). Manual Refresh button will re-run fetchThreats.
    fetchThreats();
  }, []);

  // don't short-circuit render; show view-specific loading/errors

  const getRiskLevel = (score) => {
    const s = Number(score) || 0;
    if (s >= 80) return "high";
    if (s >= 60) return "medium";
    return "low";
  };

  const filteredUsers = users.filter((u) => {
    const q = userQuery.trim().toLowerCase();
    const matchQ = q === "" || (u.username && u.username.toLowerCase().includes(q)) || (u.email && u.email.toLowerCase().includes(q));
    const matchRole = userRoleFilter === "all" || (u.role && u.role.toLowerCase() === userRoleFilter);
    return matchQ && matchRole;
  });

  const filteredThreats = threats.filter((t) => {
    const q = threatSearch.trim().toLowerCase();
    const matchesSearch = q === "" || (t.indicator && t.indicator.toLowerCase().includes(q)) || (t.title && t.title.toLowerCase().includes(q));
    const risk = getRiskLevel(t.score);
    const matchesRisk = threatFilter === "all" || risk === threatFilter;
    return matchesSearch && matchesRisk;
  });

  return (
    <div className="cp-root">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} username={username} role={role} onLogout={logout} />

      <main className={"cp-main " + (collapsed ? 'collapsed' : '')}>
        <h1>Admin Dashboard</h1>

        {/* Users view */}
        {currentView === 'users' && (
          <section>
            <h2>Registered Users</h2>
            <div className="controls" style={{ margin: "10px 0 16px" }}>
              <input
                type="search"
                placeholder="Search users by username or email"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                style={{ minWidth: 220 }}
              />
              <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}>
                <option value="all">All roles</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>
            </div>

            {loadingUsers ? (
              <p>Loading users...</p>
            ) : errorUsers ? (
              <p className="error">{errorUsers}</p>
            ) : filteredUsers.length === 0 ? (
              <p>No users found.</p>
            ) : (
              <table className="user-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Subscribed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td>{u.username}</td>
                      <td>{u.role}</td>
                      <td>
                        {u.role === 'admin' ? (
                          // Hide subscription control for admin accounts
                          ""
                        ) : (
                          <input
                            type="checkbox"
                            checked={!!u.subscribed}
                            onChange={async (e) => {
                              const newVal = e.target.checked;
                              // Optimistic update
                              setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, subscribed: newVal } : p)));
                              try {
                                const headers = { 'Content-Type': 'application/json' };
                                if (token) headers.Authorization = `Bearer ${token}`;
                                const adminKey = localStorage.getItem('admin_api_key');
                                if (adminKey) headers['X-ADMIN-KEY'] = adminKey;

                                const res = await fetch(`http://127.0.0.1:5000/api/users/${u.id}`, {
                                  method: 'PATCH',
                                  headers,
                                  body: JSON.stringify({ subscribed: newVal }),
                                });
                                if (!res.ok) {
                                  const err = await res.json();
                                  alert(err.error || 'Failed to update subscription');
                                  // rollback
                                  setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, subscribed: !newVal } : p)));
                                }
                              } catch (err) {
                                console.error('Update subscribe error:', err);
                                alert('Network error. Check console.');
                                setUsers((prev) => prev.map((p) => (p.id === u.id ? { ...p, subscribed: !newVal } : p)));
                              }
                            }}
                          />
                        )}
                      </td>
                      <td>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Delete user ${u.username}?`)) return;
                            try {
                              const headers = {};
                              if (token) headers.Authorization = `Bearer ${token}`;
                              const adminKey = localStorage.getItem('admin_api_key');
                              if (adminKey) headers['X-ADMIN-KEY'] = adminKey;

                              const res = await fetch(`http://127.0.0.1:5000/api/users/${u.id}`, {
                                method: 'DELETE',
                                headers,
                              });
                              if (res.ok) {
                                setUsers((prev) => prev.filter((usr) => usr.id !== u.id));
                              } else {
                                const err = await res.json();
                                alert(err.error || 'Failed to delete user');
                              }
                            } catch (err) {
                              console.error('Delete user error:', err);
                              alert('Network error. Check console for details.');
                            }
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#d9534f',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* Subscribed users view (exclude admins) */}
        {currentView === 'subscribed' && (
          <section>
            <h2>Subscribed Users</h2>
            {loadingUsers ? (
              <p>Loading users...</p>
            ) : errorUsers ? (
              <p className="error">{errorUsers}</p>
            ) : (
              (() => {
                const rows = users.filter(u => u.subscribed && u.role !== 'admin');
                if (rows.length === 0) return <p>No subscribed users found.</p>;
                return (
                  <table className="user-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Subscribed</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(u => (
                        <tr key={u.id}>
                          <td>{u.id}</td>
                          <td>{u.username}</td>
                          <td>{u.role}</td>
                          <td>
                            <input type="checkbox" checked={!!u.subscribed} onChange={async (e) => {
                              const newVal = e.target.checked;
                              setUsers(prev => prev.map(p => p.id === u.id ? { ...p, subscribed: newVal } : p));
                              try {
                                const headers = { 'Content-Type': 'application/json' };
                                if (token) headers.Authorization = `Bearer ${token}`;
                                const adminKey = localStorage.getItem('admin_api_key');
                                if (adminKey) headers['X-ADMIN-KEY'] = adminKey;
                                const res = await fetch(`http://127.0.0.1:5000/api/users/${u.id}`, { method: 'PATCH', headers, body: JSON.stringify({ subscribed: newVal }) });
                                if (!res.ok) { const err = await res.json(); alert(err.error || 'Failed'); setUsers(prev => prev.map(p => p.id === u.id ? { ...p, subscribed: !newVal } : p)); }
                              } catch (err) { console.error(err); alert('Network error'); setUsers(prev => prev.map(p => p.id === u.id ? { ...p, subscribed: !newVal } : p)); }
                            }} />
                          </td>
                          <td>
                            <button onClick={async () => { if (!window.confirm(`Delete user ${u.username}?`)) return; try { const headers = {}; if (token) headers.Authorization = `Bearer ${token}`; const adminKey = localStorage.getItem('admin_api_key'); if (adminKey) headers['X-ADMIN-KEY'] = adminKey; const res = await fetch(`http://127.0.0.1:5000/api/users/${u.id}`, { method: 'DELETE', headers }); if (res.ok) setUsers(prev => prev.filter(p => p.id !== u.id)); else { const err = await res.json(); alert(err.error || 'Failed'); } } catch (err) { console.error(err); alert('Network error'); } }} style={{ padding: '0.25rem 0.5rem', backgroundColor: '#d9534f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()
            )}
          </section>
        )}

        {/* Unsubscribed users view (exclude admins) */}
        {currentView === 'unsubscribed' && (
          <section>
            <h2>Unsubscribed Users</h2>
            {loadingUsers ? (
              <p>Loading users...</p>
            ) : errorUsers ? (
              <p className="error">{errorUsers}</p>
            ) : (
              (() => {
                const rows = users.filter(u => !u.subscribed && u.role !== 'admin');
                if (rows.length === 0) return <p>No unsubscribed users found.</p>;
                return (
                  <table className="user-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Subscribed</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(u => (
                        <tr key={u.id}>
                          <td>{u.id}</td>
                          <td>{u.username}</td>
                          <td>{u.role}</td>
                          <td>
                            <input type="checkbox" checked={!!u.subscribed} onChange={async (e) => {
                              const newVal = e.target.checked;
                              setUsers(prev => prev.map(p => p.id === u.id ? { ...p, subscribed: newVal } : p));
                              try {
                                const headers = { 'Content-Type': 'application/json' };
                                if (token) headers.Authorization = `Bearer ${token}`;
                                const adminKey = localStorage.getItem('admin_api_key');
                                if (adminKey) headers['X-ADMIN-KEY'] = adminKey;
                                const res = await fetch(`http://127.0.0.1:5000/api/users/${u.id}`, { method: 'PATCH', headers, body: JSON.stringify({ subscribed: newVal }) });
                                if (!res.ok) { const err = await res.json(); alert(err.error || 'Failed'); setUsers(prev => prev.map(p => p.id === u.id ? { ...p, subscribed: !newVal } : p)); }
                              } catch (err) { console.error(err); alert('Network error'); setUsers(prev => prev.map(p => p.id === u.id ? { ...p, subscribed: !newVal } : p)); }
                            }} />
                          </td>
                          <td>
                            <button onClick={async () => { if (!window.confirm(`Delete user ${u.username}?`)) return; try { const headers = {}; if (token) headers.Authorization = `Bearer ${token}`; const adminKey = localStorage.getItem('admin_api_key'); if (adminKey) headers['X-ADMIN-KEY'] = adminKey; const res = await fetch(`http://127.0.0.1:5000/api/users/${u.id}`, { method: 'DELETE', headers }); if (res.ok) setUsers(prev => prev.filter(p => p.id !== u.id)); else { const err = await res.json(); alert(err.error || 'Failed'); } } catch (err) { console.error(err); alert('Network error'); } }} style={{ padding: '0.25rem 0.5rem', backgroundColor: '#d9534f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()
            )}
          </section>
        )}

        {/* Threats view */}
        {currentView === 'threats' && (
          <section style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>Latest Threats</h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  onClick={() => fetchThreats()}
                  style={{ padding: '6px 10px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  Refresh
                </button>
                <div style={{ color: '#9fb3d6', fontSize: 12 }}>
                  {lastUpdated ? `Last: ${new Date(lastUpdated).toLocaleTimeString()}` : 'Not updated yet'}
                </div>
              </div>
            </div>

            <div className="controls" style={{ margin: '10px 0 12px' }}>
              <input
                type="search"
                placeholder="Search threats..."
                value={threatSearch}
                onChange={(e) => setThreatSearch(e.target.value)}
                style={{ minWidth: 220 }}
              />
              <select value={threatFilter} onChange={(e) => setThreatFilter(e.target.value)}>
                <option value="all">All Risks</option>
                <option value="low">Low Risk</option>
                <option value="medium">Medium Risk</option>
                <option value="high">High Risk</option>
              </select>
            </div>
            {loadingThreats ? (
              <p>Loading threats...</p>
            ) : errorThreats ? (
              <p className="error">{errorThreats}</p>
            ) : filteredThreats.length === 0 ? (
              <p>No matching threats found.</p>
            ) : (
              <div className="grid">
                {filteredThreats.map((t, index) => (
                  <ThreatCard key={index} threat={t} users={users} token={token} role={role} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default AdminDashboard;