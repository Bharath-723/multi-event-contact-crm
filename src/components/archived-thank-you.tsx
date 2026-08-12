import React from 'react';
import { ExternalLink, Sparkles, Play } from 'lucide-react';

function YoutubeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  );
}

export default function ArchivedThankYou() {
  return (
    <div className="dark min-h-screen bg-[#030014] text-slate-100 overflow-x-hidden">
      <main className="relative min-h-screen flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-purple overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-1/6 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-600/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/3 left-10 w-96 h-96 bg-pink-600/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Decorative Grid */}
        <div 
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" 
        />

        <div className="relative z-10 w-full max-w-4xl flex flex-col items-center my-auto space-y-8">
          
          {/* Main Thank You Card */}
          <div className="w-full glass-card rounded-3xl p-6 sm:p-10 border border-purple-500/20 shadow-2xl backdrop-blur-xl bg-slate-950/75 text-center flex flex-col items-center relative overflow-hidden">
            
            {/* Top Glowing Accent Line */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 via-purple-500 to-indigo-500" />

            {/* Badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 text-xs font-semibold tracking-wide">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Ratha Yatra 2026
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-500/30 text-red-300 text-xs font-semibold tracking-wide">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Registrations Closed
              </span>
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 text-slate-100">
              Thank You!
            </h1>

            {/* Devotional Message Paragraphs */}
            <div className="space-y-4 max-w-2xl text-slate-300 text-sm sm:text-base leading-relaxed">
              <p className="font-semibold text-slate-200">
                With the blessings of Lord Jagannath, Baladeva, and Subhadra Maharani, the Ratha Yatra Festival 2026 has been completed successfully.
              </p>
              <p>
                We sincerely thank every volunteer, donor, sponsor, participant, devotee, and well-wisher who contributed to making this festival a grand success.
              </p>
              <p>
                Your enthusiasm, service, and devotion helped create countless unforgettable memories.
              </p>
              <p className="text-purple-300 font-medium">
                Although registrations are now closed, we invite you to relive the beautiful moments of the festival through our official YouTube channels.
              </p>
              <p className="text-slate-300 font-medium">
                We look forward to welcoming you again during Ratha Yatra 2027.
              </p>
              <p className="text-amber-400 font-bold text-base sm:text-lg pt-2 tracking-wide">
                Hare Krishna.
              </p>
            </div>
          </div>

          {/* Festival Memories / YouTube Section */}
          <div className="w-full space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 flex items-center justify-center gap-2">
                <YoutubeIcon className="w-7 h-7 text-red-500" />
                Festival Memories
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
                Watch highlights, celebrations, kirtans, processions, and festival moments from Ratha Yatra 2026 on our official YouTube channels.
              </p>
            </div>

            {/* YouTube Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              
              {/* Card 1: Golden Temple */}
              <a
                href="https://www.youtube.com/@HareKrishnaGoldenTempleHyd"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Watch Hare Krishna Golden Temple YouTube Memories"
                className="group glass-card rounded-2xl p-6 border border-slate-800 hover:border-red-500/40 bg-slate-950/60 hover:bg-slate-900/80 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(239,68,68,0.15)] flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                      <YoutubeIcon className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 group-hover:border-red-500/30 group-hover:text-red-400 transition-colors">
                      Official Channel
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-slate-100 group-hover:text-red-400 transition-colors">
                      Golden Temple
                    </h3>
                    <p className="text-xs font-medium text-slate-400 mt-0.5">
                      Hare Krishna Golden Temple
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20 group-hover:shadow-red-600/40">
                    <Play className="w-4 h-4 fill-white" />
                    <span>Watch Memories</span>
                    <ExternalLink className="w-4 h-4 ml-1 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </a>

              {/* Card 2: Heritage Tower */}
              <a
                href="https://www.youtube.com/@HareKrishnaHeritageTower"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Watch Hare Krishna Heritage Tower YouTube Memories"
                className="group glass-card rounded-2xl p-6 border border-slate-800 hover:border-red-500/40 bg-slate-950/60 hover:bg-slate-900/80 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(239,68,68,0.15)] flex flex-col justify-between space-y-5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                      <YoutubeIcon className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 group-hover:border-red-500/30 group-hover:text-red-400 transition-colors">
                      Official Channel
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-slate-100 group-hover:text-red-400 transition-colors">
                      Heritage Tower
                    </h3>
                    <p className="text-xs font-medium text-slate-400 mt-0.5">
                      Hare Krishna Heritage Tower
                    </p>
                  </div>
                </div>

                <div className="pt-2">
                  <div className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20 group-hover:shadow-red-600/40">
                    <Play className="w-4 h-4 fill-white" />
                    <span>Watch Memories</span>
                    <ExternalLink className="w-4 h-4 ml-1 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </a>

            </div>
          </div>

          {/* Footer Info */}
          <footer className="mt-8 text-center text-xs text-slate-500 space-y-1.5 max-w-sm px-4 pt-4">
            <p className="text-sm font-semibold text-slate-400">
              See you again during <span className="text-amber-400 font-bold">Ratha Yatra 2027</span>
            </p>
            <p className="text-xs text-amber-500/80 font-medium">Hare Krishna</p>
            <p className="pt-2 text-[11px] text-slate-600">© 2026 Hare Krishna Movement. All rights reserved.</p>
          </footer>

        </div>
      </main>
    </div>
  );
}
