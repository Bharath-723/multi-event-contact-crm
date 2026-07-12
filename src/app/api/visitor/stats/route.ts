import { NextResponse } from 'next/server';
import { getVisitorStats } from '@/lib/visitor-stats';

export async function GET() {
  try {
    const stats = await getVisitorStats();
    return NextResponse.json({ stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
