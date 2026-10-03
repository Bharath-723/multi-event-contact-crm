import { NextResponse } from 'next/server';

// Parent route stub — ensures Turbopack discovers /api/geocode/* subroutes in dev
export async function GET() {
  return NextResponse.json({ message: 'Use /api/geocode/autocomplete' }, { status: 404 });
}
