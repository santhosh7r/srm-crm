'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SearchInput } from '@/components/ui/search-input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Calendar, LayoutGrid, Table as TableIcon } from 'lucide-react';

type ViewMode = 'cards' | 'table';
const VIEW_KEY = 'loans.view';

interface Loan {
  _id: string;
  disposeAmount: number;
  interestAmount: number;
  totalAmount: number;
  balance: number;
  totalPaid: number;
  status: 'active' | 'completed' | 'overdue';
  clientId: { name: string; _id: string };
  planId: {
    name: string;
    planType: 'weekly' | 'monthly' | 'days';
    duration?: number;
    intervalDays?: number;
  };
  startDate: string;
  endDate?: string;
}

export default function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<ViewMode>('cards');

  useEffect(() => { fetchLoans(); }, []);

  // Restore the last-used view. Read after mount so server and client markup match.
  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_KEY);
    if (stored === 'cards' || stored === 'table') setView(stored);
  }, []);

  const changeView = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
  };

  const fetchLoans = async () => {
    try {
      const res = await fetch('/api/loans');
      if (res.ok) setLoans((await res.json()).data || []);
    } catch (e) {
      console.error('Failed to fetch loans:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/loans/${deleteId}`, { method: 'DELETE' });
      if (res.ok) { setLoans(loans.filter(l => l._id !== deleteId)); setDeleteId(null); }
    } catch (e) { console.error(e); }
  };

  const statusStyle = (status: string) => ({
    active: 'bg-muted text-foreground border border-border dark:bg-muted dark:text-foreground dark:border-border',
    completed: 'bg-gold/10 text-gold-strong border border-gold/30 dark:bg-gold/15 dark:text-gold-strong dark:border-gold/30',
    overdue: 'bg-destructive/10 text-destructive border border-destructive/30 dark:bg-destructive/15 dark:text-destructive dark:border-destructive/30',
  }[status] || 'bg-muted text-foreground');

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const q = searchQuery.trim().toLowerCase();
  const filteredLoans = q
    ? loans.filter(l =>
        (l.clientId?.name ?? '').toLowerCase().includes(q) ||
        (l.planId?.name ?? '').toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q)
      )
    : loans;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Loans</h1>
          <p className="text-secondary-foreground mt-1">Manage all client loans and track payments</p>
        </div>
        <Link href="/dashboard/loans/new">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">+ Assign Loan</Button>
        </Link>
      </div>

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <SearchInput
          className="md:w-96"
          placeholder="Search loans by client, plan, or status..."
          value={searchQuery}
          onValueChange={setSearchQuery}
        />

        {/* Cards / table switch — the choice is remembered per browser */}
        <div className="inline-flex rounded-lg border border-border bg-muted p-0.5 self-start sm:ml-auto">
          <button
            type="button"
            onClick={() => changeView('cards')}
            aria-pressed={view === 'cards'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              view === 'cards'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Cards
          </button>
          <button
            type="button"
            onClick={() => changeView('table')}
            aria-pressed={view === 'table'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
              view === 'table'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <TableIcon className="w-4 h-4" />
            Table
          </button>
        </div>
      </div>

      {loading ? (
        <Card className="p-8 text-center"><p className="text-muted-foreground">Loading loans...</p></Card>
      ) : loans.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">No loans yet.</p>
          <Link href="/dashboard/loans/new">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Assign First Loan</Button>
          </Link>
        </Card>
      ) : filteredLoans.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No loans found matching &quot;{searchQuery}&quot;.</p>
        </Card>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 gap-3">
          {filteredLoans.map(loan => {
            const progress = Math.min(100, (loan.totalPaid / (loan.totalAmount || 1)) * 100);
            const isOverdue = loan.status === 'overdue';

            return (
              <Card
                key={loan._id}
                className={`p-5 hover:shadow-md transition-shadow border ${isOverdue ? 'border-destructive/30 dark:border-destructive/30' : 'border-border'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left */}
                  <div className="flex-1 min-w-0">
                    {/* Name + status row */}
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <Link href={`/dashboard/loans/${loan._id}`}>
                        <h3 className="font-bold text-foreground hover:underline cursor-pointer text-lg">
                          {loan.clientId?.name ?? '—'}
                        </h3>
                      </Link>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle(loan.status)}`}>
                        {loan.status}
                      </span>
                    </div>

                    {/* Plan + START DATE row — start date is super visible */}
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <p className="text-sm text-muted-foreground">
                        {loan.planId?.name ?? '—'} ·{' '}
                        {loan.planId?.planType === 'weekly'
                          ? `📆 Weekly${loan.planId.duration ? ` (${loan.planId.duration}w)` : ''}`
                          : loan.planId?.planType === 'days'
                            ? `🗓️ Every ${loan.planId.intervalDays ?? '?'}d`
                            : '📅 Monthly'}
                      </p>

                      {/* ── PROMINENT START DATE ── */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs font-bold">Started {fmtDate(loan.startDate)}</span>
                      </div>

                      {/* End date for weekly */}
                      {loan.planId?.planType === 'weekly' && loan.endDate && (
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border
                          ${new Date(loan.endDate) < new Date()
                            ? 'bg-destructive/10 border-destructive/30 text-destructive dark:bg-destructive/15 dark:border-destructive/30 dark:text-destructive'
                            : 'bg-muted border-border text-muted-foreground'
                          }`}
                        >
                          Ends {fmtDate(loan.endDate)}
                          {new Date(loan.endDate) < new Date() && ' ⚠'}
                        </div>
                      )}
                    </div>

                    {/* Amounts row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Disposed</p>
                        <p className="font-semibold text-foreground">₹{(loan.disposeAmount ?? 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {loan.planId?.planType === 'weekly'
                            ? 'Interest (one-time)'
                            : loan.planId?.planType === 'days'
                              ? `Interest / ${loan.planId.intervalDays ?? '?'}d`
                              : 'Interest/month'}
                        </p>
                        <p className="font-semibold text-foreground">
                          ₹{(loan.interestAmount ?? 0).toLocaleString('en-IN')}
                          {loan.planId?.planType === 'monthly' && loan.interestAmount > 0 && '/mo'}
                          {loan.planId?.planType === 'days' && loan.interestAmount > 0 && `/${loan.planId.intervalDays}d`}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Paid</p>
                        <p className="font-semibold text-gold-strong dark:text-gold-strong">₹{(loan.totalPaid ?? 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Balance</p>
                        <p className={`font-bold ${loan.balance === 0 ? 'text-gold-strong' : 'text-destructive'}`}>
                          ₹{(loan.balance ?? 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-muted rounded-full h-1.5 max-w-sm">
                      <div
                        className={`h-1.5 rounded-full transition-all ${progress === 100 ? 'bg-gold' : 'bg-primary'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {progress.toFixed(0)}% repaid of ₹{(loan.totalAmount ?? 0).toLocaleString('en-IN')}
                    </p>
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    <Link href={`/dashboard/loans/${loan._id}`}>
                      <Button variant="outline" size="sm" className="border-border w-20">View</Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-destructive/30 text-destructive hover:bg-destructive/10 w-20"
                      onClick={() => setDeleteId(loan._id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-0 overflow-hidden border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead className="pl-4">Client</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead className="text-right">Disposed</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLoans.map(loan => {
                const progress = Math.min(100, (loan.totalPaid / (loan.totalAmount || 1)) * 100);
                const endPassed = !!loan.endDate && new Date(loan.endDate) < new Date();

                return (
                  <TableRow
                    key={loan._id}
                    className={loan.status === 'overdue' ? 'bg-destructive/5' : undefined}
                  >
                    <TableCell className="pl-4">
                      <Link
                        href={`/dashboard/loans/${loan._id}`}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {loan.clientId?.name ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {loan.planId?.name ?? '—'}
                      <span className="ml-1.5 text-xs">
                        {loan.planId?.planType === 'weekly'
                          ? `(Weekly${loan.planId.duration ? ` ${loan.planId.duration}w` : ''})`
                          : loan.planId?.planType === 'days'
                            ? `(Every ${loan.planId.intervalDays ?? '?'}d)`
                            : '(Monthly)'}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-primary">{fmtDate(loan.startDate)}</TableCell>
                    <TableCell className={endPassed ? 'font-medium text-destructive' : 'text-muted-foreground'}>
                      {loan.endDate ? `${fmtDate(loan.endDate)}${endPassed ? ' ⚠' : ''}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-foreground">
                      ₹{(loan.disposeAmount ?? 0).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell className="text-right text-foreground">
                      ₹{(loan.interestAmount ?? 0).toLocaleString('en-IN')}
                      {loan.planId?.planType === 'monthly' && loan.interestAmount > 0 && '/mo'}
                      {loan.planId?.planType === 'days' && loan.interestAmount > 0 && `/${loan.planId.intervalDays}d`}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-gold-strong">
                      ₹{(loan.totalPaid ?? 0).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell
                      className={`text-right font-bold ${loan.balance === 0 ? 'text-gold-strong' : 'text-destructive'}`}
                    >
                      ₹{(loan.balance ?? 0).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-muted rounded-full h-1.5 shrink-0">
                          <div
                            className={`h-1.5 rounded-full ${progress === 100 ? 'bg-gold' : 'bg-primary'}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{progress.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle(loan.status)}`}>
                        {loan.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <div className="flex gap-2 justify-end">
                        <Link href={`/dashboard/loans/${loan._id}`}>
                          <Button variant="outline" size="sm" className="border-border">View</Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteId(loan._id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Loan</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this loan? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
