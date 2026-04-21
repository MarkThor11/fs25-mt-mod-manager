import React from 'react';
import tractorBody from '../assets/tractor_body.png';

const TractorHero = () => {
  return (
    <div className="tractor-hero-container">
      <svg 
        viewBox="0 0 1024 1024" 
        className="tractor-svg animate-tractor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id="bodyClip">
            <rect x="0" y="0" width="1024" height="1024" />
          </clipPath>
        </defs>

        {/* Smoke Puffs */}
        <g className="smoke-emitter">
           <circle className="smoke-puff p1" cx="725" cy="240" r="10" />
           <circle className="smoke-puff p2" cx="725" cy="240" r="10" />
           <circle className="smoke-puff p3" cx="725" cy="240" r="10" />
        </g>

        {/* Tractor Body (includes static wheels) */}
        <image 
          href={tractorBody} 
          x="0" y="0" 
          width="1024" height="1024" 
        />
      </svg>
    </div>
  );
};

export default TractorHero;
