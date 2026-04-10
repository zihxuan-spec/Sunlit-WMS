import React from 'react';

export default function GlobalModal({ modal, closeModal, t }) {
  if (!modal.isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <h3 style={{ color: modal.type === 'three-way' ? '#ff9800' : '#333', marginTop: 0 }}>
          {modal.title}
        </h3>
        <p style={{ whiteSpace: 'pre-line', fontSize: '16px', lineHeight: '1.5' }}>
          {modal.msg}
        </p>
        
        {modal.type === 'three-way' ? (
          <div className="three-way-actions">
            <button className="btn btn-success" style={{ background: '#0071e3' }} onClick={() => { if(modal.onConfirm) modal.onConfirm(); closeModal(); }}>
              {modal.btnConfirm}
            </button>
            <button className="btn btn-danger" onClick={() => { if(modal.onAltConfirm) modal.onAltConfirm(); closeModal(); }}>
              {modal.btnAlt}
            </button>
            <button className="btn btn-ghost" onClick={closeModal}>
              {modal.btnCancel}
            </button>
          </div>
        ) : (
          <div className="modal-actions">
            {modal.type === 'confirm' && (
              <button className="btn btn-ghost" onClick={closeModal}>
                {t.btnCancel}
              </button>
            )}
            <button className="btn btn-primary" onClick={() => { if(modal.onConfirm) modal.onConfirm(); closeModal(); }}>
              {modal.btnConfirm}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}