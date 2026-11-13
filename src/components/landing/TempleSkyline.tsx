'use client';

import React from 'react';

interface TempleSkylineProps {
  className?: string;
}

/**
 * Authentic Temple & Botanical Skyline Silhouette
 * Reproduces the Indian Hindu temple shikhara, mandapa pavilions, kalash finials,
 * flags, and surrounding lilac trees as shown in the MECM reference hero section.
 */
export default function TempleSkyline({ className = '' }: TempleSkylineProps) {
  return (
    <div className={`relative w-full overflow-hidden pointer-events-none select-none ${className}`}>
      {/* Warm Golden Sunrise Glow Aura behind temple */}
      <div
        className="absolute top-1/2 left-[58%] -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] sm:w-[500px] sm:h-[500px] rounded-full blur-[80px] sm:blur-[100px] opacity-70 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(254, 218, 185, 0.85) 0%, rgba(255, 236, 219, 0.5) 45%, rgba(238, 222, 250, 0) 75%)',
        }}
      />

      {/* Warm Sun Disc Silhouette */}
      <div
        className="absolute top-10 sm:top-14 left-[54%] sm:left-[56%] -translate-x-1/2 w-48 h-48 sm:w-64 sm:h-64 rounded-full opacity-60 blur-[30px]"
        style={{
          background: 'linear-gradient(180deg, #fce2c8 0%, #fae8d8 60%, rgba(247, 237, 255, 0.1) 100%)',
        }}
      />

      <svg
        viewBox="0 0 1200 600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-sm"
        preserveAspectRatio="xMidYMax meet"
      >
        <defs>
          {/* Main Temple Lavender Gradient */}
          <linearGradient id="templeGradPrimary" x1="600" y1="50" x2="600" y2="580" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ab90df" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#9677d8" stopOpacity="0.8" />
            <stop offset="85%" stopColor="#815bc4" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#754cb5" stopOpacity="0.1" />
          </linearGradient>

          {/* Background Shikhara Soft Gradient */}
          <linearGradient id="templeGradBack" x1="600" y1="80" x2="600" y2="550" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#c8b5ed" stopOpacity="0.75" />
            <stop offset="50%" stopColor="#b49de4" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#a385dc" stopOpacity="0.15" />
          </linearGradient>

          {/* Tree Silhouette Gradient */}
          <linearGradient id="treeGrad" x1="150" y1="200" x2="150" y2="580" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a98fdc" stopOpacity="0.75" />
            <stop offset="60%" stopColor="#9574d6" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#7d53c7" stopOpacity="0.1" />
          </linearGradient>

          {/* Far Right Foliage Gradient */}
          <linearGradient id="rightTreeGrad" x1="1050" y1="120" x2="1050" y2="580" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9e7fd6" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#8964cc" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#754cb5" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* ----------------- Far Left Tree Silhouette ----------------- */}
        <g id="left-trees" fill="url(#treeGrad)">
          {/* Left background tree canopy */}
          <path d="M120 320 C100 290 85 270 110 240 C130 215 160 220 180 235 C200 210 235 210 250 230 C270 215 300 225 305 255 C320 280 305 310 280 330 C295 350 280 380 250 385 C235 390 210 385 195 370 C180 390 145 390 125 365 C115 350 115 335 120 320 Z" />
          {/* Tree trunk and subtle branches */}
          <path d="M190 365 C190 400 185 450 180 500 C175 520 172 545 170 580 L205 580 C202 540 200 480 202 430 C215 410 230 395 245 385 L235 375 C215 390 200 408 195 425 L195 365 Z" />
        </g>

        {/* ----------------- Background Secondary Shikharas ----------------- */}
        <g id="background-temples" fill="url(#templeGradBack)">
          {/* Left background spire */}
          <path d="M520 180 L520 140 L522 140 L522 120 L525 120 L525 95 L527 95 L527 75 L529 75 L529 65 L530 65 L530 50 L532 50 L532 65 L533 65 L533 75 L535 75 L535 95 L537 95 L537 120 L540 120 L540 140 L542 140 L542 180 C550 200 560 230 565 270 L495 270 C500 230 510 200 520 180 Z" />
          {/* Kalash flag on left spire */}
          <path d="M532 50 L552 56 L532 62 Z" />

          {/* Right background spire */}
          <path d="M880 160 L880 130 L882 130 L882 110 L884 110 L884 90 L886 90 L886 70 L887 70 L887 55 L889 55 L889 70 L890 70 L890 90 L892 90 L892 110 L894 110 L894 130 L896 130 L896 160 C905 185 912 215 918 250 L858 250 C864 215 871 185 880 160 Z" />
          <path d="M889 55 L907 60 L889 66 Z" />
        </g>

        {/* ----------------- Foreground Grand Mandir & Shikhara ----------------- */}
        <g id="main-temple-complex" fill="url(#templeGradPrimary)">
          {/* Left Mandapa Dome Structure (Stepped Pyramid Roof) */}
          <path d="M600 320 C600 300 610 280 625 260 L625 240 L630 240 L630 220 L635 220 L635 200 L637 200 L637 185 L640 185 L640 200 L642 200 L642 220 L647 220 L647 240 L652 240 L652 260 C665 280 675 300 675 320 Z" />
          {/* Kalash on Left Mandapa */}
          <path d="M638.5 170 L641.5 170 L641.5 185 L638.5 185 Z" />
          <path d="M640 155 L654 161 L640 167 Z" />
          <ellipse cx="640" cy="172" rx="4" ry="2" />

          {/* Stepped Base of Left Mandapa */}
          <path d="M575 350 L700 350 L690 320 L585 320 Z" />
          <path d="M560 380 L715 380 L705 350 L570 350 Z" />
          <path d="M550 420 L725 420 L718 380 L558 380 Z" />

          {/* ----------------- GRAND CENTRAL SHIKHARA TOWER ----------------- */}
          {/* Amalaka and Finial Kalash */}
          {/* Top spire needle */}
          <path d="M759 62 L761 62 L761 40 L759 40 Z" />
          {/* Fluttering Temple Dhwaja (Flag) */}
          <path d="M761 40 L785 48 L761 56 Z" />
          {/* Kalash Pot Rings */}
          <ellipse cx="760" cy="65" rx="5" ry="3" />
          <ellipse cx="760" cy="73" rx="7" ry="4" />
          <ellipse cx="760" cy="82" rx="10" ry="5" />
          {/* Ribbed Amalaka Ring */}
          <path d="M740 98 C740 90 748 85 760 85 C772 85 780 90 780 98 C780 106 772 110 760 110 C748 110 740 106 740 98 Z" />

          {/* Main Shikhara Body (Curvilinear Rekha Tower) */}
          <path d="M760 110 C745 140 735 180 725 230 C715 280 708 340 705 400 L815 400 C812 340 805 280 795 230 C785 180 775 140 760 110 Z" />

          {/* Horizontal architectural bhumi tiers across shikhara */}
          <path d="M738 175 Q760 178 782 175 L784 182 Q760 185 736 182 Z" opacity="0.9" />
          <path d="M731 220 Q760 224 789 220 L791 228 Q760 232 729 228 Z" opacity="0.9" />
          <path d="M724 270 Q760 275 796 270 L798 279 Q760 284 722 279 Z" opacity="0.9" />
          <path d="M717 325 Q760 331 803 325 L805 335 Q760 341 715 335 Z" opacity="0.9" />
          <path d="M710 385 Q760 392 810 385 L812 396 Q760 403 708 396 Z" opacity="0.9" />

          {/* Central Gavaksha / Chaitya Arch Window motif */}
          <path d="M748 310 C748 295 753 285 760 285 C767 285 772 295 772 310 L772 350 L748 350 Z" opacity="0.5" />
          <circle cx="760" cy="275" r="4" opacity="0.6" />

          {/* ----------------- Right Mandapa Pavilion ----------------- */}
          <path d="M805 250 L815 250 L815 230 L820 230 L820 210 L823 210 L823 195 L827 195 L827 210 L830 210 L830 230 L835 230 L835 250 L845 250 C855 270 862 295 868 330 L795 330 C800 295 802 270 805 250 Z" />
          {/* Kalash on Right Mandapa */}
          <path d="M824 175 L826 175 L826 195 L824 195 Z" />
          <path d="M825 162 L838 167 L825 172 Z" />
          <ellipse cx="825" cy="180" rx="4" ry="2" />

          {/* Stepped Right Base */}
          <path d="M785 360 L880 360 L870 330 L792 330 Z" />
          <path d="M775 395 L895 395 L885 360 L780 360 Z" />
          <path d="M765 435 L910 435 L900 395 L770 395 Z" />

          {/* Far Right Supporting Shrine Dome */}
          <path d="M885 310 C885 270 900 240 915 220 L915 205 L918 205 L918 190 L922 190 L922 205 L925 205 L925 220 C940 240 955 270 955 310 Z" />
          <path d="M920 175 L932 180 L920 185 Z" />
          <path d="M875 350 L965 350 L955 310 L882 310 Z" />
          <path d="M865 390 L980 390 L970 350 L870 350 Z" />

          {/* Temple Complex Grand Foundation Base Platform */}
          <path d="M480 430 L990 430 L970 470 L500 470 Z" />
          <path d="M440 470 L1020 470 L1000 520 L460 520 Z" />
          <path d="M410 520 L1050 520 L1030 580 L430 580 Z" />
        </g>

        {/* ----------------- Far Right Botanical Tree Silhouette ----------------- */}
        <g id="right-trees" fill="url(#rightTreeGrad)">
          {/* Main grand tree canopy */}
          <path d="M1040 180 C1015 155 980 160 970 190 C955 215 965 245 985 260 C970 280 975 315 1000 330 C990 355 1010 385 1035 390 C1060 395 1085 385 1095 365 C1115 380 1145 375 1160 350 C1175 325 1165 295 1145 280 C1165 255 1160 220 1135 200 C1115 185 1085 190 1070 205 C1060 185 1050 175 1040 180 Z" />
          {/* Detailed tree branches and trunk */}
          <path d="M1070 375 C1070 420 1075 470 1080 520 C1083 540 1085 560 1090 580 L1055 580 C1052 550 1050 510 1052 460 C1040 440 1025 410 1005 390 L1018 380 C1035 398 1048 420 1054 440 L1056 380 Z" />
          {/* Secondary smaller tree foliage */}
          <path d="M1120 280 C1140 260 1170 270 1185 290 C1200 310 1195 340 1175 355 C1190 375 1180 405 1155 415 C1140 420 1120 415 1110 400 C1100 415 1075 415 1065 395 C1060 380 1065 365 1075 355 C1065 340 1070 315 1090 305 C1100 300 1112 300 1120 280 Z" opacity="0.8" />
        </g>

        {/* ----------------- Floating 4-Point Sparkle Stars ----------------- */}
        <g id="sparkles" fill="#c084fc">
          {/* Sparkle 1 */}
          <path d="M510 110 Q510 118 518 118 Q510 118 510 126 Q510 118 502 118 Q510 118 510 110 Z" opacity="0.75" />
          {/* Sparkle 2 */}
          <path d="M840 90 Q840 96 846 96 Q840 96 840 102 Q840 96 834 96 Q840 96 840 90 Z" opacity="0.6" />
          {/* Sparkle 3 */}
          <path d="M720 70 Q720 75 725 75 Q720 75 720 80 Q720 75 715 75 Q720 75 720 70 Z" opacity="0.8" />
          {/* Sparkle 4 */}
          <path d="M960 140 Q960 147 967 147 Q960 147 960 154 Q960 147 953 147 Q960 147 960 140 Z" opacity="0.7" />
        </g>
      </svg>
    </div>
  );
}

