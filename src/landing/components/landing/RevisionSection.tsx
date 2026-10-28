import React, { useState } from 'react';
import { BRAND } from '../../config/brand';

interface RevisionSectionProps {
  onOpenDeck?: () => void;
}

export const RevisionSection: React.FC<RevisionSectionProps> = () => {
  const [activeTab, setActiveTab] = useState<'revision' | 'progress'>('revision');

  return (
    <section className="revision-progress-section" id="revision" aria-label="Personalised Revision and Progress">
      <div className="section-container">
        {/* Section Header */}
        <div className="section-header-center">
          <div className="section-eyebrow-pill">
            <span className="eyebrow-text">RETENTION & MASTERY</span>
          </div>
          <h2 className="section-main-headline">{BRAND.revisionHeadline}</h2>
          <p className="section-description">{BRAND.revisionDescription}</p>
        </div>

        {/* Feature Group Navigation Tabs */}
        <div className="revision-group-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'revision'}
            className={`tab-btn ${activeTab === 'revision' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('revision')}
          >
            Personalised Revision
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'progress'}
            className={`tab-btn ${activeTab === 'progress' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('progress')}
          >
            Progress & Mastery
          </button>
        </div>

        {/* Dual Pillar Content Grid */}
        <div className="revision-showcase-grid">
          {/* Left Column: Educational Strategy Breakdown */}
          <div className="pillar-details-card">
            {activeTab === 'revision' ? (
              <div className="pillar-content-block">
                <div className="pillar-tag">Spaced Practice System</div>
                <h3 className="pillar-heading">Turn mistakes into intuitive retention</h3>
                <p className="pillar-text">
                  {BRAND.name} continuously distills each incorrect answer and diagnostic hurdle into targeted retrieval sessions and adaptive spaced reinforcement.
                </p>

                <ul className="pillar-features-list">
                  <li className="pillar-feature-item">
                    <span className="feature-check-icon">✓</span>
                    <div>
                      <strong>Automated Mistake Extraction:</strong> Isolates the exact conceptual misstep and builds targeted practice sets around it.
                    </div>
                  </li>
                  <li className="pillar-feature-item">
                    <span className="feature-check-icon">✓</span>
                    <div>
                      <strong>Spaced Repetition Algorithm:</strong> Dynamically calculates review intervals to reinforce memory right before forgetting occurs.
                    </div>
                  </li>
                  <li className="pillar-feature-item">
                    <span className="feature-check-icon">✓</span>
                    <div>
                      <strong>Interleaved Practice:</strong> Alternates related principles to ensure long-term conceptual differentiation.
                    </div>
                  </li>
                </ul>
              </div>
            ) : (
              <div className="pillar-content-block">
                <div className="pillar-tag">Mastery Calibration</div>
                <h3 className="pillar-heading">Meaningful improvement, never vanity metrics</h3>
                <p className="pillar-text">
                  We measure depth of understanding across problem transfer and prerequisite resilience, avoiding superficial time-spent counters.
                </p>

                <ul className="pillar-features-list">
                  <li className="pillar-feature-item">
                    <span className="feature-check-icon">✓</span>
                    <div>
                      <strong>Multi-Angle Concept Verification:</strong> Confirms mastery only when principles are successfully transferred across varied contexts.
                    </div>
                  </li>
                  <li className="pillar-feature-item">
                    <span className="feature-check-icon">✓</span>
                    <div>
                      <strong>Prerequisite Health Map:</strong> Visualises how solidly foundational skills support current advanced learning goals.
                    </div>
                  </li>
                  <li className="pillar-feature-item">
                    <span className="feature-check-icon">✓</span>
                    <div>
                      <strong>Meaningful Milestones:</strong> Celebrates breakthrough moments of intuitive clarity rather than question volume.
                    </div>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Right Column: Live Interactive Preview */}
          <div className="pillar-preview-panel">
            {activeTab === 'revision' ? (
              <div className="revision-schedule-stage">
                <div className="stage-eyebrow">
                  <span>Spaced Review Pipeline</span>
                  <span className="sample-badge">Ebbinghaus Adaptive Curve</span>
                </div>

                {/* Adaptive Spaced Review Schedule Pipeline */}
                <div className="schedule-items-list">
                  {[
                    {
                      topic: "Newton's Cooling Law · Thermal Decay",
                      status: 'Review Due Today',
                      interval: 'Day 3 Interval',
                      stability: '94% Retention Probability',
                      highlight: true,
                    },
                    {
                      topic: 'Centripetal Acceleration Vectors',
                      status: 'Scheduled Tomorrow',
                      interval: 'Day 7 Interval',
                      stability: '89% Memory Stability',
                      highlight: false,
                    },
                    {
                      topic: 'Work-Kinetic Energy Conservation',
                      status: 'Retained',
                      interval: 'Day 14 Interval',
                      stability: '97% Memory Stability',
                      highlight: false,
                    },
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      className={`schedule-item-card ${item.highlight ? 'is-active' : ''}`}
                    >
                      <div className="schedule-item-top">
                        <span className="schedule-topic-name">{item.topic}</span>
                        <span
                          className={`schedule-status-pill ${
                            item.highlight ? 'status-amber' : ''
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="schedule-item-meta">
                        <span className="meta-interval">{item.interval}</span>
                        <span className="meta-dot">•</span>
                        <span className="meta-stability">{item.stability}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Memory Decay Interval Steps */}
                <div className="interval-steps-track">
                  <span className="track-label">Interval Expansion:</span>
                  <div className="track-badges">
                    <span className="interval-pill completed">Day 1</span>
                    <span className="track-arrow">→</span>
                    <span className="interval-pill active">Day 3</span>
                    <span className="track-arrow">→</span>
                    <span className="interval-pill upcoming">Day 7</span>
                    <span className="track-arrow">→</span>
                    <span className="interval-pill upcoming">Day 14</span>
                    <span className="track-arrow">→</span>
                    <span className="interval-pill upcoming">Day 30</span>
                  </div>
                </div>

                <div className="retention-curve-note">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FC710C" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Optimal intervals expand dynamically as consecutive retrieval checkpoints succeed.</span>
                </div>
              </div>
            ) : (
              <div className="progress-graph-stage">
                <div className="stage-eyebrow">
                  <span>Concept Mastery Trajectory</span>
                  <span className="sample-badge">Sample Model</span>
                </div>

                {/* Progress bars & retention trajectory */}
                <div className="mastery-bars-container">
                  {[
                    { topic: 'Classical Kinematics', pct: 94, state: 'Solidified' },
                    { topic: "Newton's Force Laws", pct: 88, state: 'Proficient' },
                    { topic: 'Work & Energy Conservation', pct: 68, state: 'Reinforcing' },
                    { topic: 'Rotational Equilibrium', pct: 45, state: 'Acquiring' },
                  ].map((item) => (
                    <div key={item.topic} className="mastery-item-row">
                      <div className="mastery-meta-line">
                        <span className="mastery-name">{item.topic}</span>
                        <span className="mastery-score" style={{ color: item.pct > 75 ? '#FE9400' : '#FC710C' }}>
                          {item.pct}% · {item.state}
                        </span>
                      </div>
                      <div className="mastery-track-bar">
                        <div
                          className="mastery-fill-bar"
                          style={{
                            width: `${item.pct}%`,
                            backgroundColor: item.pct > 75 ? '#FE9400' : '#FC710C',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="retention-curve-note">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FC710C" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Optimal review intervals adapt as consecutive retrievals succeed.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
