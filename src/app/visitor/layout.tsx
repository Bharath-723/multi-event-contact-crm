'use client';

import React from 'react';
import AdminShell from '@/components/layouts/AdminShell';

export default function VisitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
