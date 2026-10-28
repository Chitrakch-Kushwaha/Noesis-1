import React, { useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { BRAND } from '../../config/brand';

export const Footer: React.FC = () => {
  const [modalTopic, setModalTopic] = useState<{ title: string; content: string } | null>(null);

  const openPlaceholderModal = (title: string, content: string) => {
    setModalTopic({ title, content });
  };

  const closeModal = () => {
    setModalTopic(null);
  };

  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="section-container footer-container">
        {/* Top Footer Grid */}
        <div className="footer-top-grid">
          {/* Brand & Description Column */}
          <div className="footer-brand-col">
            <BrandLogo size={26} />
            <p className="footer-desc-text">{BRAND.footerDescription}</p>
            <div className="footer-brand-motto">
              <span>{BRAND.tagline}</span>
            </div>
          </div>

          {/* Product Links */}
          <div className="footer-col">
            <h4 className="footer-col-title">Platform</h4>
            <ul className="footer-links-list">
              <li>
                <a href="#experience" onClick={(e) => handleScrollTo(e, 'experience')}>
                  Adaptive Experience
                </a>
              </li>
              <li>
                <a href="#features" onClick={(e) => handleScrollTo(e, 'features')}>
                  Platform Capabilities
                </a>
              </li>
              <li>
                <a href="#journey" onClick={(e) => handleScrollTo(e, 'journey')}>
                  Learning Journey
                </a>
              </li>
              <li>
                <a href="#knowledge-map" onClick={(e) => handleScrollTo(e, 'knowledge-map')}>
                  Knowledge Map
                </a>
              </li>
              <li>
                <a href="#simulations" onClick={(e) => handleScrollTo(e, 'simulations')}>
                  Phenomenon Lab
                </a>
              </li>
            </ul>
          </div>

          {/* Learning Resources */}
          <div className="footer-col">
            <h4 className="footer-col-title">Curriculum</h4>
            <ul className="footer-links-list">
              <li>
                <a href="#simulations" onClick={(e) => handleScrollTo(e, 'simulations')}>
                  Classical Mechanics
                </a>
              </li>
              <li>
                <a href="#challenges" onClick={(e) => handleScrollTo(e, 'challenges')}>
                  Chocolate Problems
                </a>
              </li>
              <li>
                <a href="#revision" onClick={(e) => handleScrollTo(e, 'revision')}>
                  Spaced Repetition
                </a>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() =>
                    openPlaceholderModal(
                      'Cognitive Learning Science',
                      `${BRAND.name} reverses passive lecture consumption by diagnosing intuitive mental models first. Based on research in retrieval practice, interleaving, and the generation effect.`
                    )
                  }
                >
                  Learning Methodology
                </button>
              </li>
            </ul>
          </div>

          {/* Company & Legal Information */}
          <div className="footer-col">
            <h4 className="footer-col-title">Project & Legal</h4>
            <ul className="footer-links-list">
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() =>
                    openPlaceholderModal(
                      `About ${BRAND.name}`,
                      `${BRAND.name} is an educational technology prototype exploring question-first adaptive learning, diagnostic hint trees, and interactive concept topological graphs.`
                    )
                  }
                >
                  About {BRAND.name}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() =>
                    openPlaceholderModal(
                      'Project Contact',
                      `Inquiries regarding ${BRAND.name} pedagogical architecture, interactive simulations, or technical pairing can be directed to the workspace team.`
                    )
                  }
                >
                  Contact & Inquiries
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() =>
                    openPlaceholderModal(
                      'Privacy Policy Notice',
                      `${BRAND.name} operates privacy-first. Session diagnostics, responses, and interactive simulations in this prototype are processed locally within your browser session.`
                    )
                  }
                >
                  Privacy Notice
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-link-btn"
                  onClick={() =>
                    openPlaceholderModal(
                      'Terms of Exploration',
                      `${BRAND.name} materials and conceptual models are provided for exploratory educational purposes. All interactive demonstrations are illustrative.`
                    )
                  }
                >
                  Terms of Service
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Copyright Bar */}
        <div className="footer-bottom-bar">
          <div className="footer-copy-text">
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </div>
          <div className="footer-palette-indicator">
            <span className="dot dot-amber" title="Bright Amber #FE9400" />
            <span className="dot dot-orange" title="Primary Orange #FC710C" />
            <span className="dot dot-coral" title="Coral #F37F58" />
            <span className="dot dot-peach" title="Soft Peach #F7B198" />
            <span className="palette-label">Crafted with Precision</span>
          </div>
        </div>
      </div>

      {/* Accessible Informational Modal Dialog for Placeholder Links */}
      {modalTopic && (
        <div
          className="footer-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={closeModal}
        >
          <div
            className="footer-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="modal-title" className="modal-title">
                {modalTopic.title}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeModal}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <p className="modal-body">{modalTopic.content}</p>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-modal-dismiss"
                onClick={closeModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};
