import React from 'react';
import ContactsRegisterForm from '@/components/contacts-register-form';

export const metadata = {
  title: 'Contacts Register | Rathayatra',
  description: 'Register your contact details securely with instant confirmation.',
};

export default function ContactsRegisterPage() {
  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-900 overflow-x-hidden">
      <main className="relative min-h-screen flex flex-col items-center justify-center py-10 px-4 bg-slate-100/70">
        {/* Subtle decorative background blur accents */}
        <div className="absolute top-1/6 left-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/6 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="relative z-10 w-full flex flex-col items-center">
          <ContactsRegisterForm />
          
          {/* Footer info */}
          <footer className="mt-8 text-center text-xs text-slate-500 max-w-sm px-4">
            <p>© 2026 Hare Krishna Movement. All rights reserved.</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
