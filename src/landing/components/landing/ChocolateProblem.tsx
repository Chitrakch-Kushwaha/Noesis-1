import React, { useState } from 'react';
import { BRAND } from '../../config/brand';

export const ChocolateProblem: React.FC = () => {
  const [isPreviewExpanded, setIsPreviewExpanded] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);

  return (
    <section className="chocolate-problem-section" id="challenges" aria-label="Advanced Chocolate Problems">
      <div className="section-container">
        {/* Header */}
        <div className="section-header-center">
          <div className="section-eyebrow-pill eyebrow-warm">
            <span className="eyebrow-text">{BRAND.challengeEyebrow}</span>
          </div>
          <h2 className="section-main-headline">{BRAND.challengeHeadline}</h2>
          <p className="section-description">{BRAND.challengeDescription}</p>
        </div>

        {/* Premium Warm Raised Card */}
        <div className="chocolate-card-wrap">
          <div className="chocolate-card">
            {/* Top Meta Bar */}
            <div className="card-top-bar">
              <div className="card-badge-warm">
                <span className="star-icon">✦</span>
                <span>Chocolate Problem #42 · Sample Challenge</span>
              </div>
              <div className="difficulty-badge-level">
                Level 4: Advanced Synthesis
              </div>
            </div>

            {/* Title & Core Conceptual Paradox */}
            <h3 className="chocolate-problem-title">
              The Relativistic Train and the Tunnel Paradox
            </h3>

            <p className="chocolate-problem-prompt">
              A 200-meter high-speed relativistic train travels at 0.8c toward a 150-meter tunnel. From the tunnel observer’s reference frame, relativistic Lorentz contraction shortens the train to 120 meters—comfortably fitting inside. Both tunnel blast doors can shut simultaneously for a split millisecond with the train inside.
            </p>

            <p className="chocolate-problem-question">
              However, from the train passenger’s frame of reference, it is the tunnel that contracts to a mere 90 meters, while the train remains 200 meters long! How can a 200-meter train fit inside a 90-meter tunnel when both doors close? Does the train crash into the closed doors?
            </p>

            {/* Connected Concept Tags */}
            <div className="connected-concepts-row">
              <span className="tags-label">Connected Concepts:</span>
              <div className="tags-list">
                <span className="concept-pill">Special Relativity</span>
                <span className="concept-pill">Lorentz Contraction</span>
                <span className="concept-pill">Relativity of Simultaneity</span>
                <span className="concept-pill">Minkowski Spacetime</span>
              </div>
            </div>

            {/* Interactive Preview & Hint Actions */}
            <div className="chocolate-actions-row">
              <button
                type="button"
                className="btn-preview-challenge"
                onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
                aria-expanded={isPreviewExpanded}
              >
                <span>{isPreviewExpanded ? 'Hide Challenge Breakdown' : 'Preview Challenge'}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className={isPreviewExpanded ? 'rotate-icon' : ''}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {isPreviewExpanded && (
                <button
                  type="button"
                  className="btn-challenge-hint-toggle"
                  onClick={() => setShowHint(!showHint)}
                >
                  {showHint ? 'Hide Socratic Hint' : 'Request Socratic Hint'}
                </button>
              )}
            </div>

            {/* Expanded Detailed Breakdown Area */}
            {isPreviewExpanded && (
              <div className="challenge-expanded-drawer">
                <div className="expanded-inner-box">
                  <div className="challenge-paradox-resolution">
                    <h4 className="resolution-heading">
                      <span className="accent-mark">◆</span> The Core Breakthrough: Simultaneity is Relative
                    </h4>
                    <p className="resolution-text">
                      Events that are simultaneous in the tunnel frame are <em>not</em> simultaneous in the train’s frame. In the train’s reference frame, the front door closes and re-opens <strong>before</strong> the back door shuts! The train passes through without incident.
                    </p>
                  </div>

                  {showHint && (
                    <div className="socratic-hint-box">
                      <div className="hint-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FC710C" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <span>Socratic Clue</span>
                      </div>
                      <p className="hint-text">
                        Lorentz transformation for time: Δt' = γ(Δt - vΔx / c²). Because the two tunnel doors are separated in space (Δx ≠ 0), two events occurring at the exact same tunnel time (Δt = 0) must occur at different train times (Δt' ≠ 0).
                      </p>
                    </div>
                  )}

                  <div className="challenge-disclaimer">
                    Note: This is an illustrative frontend sample challenge demonstrating Noesis’s advanced synthesis tier. Full problem verification engines evaluate mathematical derivations step-by-step.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
