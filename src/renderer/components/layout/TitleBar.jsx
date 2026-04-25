import React from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';

export default function TitleBar() {
  const handleMinimize = () => window.api.window.minimize();
  const handleMaximize = () => window.api.window.maximize();
  const handleClose = () => window.api.window.close();

  return (
    <div className="titlebar">
      <span className="titlebar__title">v1.0.10</span>
      <div className="titlebar__controls">
        <button className="titlebar__btn" onClick={handleMinimize} title="Minimize">
          <Minus size={14} />
        </button>
        <button className="titlebar__btn" onClick={handleMaximize} title="Maximize">
          <Copy size={12} />
        </button>
        <button className="titlebar__btn titlebar__btn--close" onClick={handleClose} title="Close">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
