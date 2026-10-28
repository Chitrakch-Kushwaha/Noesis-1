"use client";
import React from 'react';
import { Navbar } from './Navbar';
import { Hero } from './Hero';
import { PrinciplesStrip } from './PrinciplesStrip';
import { FeaturesShowcase } from './FeaturesShowcase';
import { HowItWorks } from './HowItWorks';
import { KnowledgeMapSection } from './KnowledgeMapSection';
import { SimulationShowcase } from './SimulationShowcase';
import { RevisionSection } from './RevisionSection';
import { ChocolateProblem } from './ChocolateProblem';
import { FinalCTA } from './FinalCTA';
import { Footer } from './Footer';
import './Landing.css';

interface LandingPageProps {
  onOpenDeck?: () => void;
  onStartLearning?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenDeck, onStartLearning }) => {
  const scrollToHeroPreview = () => {
    const el = document.getElementById('experience');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToFeatures = () => {
    const el = document.getElementById('features');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="noesis-landing-root mindforge-landing-root" id="top">
      {/* 1. Navigation */}
      <Navbar onStartLearning={onStartLearning ?? scrollToHeroPreview} />

      <main id="main-content" tabIndex={-1}>
        {/* 2. Hero & Interactive Dashboard Preview */}
        <Hero
          onStartLearning={onStartLearning ?? scrollToHeroPreview}
          onExploreExperience={scrollToFeatures}
        />

        {/* 3. Learning Principles Strip */}
        <PrinciplesStrip />

        {/* 4. Features Showcase */}
        <FeaturesShowcase />

        {/* 5. How the Learning Journey Works */}
        <HowItWorks />

        {/* 6. Interactive Knowledge Map */}
        <KnowledgeMapSection />

        {/* 7. Interactive Learning & Simulation Showcase */}
        <SimulationShowcase />

        {/* 8. Personalised Revision and Progress */}
        <RevisionSection onOpenDeck={onOpenDeck} />

        {/* 9. Chocolate Problem Showcase */}
        <ChocolateProblem />

        {/* 10. Final Call to Action */}
        <FinalCTA onStartLearning={onStartLearning ?? scrollToHeroPreview} />
      </main>

      {/* 11. Footer */}
      <Footer />
    </div>
  );
};
