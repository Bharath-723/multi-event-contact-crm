'use client';

import React from 'react';

interface LotusLogoProps {
  className?: string;
  size?: number;
}

/**
 * Authentic SVG Lotus Logo matching the MECM brand identity
 * Features 5 symmetrical lotus petals with vibrant purple/magenta gradient
 */
export default function LotusLogo({ className = '', size = 38 }: LotusLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 85"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform hover:scale-105 ${className}`}
      aria-label="MECM Lotus Logo"
    >
      <defs>
        {/* Center Petal Gradient: Vibrant Violet to Fuchsia */}
        <linearGradient id="lotusCenterGrad" x1="50" y1="5" x2="50" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c026d3" />
          <stop offset="50%" stopColor="#9333ea" />
          <stop offset="100%" stopColor="#6b21a8" />
        </linearGradient>

        {/* Inner Flanking Petals Gradient */}
        <linearGradient id="lotusInnerGrad" x1="30" y1="18" x2="70" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e879f9" />
          <stop offset="40%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#7e22ce" />
        </linearGradient>

        {/* Outer Lower Petals Gradient */}
        <linearGradient id="lotusOuterGrad" x1="10" y1="35" x2="90" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#d946ef" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#581c87" />
        </linearGradient>

        {/* Base Glow */}
        <radialGradient id="lotusBaseGlow" cx="50" cy="74" r="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#581c87" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Base soft glow */}
      <ellipse cx="50" cy="74" rx="26" ry="6" fill="url(#lotusBaseGlow)" />

      {/* Far Left Outer Petal */}
      <path
        d="M50 72 C32 70 12 58 6 42 C1 28 8 22 18 27 C28 32 40 50 50 72 Z"
        fill="url(#lotusOuterGrad)"
        fillOpacity="0.88"
        stroke="#7e22ce"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Far Right Outer Petal */}
      <path
        d="M50 72 C68 70 88 58 94 42 C99 28 92 22 82 27 C72 32 60 50 50 72 Z"
        fill="url(#lotusOuterGrad)"
        fillOpacity="0.88"
        stroke="#7e22ce"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Inner Left Petal */}
      <path
        d="M50 72 C36 65 22 46 21 28 C20 15 31 12 37 20 C44 30 48 52 50 72 Z"
        fill="url(#lotusInnerGrad)"
        fillOpacity="0.95"
        stroke="#9333ea"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Inner Right Petal */}
      <path
        d="M50 72 C64 65 78 46 79 28 C80 15 69 12 63 20 C56 30 52 52 50 72 Z"
        fill="url(#lotusInnerGrad)"
        fillOpacity="0.95"
        stroke="#9333ea"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Central Upright Petal (Tallest, Prominent) */}
      <path
        d="M50 6 C42 18 36 38 38 62 C40 70 48 74 50 74 C52 74 60 70 62 62 C64 38 58 18 50 6 Z"
        fill="url(#lotusCenterGrad)"
        stroke="#a21caf"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Central Petal Inner Delicate Spine Highlight */}
      <path
        d="M50 12 Q50 42 50 68"
        stroke="#f5d0fe"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.65"
      />

      {/* Lotus Calyx / Bottom Base Foundation */}
      <path
        d="M34 72 C42 76 58 76 66 72 C62 78 38 78 34 72 Z"
        fill="#581c87"
        stroke="#7e22ce"
        strokeWidth="1"
      />
    </svg>
  );
}

