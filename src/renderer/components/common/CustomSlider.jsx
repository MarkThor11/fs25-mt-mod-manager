import React, { useState } from 'react';

export const CustomSlider = ({ value, min, max, step, onChange, width = '100%', title, onBlur, defaultValue, className = "perfect-pill-slider", ...props }) => {
  const isControlled = value !== undefined;
  const [internalVal, setInternalVal] = useState(defaultValue !== undefined ? defaultValue : min);
  
  const val = isControlled ? value : internalVal;
  
  const numVal = parseFloat(val) || 0;
  const numMin = parseFloat(min) || 0;
  const numMax = parseFloat(max) || 100;
  
  let percentage = 0;
  if (numMax > numMin) {
    percentage = ((numVal - numMin) / (numMax - numMin)) * 100;
  }
  
  percentage = Math.max(0, Math.min(100, percentage));

  const handleChange = (e) => {
    if (!isControlled) {
      setInternalVal(e.target.value);
    }
    if (onChange) onChange(e);
  };

  return (
    <>
      <style>{`
        .perfect-pill-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 2px;
          outline: none;
          cursor: pointer;
          margin: 0;
          padding: 0;
          display: inline-block;
          vertical-align: middle;
          pointer-events: none;
        }
        .perfect-pill-slider::-webkit-slider-runnable-track {
          width: 100%;
          height: 4px;
          background: transparent;
          border: none;
        }
        .perfect-pill-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--accent);
          cursor: pointer;
          border: 1px solid rgba(0, 0, 0, 0.15);
          box-shadow: 0 1px 4px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.2);
          margin-top: -5px;
          pointer-events: auto;
        }
        .perfect-pill-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
      `}</style>
      <input
        type="range"
        className={className}
        min={min}
        max={max}
        step={step}
        value={isControlled ? value : internalVal}
        onChange={handleChange}
        onBlur={onBlur}
        title={title}
        style={{
          width,
          background: props.style?.background !== 'transparent' 
            ? `linear-gradient(to right, var(--accent) calc(7px + ${percentage} * (100% - 14px) / 100), rgba(255,255,255,0.1) calc(7px + ${percentage} * (100% - 14px) / 100))`
            : 'transparent',
          ...props.style
        }}
        {...props}
      />
    </>
  );
};
