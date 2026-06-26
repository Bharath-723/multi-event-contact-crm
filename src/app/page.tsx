import RegistrationForm from '@/components/registration-form';

export const metadata = {
  title: 'Volunteer Registration | Rathayatra 2026',
  description: 'Instantly register to volunteer for the grand Rathayatra festival. Secure registration with real-time updates.',
};

export default function RegisterPage() {
  return (
    <main className="relative min-h-screen flex items-center justify-center py-12 px-4 bg-gradient-purple">
      {/* Visual background decorations - absolute positioned glow rings */}
      <div className="absolute top-1/4 left-10 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      
      {/* Decorative Grid Layer */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" 
      />

      <div className="relative z-10 w-full flex flex-col items-center">
        <RegistrationForm />
        
        {/* Footer info for accessibility and support */}
        <footer className="mt-8 text-center text-xs text-slate-500 max-w-sm px-4">
          <p>© 2026 Hare Krishna Movement. All rights reserved.</p>
        </footer>
      </div>
    </main>
  );
}
