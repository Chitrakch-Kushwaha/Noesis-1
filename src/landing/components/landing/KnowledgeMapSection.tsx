import React, { useState } from 'react';
import { BRAND } from '../../config/brand';

interface ConceptNode {
  id: string;
  name: string;
  category: string;
  state: 'completed' | 'active' | 'upcoming' | 'challenge';
  x: number;
  y: number;
  masteryPct: number;
  description: string;
  prerequisites: string[];
  unlocks: string[];
}

export const KnowledgeMapSection: React.FC = () => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('work-energy');
  const [explorationFeedback, setExplorationFeedback] = useState<string | null>(null);

  const nodes: ConceptNode[] = [
    {
      id: 'motion-1d',
      name: '1D Kinematics',
      category: 'Foundations',
      state: 'completed',
      x: 100,
      y: 190,
      masteryPct: 96,
      description:
        'Displacement, instantaneous velocity, and constant acceleration equations. The mathematical language describing how things move.',
      prerequisites: ['Coordinate Systems', 'Algebraic Vectors'],
      unlocks: ["Newton's Laws", 'Projectile Motion'],
    },
    {
      id: 'newtons-laws',
      name: "Newton's Laws",
      category: 'Dynamics',
      state: 'completed',
      x: 270,
      y: 110,
      masteryPct: 88,
      description:
        'Inertia, F = ma, and equal-opposite reaction pairs. Understanding the causal relationship between external force and changes in state of motion.',
      prerequisites: ['1D Kinematics', 'Free-Body Diagrams'],
      unlocks: ['Work & Energy', 'Frictional Dissipation'],
    },
    {
      id: 'work-energy',
      name: 'Work & Energy',
      category: 'Conservation Principles',
      state: 'active',
      x: 470,
      y: 190,
      masteryPct: 68,
      description:
        'Work done by a force (W = F · d), kinetic energy, conservative forces, and potential energy landscapes. Solving mechanics without time-integration.',
      prerequisites: ["Newton's Laws", 'Scalar Dot Products'],
      unlocks: ['Rotational Dynamics', 'Thermodynamics Foundations'],
    },
    {
      id: 'rotation',
      name: 'Rotational Dynamics',
      category: 'Angular Mechanics',
      state: 'upcoming',
      x: 670,
      y: 120,
      masteryPct: 0,
      description:
        'Torque, moment of inertia, and angular momentum conservation. Translating linear kinematic rules into rotational counterparts.',
      prerequisites: ['Work & Energy', 'Centripetal Acceleration'],
      unlocks: ['Rigid Body Precession', 'Orbital Mechanics'],
    },
    {
      id: 'relativistic-dynamics',
      name: 'Relativistic Dynamics',
      category: 'Advanced Frontier',
      state: 'challenge',
      x: 830,
      y: 200,
      masteryPct: 0,
      description:
        'Special relativity, Lorentz invariance, time dilation, and momentum at velocities approaching c. A synthesis challenge exploring where classical physics yields.',
      prerequisites: ['Rotational Dynamics', 'Electromagnetism'],
      unlocks: ['General Relativity', 'Cosmology'],
    },
  ];

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[2]!;

  const handleExplore = (nodeName: string) => {
    setExplorationFeedback(
      `Concept module preview for "${nodeName}" queued. Diagnostic question loaded into session.`
    );
    setTimeout(() => setExplorationFeedback(null), 4000);
  };

  return (
    <section className="knowledge-map-section" id="knowledge-map" aria-label="Interactive Knowledge Map">
      <div className="section-container">
        {/* Section Header */}
        <div className="section-header-center">
          <div className="section-eyebrow-pill">
            <span className="eyebrow-text">CURRICULUM TOPOLOGY</span>
          </div>
          <h2 className="section-main-headline">{BRAND.knowledgeMapHeadline}</h2>
          <p className="section-description">{BRAND.knowledgeMapDescription}</p>
        </div>

        {/* Legend */}
        <div className="map-legend-row" aria-label="Knowledge Map Node States">
          <div className="legend-item">
            <span className="legend-pill state-completed">
              <span className="legend-symbol">✓</span>
            </span>
            <span className="legend-text">Completed</span>
          </div>
          <div className="legend-item">
            <span className="legend-pill state-active">
              <span className="legend-symbol">◉</span>
            </span>
            <span className="legend-text">Active Focus</span>
          </div>
          <div className="legend-item">
            <span className="legend-pill state-upcoming">
              <span className="legend-symbol">○</span>
            </span>
            <span className="legend-text">Upcoming</span>
          </div>
          <div className="legend-item">
            <span className="legend-pill state-challenge">
              <span className="legend-symbol">🔒</span>
            </span>
            <span className="legend-text">Locked Challenge</span>
          </div>
        </div>

        {/* Interactive Graph & Detail Panel Layout */}
        <div className="knowledge-map-layout">
          {/* SVG Graph Viewport */}
          <div className="map-svg-wrapper">
            <svg
              viewBox="0 0 920 320"
              className="map-interactive-svg"
              role="img"
              aria-label="Interactive concept node network showing Motion connecting to Newton's Laws, Work & Energy, and Rotation"
            >
              <defs>
                {/* Active node glow filter */}
                <filter id="active-orange-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#FC710C" floodOpacity="0.6" />
                </filter>
                <filter id="amber-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#FE9400" floodOpacity="0.4" />
                </filter>
              </defs>

              {/* Connecting Pathway Lines */}
              {/* Line 1: Motion -> Newton's Laws (Completed) */}
              <line
                x1="100"
                y1="190"
                x2="270"
                y2="110"
                stroke="#FE9400"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.85"
              />

              {/* Line 2: Newton's Laws -> Work & Energy (Active) */}
              <line
                x1="270"
                y1="110"
                x2="470"
                y2="190"
                stroke="#FC710C"
                strokeWidth="3"
                strokeLinecap="round"
              />

              {/* Line 3: Work & Energy -> Rotation (Upcoming) */}
              <line
                x1="470"
                y1="190"
                x2="670"
                y2="120"
                stroke="#515151"
                strokeWidth="2"
                strokeDasharray="6 6"
                strokeLinecap="round"
              />

              {/* Line 4: Rotation -> Relativistic Dynamics (Locked Challenge) */}
              <line
                x1="670"
                y1="120"
                x2="830"
                y2="200"
                stroke="#333333"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                strokeLinecap="round"
              />

              {/* Interactive Nodes */}
              {nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                let strokeColor = '#515151';
                let fillColor = '#141517';
                let stateSymbol = '○';
                let filterProp: string | undefined = undefined;

                if (node.state === 'completed') {
                  strokeColor = '#FE9400';
                  fillColor = '#141517';
                  stateSymbol = '✓';
                  filterProp = 'url(#amber-glow)';
                } else if (node.state === 'active') {
                  strokeColor = '#FC710C';
                  fillColor = '#2F231A';
                  stateSymbol = '●';
                  filterProp = 'url(#active-orange-glow)';
                } else if (node.state === 'challenge') {
                  strokeColor = '#515151';
                  fillColor = '#100e0d';
                  stateSymbol = '🔒';
                }

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={() => setSelectedNodeId(node.id)}
                    className="map-node-group"
                    role="button"
                    tabIndex={0}
                    aria-label={`Node: ${node.name}, Status: ${node.state}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedNodeId(node.id);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Outer Selection Highlight Ring */}
                    {isSelected && (
                      <circle
                        r="34"
                        fill="none"
                        stroke="#FE9400"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                        opacity="0.8"
                      />
                    )}

                    {/* Main Node Circle */}
                    <circle
                      r="26"
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={node.state === 'active' || isSelected ? '3' : '2'}
                      filter={filterProp}
                    />

                    {/* Node State Symbol / Icon */}
                    <text
                      textAnchor="middle"
                      dy="5"
                      fill={
                        node.state === 'completed'
                          ? '#FE9400'
                          : node.state === 'active'
                          ? '#FC710C'
                          : '#A5A19E'
                      }
                      fontSize="14"
                      fontWeight="700"
                      aria-hidden="true"
                    >
                      {stateSymbol}
                    </text>

                    {/* Node Label Below */}
                    <text
                      textAnchor="middle"
                      dy="45"
                      fill={isSelected ? '#F5F5F5' : '#A5A19E'}
                      fontSize="12"
                      fontWeight={isSelected ? '600' : '400'}
                    >
                      {node.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Node Detail Drawer / Panel */}
          <div className="map-detail-panel" aria-live="polite">
            <div className="panel-badge-row">
              <span className={`status-pill status-${selectedNode.state}`}>
                {selectedNode.state === 'completed' && '✓ Mastered'}
                {selectedNode.state === 'active' && '◉ Current Focus'}
                {selectedNode.state === 'upcoming' && '○ Upcoming'}
                {selectedNode.state === 'challenge' && '🔒 Advanced Challenge'}
              </span>
              <span className="category-pill">{selectedNode.category}</span>
            </div>

            <h3 className="panel-node-title">{selectedNode.name}</h3>

            <p className="panel-node-description">{selectedNode.description}</p>

            {/* Mastery Progress Meter */}
            <div className="panel-metric-block">
              <div className="metric-header">
                <span className="metric-label">Demonstrated Mastery</span>
                <span className="metric-val">{selectedNode.masteryPct}%</span>
              </div>
              <div className="metric-track">
                <div
                  className="metric-fill"
                  style={{
                    width: `${selectedNode.masteryPct}%`,
                    backgroundColor:
                      selectedNode.state === 'completed'
                        ? '#FE9400'
                        : selectedNode.state === 'active'
                        ? '#FC710C'
                        : '#515151',
                  }}
                />
              </div>
            </div>

            {/* Prerequisites & Unlocks */}
            <div className="panel-connections-grid">
              <div className="conn-col">
                <span className="conn-label">Prerequisites</span>
                <div className="conn-tags">
                  {selectedNode.prerequisites.map((p) => (
                    <span key={p} className="conn-tag">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <div className="conn-col">
                <span className="conn-label">Unlocks Next</span>
                <div className="conn-tags">
                  {selectedNode.unlocks.map((u) => (
                    <span key={u} className="conn-tag highlight">
                      {u}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Action CTA */}
            <div className="panel-action-wrap">
              <button
                type="button"
                className="btn-explore-concept"
                onClick={() => handleExplore(selectedNode.name)}
              >
                <span>Explore Concept</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14m-7-7 7 7-7 7" />
                </svg>
              </button>

              {explorationFeedback && (
                <div className="explore-feedback-msg" role="status">
                  {explorationFeedback}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
