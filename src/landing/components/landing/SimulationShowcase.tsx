import React, { useState, useEffect, useRef } from 'react';
import { BRAND } from '../../config/brand';

export const SimulationShowcase: React.FC = () => {
  const [force, setForce] = useState<number>(40); // Newtons
  const [mass, setMass] = useState<number>(4); // kg
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [cartPosition, setCartPosition] = useState<number>(10); // percentage 0 to 85%
  const animRef = useRef<number | null>(null);

  // Exact Newton's Second Law calculation: a = F / m
  const acceleration = Number((force / mass).toFixed(2));

  // Dynamic vector arrow lengths (bounded between 20px and 120px)
  const forceArrowWidth = Math.min(120, Math.max(24, (force / 100) * 110));
  const accelArrowWidth = Math.min(120, Math.max(24, (acceleration / 50) * 110));

  // Visual simulation loop
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      if (isPlaying) {
        setCartPosition((prev) => {
          // Speed scales gently with acceleration for smooth visual playback
          const speed = Math.sqrt(acceleration) * 14;
          const next = prev + speed * dt;
          return next > 82 ? 5 : next;
        });
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, acceleration]);

  const handleResetPosition = () => {
    setCartPosition(5);
  };

  return (
    <section className="simulation-showcase-section" id="simulations" aria-label="Interactive Physics Simulation">
      <div className="section-container">
        {/* Header */}
        <div className="section-header-center">
          <div className="section-eyebrow-pill">
            <span className="eyebrow-text">PHENOMENON LAB</span>
          </div>
          <h2 className="section-main-headline">{BRAND.simulationHeadline}</h2>
          <p className="section-description">{BRAND.simulationDescription}</p>
        </div>

        {/* Main Simulation Showcase Card */}
        <div className="simulation-card-container">
          <div className="simulation-inner-grid">
            {/* Left: Parameter Controls */}
            <div className="sim-controls-panel">
              <div className="sim-panel-title-row">
                <span className="sim-badge">Newton's 2nd Law</span>
                <span className="sim-formula">a = F / m</span>
              </div>

              {/* Slider 1: Force */}
              <div className="sim-control-group">
                <div className="control-label-row">
                  <label htmlFor="force-slider" className="control-name">
                    Applied Force (F)
                  </label>
                  <span className="control-value-readout" style={{ color: '#FE9400' }}>
                    {force} N
                  </span>
                </div>
                <input
                  id="force-slider"
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={force}
                  onChange={(e) => setForce(Number(e.target.value))}
                  className="custom-range-slider"
                  aria-label="Adjust applied force in Newtons"
                />
                <div className="slider-limits">
                  <span>10 N</span>
                  <span>100 N</span>
                </div>
              </div>

              {/* Slider 2: Mass */}
              <div className="sim-control-group">
                <div className="control-label-row">
                  <label htmlFor="mass-slider" className="control-name">
                    Object Mass (m)
                  </label>
                  <span className="control-value-readout" style={{ color: '#FC710C' }}>
                    {mass} kg
                  </span>
                </div>
                <input
                  id="mass-slider"
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={mass}
                  onChange={(e) => setMass(Number(e.target.value))}
                  className="custom-range-slider"
                  aria-label="Adjust object mass in kilograms"
                />
                <div className="slider-limits">
                  <span>1 kg</span>
                  <span>20 kg</span>
                </div>
              </div>

              {/* Calculated Readout Summary Box */}
              <div className="sim-readout-card">
                <div className="readout-row">
                  <span className="readout-label">Calculated Acceleration</span>
                  <div className="readout-hero-number">
                    <span>{acceleration}</span>
                    <span className="readout-unit">m/s²</span>
                  </div>
                </div>

                <div className="readout-equation-breakdown">
                  <span>{force} N</span>
                  <span>÷</span>
                  <span>{mass} kg</span>
                  <span>=</span>
                  <strong style={{ color: '#FE9400' }}>{acceleration} m/s²</strong>
                </div>
              </div>

              {/* Play / Reset Controls */}
              <div className="sim-actions-row">
                <button
                  type="button"
                  className="btn-sim-action"
                  onClick={() => setIsPlaying(!isPlaying)}
                  aria-label={isPlaying ? 'Pause simulation animation' : 'Play simulation animation'}
                >
                  {isPlaying ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Resume
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="btn-sim-action secondary"
                  onClick={handleResetPosition}
                  title="Reset track position"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  Reset Track
                </button>
              </div>
            </div>

            {/* Right: Dynamic Visual Runway */}
            <div className="sim-visual-stage">
              <div className="stage-header">
                <span className="stage-title">Frictionless Runway Visualisation</span>
                <span className="stage-subtitle">Illustrative Model</span>
              </div>

              {/* Runway Box */}
              <div className="runway-box" aria-hidden="true">
                {/* Distance Grid & Marker Ticks */}
                <div className="runway-ruler">
                  {[0, 10, 20, 30, 40, 50, 60, 70, 80].map((tick) => (
                    <div key={tick} className="ruler-tick">
                      <span className="tick-line" />
                      <span className="tick-label">{tick}m</span>
                    </div>
                  ))}
                </div>

                {/* Moving Sled Block */}
                <div
                  className="moving-cart-block"
                  style={{
                    left: `${cartPosition}%`,
                    width: `${Math.min(94, Math.max(54, 45 + mass * 2.2))}px`,
                  }}
                >
                  <div className="cart-body">
                    <span className="cart-mass-label">{mass} kg</span>
                  </div>

                  {/* Force Vector Arrow (Amber) pointing right */}
                  <div
                    className="vector-arrow force-vector"
                    style={{ width: `${forceArrowWidth}px` }}
                    title={`Force Vector: ${force} N`}
                  >
                    <span className="vector-label">F = {force}N</span>
                    <span className="arrow-head" />
                  </div>

                  {/* Acceleration Vector Arrow (Orange) pointing right */}
                  <div
                    className="vector-arrow accel-vector"
                    style={{ width: `${accelArrowWidth}px` }}
                    title={`Acceleration Vector: ${acceleration} m/s²`}
                  >
                    <span className="vector-label">a = {acceleration}m/s²</span>
                    <span className="arrow-head" />
                  </div>
                </div>

                {/* Track Ground Rail */}
                <div className="track-ground-rail" />
              </div>

              {/* Explanatory Scientific Note */}
              <div className="sim-scientific-note">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FE9400" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <div className="note-text">
                  <strong>Concept Insight:</strong> Notice how doubling the applied force directly doubles acceleration, while doubling the mass halves acceleration. Mass quantifies an object’s fundamental resistance to changes in motion (inertia).
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
