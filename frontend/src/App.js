import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion"; // ✅ Added for smooth page transitions
import Login from "./components/Login";
import Register from "./components/Register";
import ThreatDashboard from "./components/ThreatDashboard";
import AdminDashboard from "./components/AdminDashboard";
import Overview from "./pages/Overview";
import UserInfo from "./pages/UserInfo";
import WebsitePublish from "./pages/WebsitePublish";
import Notifications from "./pages/Notifications";
import './styles/dashboard.css';

function AnimatedRoutes({ token, role, handleLogin, handleLogout }) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Root Route */}
        <Route
          path="/"
          element={
            // If there's no token or no role, show the login page.
            // This prevents redirect loops when a token exists but role is missing.
            !token || !role ? (
              <Login onLogin={handleLogin} />
            ) : role === "admin" ? (
              <Navigate to="/admin" />
            ) : (
              <Navigate to="/overview" />
            )
          }
        />

        {/* Register Route */}
        <Route path="/register" element={<Register />} />

        {/* User Dashboard */}
        <Route
          path="/dashboard"
          element={
            token && role === "user" ? (
              <ThreatDashboard token={token} logout={handleLogout} />
            ) : (
              <Navigate to="/" />
            )
          }
        />

        <Route path="/overview" element={token && role === "user" ? <Overview token={token} logout={handleLogout} /> : <Navigate to="/" />} />
        <Route path="/profile" element={token ? <UserInfo logout={handleLogout} /> : <Navigate to="/" />} />
        <Route path="/publish" element={token && role === "user" ? <WebsitePublish logout={handleLogout} /> : <Navigate to="/" />} />
        <Route path="/notifications" element={token ? <Notifications logout={handleLogout} /> : <Navigate to="/" />} />

        {/* Admin Dashboard */}
        <Route
          path="/admin"
          element={
            token && role === "admin" ? (
              <AdminDashboard token={token} logout={handleLogout} />
            ) : (
              <Navigate to="/" />
            )
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  const [role, setRole] = useState(localStorage.getItem("role") || null);
  const [token, setToken] = useState(localStorage.getItem("token") || null);

  const handleLogin = (token, userRole) => {
    localStorage.setItem("token", token);
    localStorage.setItem("role", userRole);
    setToken(token);
    setRole(userRole);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    setToken(null);
    setRole(null);
  };

  return (
    <Router>
      <AnimatedRoutes
        token={token}
        role={role}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
      />
    </Router>
  );
}

export default App;
