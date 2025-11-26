import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion"; // ✅ Added for smooth page transitions
import Login from "./components/Login";
import Register from "./components/Register";
import ThreatDashboard from "./components/ThreatDashboard";
import AdminDashboard from "./components/AdminDashboard";
import SitesPage from "./pages/SitesPage";
import PublishPage from "./pages/PublishPage";
import ContentPage from "./pages/ContentPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import IntegrationsPage from "./pages/IntegrationsPage";
import FilesPage from "./pages/FilesPage";
import ProfilePage from "./pages/ProfilePage";
import NotificationsPage from "./pages/NotificationsPage";
import SettingsPage from "./pages/SettingsPage";
import SupportPage from "./pages/SupportPage";

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
              <Navigate to="/dashboard" />
            )
          }
        />

        {/* Threats direct route */}
        <Route
          path="/threats"
          element={
            token && role === "user" ? (
              <ThreatDashboard token={token} logout={handleLogout} />
            ) : (
              <Navigate to="/" />
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

        {/* Additional user pages */}
        <Route
          path="/sites"
          element={token && role === "user" ? <SitesPage /> : <Navigate to="/" />}
        />
        <Route
          path="/publish"
          element={token && role === "user" ? <PublishPage /> : <Navigate to="/" />}
        />
        <Route
          path="/content"
          element={token && role === "user" ? <ContentPage /> : <Navigate to="/" />}
        />
        <Route
          path="/analytics"
          element={token && role === "user" ? <AnalyticsPage /> : <Navigate to="/" />}
        />
        <Route
          path="/subscriptions"
          element={token && role === "user" ? <SubscriptionsPage /> : <Navigate to="/" />}
        />
        <Route
          path="/integrations"
          element={token && role === "user" ? <IntegrationsPage /> : <Navigate to="/" />}
        />
        <Route
          path="/files"
          element={token && role === "user" ? <FilesPage /> : <Navigate to="/" />}
        />
        <Route
          path="/profile"
          element={token ? <ProfilePage /> : <Navigate to="/" />}
        />
        <Route
          path="/notifications"
          element={token ? <NotificationsPage /> : <Navigate to="/" />}
        />
        <Route
          path="/settings"
          element={token ? <SettingsPage /> : <Navigate to="/" />}
        />
        <Route
          path="/support"
          element={token ? <SupportPage /> : <Navigate to="/" />}
        />

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
