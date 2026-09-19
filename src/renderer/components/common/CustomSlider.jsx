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
          height: 6px;
          border-radius: 3px;
          outline: none;
          cursor: pointer;
          margin: 0;
          padding: 0;
          display: inline-block;
          vertical-align: middle;
        }
        .perfect-pill-slider::-webkit-slider-runnable-track {
          width: 100%;
          height: 6px;
          background: transparent;
          border: none;
        }
        .perfect-pill-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--accent);
          cursor: pointer;
          border: 1px solid rgba(0, 0, 0, 0.2);
          box-shadow: 0 1px 3px rgba(0,0,0,0.5);
          margin-top: -3px;
          transition: transform 0.1s ease;
        }
        .perfect-pill-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
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
          background: `linear-gradient(to right, var(--accent) calc(6px + ${percentage} * (100% - 12px) / 100), rgba(255,255,255,0.1) calc(6px + ${percentage} * (100% - 12px) / 100))`,
          ...props.style
        }}
        {...props}
      />
    </>
  );
};
