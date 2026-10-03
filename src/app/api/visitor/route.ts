import { NextResponse } from 'next/server';

// Parent route stub — ensures Turbopack discovers /api/visitor/* subroutes in dev
export async function GET() {
  return NextResponse.json({ message: 'Use /api/visitor/logs, /api/visitor/stats, /api/visitor/search, /api/visitor/check-in' }, { status: 404 });
}
