import React from 'react';
import RathayatraRegistrationForm from '@/components/rathayatra-registration-form';

export const metadata = {
  title: 'Krishnashtami 2026 | Volunteer Registration | Hare Krishna Movement',
  description:
    'Register as a volunteer for Krishnashtami 2026 on 04-September-2026. Join the grand celebrations with Hare Krishna Movement.',
};

export default function HomePage() {
  return (
    <div className="dark min-h-screen bg-[#030014] text-slate-100 overflow-x-hidden">
      <main className="relative min-h-screen flex items-center justify-center py-12 px-4 bg-gradient-purple overflow-hidden">
        {/* Visual background decorations */}
        <div className="absolute top-1/4 left-10 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Decorative Grid Layer */}
        <div
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"
        />

        <div className="relative z-10 w-full flex flex-col items-center">
          <RathayatraRegistrationForm />

          <footer className="mt-8 text-center text-xs text-slate-500 max-w-sm px-4">
            <p>© 2026 Hare Krishna Movement. All rights reserved.</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
