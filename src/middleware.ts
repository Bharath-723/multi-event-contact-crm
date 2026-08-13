import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = (
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    ''
  ).toLowerCase();

  const url = request.nextUrl.clone();

  // If request is coming from Rathayatra domain (e.g. rathayatra-three.vercel.app)
  // and accessing the root / or /register, rewrite to /rathayatra-complete
  if (host.includes('rathayatra')) {
    if (url.pathname === '/' || url.pathname === '/register') {
      url.pathname = '/rathayatra-complete';
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/register'],
};
