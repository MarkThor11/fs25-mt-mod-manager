import React, { useState } from 'react';

export const CustomSlider = ({ value, min, max, step, onChange, width = '100%', title, onBlur, defaultValue, className = "perfect-pill-slider", ...props }) => {
  // Use state for uncontrolled inputs so they still animate when dragged
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
  
  // Clamp between 0 and 100 to avoid CSS calc issues
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
        .perfect-pill-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--accent);
          cursor: pointer;
          border: 2px solid var(--bg-surface);
          box-shadow: 0 0 5px rgba(0,0,0,0.3);
          transition: transform 0.15s ease;
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
        background: `linear-gradient(to right, var(--accent) calc(7px + ${percentage} * (100% - 14px) / 100), rgba(255,255,255,0.1) calc(7px + ${percentage} * (100% - 14px) / 100))`,
        ...props.style
      }}
      {...props}
    />
    </>
  );
};
