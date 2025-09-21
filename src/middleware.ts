import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const session = request.cookies.get('session')?.value;

  // Protect /books and /folio-society routes and their API calls
  const isBooks = request.nextUrl.pathname.startsWith('/books');
  const isFolioSociety = request.nextUrl.pathname.startsWith('/folio-society');

  if ((isBooks || isFolioSociety) && !session) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/books',
    '/books/:path*',
    '/folio-society',
    '/folio-society/:path*',
  ],
};
