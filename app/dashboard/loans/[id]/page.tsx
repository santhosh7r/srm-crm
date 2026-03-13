'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Plan {
  name: string;
  interestType: 'fixed' | 'percentage';
  planType: 'weekly' | 'monthly';
  duration?: number;
}

interface Loan {
  _id: string;
  disposeAmount: number;
  interestAmount: number;
  totalAmount: number;
  balance: number;
  totalPaid: number;
  status: 'active' | 'completed' | 'overdue';
  clientId: { name: string; _id: string };
  planId: Plan;
  startDate: string;
  endDate?: string;
}

interface Payment {
  _id: string;
  amount: number;
  type: 'given' | 'interest';
  date: string;
  notes: string;
}

export default function LoanDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const fromClient = searchParams.get('from') === 'client';
  const clientId = searchParams.get('clientId');

  const [loan, setLoan] = useState<Loan | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentType, setPaymentType] = useState<'given' | 'interest'>('given');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [historyTab, setHistoryTab] = useState<'all' | 'given' | 'interest'>('all');
  const [infoOpen, setInfoOpen] = useState(false);

  const fetchData = async () => {
    try {
      const [loanRes, paymentsRes] = await Promise.all([
        fetch(`/api/loans/${id}`),
        fetch(`/api/loans/${id}/payments`),
      ]);
      if (loanRes.ok) setLoan((await loanRes.json()).data);
      if (paymentsRes.ok) setPayments((await paymentsRes.json()).data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!amount) { setError('Enter an amount'); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return; }
    if (paymentType === 'given' && loan && amt > loan.balance) {
      setError(`Cannot exceed balance ₹${loan.balance.toFixed(2)}`);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId: id, amount: amt, type: paymentType, date: new Date(date), notes }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setAmount(''); setNotes('');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setIsSubmitting(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="h-8 w-8 bg-slate-200 rounded-full animate-pulse mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading loan...</p>
      </div>
    </div>
  );

  if (!loan) return (
    <Card className="p-8 text-center">
      <p className="text-slate-600 mb-4">Loan not found</p>
      <Link href="/dashboard/loans"><Button className="bg-slate-900 text-white">Back to Loans</Button></Link>
    </Card>
  );

  const plan = loan.planId;
  const givenPayments = payments.filter(p => !p.type || p.type === 'given');
  const interestPayments = payments.filter(p => p.type === 'interest');
  const totalGiven = givenPayments.reduce((s, p) => s + p.amount, 0);
  const initialInterestPayments = interestPayments.filter(p => (p.notes || '').toLowerCase().includes('initial'));
  const collectedInterestPayments = interestPayments.filter(p => !(p.notes || '').toLowerCase().includes('initial'));
  const totalInitial = initialInterestPayments.reduce((s, p) => s + p.amount, 0);
  const totalCollected = collectedInterestPayments.reduce((s, p) => s + p.amount, 0);
  const totalInterest = totalInitial + totalCollected;

  const progress = Math.min(100, loan.totalAmount > 0 ? (loan.totalPaid / loan.totalAmount) * 100 : 0);

  const durationDisplay = plan?.planType === 'weekly' && plan?.duration
    ? `${plan.duration} week(s)`
    : 'Monthly';

  const statusStyle = {
    active: 'bg-green-100 text-green-700',
    completed: 'bg-slate-100 text-slate-600',
    overdue: 'bg-red-100 text-red-700',
  }[loan.status];

  const filteredPayments =
    historyTab === 'given' ? givenPayments :
      historyTab === 'interest' ? interestPayments :
        [...payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const fmt = (n: number) => `₹${(n ?? 0).toFixed(2)}`;

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={fromClient && clientId ? `/dashboard/clients/${clientId}` : '/dashboard/loans'}>
            <button className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-slate-600">
              ←
            </button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">{loan.clientId.name}</h1>
            <p className="text-sm text-slate-500 truncate">Plan: {plan?.name}</p>
          </div>
        </div>
        <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyle}`}>
          {loan.status.charAt(0).toUpperCase() + loan.status.slice(1)}
        </span>
      </div>

      {/* ── 4 stat cards — 2×2 on mobile, 4 on md+ ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Disbursed', value: fmt(loan.disposeAmount), color: 'text-slate-900' },
          { label: 'Total Given', value: fmt(totalGiven), color: 'text-green-700' },
          { label: 'Interest Paid', value: fmt(totalInterest), color: 'text-blue-700' },
          { label: 'Balance', value: fmt(loan.balance), color: loan.balance === 0 ? 'text-green-600' : 'text-red-600' },
        ].map(s => (
          <Card key={s.label} className="p-3.5">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* ── Progress ── */}
      <Card className="p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-600">Repayment Progress</span>
          <span className="font-semibold text-slate-900">{progress.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${loan.balance === 0 ? 'bg-green-500' : 'bg-slate-800'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {loan.balance === 0 && (
          <p className="text-xs text-green-600 font-medium mt-1.5">Fully paid — loan completed</p>
        )}
      </Card>

      {/* ── Collapsible Loan Info (mobile-friendly) ── */}
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <button
          onClick={() => setInfoOpen(!infoOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
        >
          Loan Info
          <svg
            className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${infoOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {infoOpen && (
          <div className="border-t border-slate-100 px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              ['Plan', plan?.name],
              ['Client', loan.clientId.name],
              ['Type', plan?.planType === 'weekly' ? 'Weekly' : 'Monthly'],
              ['Duration', durationDisplay],
              ['Dispose', fmt(loan.disposeAmount)],
              ['Monthly Interest', fmt(loan.interestAmount)],
              ['Total Amount', fmt(loan.totalAmount)],
              ['Start', new Date(loan.startDate).toLocaleDateString('en-IN')],
              ['End', loan.endDate ? new Date(loan.endDate).toLocaleDateString('en-IN') : 'No end date'],
              ['Status', loan.status],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
                <p className="font-medium text-slate-900 mt-0.5">{String(value)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add Payment ── */}
      {loan.status !== 'completed' && (
        <Card className="p-4">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Add Payment</h2>

          {/* Payment type select */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Payment Type</label>
            <select
              value={paymentType}
              onChange={e => { setPaymentType(e.target.value as 'given' | 'interest'); setAmount(''); setError(''); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            >
              <option value="given">Given Amount — reduces balance</option>
              <option value="interest">Interest Payment — no balance change</option>
            </select>
          </div>

          <form onSubmit={handlePayment} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Amount (₹) *</label>
                <Input
                  type="number" step="0.01" min="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  disabled={isSubmitting}
                  placeholder={paymentType === 'given' ? `Max ${fmt(loan.balance)}` : '0.00'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Date *</label>
                <Input
                  type="date" value={date}
                  onChange={e => setDate(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
              <Input
                type="text" value={notes}
                onChange={e => setNotes(e.target.value)}
                disabled={isSubmitting}
                placeholder="Optional"
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 p-3 rounded-lg text-sm">{error}</div>
            )}
            <Button
              type="submit" disabled={isSubmitting}
              className={`w-full font-semibold text-white ${paymentType === 'given' ? 'bg-slate-900 hover:bg-slate-800' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isSubmitting ? 'Saving...' : paymentType === 'given' ? 'Add Given Payment' : 'Add Interest Payment'}
            </Button>
          </form>
        </Card>
      )}

      {/* ── Payment History ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">History</h2>
          {/* Tabs */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
            {([['all', `All (${payments.length})`], ['given', `Given (${givenPayments.length})`], ['interest', `Interest (${interestPayments.length})`]] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setHistoryTab(tab)}
                className={`px-3 py-1.5 font-medium transition-colors ${historyTab === tab ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredPayments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No payments yet.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {filteredPayments.map(p => (
              <div
                key={p._id}
                className={`flex items-center justify-between p-3 rounded-lg border text-sm ${p.type === 'interest' ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'
                  }`}
              >
                <div>
                  <p className="font-semibold text-slate-900">{fmt(p.amount)}</p>
                  {p.notes && <p className="text-xs text-slate-400 mt-0.5">{p.notes}</p>}
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-xs text-slate-400">{new Date(p.date).toLocaleDateString('en-IN')}</p>
                  <span className={`text-xs font-medium ${p.type === 'interest' ? 'text-blue-600' : 'text-slate-500'}`}>
                    {p.type === 'interest' ? 'Interest' : 'Given'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary footer */}
        {payments.length > 0 && (
          <div className="border-t border-slate-100 mt-4 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-xs px-2">
            <div>
              <p className="text-slate-400 uppercase font-semibold mb-1">Total Given</p>
              <p className="font-bold text-slate-900 text-sm">{fmt(totalGiven)}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase font-semibold mb-1 text-amber-600">Initial Int.</p>
              <p className="font-bold text-amber-700 text-sm">{fmt(totalInitial)}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase font-semibold mb-1 text-blue-600">Coll. Interest</p>
              <p className="font-bold text-blue-800 text-sm">{fmt(totalCollected)}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase font-semibold mb-1">Balance</p>
              <p className={`font-bold text-sm ${loan.balance === 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(loan.balance)}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
