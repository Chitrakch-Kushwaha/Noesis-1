import React from 'react';
import { BRAND } from '../../config/brand';

interface BrandLogoProps {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 28,
  showWordmark = true,
}) => {
  return (
    <a
      href="#top"
      className={`brand-logo-container ${className}`}
      aria-label={`${BRAND.name} home`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.625rem',
        textDecoration: 'none',
        color: BRAND.colors.textMain,
      }}
    >
      {/* Minimal geometric symbol: Intersecting forged angular planes */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="brand-geometric-symbol"
        aria-hidden="true"
      >
        <path
          d="M16 2L28 9V23L16 30L4 23V9L16 2Z"
          stroke="#FC710C"
          strokeWidth="1.75"
          strokeLinejoin="round"
          opacity="0.8"
        />
        <path
          d="M16 2L16 16M16 16L28 23M16 16L4 23"
          stroke="#FE9400"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="16" r="3" fill="#FC710C" />
        <circle cx="16" cy="16" r="1.25" fill="#F7B198" />
      </svg>

      {showWordmark && (
        <span
          className="brand-wordmark"
          style={{
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontWeight: 700,
            fontSize: '1.1875rem',
            letterSpacing: '-0.025em',
            color: BRAND.colors.textMain,
            display: 'inline-flex',
            alignItems: 'baseline',
          }}
        >
          {BRAND.name}
          <span
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              backgroundColor: BRAND.colors.primaryOrange,
              display: 'inline-block',
              marginLeft: '2px',
            }}
          />
        </span>
      )}
    </a>
  );
};
