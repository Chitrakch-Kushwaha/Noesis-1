import React from 'react';
import { BRAND } from '../../config/brand';

interface FinalCTAProps {
  onStartLearning?: () => void;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({ onStartLearning }) => {
  const handleClick = () => {
    if (onStartLearning) {
      onStartLearning();
    } else {
      const el = document.getElementById('experience');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="final-cta-section" aria-label="Final Call to Action">
      {/* Subtle Orange Light Core Glow */}
      <div className="final-cta-ambient-glow" aria-hidden="true" />

      <div className="section-container final-cta-container">
        <div className="final-cta-content">
          <div className="final-cta-eyebrow">
            <span className="dot-pulse" aria-hidden="true" />
            <span>{BRAND.tagline}</span>
          </div>

          <h2 className="final-cta-headline">{BRAND.finalCtaHeadline}</h2>

          <p className="final-cta-supporting">{BRAND.finalCtaSupporting}</p>

          <div className="final-cta-actions">
            <button
              type="button"
              className="btn-final-primary"
              onClick={handleClick}
            >
              <span>{BRAND.ctaPrimary}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14m-7-7 7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="final-cta-secondary-text">
            <span>{BRAND.finalCtaSecondary}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
