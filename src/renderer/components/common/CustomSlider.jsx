import React, { useState } from 'react';

export const CustomSlider = ({ value, min, max, step, onChange, width = '100%', title, onBlur, defaultValue, useLog = false, className = "perfect-pill-slider", ...props }) => {
  const isControlled = value !== undefined;
  const [internalVal, setInternalVal] = useState(defaultValue !== undefined ? defaultValue : min);
  
  const rawVal = isControlled ? value : internalVal;
  
  const numVal = parseFloat(rawVal) || 0;
  const numMin = parseFloat(min) || 0;
  const numMax = parseFloat(max) || 100;
  
  let percentage = 0;
  if (useLog && numMax > numMin) {
    // Square root mapping: percentage = sqrt( (val - min)/(max - min) ) * 100
    // Gives 70% of horizontal slider width to the bottom 50% of the range for granular control
    const ratio = Math.max(0, Math.min(1, (numVal - numMin) / (numMax - numMin)));
    percentage = Math.sqrt(ratio) * 100;
  } else if (numMax > numMin) {
    percentage = ((numVal - numMin) / (numMax - numMin)) * 100;
  }
  
  percentage = Math.max(0, Math.min(100, percentage));

  // Convert linear slider input (0-1000 slider steps) back to actual value using inverse power curve
  const handleSliderInput = (e) => {
    let newActualVal;
    if (useLog) {
      const sliderPct = parseFloat(e.target.value) / 1000; // 0.0 to 1.0
      // Inverse: ratio = sliderPct^2
      const ratio = sliderPct * sliderPct;
      newActualVal = Math.round(numMin + ratio * (numMax - numMin));
    } else {
      newActualVal = e.target.value;
    }

    if (!isControlled) {
      setInternalVal(newActualVal);
    }
    if (onChange) {
      // Create synthetic event with calculated actual value
      const syntheticEvent = { ...e, target: { ...e.target, value: newActualVal } };
      onChange(syntheticEvent);
    }
  };

  const sliderMin = useLog ? 0 : min;
  const sliderMax = useLog ? 1000 : max;
  const sliderStep = useLog ? 'any' : step;
  const sliderVal = useLog ? (percentage * 10) : (isControlled ? value : internalVal);

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
        min={sliderMin}
        max={sliderMax}
        step={sliderStep}
        value={sliderVal}
        onChange={handleSliderInput}
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
