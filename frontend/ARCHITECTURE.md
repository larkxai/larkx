# Frontend Architecture - Best Practices

This document outlines the best practices for structuring marketing and app pages in the Larkx Next.js application.

## Directory Structure

```
app/
├── (marketing)/          # Public-facing marketing pages
│   ├── layout.tsx        # Marketing layout (Server Component)
│   └── page.tsx          # Homepage (Server Component with Client islands)
├── (app)/               # Authenticated app pages
│   ├── layout.tsx       # App layout with sidebar (Client Component)
│   ├── dashboard/
│   ├── apps/
│   ├── submissions/
│   └── history/
├── login/               # Login page (outside route groups)
├── pricing/             # Pricing page
├── privacy/             # Privacy policy
├── terms/               # Terms of service
└── layout.tsx           # Root layout (Server Component)

components/
├── marketing-navbar.tsx  # Navbar for marketing pages (Client Component)
├── marketing-footer.tsx  # Footer for marketing pages (Server Component)
├── hero-cta.tsx         # Hero CTA with auth detection (Client Component)
├── app-sidebar.tsx      # Sidebar for app pages (Client Component)
└── ui/                  # Reusable UI components
```

## Best Practices

### 1. Route Groups for Separation

Use route groups `()` to separate concerns without affecting URL structure:

- **`(marketing)`**: Public pages (homepage, pricing, about)
  - SEO-focused
  - Server-rendered for better performance
  - Minimal JavaScript
  
- **`(app)`**: Authenticated app pages (dashboard, settings)
  - Rich interactivity
  - Client components where needed
  - Protected by middleware

**Benefits:**
- Clear separation of concerns
- Different layouts for different sections
- Clean URL structure (route groups don't appear in URLs)

### 2. Server Components First

**Default to Server Components** and only use Client Components when needed:

```typescript
// ✅ Good: Server Component (default)
export default function MarketingPage() {
  return <div>Static content</div>
}

// ✅ Good: Client Component only when needed
"use client"
export function InteractiveWidget() {
  const [state, setState] = useState()
  return <div>Interactive content</div>
}
```

**When to use Client Components:**
- Browser APIs (cookies, localStorage, window)
- Event handlers (onClick, onChange)
- Hooks (useState, useEffect, useContext)
- Third-party libraries that use browser APIs

**When to use Server Components:**
- Static content
- Data fetching
- SEO-critical content
- Performance-critical pages

### 3. Layout Strategy

#### Marketing Layout (Server Component)
```typescript
// app/(marketing)/layout.tsx
import { MarketingNavbar } from "@/components/marketing-navbar"
import { MarketingFooter } from "@/components/marketing-footer"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Your App - Description",
  description: "SEO-friendly description",
  // ... more SEO metadata
}

export default function MarketingLayout({ children }) {
  return (
    <div>
      <MarketingNavbar />      {/* Client Component */}
      <main>{children}</main>  {/* Server Component */}
      <MarketingFooter />      {/* Server Component */}
    </div>
  )
}
```

**Benefits:**
- SEO metadata in Server Component
- Navbar/Footer reused across all marketing pages
- Children can be Server or Client Components

#### App Layout (Client Component)
```typescript
// app/(app)/layout.tsx
"use client"
import { AppSidebar } from "@/components/app-sidebar"
import { usePathname } from "next/navigation"

export default function AppLayout({ children }) {
  const pathname = usePathname() // Client-side hook
  
  return (
    <SidebarProvider>
      <AppSidebar />
      <main>{children}</main>
    </SidebarProvider>
  )
}
```

**Benefits:**
- Rich interactivity with hooks
- Dynamic behavior based on route
- Shared sidebar across all app pages

### 4. Client Islands Pattern

Mix Server and Client Components for optimal performance:

```typescript
// app/(marketing)/page.tsx (Server Component)
import { HeroCTA } from "@/components/hero-cta"

export default function HomePage() {
  return (
    <div>
      {/* Server-rendered content */}
      <h1>Welcome</h1>
      <p>Static description</p>
      
      {/* Client island for interactivity */}
      <HeroCTA />  {/* Client Component */}
      
      {/* More server-rendered content */}
      <Features />
    </div>
  )
}
```

```typescript
// components/hero-cta.tsx (Client Component)
"use client"
import { useState, useEffect } from "react"

export function HeroCTA() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  
  useEffect(() => {
    // Client-side logic
    setIsAuthenticated(checkAuth())
  }, [])
  
  return <Button>{isAuthenticated ? "Dashboard" : "Sign Up"}</Button>
}
```

**Benefits:**
- Most of the page is server-rendered (fast)
- Only interactive parts use JavaScript
- Better SEO and performance

### 5. Metadata for SEO

Always add metadata in Server Components for better SEO:

```typescript
// app/(marketing)/layout.tsx
export const metadata: Metadata = {
  title: "Larkx - AI-Powered App Store Publishing",
  description: "Your AI agent for mobile app publishing",
  keywords: ["app store", "publishing", "AI"],
  openGraph: {
    title: "Larkx",
    description: "AI-powered publishing",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Larkx",
  },
}
```

### 6. Middleware for Route Protection

Use middleware to protect routes and handle redirects:

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const session = request.cookies.get('session')?.value
  const isAuthenticated = !!session
  const path = request.nextUrl.pathname

  // Redirect authenticated users from login
  if (isAuthenticated && path === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Protect app routes
  if (!isAuthenticated && path.startsWith('/app')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}
```

## Component Organization

### Marketing Components
- **Navbar**: Client Component (cookie detection)
- **Footer**: Server Component (static links)
- **Hero**: Server Component with Client island for CTA
- **Features**: Server Component (static content)
- **Pricing**: Server Component (static cards)

### App Components
- **Sidebar**: Client Component (navigation, state)
- **Breadcrumbs**: Client Component (dynamic based on route)
- **Dashboard**: Mix of Server and Client Components
- **Forms**: Client Components (state management)

## Performance Optimization

1. **Server Components by Default**: Reduces JavaScript bundle size
2. **Client Islands**: Only load JavaScript where needed
3. **Static Generation**: Marketing pages are statically generated
4. **Dynamic Imports**: Lazy load heavy components
5. **Image Optimization**: Use Next.js Image component

## SEO Optimization

1. **Metadata in Layouts**: Set SEO metadata in Server Component layouts
2. **Semantic HTML**: Use proper heading hierarchy (h1, h2, h3)
3. **Server Components**: Content is in HTML for crawlers
4. **Open Graph Tags**: For social media sharing
5. **Structured Data**: Add JSON-LD for rich snippets

## Common Patterns

### Authentication Detection in Client Components
```typescript
"use client"
import { useEffect, useState } from "react"

export function AuthAwareComponent() {
  const [isAuth, setIsAuth] = useState(false)
  const [isClient, setIsClient] = useState(false)
  
  useEffect(() => {
    setIsClient(true)
    const session = document.cookie.includes('session=')
    setIsAuth(session)
  }, [])
  
  if (!isClient) return <div>Loading...</div>
  
  return <div>{isAuth ? "Logged in" : "Logged out"}</div>
}
```

### Conditional Layouts
```typescript
export default function AppLayout({ children }) {
  const pathname = usePathname()
  const isFullscreen = pathname?.includes('/apps/new')
  
  return (
    <SidebarProvider defaultOpen={!isFullscreen}>
      {!isFullscreen && <AppSidebar />}
      <main>{children}</main>
    </SidebarProvider>
  )
}
```

## File Naming Conventions

- `layout.tsx`: Layout for route segment
- `page.tsx`: Page component for route
- `loading.tsx`: Loading state
- `error.tsx`: Error boundary
- `not-found.tsx`: 404 page
- `route.ts`: API route handler

## Summary

**Marketing Pages:**
- ✅ Server Components (SEO, performance)
- ✅ Client islands for interactivity
- ✅ SEO metadata
- ✅ Static generation

**App Pages:**
- ✅ Client Components where needed
- ✅ Protected by middleware
- ✅ Rich interactivity
- ✅ Dynamic behavior

**Both:**
- ✅ Clear separation via route groups
- ✅ Reusable components
- ✅ Optimized performance
- ✅ TypeScript for type safety


