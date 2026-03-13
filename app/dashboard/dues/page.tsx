'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Activity, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DuesPage() {
    const [weeklyPending, setWeeklyPending] = useState<any[]>([]);
    const [monthlyPending, setMonthlyPending] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modals
    const [paymentLoan, setPaymentLoan] = useState<any>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentType, setPaymentType] = useState('given');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    useEffect(() => {
        const fetchDuesData = async () => {
            try {
                const [loansRes, paymentsRes] = await Promise.all([
                    fetch('/api/loans').then(res => res.json()),
                    fetch('/api/payments').then(res => res.json()),
                ]);

                const loansData = loansRes.data || [];
                const paymentsData = paymentsRes.data || [];

                const now = new Date();
                const weekly: any[] = [];
                const monthly: any[] = [];

                loansData.forEach((loan: any) => {
                    if (loan.status === 'completed') return;
                    const plan = loan.planId;
                    if (!plan) return;

                    if (plan.planType === 'weekly' && plan.duration) {
                        const msInWeek = 7 * 24 * 60 * 60 * 1000;
                        // Weekly principal payment schedule
                        const expectedWeeklyPrincipal = loan.disposeAmount / plan.duration;
                        let weeksPassed = Math.floor((now.getTime() - new Date(loan.startDate).getTime()) / msInWeek);

                        // Only show after next week
                        if (weeksPassed >= 1) {
                            weeksPassed = Math.min(weeksPassed, plan.duration);

                            const expectedTotalPrincipalPaid = weeksPassed * expectedWeeklyPrincipal;
                            const pendingPrincipal = expectedTotalPrincipalPaid - (loan.totalPaid || 0);

                            // Check for 1-time interest
                            const interestPayments = paymentsData.filter((p: any) => {
                                const pid = p.loanId?._id || p.loanId;
                                return String(pid) === String(loan._id) && p.type === 'interest';
                            });
                            const totalInterestPaid = interestPayments.reduce((sum: number, p: any) => sum + p.amount, 0);
                            const pendingInterest = loan.interestAmount > 0 ? Math.max(0, loan.interestAmount - totalInterestPaid) : 0;

                            const totalPendingDue = Math.max(0, pendingPrincipal) + pendingInterest;

                            // Use Math.round to avoid small remainder float issues
                            if (Math.round(totalPendingDue) > 0) {
                                // Calculate the last missed due date (anniversary)
                                const dueDate = new Date(new Date(loan.startDate).getTime() + (weeksPassed * msInWeek));
                                weekly.push({ ...loan, dueAmount: totalPendingDue, dueDate });
                            }
                        }
                    } else if (plan.planType === 'monthly') {
                        const start = new Date(loan.startDate);

                        let fullMonthsPassed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
                        if (now.getDate() < start.getDate()) {
                            fullMonthsPassed--;
                        }

                        const activeMonths = Math.max(0, fullMonthsPassed);

                        // Monthly recurring expects 1 for each full month passed (Excluding upfront day-0 interest)
                        const expectedRecurringInterest = activeMonths * loan.interestAmount;

                        // Only count interest payments that are NOT the initial Day-0 payment
                        const recurringInterestPayments = paymentsData.filter((p: any) => {
                            const pid = p.loanId?._id || p.loanId;
                            return String(pid) === String(loan._id) &&
                                p.type === 'interest' &&
                                !(p.notes || '').toLowerCase().includes('initial');
                        });
                        const totalRecurringPaid = recurringInterestPayments.reduce((sum: number, p: any) => sum + p.amount, 0);

                        const pendingInterest = expectedRecurringInterest - totalRecurringPaid;

                        // Only show in pending list if debt is at least 1 unit after rounding
                        if (Math.round(pendingInterest) > 0 && activeMonths >= 1) {
                            const dueDate = new Date(start);
                            dueDate.setMonth(start.getMonth() + activeMonths);
                            monthly.push({ ...loan, dueAmount: pendingInterest, dueDate });
                        }
                    }
                });

                setWeeklyPending(weekly);
                setMonthlyPending(monthly);

            } catch (error) {
                console.error('Failed to fetch dues data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDuesData();
    }, []);

    const handlePaymentSubmit = async () => {
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
                    notes: 'Added from Pending Dues page'
                })
            });
            if (!res.ok) throw new Error('Failed to add payment');

            setPaymentLoan(null);
            window.location.reload();
        } catch (e) {
            setSubmitError('Error adding payment');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="w-full h-full min-h-[500px] flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="pb-8 overflow-hidden">
            <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard">
                        <Button variant="outline" className="border-slate-200">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">All Pending Dues</h1>
                        <p className="text-slate-500 mt-1 text-sm font-medium">
                            Comprehensive list of all active loans with pending installments
                        </p>
                    </div>
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-8"
            >
                {/* Weekly Pending Full List */}
                <Card className="p-6 border-slate-200 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-6 h-6 text-indigo-500" />
                            <h2 className="text-xl font-bold text-slate-800">Weekly Pending Dues</h2>
                        </div>
                        <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">{weeklyPending.length} Clients</span>
                    </div>
                    {weeklyPending.length === 0 ? <p className="text-sm text-slate-500 text-center py-10">Amazing! No pending weekly dues at this time.</p> : (
                        <div className="space-y-4">
                            {weeklyPending.map((p, i) => (
                                <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-white p-4 rounded-xl border border-slate-100 transition-all hover:shadow-md hover:border-indigo-200 group">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-bold text-slate-800 text-base">{p.clientId?.name}</p>
                                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 italic">
                                                Weekly
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            <p className="text-sm text-slate-500 inline-flex items-center gap-1">
                                                Due: <span className="text-red-600 font-bold">₹{Math.round(p.dueAmount)}</span>
                                            </p>
                                            <p className="text-xs text-slate-400 inline-flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                Due Date: {p.dueDate ? new Date(p.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Link href={`/dashboard/clients/${p.clientId?._id}`} className="flex-1 sm:flex-none">
                                            <Button size="sm" variant="outline" className="h-9 w-full sm:w-auto border-slate-200 hover:bg-slate-100/80">View</Button>
                                        </Link>
                                        <Button size="sm" onClick={() => { setPaymentLoan(p); setPaymentAmount(Math.round(p.dueAmount).toString()); setPaymentType('given'); }} className="bg-indigo-600 hover:bg-indigo-700 h-9 px-4 flex-1 sm:flex-none">Collect</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* Monthly Pending Full List */}
                <Card className="p-6 border-slate-200 shadow-sm flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Activity className="w-6 h-6 text-emerald-500" />
                            <h2 className="text-xl font-bold text-slate-800">Monthly Pending Dues</h2>
                        </div>
                        <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">{monthlyPending.length} Clients</span>
                    </div>
                    {monthlyPending.length === 0 ? <p className="text-sm text-slate-500 text-center py-10">Amazing! No pending monthly dues at this time.</p> : (
                        <div className="space-y-4">
                            {monthlyPending.map((p, i) => (
                                <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-white p-4 rounded-xl border border-slate-100 transition-all hover:shadow-md hover:border-emerald-200 group">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-bold text-slate-800 text-base">{p.clientId?.name}</p>
                                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100 italic">
                                                Monthly
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            <p className="text-sm text-slate-500 inline-flex items-center gap-1">
                                                Interest: <span className="text-red-600 font-bold">₹{Math.round(p.dueAmount)}</span>
                                            </p>
                                            <p className="text-xs text-slate-400 inline-flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                Due Date: {p.dueDate ? new Date(p.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Link href={`/dashboard/clients/${p.clientId?._id}`} className="flex-1 sm:flex-none">
                                            <Button size="sm" variant="outline" className="h-9 w-full sm:w-auto border-slate-200 hover:bg-slate-100/80">View</Button>
                                        </Link>
                                        <Button size="sm" onClick={() => { setPaymentLoan(p); setPaymentAmount(Math.round(p.dueAmount).toString()); setPaymentType('interest'); }} className="bg-emerald-600 hover:bg-emerald-700 h-9 px-4 flex-1 sm:flex-none">Collect</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </motion.div>

            {/* Payment Inline Modal */}
            {paymentLoan && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-100">
                        <h3 className="text-xl font-bold mb-1 text-slate-900">Add Payment</h3>
                        <p className="text-slate-500 text-sm mb-5">Recording collection for <span className="font-semibold text-slate-700">{paymentLoan.clientId?.name}</span></p>

                        {submitError && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm mb-5 font-medium border border-red-100">{submitError}</div>}

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Amount (₹)</label>
                                <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Payment Type</label>
                                <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                                    <option value="given">Principal (Given Amount)</option>
                                    <option value="interest">Monthly Interest</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Collection Date</label>
                                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end pt-2 border-t border-slate-100">
                            <Button variant="outline" onClick={() => setPaymentLoan(null)} className="border-slate-300">Cancel</Button>
                            <Button onClick={handlePaymentSubmit} disabled={isSubmitting} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[120px]">
                                {isSubmitting ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                    'Confirm Payment'
                                )}
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
