import React from 'react';
import { BRAND } from '../../config/brand';

interface PrincipleItem {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

export const PrinciplesStrip: React.FC = () => {
  const principles: PrincipleItem[] = [
    {
      id: 'p1',
      title: 'Questions First',
      subtitle: 'Diagnose intuition before reading theory',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FC710C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      ),
    },
    {
      id: 'p2',
      title: 'Adaptive Practice',
      subtitle: 'Questions calibrate dynamically to reasoning',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FE9400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="m4.93 4.93 2.83 2.83" />
          <path d="m16.24 16.24 2.83 2.83" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
          <path d="m4.93 19.07 2.83-2.83" />
          <path d="m16.24 7.76 2.83-2.83" />
        </svg>
      ),
    },
    {
      id: 'p3',
      title: 'Visual Understanding',
      subtitle: 'Simulate variables and observe causality',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F37F58" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
        </svg>
      ),
    },
    {
      id: 'p4',
      title: 'Lasting Mastery',
      subtitle: 'Spaced revision for enduring retention',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F7B198" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
  ];

  return (
    <section className="principles-strip-section" aria-label="Learning Principles">
      <div className="principles-container">
        {/* Section Label */}
        <div className="principles-header">
          <span className="principles-label">{BRAND.principlesLabel}</span>
        </div>

        {/* 4 Quiet Principles with Subtle Dividers */}
        <div className="principles-grid">
          {principles.map((item, index) => (
            <div key={item.id} className="principle-card">
              <div className="principle-icon-wrapper" aria-hidden="true">
                {item.icon}
              </div>
              <div className="principle-text-wrap">
                <h3 className="principle-title">{item.title}</h3>
                <p className="principle-subtitle">{item.subtitle}</p>
              </div>
              {index < principles.length - 1 && (
                <div className="principle-divider" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
