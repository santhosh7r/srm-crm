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
import { Calendar } from 'lucide-react';

interface Loan {
  _id: string;
  disposeAmount: number;
  interestAmount: number;
  totalAmount: number;
  balance: number;
  totalPaid: number;
  status: 'active' | 'completed' | 'overdue';
  clientId: { name: string; _id: string };
  planId: { name: string; planType: 'weekly' | 'monthly'; duration?: number };
  startDate: string;
  endDate?: string;
}

export default function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { fetchLoans(); }, []);

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
    active: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/50',
    completed: 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800/50',
    overdue: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/50',
  }[status] || 'bg-muted text-foreground');

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

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

      {loading ? (
        <Card className="p-8 text-center"><p className="text-muted-foreground">Loading loans...</p></Card>
      ) : loans.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">No loans yet.</p>
          <Link href="/dashboard/loans/new">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Assign First Loan</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {loans.map(loan => {
            const progress = Math.min(100, (loan.totalPaid / (loan.totalAmount || 1)) * 100);
            const days = daysSince(loan.startDate);
            const isOverdue = loan.status === 'overdue';

            return (
              <Card
                key={loan._id}
                className={`p-5 hover:shadow-md transition-shadow border ${isOverdue ? 'border-red-200 dark:border-red-800/50' : 'border-border'}`}
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
                            ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800/50 dark:text-red-400'
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
                          {loan.planId?.planType === 'weekly' ? 'Interest (one-time)' : 'Interest/month'}
                        </p>
                        <p className="font-semibold text-foreground">
                          ₹{(loan.interestAmount ?? 0).toLocaleString('en-IN')}
                          {loan.planId?.planType === 'monthly' && loan.interestAmount > 0 && '/mo'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Paid</p>
                        <p className="font-semibold text-green-700 dark:text-green-400">₹{(loan.totalPaid ?? 0).toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Balance</p>
                        <p className={`font-bold ${loan.balance === 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ₹{(loan.balance ?? 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-muted rounded-full h-1.5 max-w-sm">
                      <div
                        className={`h-1.5 rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-primary'}`}
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
                      className="border-red-200 text-red-600 hover:bg-red-50 w-20"
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
      )}

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Loan</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this loan? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
