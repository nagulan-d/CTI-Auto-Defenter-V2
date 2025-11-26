import React from 'react';

export default function Modal({ open, title, children, onClose, actions }) {
  if (!open) return null;
  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cp-modal-header">
          <h3>{title}</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>
        <div className="cp-modal-body">{children}</div>
        {actions && <div className="cp-modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
