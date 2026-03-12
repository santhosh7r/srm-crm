'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';

interface Client {
  _id: string;
  name: string;
  phone: string;
}

interface Plan {
  _id: string;
  name: string;
  description: string;
  planType: 'weekly' | 'monthly';
  interestType: 'fixed' | 'percentage';
  duration?: number;
}

export default function NewLoanPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState('');
  const [planId, setPlanId] = useState('');
  const [disposeAmount, setDisposeAmount] = useState('');
  const [interestAmount, setInterestAmount] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [error, setError] = useState('');

  // Auto-calculate total
  const dispose = parseFloat(disposeAmount) || 0;
  const interest = parseFloat(interestAmount) || 0;
  const total = dispose + interest;

  // Auto-calculate end date preview for weekly plans
  const endDatePreview = (() => {
    if (!selectedPlan || selectedPlan.planType !== 'weekly' || !selectedPlan.duration || !startDate) return null;
    const d = new Date(startDate);
    d.setDate(d.getDate() + selectedPlan.duration * 7);
    return d.toLocaleDateString('en-IN');
  })();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cr, pr] = await Promise.all([fetch('/api/clients'), fetch('/api/plans')]);
        if (cr.ok) setClients((await cr.json()).data || []);
        if (pr.ok) setPlans((await pr.json()).data || []);
      } catch (e) { console.error(e); }
    };
    fetchData();
  }, []);

  const handlePlanChange = (val: string) => {
    setPlanId(val);
    setSelectedPlan(plans.find(p => p._id === val) || null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!clientId || !planId) { setError('Select a client and plan'); return; }
    if (!disposeAmount || !interestAmount) { setError('Enter dispose and interest amounts'); return; }
    if (dispose <= 0) { setError('Dispose amount must be greater than 0'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, planId, disposeAmount: dispose, interestAmount: interest, startDate }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create loan');
      router.push('/dashboard/loans');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create loan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <Link href="/dashboard/loans">
          <Button variant="outline" className="border-slate-200">← Back</Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Assign Loan</h1>
          <p className="text-slate-600 mt-1">Allocate a loan plan to a client with specific amounts</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Client */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                <Select value={clientId} onValueChange={setClientId} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.name}{c.phone ? ` — ${c.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Plan */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Plan *</label>
                <Select value={planId} onValueChange={handlePlanChange} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(p => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name} — {p.planType === 'weekly' ? `Weekly (${p.duration}w)` : 'Monthly'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date *</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  disabled={loading}
                />
                {endDatePreview && (
                  <p className="text-xs text-slate-400 mt-1">
                    📅 End date: {endDatePreview} ({selectedPlan?.duration} weeks)
                  </p>
                )}
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Dispose Amount (₹) *
                    <span className="text-xs font-normal text-slate-400 ml-1">Amount given to client</span>
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={disposeAmount}
                    onChange={e => setDisposeAmount(e.target.value)}
                    disabled={loading}
                    placeholder="e.g. 10000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Interest Amount (₹) *
                    {selectedPlan && (
                      <span className="text-xs font-normal text-slate-400 ml-1">
                        ({selectedPlan.interestType === 'percentage' ? '% based' : 'fixed ₹'})
                      </span>
                    )}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={interestAmount}
                    onChange={e => setInterestAmount(e.target.value)}
                    disabled={loading}
                    placeholder="e.g. 1500"
                  />
                </div>
              </div>

              {/* Total — auto-calculated */}
              {(disposeAmount || interestAmount) && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-slate-500">Total Amount (auto-calculated)</p>
                      <p className="text-xs text-slate-400">Dispose + Interest = Total</p>
                    </div>
                    <p className="text-2xl font-bold text-slate-900">₹{total.toFixed(2)}</p>
                  </div>
                  <div className="flex gap-4 mt-3 text-xs text-slate-500">
                    <span>₹{dispose.toFixed(2)} dispose</span>
                    <span>+</span>
                    <span>₹{interest.toFixed(2)} interest</span>
                    <span>=</span>
                    <span className="font-semibold text-slate-700">₹{total.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-sm">{error}</div>
              )}

              <Button
                type="submit"
                disabled={loading || !clientId || !planId || !disposeAmount || !interestAmount}
                className="bg-slate-900 hover:bg-slate-800 text-white w-full py-3"
              >
                {loading ? 'Assigning...' : 'Assign Loan'}
              </Button>
            </form>
          </Card>
        </div>

        {/* Plan summary */}
        {selectedPlan && (
          <Card className="p-5 h-fit">
            <h3 className="font-semibold text-slate-900 mb-4">Plan Rules</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Plan</p>
                <p className="font-medium text-slate-900">{selectedPlan.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Type</p>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${selectedPlan.planType === 'weekly' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                  {selectedPlan.planType === 'weekly' ? '📆 Weekly' : '📅 Monthly'}
                </span>
              </div>
              {selectedPlan.planType === 'weekly' && selectedPlan.duration && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Duration</p>
                  <p className="font-medium text-slate-900">{selectedPlan.duration} week(s)</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Interest Type</p>
                <p className="font-medium text-slate-900">
                  {selectedPlan.interestType === 'fixed' ? '₹ Fixed Amount' : '% Percentage'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Description</p>
                <p className="text-slate-700">{selectedPlan.description}</p>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-400">💡 Amounts are defined per client loan, not on the plan itself.</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
