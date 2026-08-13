import { NextRequest, NextResponse } from 'next/server';
import { getVisitorStats } from '@/lib/visitor-stats';

export async function GET(req: NextRequest) {
  try {
    const festivalEventId = req.nextUrl.searchParams.get('festival_event_id');

    // festival_event_id is required — reject global (unscoped) requests.
    if (!festivalEventId) {
      return NextResponse.json(
        { error: 'festival_event_id is required' },
        { status: 400 }
      );
    }

    const stats = await getVisitorStats(festivalEventId);
    return NextResponse.json({ stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
