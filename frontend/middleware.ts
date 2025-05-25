import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Get session token from HTTP-only cookie
  const session = request.cookies.get('session')?.value
  const isAuthenticated = !!session

  // Redirect authenticated users from login page to dashboard
  if (isAuthenticated && path === '/login') {
    return NextResponse.redirect(new URL('/app/dashboard', request.url))
  }

  // Only redirect unauthenticated users from protected routes
  if (!isAuthenticated && path.startsWith('/app')) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', path)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

// Configure the paths that middleware will run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
} 