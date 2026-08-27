import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return createPortal(
    <div 
      className="toast-container" 
      style={{ 
        position: 'fixed',
        bottom: 'var(--sp-6)',
        left: 'var(--sp-6)',
        zIndex: 2147483647,
        pointerEvents: 'none'
      }}
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type] || Info;
        return (
          <div
            key={toast.id}
            className={`toast ${toast.exiting ? 'toast--exiting' : ''}`}
            style={{ pointerEvents: 'all' }}
          >
            <Icon
              size={18}
              className={`toast__icon toast__icon--${toast.type}`}
            />
            <span className="toast__msg">{toast.message}</span>
            <button
              className="toast__close"
              onClick={() => removeToast(toast.id)}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
