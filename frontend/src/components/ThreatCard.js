import React, { useState } from "react";

function ThreatCard({ threat = {}, users = [], token, role = "" }) {
  // Determine risk class
  let riskClass = "low";
  if (threat.score >= 80) riskClass = "high";
  else if (threat.score >= 60) riskClass = "medium";

  const [selectedUser, setSelectedUser] = useState(""); // For notification dropdown
  const [sending, setSending] = useState(false); // Disable button while sending

  const handleSendNotification = async () => {
    if (!selectedUser) {
      alert("Please select a user to notify.");
      return;
    }

    setSending(true);
    try {
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      // optional admin API key (for local testing) stored in localStorage as 'admin_api_key'
      const adminKey = localStorage.getItem("admin_api_key");
      if (adminKey) headers["X-ADMIN-KEY"] = adminKey;

      const body = { threat };
      if (selectedUser === "ALL") {
        body.user_email = "ALL";
      } else {
        body.user_email = selectedUser;
      }

      const res = await fetch("http://127.0.0.1:5000/api/send-notification", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (res.ok) {
        alert("Notification sent successfully!");
        setSelectedUser("");
      } else {
        const errorData = await res.json();
        alert(`Error: ${errorData.error || "Failed to send notification"}`);
      }
    } catch (err) {
      alert("Network error. Check console for details.");
      console.error("Send notification error:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`threat-card ${riskClass}`}>
      <h3>{threat.title}</h3>
      <p><b>Indicator:</b> {threat.indicator}</p>
      <p><b>Type:</b> {threat.type}</p>
      <p><b>Summary:</b> {threat.summary}</p>
      <p><b>Score:</b> {threat.score}</p>
      <p><b>Detected:</b> {threat.timestamp}</p>
      {threat.alert && <p style={{ color: "red" }}>High Risk</p>}

  {role === "admin" && users.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <label htmlFor={`user-select-${threat.indicator}`} style={{ display: "block", marginBottom: "0.5rem" }}>
            Notify User:
          </label>
          <select
            id={`user-select-${threat.indicator}`}
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            style={{
              padding: "0.5rem",
              width: "100%",
              border: "1px solid #ccc",
              borderRadius: "4px",
              marginBottom: "0.5rem",
            }}
          >
            <option value="">Select a user...</option>
            <option value="ALL">All users (send to everyone)</option>
            {users.map((user) => (
              <option key={user.id} value={user.email}>
                {user.username} ({user.email})
              </option>
            ))}
          </select>

          <button
            onClick={handleSendNotification}
            disabled={sending || !selectedUser}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: sending ? "#ccc" : "#007bff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: sending || !selectedUser ? "not-allowed" : "pointer",
              width: "100%",
            }}
          >
            {sending ? "Sending..." : "Send Notification"}
          </button>
        </div>
      )}
    </div>
  );
}
export default ThreatCard;
