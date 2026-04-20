'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [useName, setUseName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) { router.push('/login'); return; }
        const data = await res.json();
        if (data.user) {
          setUseName(data.user.name || data.user.email);
          setIsLoading(false);
        } else {
          router.push('/login');
        }
      } catch {
        router.push('/login');
      }
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Prevent body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary animate-pulse" />
          <p className="text-sm text-muted-foreground font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/clients', label: 'Clients' },
    { href: '/dashboard/plans', label: 'Plans' },
    { href: '/dashboard/loans', label: 'Loans' },
    { href: '/dashboard/dues', label: 'Dues' },
    { href: '/dashboard/history', label: 'History' },
    { href: '/dashboard/profile', label: 'Profile' },
  ];

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Navbar ── */}
      <nav
        className={`sticky top-0 z-50 transition-all duration-300 ${scrolled
          ? 'bg-card/90 backdrop-blur-md shadow-sm border-b border-border/60'
          : 'bg-card border-b border-border'
          }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">

            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 group">
              <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-200">
                <span className="text-primary-foreground text-xs font-bold">RI</span>
              </div>
              <span className="font-bold text-foreground text-sm hidden sm:inline tracking-tight">
                RIYA FINANCE LTD
              </span>
            </Link>

            {/* Desktop links */}
            <div className="hidden sm:flex items-center gap-1">
              {navLinks.map(item => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative px-3.5 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${active
                      ? 'text-primary-foreground bg-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                  >
                    {item.label}
                    {active && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Right — desktop */}
            <div className="hidden sm:flex items-center gap-2">
              <ThemeToggle />
              <Link 
                href="/dashboard/profile"
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted hover:border-border/80 transition-all group"
              >
                <div className="h-6 w-6 bg-primary rounded-full flex items-center justify-center text-[10px] text-primary-foreground font-bold group-hover:scale-110 transition-transform">
                  {useName.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-foreground">{useName}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="text-xs font-medium text-muted-foreground hover:text-destructive px-2 py-1.5 rounded-lg hover:bg-destructive/10 transition-all duration-200"
              >
                Logout
              </button>
            </div>

            {/* Hamburger — mobile */}
            <div className="sm:hidden flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="relative h-9 w-9 flex items-center justify-center rounded-xl bg-muted hover:bg-muted/80 transition-colors duration-200"
                aria-label="Toggle menu"
              >
                <div className="flex flex-col gap-1.5 w-4">
                  <span className={`block h-0.5 bg-foreground rounded-full transition-all duration-300 origin-center ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
                  <span className={`block h-0.5 bg-foreground rounded-full transition-all duration-200 ${mobileOpen ? 'opacity-0 scale-x-0' : ''}`} />
                  <span className={`block h-0.5 bg-foreground rounded-full transition-all duration-300 origin-center ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                </div>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Full-page mobile menu overlay ── */}
      <div
        className={`fixed inset-0 z-40 sm:hidden transition-all duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/30 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />

        {/* Slide-in panel */}
        <div
          className={`absolute top-14 left-0 right-0 bottom-0 bg-card flex flex-col transition-transform duration-300 ease-out ${mobileOpen ? 'translate-y-0' : '-translate-y-4'
            }`}
        >
          {/* Nav links — takes up main space */}
          <div className="flex-1 flex flex-col justify-center px-8 gap-2">
            {navLinks.map((item, i) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ transitionDelay: mobileOpen ? `${60 + i * 50}ms` : '0ms' }}
                  className={`flex items-center justify-between px-5 py-4 rounded-2xl text-xl font-semibold transition-all duration-300 ${mobileOpen ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'
                    } ${active
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                      : 'text-foreground bg-muted hover:bg-muted/80'
                    }`}
                >
                  {item.label}
                  {active && (
                    <svg className="h-5 w-5 opacity-60" fill="currentColor" viewBox="0 0 20 20">
                      <circle cx="10" cy="10" r="4" />
                    </svg>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Bottom user section */}
          <div className="px-8 pb-10 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center text-base text-primary-foreground font-bold shadow">
                  {useName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{useName}</p>
                  <p className="text-xs text-muted-foreground">Signed in</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-4 py-2.5 rounded-xl transition-colors duration-200"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border mt-auto w-full bg-card/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground font-medium text-center md:text-left">
            © {new Date().getFullYear()} RIYA FINANCE LTD. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground/80 font-medium text-center md:text-right flex items-center justify-center md:justify-end gap-1">
            Software by <a href="https://webzystudios.com" target="_blank" rel="noopener noreferrer" className="bg-primary/10 text-primary px-2 py-0.5 rounded-md font-bold hover:bg-primary hover:text-primary-foreground transition-all">webzystudios.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
