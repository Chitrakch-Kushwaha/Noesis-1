import React, { useState } from 'react';
import { Spotlight } from '../core/spotlight';
import { BRAND } from '../../config/brand';

export const FeaturesShowcase: React.FC = () => {
  // Feature 1: Adaptive Question state
  const [f1Selected, setF1Selected] = useState<number>(1);
  const [f1HintOpen, setF1HintOpen] = useState<boolean>(false);

  // Feature 2: Knowledge Map node state
  const [f2ActiveNode, setF2ActiveNode] = useState<string>('work');

  // Feature 3: Learn by Experimenting state (frequency slider)
  const [f3Frequency, setF3Frequency] = useState<number>(3);

  // Feature 4: AI Guide Hint counter
  const [f5HintStep, setF5HintStep] = useState<number>(1);

  return (
    <section className="features-showcase-section" id="features" aria-label="Features Showcase">
      <div className="section-container">
        {/* Section Header */}
        <div className="section-header-center">
          <div className="section-eyebrow-pill">
            <span className="eyebrow-text">{BRAND.featuresEyebrow}</span>
          </div>
          <h2 className="section-main-headline">{BRAND.featuresHeadline}</h2>
          <p className="section-description">{BRAND.featuresDescription}</p>
        </div>

        {/* 4 Feature Cards Grid: 3 in Row 1, 1 wide balanced card in Row 2 */}
        <div className="features-bento-grid">
          {/* Card 1: Adaptive Questions */}
          <div className="feature-card">
            <Spotlight
              className="feature-card-spotlight"
              size={260}
              color="rgba(252, 113, 12, 0.45)"
              style={{
                background:
                  'radial-gradient(circle at center, rgba(254, 148, 0, 0.5) 0%, rgba(252, 113, 12, 0.35) 30%, rgba(243, 127, 88, 0.12) 60%, transparent 80%)',
                filter: 'blur(26px)',
              }}
            />
            <div className="feature-card-inner">
              <div className="feature-card-header">
                <div className="feature-tag">Diagnostic Assessment</div>
                <h3 className="feature-title">Adaptive Questions</h3>
                <p className="feature-desc">
                  Every response helps shape the next question, adjusting the challenge to your demonstrated understanding.
                </p>
              </div>

              {/* Interactive Preview 1 */}
              <div className="feature-preview-box">
                <div className="micro-question-panel">
                  <div className="micro-meta-bar">
                    <span className="difficulty-pill">Difficulty: Tier 3</span>
                    <span className="step-pill">Q4 · Electric Flux</span>
                  </div>
                  <div className="micro-q-title">
                    Does flux depend on the enclosed charge or the Gaussian surface shape?
                  </div>
                  <div className="micro-options-list">
                    {[
                      { id: 0, text: 'Enclosed charge only (Gauss’s Law)' },
                      { id: 1, text: 'Both surface shape & charge' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setF1Selected(opt.id)}
                        className={`micro-opt-btn ${f1Selected === opt.id ? 'is-selected' : ''}`}
                      >
                        <span className="micro-opt-radio" />
                        <span>{opt.text}</span>
                      </button>
                    ))}
                  </div>
                  <div className="micro-hint-row">
                    <button
                      type="button"
                      onClick={() => setF1HintOpen(!f1HintOpen)}
                      className="micro-hint-toggle"
                    >
                      <span>{f1HintOpen ? 'Hide Hint' : 'Request Progressive Hint'}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d={f1HintOpen ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
                      </svg>
                    </button>
                    {f1HintOpen && (
                      <div className="micro-hint-content">
                        Think of electric flux as field lines piercing a net. Expanding the net without adding charges doesn't increase total lines!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Interactive Knowledge Map */}
          <div className="feature-card">
            <Spotlight
              className="feature-card-spotlight"
              size={260}
              color="rgba(252, 113, 12, 0.45)"
              style={{
                background:
                  'radial-gradient(circle at center, rgba(254, 148, 0, 0.5) 0%, rgba(252, 113, 12, 0.35) 30%, rgba(243, 127, 88, 0.12) 60%, transparent 80%)',
                filter: 'blur(26px)',
              }}
            />
            <div className="feature-card-inner">
              <div className="feature-card-header">
                <div className="feature-tag">Curriculum Intelligence</div>
                <h3 className="feature-title">Interactive Knowledge Map</h3>
                <p className="feature-desc">
                  Explore connected concepts, uncover missing prerequisites, and see your understanding grow.
                </p>
              </div>

              {/* Interactive Preview 2: Connected SVG nodes */}
              <div className="feature-preview-box">
                <div className="micro-map-canvas">
                  <svg viewBox="0 0 320 180" className="micro-map-svg" aria-hidden="true">
                    {/* Connection Lines */}
                    <line x1="60" y1="90" x2="160" y2="45" stroke="#FE9400" strokeWidth="2" strokeDasharray="3 3" opacity="0.6" />
                    <line x1="60" y1="90" x2="160" y2="135" stroke="#FC710C" strokeWidth="2" />
                    <line x1="160" y1="135" x2="260" y2="90" stroke="#515151" strokeWidth="1.5" />

                    {/* Node 1: Completed */}
                    <g
                      transform="translate(60, 90)"
                      onClick={() => setF2ActiveNode('vectors')}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle r="18" fill="#141517" stroke="#FE9400" strokeWidth="2" />
                      <text textAnchor="middle" dy="4" fill="#FE9400" fontSize="10" fontWeight="700">✓</text>
                      <text textAnchor="middle" dy="28" fill="#A5A19E" fontSize="9">Vectors</text>
                    </g>

                    {/* Node 2: Active */}
                    <g
                      transform="translate(160, 135)"
                      onClick={() => setF2ActiveNode('work')}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle r="20" fill="#2F231A" stroke="#FC710C" strokeWidth="2.5" />
                      <circle r="6" fill="#FC710C" />
                      <text textAnchor="middle" dy="32" fill="#F5F5F5" fontSize="10" fontWeight="600">Work & Energy</text>
                    </g>

                    {/* Node 3: Secondary */}
                    <g
                      transform="translate(160, 45)"
                      onClick={() => setF2ActiveNode('forces')}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle r="16" fill="#141517" stroke="#FE9400" strokeWidth="1.5" />
                      <text textAnchor="middle" dy="4" fill="#FE9400" fontSize="10">✓</text>
                      <text textAnchor="middle" dy="26" fill="#A5A19E" fontSize="9">Forces</text>
                    </g>

                    {/* Node 4: Upcoming */}
                    <g
                      transform="translate(260, 90)"
                      onClick={() => setF2ActiveNode('rotation')}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle r="16" fill="#141517" stroke="#515151" strokeWidth="1.5" />
                      <text textAnchor="middle" dy="4" fill="#A5A19E" fontSize="9">🔒</text>
                      <text textAnchor="middle" dy="28" fill="#A5A19E" fontSize="9">Rotational</text>
                    </g>
                  </svg>

                  <div className="micro-node-status-bar">
                    <span>Selected Node:</span>
                    <strong style={{ color: '#FC710C' }}>
                      {f2ActiveNode === 'vectors'
                        ? 'Vector Foundations (Mastered)'
                        : f2ActiveNode === 'work'
                        ? 'Work & Energy (In Progress)'
                        : f2ActiveNode === 'forces'
                        ? 'Newtonian Forces (Mastered)'
                        : 'Rotational Kinematics (Upcoming)'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Learn by Experimenting */}
          <div className="feature-card">
            <Spotlight
              className="feature-card-spotlight"
              size={260}
              color="rgba(252, 113, 12, 0.45)"
              style={{
                background:
                  'radial-gradient(circle at center, rgba(254, 148, 0, 0.5) 0%, rgba(252, 113, 12, 0.35) 30%, rgba(243, 127, 88, 0.12) 60%, transparent 80%)',
                filter: 'blur(26px)',
              }}
            />
            <div className="feature-card-inner">
              <div className="feature-card-header">
                <div className="feature-tag">Interactive Simulations</div>
                <h3 className="feature-title">Learn by Experimenting</h3>
                <p className="feature-desc">
                  Change variables, manipulate graphs, and explore how concepts behave in interactive simulations.
                </p>
              </div>

              {/* Interactive Preview 3: Live Wave Graph */}
              <div className="feature-preview-box">
                <div className="micro-sim-panel">
                  <div className="micro-sim-controls">
                    <label htmlFor="freq-slider" className="sim-label">
                      <span>Frequency:</span>
                      <strong style={{ color: '#FE9400' }}>{f3Frequency} Hz</strong>
                    </label>
                    <input
                      id="freq-slider"
                      type="range"
                      min="1"
                      max="6"
                      step="1"
                      value={f3Frequency}
                      onChange={(e) => setF3Frequency(Number(e.target.value))}
                      className="custom-range-slider"
                    />
                  </div>

                  <div className="wave-svg-container">
                    <svg viewBox="0 0 280 80" className="wave-svg" aria-hidden="true">
                      <path
                        d={Array.from({ length: 280 }, (_, x) => {
                          const y = 40 + Math.sin((x / 280) * Math.PI * 2 * f3Frequency) * 26;
                          return `${x === 0 ? 'M' : 'L'} ${x} ${y.toFixed(1)}`;
                        }).join(' ')}
                        fill="none"
                        stroke="#FC710C"
                        strokeWidth="2.5"
                      />
                      <line x1="0" y1="40" x2="280" y2="40" stroke="rgba(81, 81, 81, 0.4)" strokeDasharray="4 4" />
                    </svg>
                  </div>
                  <div className="sim-caption">
                    Wavelength λ shrinks as frequency increases (v = f · λ).
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: AI Learning Guide (Wide Balanced Row 2 Card) */}
          <div className="feature-card card-ai-wide">
            <Spotlight
              className="feature-card-spotlight"
              size={360}
              color="rgba(252, 113, 12, 0.45)"
              style={{
                background:
                  'radial-gradient(circle at center, rgba(254, 148, 0, 0.5) 0%, rgba(252, 113, 12, 0.35) 30%, rgba(243, 127, 88, 0.12) 60%, transparent 80%)',
                filter: 'blur(30px)',
              }}
            />
            <div className="feature-card-inner ai-wide-inner">
              <div className="ai-wide-content">
                <div className="feature-tag">Socratic Companion</div>
                <h3 className="feature-title">AI Learning Guide</h3>
                <p className="feature-desc">
                  Get progressive hints, guiding questions, and clear explanations when you need support.
                </p>
                <div className="ai-features-bullets">
                  <div className="ai-bullet">
                    <span className="bullet-dot" />
                    <span>Multi-tiered progressive hints that guide without giving away answers</span>
                  </div>
                  <div className="ai-bullet">
                    <span className="bullet-dot" />
                    <span>Pinpoints conceptual misconceptions in real-time</span>
                  </div>
                  <div className="ai-bullet">
                    <span className="bullet-dot" />
                    <span>Adaptive follow-up questions to solidify intuition</span>
                  </div>
                </div>
              </div>

              {/* Interactive Preview 4: Chat Dialogue with Progressive Hints */}
              <div className="feature-preview-box ai-wide-preview">
                <div className="micro-chat-panel">
                  <div className="chat-bubble student-bubble">
                    <span className="sender-tag">You</span>
                    <p>I calculated acceleration as zero at the top because it stops moving.</p>
                  </div>

                  <div className="chat-bubble ai-bubble">
                    <span className="sender-tag" style={{ color: '#FC710C' }}>{BRAND.name} Guide</span>
                    <p>
                      {f5HintStep === 1 && (
                        <>That’s an intuitive instinct! But imagine if acceleration were zero at the peak. By Newton's First Law, what would happen to the ball’s motion from that exact instant forward?</>
                      )}
                      {f5HintStep === 2 && (
                        <>Exactly. If acceleration stopped, it would float in place! Since gravity never takes a break, the velocity changes direction through zero at 9.8 m/s² downward.</>
                      )}
                    </p>
                    <div className="chat-actions-row">
                      <button
                        type="button"
                        className="chat-hint-chip"
                        onClick={() => setF5HintStep(f5HintStep === 1 ? 2 : 1)}
                      >
                        {f5HintStep === 1 ? 'Show Follow-up Step →' : '← Previous Step'}
                      </button>
                      <span className="step-counter">Guidance Step {f5HintStep} of 2</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
