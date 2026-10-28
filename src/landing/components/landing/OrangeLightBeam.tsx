import React from 'react';

interface OrangeLightBeamProps {
  className?: string;
}

/**
 * Signature Orange Light Beam
 * A dramatic vertical illumination transitioning into a horizontal pool of light
 * behind the hero dashboard preview.
 *
 * Uses layered CSS & SVG gradients:
 * - Concentrated #FE9400 light source at core
 * - Dominant #FC710C primary orange
 * - Coral #F37F58 secondary glow
 * - Soft peach #F7B198 at delicate edges
 * - Low-opacity ambient spread against #050505
 */
export const OrangeLightBeam: React.FC<OrangeLightBeamProps> = ({ className = '' }) => {
  return (
    <div
      className={`signature-light-beam-wrapper ${className}`}
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '1400px',
        height: '920px',
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* 1. Core Top Vertical Beam (Intense vertical pillar tapering downwards) */}
      <div
        className="vertical-light-beam"
        style={{
          position: 'absolute',
          top: '-60px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '180px',
          height: '520px',
          background:
            'linear-gradient(180deg, rgba(254, 148, 0, 0.95) 0%, rgba(252, 113, 12, 0.8) 25%, rgba(243, 127, 88, 0.45) 55%, rgba(247, 177, 152, 0.15) 80%, rgba(5, 5, 5, 0) 100%)',
          filter: 'blur(36px)',
          borderRadius: '50% 50% 30% 30%',
          opacity: 0.85,
        }}
      />

      {/* 2. Narrow Focused Center Shaft (High intensity concentrated light source) */}
      <div
        className="vertical-core-shaft"
        style={{
          position: 'absolute',
          top: '0px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '48px',
          height: '380px',
          background:
            'linear-gradient(180deg, #FFFFFF 0%, #FE9400 30%, #FC710C 70%, rgba(252, 113, 12, 0) 100%)',
          filter: 'blur(16px)',
          borderRadius: '9999px',
          opacity: 0.9,
        }}
      />

      {/* 3. Horizontal Pool of Light (Spreading light pool behind the dashboard) */}
      <div
        className="horizontal-light-pool"
        style={{
          position: 'absolute',
          top: '260px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '92%',
          maxWidth: '1100px',
          height: '420px',
          background:
            'radial-gradient(ellipse 75% 45% at 50% 35%, rgba(254, 148, 0, 0.42) 0%, rgba(252, 113, 12, 0.28) 28%, rgba(243, 127, 88, 0.14) 52%, rgba(247, 177, 152, 0.05) 72%, rgba(5, 5, 5, 0) 100%)',
          filter: 'blur(48px)',
          borderRadius: '50%',
          opacity: 0.95,
        }}
      />

      {/* 4. Ambient Atmosphere (Low-opacity wide field warm glow against #050505) */}
      <div
        className="ambient-back-glow"
        style={{
          position: 'absolute',
          top: '180px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: '1360px',
          height: '580px',
          background:
            'radial-gradient(ellipse 65% 50% at 50% 40%, rgba(252, 113, 12, 0.12) 0%, rgba(47, 35, 26, 0.18) 45%, rgba(5, 5, 5, 0) 80%)',
          filter: 'blur(70px)',
          borderRadius: '50%',
          opacity: 0.8,
        }}
      />

      {/* 5. Delicate Horizontal Light Filament Bar */}
      <div
        style={{
          position: 'absolute',
          top: '320px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '640px',
          height: '2px',
          background:
            'linear-gradient(90deg, rgba(5,5,5,0) 0%, rgba(247, 177, 152, 0.4) 20%, rgba(254, 148, 0, 0.95) 50%, rgba(247, 177, 152, 0.4) 80%, rgba(5,5,5,0) 100%)',
          filter: 'blur(1px)',
          opacity: 0.75,
        }}
      />
    </div>
  );
};
