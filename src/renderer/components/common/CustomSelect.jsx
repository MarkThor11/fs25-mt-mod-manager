import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export default function CustomSelect({
  value,
  onChange,
  options = [],
  className = '',
  style = {},
  menuStyle = {},
  title
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const selectedOption = options.find((opt) => String(opt.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : value;

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-block', ...style }}
      title={title}
    >
      <button
        type="button"
        className={className || 'btn btn--secondary btn--sm'}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '0 10px',
          border: '1px solid var(--border-subtle, var(--border))',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          borderRadius: 'var(--radius-sm, 6px)',
          fontSize: 'var(--fs-xs, 13px)',
          fontWeight: 'var(--fw-medium, 500)',
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap'
        }}
      >
        <span>{displayLabel}</span>
        <ChevronDown
          size={14}
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
            opacity: 0.7,
            flexShrink: 0
          }}
        />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: '100%',
            background: 'var(--bg-secondary, #0d1117)',
            backgroundColor: '#0d1117',
            border: '1px solid var(--border-light, rgba(255, 255, 255, 0.18))',
            borderRadius: 'var(--radius-sm, 6px)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.8), 0 2px 6px rgba(0, 0, 0, 0.4)',
            zIndex: 99999,
            overflow: 'hidden',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            whiteSpace: 'nowrap',
            ...menuStyle
          }}
        >
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <div
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'var(--bg-card-hover, rgba(255, 255, 255, 0.08))';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: 'var(--fs-xs, 13px)',
                  fontWeight: isSelected ? '600' : '400',
                  color: isSelected ? 'var(--accent, #4ade80)' : 'var(--text-primary, #f8fafc)',
                  background: isSelected ? 'var(--accent-dim, rgba(74, 222, 128, 0.15))' : 'transparent',
                  transition: 'background 0.1s ease',
                  userSelect: 'none'
                }}
              >
                {option.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
