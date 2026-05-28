'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type PlanType = 'weekly' | 'monthly' | 'days';

interface Plan {
  _id: string;
  name: string;
  description: string;
  planType: PlanType;
  interestType: 'fixed' | 'percentage';
  duration?: number;
  intervalDays?: number;
}

const emptyForm = {
  name: '',
  description: '',
  planType: 'monthly' as PlanType,
  interestType: 'fixed' as 'fixed' | 'percentage',
  duration: '',
  intervalDays: '',
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => { fetchPlans(); }, []);

  const fetchPlans = async () => {
    try {
      const res = await fetch('/api/plans');
      if (res.ok) setPlans((await res.json()).data || []);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payload: any = {
      name: form.name,
      description: form.description,
      planType: form.planType,
      interestType: form.interestType,
    };
    if (form.planType === 'weekly' && form.duration) {
      payload.duration = parseInt(form.duration);
    }
    if (form.planType === 'days') {
      if (!form.intervalDays) { setError('Interval (days) is required'); return; }
      payload.intervalDays = parseInt(form.intervalDays);
    }

    const url = editingId ? `/api/plans/${editingId}` : '/api/plans';
    const method = editingId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save plan');
      }
      reset();
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plan');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/plans/${deleteId}`, { method: 'DELETE' });
    setPlans(plans.filter(p => p._id !== deleteId));
    setDeleteId(null);
  };

  const handleEdit = (plan: Plan) => {
    setForm({
      name: plan.name,
      description: plan.description,
      planType: plan.planType,
      interestType: plan.interestType,
      duration: plan.duration?.toString() || '',
      intervalDays: plan.intervalDays?.toString() || '',
    });
    setEditingId(plan._id);
    setShowForm(true);
  };

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError('');
  };

  const Toggle = ({
    value, onChange, options,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <div className="flex rounded-lg border border-border overflow-hidden w-fit flex-wrap">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${value === o.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-secondary-foreground hover:bg-background'
            }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const planLabel = (p: Plan) => {
    if (p.planType === 'weekly') return `📆 Weekly${p.duration ? ` (${p.duration}w)` : ''}`;
    if (p.planType === 'monthly') return '📅 Monthly';
    return `🗓️ Every ${p.intervalDays ?? '?'}d`;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Loan Plans</h1>
          <p className="text-secondary-foreground mt-1">Define loan rules — amounts are set per client when assigning</p>
        </div>
        <Button onClick={() => { reset(); setShowForm(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          + New Plan
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-5">
            {editingId ? 'Edit Plan' : 'Create Plan'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Plan Name *</label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                placeholder="e.g. Standard Weekly"
              />
            </div>

            {/* Plan Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Plan Type *</label>
              <Toggle
                value={form.planType}
                onChange={v => setForm({
                  ...form,
                  planType: v as PlanType,
                  duration: '',
                  intervalDays: '',
                })}
                options={[
                  { value: 'monthly', label: '📅 Monthly' },
                  { value: 'weekly', label: '📆 Weekly' },
                  { value: 'days', label: '🗓️ Days' },
                ]}
              />
            </div>

            {/* Duration — only for weekly */}
            {form.planType === 'weekly' && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Duration (weeks) *</label>
                <Input
                  type="number"
                  min="1"
                  value={form.duration}
                  onChange={e => setForm({ ...form, duration: e.target.value })}
                  required={form.planType === 'weekly'}
                  placeholder="e.g. 10"
                  className="w-36"
                />
                {form.duration && (
                  <p className="text-xs text-muted-foreground mt-1">{form.duration} week(s)</p>
                )}
              </div>
            )}

            {/* Days plan field */}
            {form.planType === 'days' && (
              <div className="space-y-2 p-4 rounded-lg border border-border bg-background/50">
                <label className="block text-sm font-medium text-foreground">Interval (days) *</label>
                <Input
                  type="number"
                  min="1"
                  value={form.intervalDays}
                  onChange={e => setForm({ ...form, intervalDays: e.target.value })}
                  required
                  placeholder="e.g. 10"
                  className="w-36"
                />
                <p className="text-xs text-muted-foreground">
                  Interest cycle repeats every {form.intervalDays || 'N'} day(s) — runs until balance is cleared. Works like monthly, but on your own day count (10, 15, 20, etc.).
                </p>
              </div>
            )}

            {/* Interest Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Interest Type *</label>
              <Toggle
                value={form.interestType}
                onChange={v => setForm({ ...form, interestType: v as 'fixed' | 'percentage' })}
                options={[
                  { value: 'fixed', label: '₹ Fixed Amount' },
                  { value: 'percentage', label: '% Percentage' },
                ]}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.interestType === 'fixed'
                  ? 'Interest is a fixed rupee amount — set per loan'
                  : 'Interest is a % of dispose amount — set per loan'}
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description *</label>
              <Input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                required
                placeholder="Brief description of this plan"
              />
            </div>

            {error && <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">{error}</div>}

            <div className="flex gap-3">
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {editingId ? 'Update Plan' : 'Create Plan'}
              </Button>
              <Button type="button" variant="outline" onClick={reset} className="border-border">
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Plans list */}
      {loading ? (
        <Card className="p-8 text-center"><p className="text-muted-foreground">Loading plans...</p></Card>
      ) : plans.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">No plans yet.</p>
          <Button onClick={() => { reset(); setShowForm(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            Create First Plan
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(plan => (
            <Card key={plan._id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-foreground">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{plan.description}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  plan.planType === 'weekly' ? 'bg-muted text-blue-700' :
                  plan.planType === 'days' ? 'bg-muted text-purple-700' :
                  'bg-muted text-secondary-foreground'
                }`}>
                  {planLabel(plan)}
                </span>
              </div>

              <div className="space-y-1.5 text-sm text-secondary-foreground mb-4">
                <div className="flex justify-between">
                  <span>Interest Type</span>
                  <span className="font-medium text-foreground">
                    {plan.interestType === 'fixed' ? '₹ Fixed Amount' : '% Percentage'}
                  </span>
                </div>
                {plan.planType === 'weekly' && plan.duration && (
                  <div className="flex justify-between">
                    <span>Duration</span>
                    <span className="font-medium text-foreground">{plan.duration} week(s)</span>
                  </div>
                )}
                {plan.planType === 'days' && (
                  <div className="flex justify-between">
                    <span>Cycle</span>
                    <span className="font-medium text-foreground">every {plan.intervalDays ?? '?'} day(s)</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button onClick={() => handleEdit(plan)} variant="outline" size="sm" className="flex-1 border-border">
                  Edit
                </Button>
                <Button
                  onClick={() => setDeleteId(plan._id)}
                  variant="outline"
                  size="sm"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Plan</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure? This action cannot be undone.
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
