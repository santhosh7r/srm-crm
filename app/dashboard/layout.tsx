'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LogoMark } from '@/components/Logo';
import { BookOpen, CalendarClock, ClipboardList, HandCoins, History, LayoutDashboard, LogOut, User, Users } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [useName, setUseName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const mobileNav = useRef<HTMLDivElement>(null);
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

  // Keep the current section visible in the scrolling mobile bottom bar
  useEffect(() => {
    mobileNav.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <LogoMark size={44} className="animate-pulse" />
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
    { href: '/dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/clients', label: 'Clients', icon: Users },
    { href: '/dashboard/plans', label: 'Plans', icon: ClipboardList },
    { href: '/dashboard/loans', label: 'Loans', icon: HandCoins },
    { href: '/dashboard/accounts', label: 'Accounts', icon: BookOpen },
    { href: '/dashboard/dues', label: 'Dues', icon: CalendarClock },
    { href: '/dashboard/history', label: 'History', icon: History },
    { href: '/dashboard/profile', label: 'Profile', icon: User },
  ];

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Navbar ── */}
      <nav
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
        className={`sticky top-0 z-50 transition-all duration-300 ${scrolled
          ? 'bg-card/90 backdrop-blur-md shadow-sm border-b border-border/60'
          : 'bg-card border-b border-border'
          }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">

            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 group">
              <LogoMark size={30} priority className="group-hover:scale-105 transition-transform duration-200" />
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

            {/* Right — mobile (navigation lives in the bottom bar) */}
            <div className="sm:hidden flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={handleLogout}
                className="h-9 w-9 flex items-center justify-center rounded-xl bg-muted text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors duration-200"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile bottom bar: every section, scrolls sideways ── */}
      <nav
        aria-label="Sections"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        className="sm:hidden fixed inset-x-0 bottom-0 z-40 bg-card border-t border-border"
      >
        <div
          ref={mobileNav}
          className="flex overflow-x-auto overscroll-x-contain snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {navLinks.map(item => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-[60px] w-[22%] min-w-[4.75rem] shrink-0 snap-start flex-col items-center justify-center gap-1 whitespace-nowrap text-[11px] font-medium transition-colors duration-200 ${active ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" />}
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                {item.short || item.label}
              </Link>
            );
          })}
        </div>
        {/* A soft edge hints that there is more to the right */}
        <span className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card to-transparent" />
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {children}
      </main>

      {/* ── Footer ── */}
      <footer
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        className="border-t border-border mt-auto w-full bg-card/30 mb-[60px] sm:mb-0"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground font-medium text-center md:text-left">
            © {new Date().getFullYear()} RIYA FINANCE LTD. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground/80 font-medium text-center md:text-right flex items-center justify-center md:justify-end gap-1">
            Software by <a href="https://webzyinc.com" target="_blank" rel="noopener noreferrer" className="bg-primary/10 text-primary px-2 py-0.5 rounded-md font-bold hover:bg-primary hover:text-primary-foreground transition-all">webzy</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
