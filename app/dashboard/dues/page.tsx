'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Activity, ArrowLeft, IndianRupee, Calendar, Clock, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DuesPage() {
    const [weeklyPending, setWeeklyPending] = useState<any[]>([]);
    const [monthlyPending, setMonthlyPending] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [paymentLoan, setPaymentLoan] = useState<any>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentType, setPaymentType] = useState('given');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    useEffect(() => {
        fetch('/api/dues')
            .then(r => r.json())
            .then(json => {
                setWeeklyPending(json.data?.weekly || []);
                setMonthlyPending(json.data?.monthly || []);
            })
            .catch(() => setError('Failed to load pending dues.'))
            .finally(() => setLoading(false));
    }, []);

    const handleCollect = async () => {
        if (!paymentAmount || Number(paymentAmount) <= 0) {
            setSubmitError('Please enter a valid amount');
            return;
        }
        setIsSubmitting(true);
        setSubmitError('');
        try {
            const res = await fetch('/api/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    loanId: paymentLoan._id,
                    amount: Number(paymentAmount),
                    type: paymentType,
                    date: paymentDate,
                    notes: `Collected — ${new Date(paymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
                }),
            });
            if (!res.ok) throw new Error();
            setPaymentLoan(null);
            window.location.reload();
        } catch {
            setSubmitError('Error recording payment. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
    const fmtDate = (d: string | Date) =>
        new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    if (loading) {
        return (
            <div className="w-full min-h-[500px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-border/50 border-t-primary rounded-full animate-spin" />
                    <p className="text-sm text-muted-foreground font-medium">Loading pending dues…</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full min-h-[500px] flex items-center justify-center">
                <div className="text-center">
                    <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                    <p className="text-red-600 font-medium mb-4">{error}</p>
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                </div>
            </div>
        );
    }

    const overdueWeekly = weeklyPending.filter(p => p.isPastDuration);

    return (
        <div className="pb-8 overflow-hidden">
            {/* Header */}
            <div className="mb-8 flex items-center gap-4">
                <Link href="/dashboard">
                    <Button variant="outline" className="border-border">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold text-foreground tracking-tight">All Pending Dues</h1>
                    <p className="text-muted-foreground mt-1 text-sm font-medium">
                        Shows from anniversary date • disappears once collected • repeats until loan complete
                    </p>
                </div>
            </div>

            {/* Overdue banner */}
            {overdueWeekly.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800/50"
                >
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                        {overdueWeekly.length} weekly loan{overdueWeekly.length > 1 ? 's' : ''} past duration — collect immediately
                    </p>
                </motion.div>
            )}

            {/* Summary */}
            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8"
            >
                <Card className="p-5 border-border flex items-center gap-4">
                    <div className="p-3 bg-muted rounded-xl shrink-0">
                        <AlertCircle className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Weekly Dues</p>
                        <p className="text-2xl font-bold text-foreground">
                            {weeklyPending.length}<span className="text-sm font-medium text-muted-foreground ml-1">clients</span>
                        </p>
                        {overdueWeekly.length > 0 && (
                            <p className="text-xs font-bold text-red-600 mt-0.5">{overdueWeekly.length} past duration</p>
                        )}
                    </div>
                </Card>
                <Card className="p-5 border-border flex items-center gap-4">
                    <div className="p-3 bg-muted rounded-xl shrink-0">
                        <Activity className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-0.5">Monthly Dues</p>
                        <p className="text-2xl font-bold text-foreground">
                            {monthlyPending.length}<span className="text-sm font-medium text-muted-foreground ml-1">clients</span>
                        </p>
                        {monthlyPending.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {monthlyPending.filter(p => p.unpaidMonths > 1).length} with multiple months pending
                            </p>
                        )}
                    </div>
                </Card>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-8"
            >
                {/* ── WEEKLY ── */}
                <Card className="p-6 border-border shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-bold text-foreground">Weekly Pending Dues</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            {overdueWeekly.length > 0 && (
                                <span className="bg-red-100 text-red-600 border border-red-200 px-2.5 py-1 rounded-full text-xs font-bold">
                                    {overdueWeekly.length} overdue
                                </span>
                            )}
                            <span className="bg-muted text-primary px-3 py-1 rounded-full text-xs font-bold">
                                {weeklyPending.length} Clients
                            </span>
                        </div>
                    </div>

                    {weeklyPending.length === 0 ? (
                        <EmptyState icon={<AlertCircle className="w-6 h-6 text-muted-foreground" />} label="No weekly dues pending" />
                    ) : (
                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                            {weeklyPending.map((p, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.04 }}
                                    className={`flex flex-col gap-3 p-4 rounded-xl border transition-all hover:shadow-sm
                                        ${p.isPastDuration
                                            ? 'bg-red-50/60 border-red-300 dark:bg-red-950/25 dark:border-red-800/50'
                                            : 'bg-card border-border/60 hover:border-primary/35'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                <p className="font-bold text-foreground">{p.clientId?.name || '—'}</p>
                                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-primary border border-border shrink-0">
                                                    Weekly
                                                </span>
                                                {p.isPastDuration && (
                                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-300 shrink-0 flex items-center gap-1">
                                                        <AlertTriangle className="w-2.5 h-2.5" /> Past Duration
                                                    </span>
                                                )}
                                                {p.unpaidWeeks > 1 && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200 shrink-0">
                                                        {p.unpaidWeeks} weeks unpaid
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-0.5 text-xs">
                                                <span className="flex items-center gap-1 text-foreground font-medium">
                                                    <IndianRupee className="w-3 h-3 shrink-0" />
                                                    {p.pendingPrincipal > 0 && `Principal: ${fmt(p.pendingPrincipal)}`}
                                                    {p.pendingPrincipal > 0 && p.pendingInterest > 0 && ' + '}
                                                    {p.pendingInterest > 0 && `Interest: ${fmt(p.pendingInterest)}`}
                                                </span>
                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                    <Clock className="w-3 h-3 shrink-0" />
                                                    Due from: {fmtDate(p.dueDate)}
                                                    {p.endDate && ` · Plan ended: ${fmtDate(p.endDate)}`}
                                                </span>
                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                    <Calendar className="w-3 h-3 shrink-0" />
                                                    Started: {fmtDate(p.startDate)} · Balance: {fmt(p.balance || 0)}
                                                </span>
                                            </div>
                                        </div>
                                        <p className={`text-base font-bold whitespace-nowrap shrink-0 ${p.isPastDuration ? 'text-red-700' : 'text-red-600'}`}>
                                            {fmt(p.dueAmount)}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <Link href={`/dashboard/clients/${p.clientId?._id}`}>
                                            <Button size="sm" variant="outline" className="h-8 border-border hover:bg-muted text-xs">View</Button>
                                        </Link>
                                        <Button
                                            size="sm"
                                            className={`h-8 text-xs px-4 ${p.isPastDuration ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'} text-white`}
                                            onClick={() => {
                                                setPaymentLoan(p);
                                                setPaymentAmount(Math.round(p.dueAmount).toString());
                                                setPaymentType('given');
                                            }}
                                        >
                                            Collect
                                        </Button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* ── MONTHLY ── */}
                <Card className="p-6 border-border shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-bold text-foreground">Monthly Pending Dues</h2>
                        </div>
                        <span className="bg-muted text-primary px-3 py-1 rounded-full text-xs font-bold">
                            {monthlyPending.length} Clients
                        </span>
                    </div>

                    {monthlyPending.length === 0 ? (
                        <EmptyState icon={<Activity className="w-6 h-6 text-muted-foreground" />} label="No monthly dues pending" />
                    ) : (
                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                            {monthlyPending.map((p, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.04 }}
                                    className={`flex flex-col gap-3 p-4 rounded-xl border transition-all hover:shadow-sm
                                        ${p.unpaidMonths > 1
                                            ? 'bg-orange-50/40 border-orange-200/70 dark:bg-orange-950/20 dark:border-orange-800/40'
                                            : 'bg-card border-border/60 hover:border-primary/35'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                <p className="font-bold text-foreground">{p.clientId?.name || '—'}</p>
                                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-primary border border-border shrink-0">
                                                    Monthly
                                                </span>
                                                {p.unpaidMonths > 1 && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200 shrink-0">
                                                        {p.unpaidMonths} months pending
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-0.5 text-xs">
                                                {p.hasInterest ? (
                                                    <span className="flex items-center gap-1 text-foreground font-medium">
                                                        <IndianRupee className="w-3 h-3 shrink-0" />
                                                        {fmt(p.interestPerMonth)}/month
                                                        {p.unpaidMonths > 1 && ` × ${p.unpaidMonths} = ${fmt(p.dueAmount)} total`}
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-foreground font-medium">
                                                        <IndianRupee className="w-3 h-3 shrink-0" />
                                                        Collect outstanding: {fmt(p.outstandingBalance)}
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                    <Clock className="w-3 h-3 shrink-0" />
                                                    Due from: {fmtDate(p.dueDate)}
                                                </span>
                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                    <Calendar className="w-3 h-3 shrink-0" />
                                                    Loan started: {fmtDate(p.startDate)} · Balance: {fmt(p.outstandingBalance)}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-base font-bold text-red-600 whitespace-nowrap shrink-0">
                                            {p.hasInterest ? fmt(p.dueAmount) : fmt(p.outstandingBalance)}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                        <Link href={`/dashboard/clients/${p.clientId?._id}`}>
                                            <Button size="sm" variant="outline" className="h-8 border-border hover:bg-muted text-xs">View</Button>
                                        </Link>
                                        <Button
                                            size="sm"
                                            className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-4"
                                            onClick={() => {
                                                setPaymentLoan(p);
                                                setPaymentAmount(p.hasInterest ? Math.round(p.interestPerMonth).toString() : '');
                                                setPaymentType(p.hasInterest ? 'interest' : 'given');
                                            }}
                                        >
                                            Collect
                                        </Button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </Card>
            </motion.div>

            {/* Payment Modal */}
            {paymentLoan && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6 border border-border/50"
                    >
                        <h3 className="text-xl font-bold mb-1 text-foreground">Collect Payment</h3>
                        <p className="text-muted-foreground text-sm mb-4">
                            Client: <span className="font-semibold text-foreground">{paymentLoan.clientId?.name}</span>
                        </p>

                        {submitError && (
                            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm mb-4 border border-red-100">{submitError}</div>
                        )}

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Amount (₹)</label>
                                <input
                                    type="number"
                                    placeholder="Enter amount collected"
                                    value={paymentAmount}
                                    onChange={e => setPaymentAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Payment Type</label>
                                <select
                                    value={paymentType}
                                    onChange={e => setPaymentType(e.target.value)}
                                    className="w-full px-3 py-2 border border-border rounded-lg bg-card focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                                >
                                    <option value="interest">Monthly Interest</option>
                                    <option value="given">Principal Repayment</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1.5">Collection Date</label>
                                <input
                                    type="date"
                                    value={paymentDate}
                                    onChange={e => setPaymentDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none text-foreground"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end pt-2 border-t border-border/50">
                            <Button variant="outline" onClick={() => { setPaymentLoan(null); setSubmitError(''); }} className="border-border">
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCollect}
                                disabled={isSubmitting}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[130px]"
                            >
                                {isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Confirm Payment'}
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">{icon}</div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-1">All clients are up to date</p>
        </div>
    );
}
