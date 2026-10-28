import React, { useState } from 'react';
import { BRAND } from '../../config/brand';

interface JourneyStep {
  number: string;
  title: string;
  summary: string;
  deepDive: string;
  scenarioWrong: string;
  scenarioCorrect: string;
}

export const HowItWorks: React.FC = () => {
  const [activeStep, setActiveStep] = useState<number>(0);

  const steps: JourneyStep[] = [
    {
      number: '01',
      title: 'Attempt',
      summary: 'Start with a question that reveals what you already understand.',
      deepDive:
        'Instead of reading passive lecture summaries, you are presented with a real conceptual challenge. Your initial intuition uncovers how your mental model works before explanations are introduced.',
      scenarioWrong: 'An unexpected answer immediately flags subtle misconceptions without penalties.',
      scenarioCorrect: 'A correct instinct prompts a brief reasoning verification check.',
    },
    {
      number: '02',
      title: 'Discover',
      summary: 'Identify the misconception or missing concept behind the difficulty.',
      deepDive:
        `${BRAND.name} analyses your choice against known cognitive stumbling blocks, diagnosing whether difficulty stems from a prerequisite gap, vector direction confusion, or arithmetic oversight.`,
      scenarioWrong: 'Pins the exact missing prerequisite on your Knowledge Map.',
      scenarioCorrect: 'Confirms foundational reasoning rather than lucky guesswork.',
    },
    {
      number: '03',
      title: 'Understand',
      summary: 'Use hints, explanations, and visual exploration to build clarity.',
      deepDive:
        'Receive tiered Socratic hints that guide without spoiling. Manipulate variables in lightweight physics simulations to witness cause-and-effect directly on screen.',
      scenarioWrong: 'Provides progressive hints and unlocks an interactive simulation slider.',
      scenarioCorrect: 'Surfaces a deeper conceptual connection to solidify the principle.',
    },
    {
      number: '04',
      title: 'Master',
      summary: 'Demonstrate understanding and unlock the next learning opportunity.',
      deepDive:
        'Apply your strengthened intuition to a transfer problem. Once genuine understanding is demonstrated, the node illuminates in amber on your Knowledge Map and schedules spaced review.',
      scenarioWrong: 'Schedules an automated spaced flashcard for retention reinforcement.',
      scenarioCorrect: 'Unlocks next-level concepts and optional Chocolate Problems.',
    },
  ];

  return (
    <section className="how-it-works-section" id="journey" aria-label="How Learning Works">
      <div className="section-container">
        {/* Header */}
        <div className="section-header-center">
          <div className="section-eyebrow-pill">
            <span className="eyebrow-text">{BRAND.journeyEyebrow}</span>
          </div>
          <h2 className="section-main-headline">{BRAND.journeyHeadline}</h2>
          <p className="section-description">
            A continuous loop that adapts whether your answer is fully confident or reveals a misunderstanding.
          </p>
        </div>

        {/* 4 Interactive Journey Nodes */}
        <div className="journey-pathway-wrapper">
          {/* Top Step Selectors */}
          <div className="journey-steps-nav" role="tablist" aria-label="Learning Journey Steps">
            {steps.map((step, idx) => {
              const isActive = activeStep === idx;
              return (
                <button
                  key={step.number}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`journey-step-btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => setActiveStep(idx)}
                >
                  <div className="step-num-pill">{step.number}</div>
                  <div className="step-nav-text">
                    <span className="step-title">{step.title}</span>
                  </div>
                  {idx < steps.length - 1 && <span className="step-connector-line" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          {/* Active Step Deep Dive Card */}
          <div className="journey-detail-card" role="tabpanel">
            <div className="journey-card-header">
              <span className="step-indicator-large">Step {steps[activeStep]!.number}</span>
              <h3 className="journey-step-heading">{steps[activeStep]!.title}</h3>
              <p className="journey-step-summary">{steps[activeStep]!.summary}</p>
            </div>

            <p className="journey-deep-dive-text">{steps[activeStep]!.deepDive}</p>

            {/* Adaptive Branching Logic Visual */}
            <div className="adaptive-branching-box">
              <div className="branch-col branch-incorrect">
                <div className="branch-badge">
                  <span className="branch-dot dot-orange" />
                  If Difficulty Occurs
                </div>
                <p className="branch-text">{steps[activeStep]!.scenarioWrong}</p>
              </div>

              <div className="branch-divider" aria-hidden="true" />

              <div className="branch-col branch-correct">
                <div className="branch-badge">
                  <span className="branch-dot dot-amber" />
                  When Concept Is Grasped
                </div>
                <p className="branch-text">{steps[activeStep]!.scenarioCorrect}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
