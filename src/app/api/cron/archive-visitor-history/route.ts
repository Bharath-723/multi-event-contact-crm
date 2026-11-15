import { NextResponse, NextRequest } from 'next/server';
import { archiveAndGetVisitorHistory } from '@/lib/visitor-history';
import { getCurrentWeeklyPeriod, getSaturdayMeetupDate } from '@/lib/weekly-period';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/cron/archive-visitor-history
 *
 * Automated cron job triggered every Sunday at 06:00 AM IST (00:30 UTC).
 * Cron schedule: "30 0 * * 0"
 *
 * Responsibilities:
 * 1. Finalize and archive the previous Saturday Meetup approved visitor count.
 * 2. Idempotent: safe to run multiple times, never overwrites finalized records.
 * 3. Keeps historical records permanent across weekly rollovers.
 */
export async function GET(req: NextRequest) {
  return handleArchival(req);
}

export async function POST(req: NextRequest) {
  return handleArchival(req);
}

async function handleArchival(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') || '';
  const cronSecret = process.env.CRON_SECRET;

  // If CRON_SECRET is configured in environment, verify it
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Also allow Vercel's internal cron header if deployed on Vercel
    const isVercelCron = req.headers.get('x-vercel-cron') === '1';
    if (!isVercelCron) {
      return NextResponse.json({ error: 'Unauthorized: Invalid cron secret' }, { status: 401 });
    }
  }

  const currentPeriod = getCurrentWeeklyPeriod();
  const { dateStr: meetupDate, label: meetupLabel } = getSaturdayMeetupDate(currentPeriod);

  try {
    const history = await archiveAndGetVisitorHistory(currentPeriod);

    return NextResponse.json({
      success: true,
      message: 'Sunday 06:00 AM IST Saturday Meetup visitor history archival completed successfully.',
      current_weekly_period: currentPeriod,
      target_meetup_date: meetupDate,
      target_meetup_label: meetupLabel,
      total_archived_meetups: history.length,
      history,
      executed_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('[cron/archive-visitor-history Error]:', err);
    return NextResponse.json(
      {
        error: 'Archival execution encountered an error',
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
