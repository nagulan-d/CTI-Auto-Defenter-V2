import React, { useEffect, useState } from "react";

function Threats() {
  const [threats, setThreats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetch("http://127.0.0.1:5000/api/threats")
      .then(res => res.json())
      .then(data => {
        if (mounted) {
          setThreats(data);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Error fetching threats:", err);
        setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  if (loading) return <p>Loading threats...</p>;
  if (!threats.length) return <p>No threats found</p>;

  return (
    <div>
      <h2>Threat Intelligence</h2>
      <ul>
        {threats.map((t, index) => (
          <li key={index}>
            <strong>{t.indicator}</strong> ({t.type})  
            <p>{t.summary}</p>
            <small>Score: {t.score}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Threats;
