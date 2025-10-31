import React, { useState } from "react";
import { motion } from "framer-motion";
import "../App.css";

function Register() {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    phone: "",
    role: "user",
    subscribed: false,
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("✅ Registration successful! You can now login.");
        setFormData({
          username: "",
          email: "",
          password: "",
          phone: "",
          role: "user",
          subscribed: false,
        });
      } else {
        setError(data.error || "❌ Registration failed. Try again.");
      }
    } catch (err) {
      setError("⚠️ Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="login-page"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -40 }}
      transition={{ duration: 0.5 }}
    >
      <div className="login-container">
        <h2>Register</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={formData.username}
            onChange={handleChange}
            required
          />

          <input
            type="email"
            name="email"
            placeholder="Email Address"
            value={formData.email}
            onChange={handleChange}
            required
          />

          <input
            type="text"
            name="phone"
            placeholder="Phone Number"
            value={formData.phone}
            onChange={handleChange}
            required
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
          />

          <select
            name="role"
            value={formData.role}
            onChange={handleChange}
            style={{
              width: "90%",
              padding: "12px 15px",
              margin: "10px 0",
              border: "1px solid #ccc",
              borderRadius: "6px",
              fontSize: "15px",
              outline: "none",
            }}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>

          {/* Professional toggle for subscription */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <label htmlFor="subscribed-toggle" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <div style={{ position: 'relative', width: 48, height: 28 }}>
                <input
                  id="subscribed-toggle"
                  type="checkbox"
                  name="subscribed"
                  checked={formData.subscribed}
                  onChange={handleChange}
                  aria-label="Subscribe to notifications"
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    width: 0,
                    height: 0,
                  }}
                />
                <span
                  className="toggle-track"
                  aria-hidden
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    background: formData.subscribed ? '#16a34a' : '#e5e7eb',
                    borderRadius: 9999,
                    transition: 'background 150ms ease',
                  }}
                />
                <span
                  className="toggle-thumb"
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: formData.subscribed ? 24 : 3,
                    width: 22,
                    height: 22,
                    background: '#fff',
                    borderRadius: '50%',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    transition: 'left 150ms ease',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                <span style={{ fontWeight: 600 }}>Subscribe to alerts</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>Get email notifications for high-risk threats</span>
              </div>
            </label>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Registering..." : "Register"}
          </button>
        </form>

        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}

        <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
          Already have an account?{" "}
          <a href="/" style={{ color: "#2ecc71", textDecoration: "none" }}>
            Login here
          </a>
        </p>
      </div>
    </motion.div>
  );
}

export default Register;
