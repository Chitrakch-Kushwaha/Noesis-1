import React, { useState } from 'react';
import { BRAND } from '../../config/brand';

interface HeroDashboardProps {
  className?: string;
}

type TabType = 'dashboard' | 'learn' | 'map' | 'revision' | 'progress';

interface AnswerOption {
  id: string;
  label: string;
  text: string;
  isCorrect: boolean;
  misconceptionExplanation?: string;
}

export const HeroDashboard: React.FC<HeroDashboardProps> = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState<TabType>('learn');
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [masteryScore, setMasteryScore] = useState<number>(78);

  const options: AnswerOption[] = [
    {
      id: 'opt-a',
      label: 'A',
      text: 'It becomes zero.',
      isCorrect: false,
      misconceptionExplanation:
        'Velocity momentarily becomes zero at the apogee, but acceleration does not. If acceleration were zero, the ball would remain suspended in mid-air indefinitely!',
    },
    {
      id: 'opt-b',
      label: 'B',
      text: 'It remains approximately 9.8 m/s² downward.',
      isCorrect: true,
      misconceptionExplanation:
        'Correct! Near Earth’s surface, gravity exerts an unchanging downward force F = mg regardless of instantaneous velocity. At the apex, v = 0 m/s, but rate of change of velocity remains a = g = 9.8 m/s² downwards.',
    },
    {
      id: 'opt-c',
      label: 'C',
      text: 'It changes direction and points upward.',
      isCorrect: false,
      misconceptionExplanation:
        'Gravitational pull is always directed towards the center of Earth (downward). The force does not flip direction at the peak.',
    },
    {
      id: 'opt-d',
      label: 'D',
      text: "It depends on the ball's mass.",
      isCorrect: false,
      misconceptionExplanation:
        'Free-fall acceleration is invariant with respect to mass (Galileo’s equivalence principle). While F = mg varies with mass, a = F/m = g remains constant.',
    },
  ];

  const handleSelectOption = (id: string) => {
    setSelectedAnswerId(id);
    setHasSubmitted(true);
    const selected = options.find((o) => o.id === id);
    if (selected?.isCorrect) {
      setShowExplanation(true);
      setShowHint(false);
      setMasteryScore(86);
    } else {
      setShowHint(true);
      setShowExplanation(false);
    }
  };

  const handleReset = () => {
    setSelectedAnswerId(null);
    setHasSubmitted(false);
    setShowHint(false);
    setShowExplanation(false);
    setMasteryScore(78);
  };

  const selectedOption = options.find((o) => o.id === selectedAnswerId);

  return (
    <div
      className={`hero-dashboard-container ${className}`}
      id="hero-dashboard-preview"
      style={{
        position: 'relative',
        zIndex: 2,
        borderRadius: '18px',
        backgroundColor: '#141517',
        border: '1px solid rgba(81, 81, 81, 0.45)',
        boxShadow:
          '0 28px 80px -15px rgba(0, 0, 0, 0.85), 0 0 40px -8px rgba(252, 113, 12, 0.18)',
        overflow: 'hidden',
        color: '#F5F5F5',
      }}
    >
      {/* Top Application Window Chrome Bar */}
      <div
        className="dashboard-chrome-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.25rem',
          backgroundColor: '#0c0d0e',
          borderBottom: '1px solid rgba(81, 81, 81, 0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#515151',
              display: 'inline-block',
            }}
          />
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#515151',
              display: 'inline-block',
              opacity: 0.6,
            }}
          />
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#515151',
              display: 'inline-block',
              opacity: 0.3,
            }}
          />
          <span
            style={{
              marginLeft: '0.75rem',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#A5A19E',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {BRAND.name} Workspace · Physics · Kinematics
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px',
              backgroundColor: 'rgba(252, 113, 12, 0.12)',
              color: '#FC710C',
              border: '1px solid rgba(252, 113, 12, 0.25)',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#FC710C',
              }}
            />
            Adaptive Session Active
          </span>
        </div>
      </div>

      {/* Main Dashboard Layout: Sidebar + Main Stage */}
      <div
        className="dashboard-body-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          minHeight: '520px',
        }}
      >
        {/* Sidebar */}
        <aside
          className="dashboard-sidebar"
          style={{
            backgroundColor: '#0f1012',
            borderRight: '1px solid rgba(81, 81, 81, 0.25)',
            padding: '1.25rem 0.875rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#A5A19E',
                paddingLeft: '0.75rem',
                marginBottom: '0.75rem',
              }}
            >
              Navigation
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[
                {
                  id: 'dashboard',
                  label: 'Dashboard',
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect width="7" height="9" x="3" y="3" rx="1" />
                      <rect width="7" height="5" x="14" y="3" rx="1" />
                      <rect width="7" height="9" x="14" y="12" rx="1" />
                      <rect width="7" height="5" x="3" y="16" rx="1" />
                    </svg>
                  ),
                },
                {
                  id: 'learn',
                  label: 'Learn',
                  badge: 'Active',
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polygon points="10 8 16 12 10 16 10 8" />
                    </svg>
                  ),
                },
                {
                  id: 'map',
                  label: 'Knowledge Map',
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  ),
                },
                {
                  id: 'revision',
                  label: 'Revision',
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 21h5v-5" />
                    </svg>
                  ),
                },
                {
                  id: 'progress',
                  label: 'Progress',
                  icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3v18h18" />
                      <path d="m19 9-5 5-4-4-3 3" />
                    </svg>
                  ),
                },
              ].map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id as TabType)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '0.625rem 0.75rem',
                      borderRadius: '8px',
                      backgroundColor: isActive
                        ? 'rgba(252, 113, 12, 0.12)'
                        : 'transparent',
                      color: isActive ? '#FC710C' : '#A5A19E',
                      border: isActive
                        ? '1px solid rgba(252, 113, 12, 0.3)'
                        : '1px solid transparent',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      fontWeight: isActive ? 600 : 500,
                      textAlign: 'left',
                      transition: 'all 0.18s ease-out',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                      {item.icon}
                      {item.label}
                    </span>
                    {item.badge && (
                      <span
                        style={{
                          fontSize: '0.625rem',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          backgroundColor: '#FC710C',
                          color: '#FFFFFF',
                          fontWeight: 700,
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Mini Widget: Spaced Revision Status */}
          <div
            style={{
              padding: '0.875rem',
              borderRadius: '10px',
              backgroundColor: '#141517',
              border: '1px solid rgba(81, 81, 81, 0.3)',
              marginTop: '1.5rem',
            }}
          >
            <div
              style={{
                fontSize: '0.6875rem',
                color: '#A5A19E',
                marginBottom: '0.375rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Scheduled Review
            </div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#F5F5F5' }}>
              Free Fall & G-Vectors
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '0.375rem',
                fontSize: '0.6875rem',
                color: '#FE9400',
              }}
            >
              <span>Due in 4 hours</span>
            </div>
          </div>
        </aside>

        {/* Main Learning Panel */}
        <main
          className="dashboard-main-content"
          style={{
            padding: '1.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            backgroundColor: '#141517',
          }}
        >
          {/* Question Header & Context */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '1rem',
              borderBottom: '1px solid rgba(81, 81, 81, 0.25)',
              paddingBottom: '1rem',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#FE9400',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: '0.375rem',
                }}
              >
                <span>Diagnostic Step 01</span>
                <span>•</span>
                <span style={{ color: '#A5A19E' }}>Gravitational Kinematics</span>
              </div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.1875rem',
                  fontWeight: 600,
                  color: '#F5F5F5',
                  lineHeight: 1.4,
                  letterSpacing: '-0.01em',
                }}
              >
                A ball is thrown vertically upward. What happens to its acceleration at the highest point?
              </h3>
            </div>

            <button
              type="button"
              onClick={handleReset}
              title="Reset question to try another answer"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(81, 81, 81, 0.4)',
                color: '#A5A19E',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              Reset
            </button>
          </div>

          {/* Four Interactive Answer Options */}
          <div
            className="answer-options-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {options.map((opt) => {
              const isSelected = selectedAnswerId === opt.id;
              let borderColor = 'rgba(81, 81, 81, 0.35)';
              let bgColor = '#18191c';
              let badgeColor = '#A5A19E';

              if (isSelected) {
                if (opt.isCorrect) {
                  borderColor = '#FE9400';
                  bgColor = 'rgba(254, 148, 0, 0.1)';
                  badgeColor = '#FE9400';
                } else {
                  borderColor = '#FC710C';
                  bgColor = 'rgba(252, 113, 12, 0.08)';
                  badgeColor = '#FC710C';
                }
              }

              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectOption(opt.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.875rem',
                    padding: '1rem 1.125rem',
                    borderRadius: '12px',
                    backgroundColor: bgColor,
                    border: `1px solid ${borderColor}`,
                    color: '#F5F5F5',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                    boxShadow: isSelected
                      ? '0 0 20px -5px rgba(252, 113, 12, 0.25)'
                      : 'none',
                  }}
                  aria-pressed={isSelected}
                >
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: isSelected
                        ? badgeColor
                        : 'rgba(81, 81, 81, 0.2)',
                      color: isSelected ? '#050505' : '#A5A19E',
                      flexShrink: 0,
                    }}
                  >
                    {opt.label}
                  </span>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      lineHeight: 1.45,
                      fontWeight: isSelected ? 500 : 400,
                    }}
                  >
                    {opt.text}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Feedback & Diagnostic Hint Area */}
          <div
            className="feedback-area"
            style={{
              minHeight: '84px',
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              backgroundColor: hasSubmitted
                ? selectedOption?.isCorrect
                  ? 'rgba(254, 148, 0, 0.08)'
                  : 'rgba(252, 113, 12, 0.06)'
                : 'rgba(20, 21, 23, 0.6)',
              border: `1px solid ${
                hasSubmitted
                  ? selectedOption?.isCorrect
                    ? 'rgba(254, 148, 0, 0.4)'
                    : 'rgba(252, 113, 12, 0.35)'
                  : 'rgba(81, 81, 81, 0.25)'
              }`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            {!hasSubmitted ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  color: '#A5A19E',
                  fontSize: '0.8125rem',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FC710C" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Select an answer above to trigger immediate adaptive diagnostic feedback.
              </div>
            ) : selectedOption?.isCorrect ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: '#FE9400',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    marginBottom: '0.25rem',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Intuition Verified · Mastery Gained (+8%)
                </div>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#F5F5F5', lineHeight: 1.5 }}>
                  {selectedOption.misconceptionExplanation}
                </p>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    marginBottom: '0.25rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      color: '#FC710C',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Common Intuitive Misconception Detected
                  </div>
                  {!showExplanation && (
                    <button
                      type="button"
                      onClick={() => setShowExplanation(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#FE9400',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                      }}
                    >
                      Show Full Explanation
                    </button>
                  )}
                </div>

                {showHint && !showExplanation && (
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#F5F5F5', lineHeight: 1.5 }}>
                    <strong style={{ color: '#F7B198' }}>Diagnostic Hint:</strong> Consider Newton’s Second Law (F = ma). Does gravitational pull vanish just because the vertical velocity passes momentarily through zero? What force is acting?
                  </p>
                )}

                {showExplanation && (
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: '#F5F5F5', lineHeight: 1.5 }}>
                    {selectedOption?.misconceptionExplanation}{' '}
                    <span style={{ color: '#FE9400' }}>
                      Key takeaway: Acceleration is determined by net force, not instantaneous speed!
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Secondary Dashboard Indicators Strip */}
          <div
            className="dashboard-indicators-strip"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid rgba(81, 81, 81, 0.2)',
            }}
          >
            {/* 1. Concept Mastery Indicator */}
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                backgroundColor: '#0c0d0e',
                border: '1px solid rgba(81, 81, 81, 0.25)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                <span style={{ fontSize: '0.6875rem', color: '#A5A19E', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Concept Mastery
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#FE9400' }}>
                  {masteryScore}%
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: 'rgba(81, 81, 81, 0.3)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${masteryScore}%`,
                    height: '100%',
                    backgroundColor: '#FE9400',
                    transition: 'width 0.4s ease-out',
                  }}
                />
              </div>
            </div>

            {/* 2. Miniature Connected Knowledge Map */}
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                backgroundColor: '#0c0d0e',
                border: '1px solid rgba(81, 81, 81, 0.25)',
              }}
            >
              <span style={{ fontSize: '0.6875rem', color: '#A5A19E', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.375rem' }}>
                Learning Path
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.6875rem' }}>
                <span style={{ color: '#FE9400', fontWeight: 600 }}>1D Motion ✓</span>
                <span style={{ color: '#515151' }}>→</span>
                <span style={{ color: '#FC710C', fontWeight: 700, borderBottom: '1px solid #FC710C' }}>Free Fall</span>
                <span style={{ color: '#515151' }}>→</span>
                <span style={{ color: '#A5A19E' }}>Projectiles</span>
              </div>
            </div>

            {/* 3. Session Progress Checkpoints */}
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                backgroundColor: '#0c0d0e',
                border: '1px solid rgba(81, 81, 81, 0.25)',
              }}
            >
              <span style={{ fontSize: '0.6875rem', color: '#A5A19E', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.375rem' }}>
                Diagnostic Status
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {[1, 2, 3, 4, 5].map((idx) => (
                  <span
                    key={idx}
                    style={{
                      flex: 1,
                      height: '6px',
                      borderRadius: '2px',
                      backgroundColor:
                        idx <= 3
                          ? '#FE9400'
                          : idx === 4
                          ? hasSubmitted
                            ? selectedOption?.isCorrect
                              ? '#FE9400'
                              : '#FC710C'
                            : 'rgba(252, 113, 12, 0.35)'
                          : 'rgba(81, 81, 81, 0.25)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
