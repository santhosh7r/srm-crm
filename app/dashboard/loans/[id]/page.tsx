'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Plan {
  name: string;
  totalAmount: number;
  disposeAmount: number;
  interestAmount: number;
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
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');

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
      setAmount('');
      setNotes('');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return (
    <Card className="p-12 text-center">
      <div className="text-slate-400 text-4xl mb-3">⏳</div>
      <p className="text-slate-600">Loading loan details...</p>
    </Card>
  );

  if (!loan) return (
    <Card className="p-12 text-center">
      <p className="text-slate-600 mb-4">Loan not found</p>
      <Link href="/dashboard/loans"><Button className="bg-slate-900 text-white">← Back</Button></Link>
    </Card>
  );

  const plan = loan.planId;
  const givenPayments = payments.filter(p => !p.type || p.type === 'given');
  const interestPayments = payments.filter(p => p.type === 'interest');
  const totalGiven = givenPayments.reduce((s, p) => s + p.amount, 0);
  const totalInterestCollected = interestPayments.reduce((s, p) => s + p.amount, 0);
  const totalRepay = loan.totalAmount;
  const progress = Math.min(100, (loan.totalPaid / totalRepay) * 100);

  const durationDisplay = plan?.planType === 'weekly' && plan?.duration
    ? `${plan.duration} week(s)`
    : 'Monthly (no fixed duration)';

  const statusStyle = {
    active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Active' },
    completed: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Completed' },
    overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'Overdue' },
  }[loan.status];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={fromClient && clientId ? `/dashboard/clients/${clientId}` : '/dashboard/loans'}>
            <Button variant="outline" className="border-slate-200">
              {fromClient ? '← Back to Client' : '← Back'}
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{loan.clientId.name}</h1>
            <p className="text-slate-500 text-sm">Plan: {plan?.name}</p>
          </div>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
          {statusStyle.label}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left (2/3) ── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Payment Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Disbursed', value: `₹${loan.disposeAmount.toFixed(2)}`, color: 'text-slate-900' },
              { label: 'Total Given', value: `₹${totalGiven.toFixed(2)}`, color: 'text-green-700' },
              { label: 'Interest Collected', value: `₹${totalInterestCollected.toFixed(2)}`, color: 'text-blue-700' },
              { label: 'Balance', value: `₹${loan.balance.toFixed(2)}`, color: loan.balance === 0 ? 'text-green-600' : 'text-red-600' },
            ].map(stat => (
              <Card key={stat.label} className="p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{stat.label}</p>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
              </Card>
            ))}
          </div>

          {/* Progress */}
          <Card className="p-5">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600">Repayment Progress</span>
              <span className="font-semibold text-slate-900">{progress.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${loan.balance === 0 ? 'bg-green-500' : 'bg-slate-800'
                  }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {loan.balance === 0 && (
              <p className="text-xs text-green-600 font-medium mt-2">✓ Fully paid — loan completed</p>
            )}
          </Card>

          {/* Add Payment */}
          {loan.status !== 'completed' && (
            <Card className="p-5">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Add Payment</h2>

              <form onSubmit={handlePayment} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Payment Type as select */}
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Type *</label>
                    <select
                      value={paymentType}
                      onChange={e => { setPaymentType(e.target.value as 'given' | 'interest'); setAmount(''); setError(''); }}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                    >
                      <option value="given">💰 Given Amount — reduces loan balance</option>
                      <option value="interest">📊 Interest Payment — collected interest, no balance change</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Amount (₹) *
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      disabled={isSubmitting}
                      placeholder={paymentType === 'given' ? `Max ₹${loan.balance.toFixed(2)}` : 'Enter amount'}
                      className="text-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                    <Input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                  <Input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Optional note"
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-3 font-semibold text-white transition-all ${paymentType === 'given'
                    ? 'bg-slate-900 hover:bg-slate-800'
                    : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                  {isSubmitting
                    ? 'Saving...'
                    : paymentType === 'given'
                      ? '+ Add Given Payment'
                      : '+ Add Interest Payment'}
                </Button>
              </form>
            </Card>
          )}

          {/* Payment History */}
          <Card className="p-5">
            {/* Tabs */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Payment History</h2>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-1.5 font-medium transition-colors ${activeTab === 'overview' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  All ({payments.length})
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-4 py-1.5 font-medium transition-colors ${activeTab === 'history' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  By Type
                </button>
              </div>
            </div>

            {payments.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No payments recorded yet.</p>
            ) : activeTab === 'overview' ? (
              /* All payments chronological */
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {[...payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => (
                  <div key={p._id} className={`flex justify-between items-center p-3 rounded-lg border ${p.type === 'interest'
                    ? 'bg-blue-50 border-blue-100'
                    : 'bg-slate-50 border-slate-100'
                    }`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{p.type === 'interest' ? '📊' : '💰'}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">₹{p.amount.toFixed(2)}</p>
                        {p.notes && <p className="text-xs text-slate-500">{p.notes}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">{new Date(p.date).toLocaleDateString('en-IN')}</p>
                      <p className={`text-xs font-medium mt-0.5 ${p.type === 'interest' ? 'text-blue-600' : 'text-slate-600'}`}>
                        {p.type === 'interest' ? 'Interest' : 'Given'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* By type view */
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    💰 Given ({givenPayments.length})
                  </p>
                  {givenPayments.length === 0
                    ? <p className="text-xs text-slate-400">None</p>
                    : <div className="space-y-2 max-h-64 overflow-y-auto">
                      {givenPayments.map(p => (
                        <div key={p._id} className="p-2 bg-slate-50 rounded border border-slate-100">
                          <p className="text-sm font-semibold text-slate-900">₹{p.amount.toFixed(2)}</p>
                          <p className="text-xs text-slate-400">{new Date(p.date).toLocaleDateString('en-IN')}</p>
                          {p.notes && <p className="text-xs text-slate-500">{p.notes}</p>}
                        </div>
                      ))}
                    </div>
                  }
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    📊 Interest ({interestPayments.length})
                  </p>
                  {interestPayments.length === 0
                    ? <p className="text-xs text-slate-400">None</p>
                    : <div className="space-y-2 max-h-64 overflow-y-auto">
                      {interestPayments.map(p => (
                        <div key={p._id} className="p-2 bg-blue-50 rounded border border-blue-100">
                          <p className="text-sm font-semibold text-slate-900">₹{p.amount.toFixed(2)}</p>
                          <p className="text-xs text-slate-400">{new Date(p.date).toLocaleDateString('en-IN')}</p>
                          {p.notes && <p className="text-xs text-slate-500">{p.notes}</p>}
                        </div>
                      ))}
                    </div>
                  }
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ── Right (1/3) — Loan Info only ── */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Loan Info</h3>
            <div className="space-y-3 text-sm">
              {[
                ['Plan', plan?.name],
                ['Client', loan.clientId.name],
                ['Loan Type', plan?.planType === 'weekly' ? '📆 Weekly' : '📅 Monthly'],
                ['Duration', durationDisplay],
                ['Dispose Amount', `₹${loan.disposeAmount.toFixed(2)}`],
                ['Interest Amount', `₹${loan.interestAmount.toFixed(2)}`],
                ['Total Amount', `₹${loan.totalAmount.toFixed(2)}`],
                ['Start Date', new Date(loan.startDate).toLocaleDateString('en-IN')],
                ['End Date', loan.endDate ? new Date(loan.endDate).toLocaleDateString('en-IN') : 'No end date'],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
                  <p className="font-medium text-slate-900">{String(value)}</p>
                </div>
              ))}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
                  {statusStyle.label}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Total Given</span>
                <span className="font-bold text-slate-900">₹{totalGiven.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Interest Collected</span>
                <span className="font-bold text-blue-700">₹{totalInterestCollected.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-600">Balance</span>
                <span className={`font-bold ${loan.balance === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₹{loan.balance.toFixed(2)}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
