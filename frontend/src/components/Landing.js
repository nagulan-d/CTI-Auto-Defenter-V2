import React from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';

export default function Landing() {
  return (
    <div className="landing-root">
      <Link to="/login" className="get-started-button">Get Started</Link>
    </div>
  );
}
