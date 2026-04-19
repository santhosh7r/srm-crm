'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Loan {
    _id: string;
    principal: number;
    balance: number;
    totalPaid: number;
    interestRate: number;
    duration: number;
    status: 'active' | 'completed' | 'overdue';
    clientId: { name: string; _id: string };
    planId: { name: string; totalAmount: number };
    startDate: string;
    endDate: string;
}

interface Payment {
    _id: string;
    amount: number;
    date: string;
    notes: string;
}

interface Props {
    loanId: string;
    onClose?: () => void;
}

export default function LoanDetailView({ loanId, onClose }: Props) {
    const [loan, setLoan] = useState<Loan | null>(null);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddingPayment, setIsAddingPayment] = useState(false);
    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
    });
    const [error, setError] = useState('');

    const fetchData = async () => {
        try {
            const [loanRes, paymentsRes] = await Promise.all([
                fetch(`/api/loans/${loanId}`),
                fetch(`/api/loans/${loanId}/payments`),
            ]);
            if (loanRes.ok) setLoan((await loanRes.json()).data);
            if (paymentsRes.ok) setPayments((await paymentsRes.json()).data || []);
        } catch (error) {
            console.error('Failed to fetch loan:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [loanId]);

    const handleAddPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!paymentForm.amount) {
            setError('Please enter an amount');
            return;
        }

        const amount = parseFloat(paymentForm.amount);
        if (loan && amount > loan.balance) {
            setError(`Payment cannot exceed balance of ₹${loan.balance.toFixed(2)}`);
            return;
        }

        setIsAddingPayment(true);
        try {
            const response = await fetch('/api/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    loanId,
                    amount,
                    date: new Date(paymentForm.date),
                    notes: paymentForm.notes,
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to add payment');
            }

            setPaymentForm({ amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
            await fetchData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add payment');
        } finally {
            setIsAddingPayment(false);
        }
    };

    if (loading) {
        return (
            <Card className="p-8 text-center">
                <p className="text-secondary-foreground">Loading loan details...</p>
            </Card>
        );
    }

    if (!loan) {
        return (
            <Card className="p-8 text-center">
                <p className="text-secondary-foreground">Loan not found</p>
            </Card>
        );
    }

    const totalRepay = loan.planId?.totalAmount || loan.principal + (loan.principal * loan.interestRate) / 100;
    const progress = Math.min(100, (loan.totalPaid / totalRepay) * 100);

    const statusColor = {
        active: 'bg-green-100 text-green-700',
        completed: 'bg-muted text-secondary-foreground',
        overdue: 'bg-red-100 text-red-700',
    }[loan.status];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-foreground">
                        Loan — {loan.planId?.name || 'Loan Details'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Started {new Date(loan.startDate).toLocaleDateString('en-IN')}
                        {loan.endDate && ` · Due ${new Date(loan.endDate).toLocaleDateString('en-IN')}`}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor}`}>
                        {loan.status.toUpperCase()}
                    </span>
                    {onClose && (
                        <Button variant="outline" size="sm" onClick={onClose} className="border-border">
                            ✕ Close
                        </Button>
                    )}
                </div>
            </div>

            {/* Loan Overview */}
            <Card className="p-5">
                <h4 className="font-semibold text-foreground mb-4">Loan Overview</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Principal</p>
                        <p className="text-xl font-bold text-foreground">₹{loan.principal.toFixed(2)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total to Repay</p>
                        <p className="text-xl font-bold text-foreground">₹{totalRepay.toFixed(2)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Paid</p>
                        <p className="text-xl font-bold text-green-700">₹{loan.totalPaid.toFixed(2)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Balance</p>
                        <p className="text-xl font-bold text-red-600">₹{loan.balance.toFixed(2)}</p>
                    </div>
                </div>

                {/* Progress bar */}
                <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Repayment Progress</span>
                        <span>{progress.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                        <div
                            className="bg-green-500 h-2 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </Card>

            {/* Add Payment + History side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Add Payment */}
                {loan.status !== 'completed' && (
                    <Card className="p-5">
                        <h4 className="font-semibold text-foreground mb-4">Add Payment</h4>
                        <form onSubmit={handleAddPayment} className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-foreground mb-1">Amount (₹) *</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max={loan.balance}
                                    value={paymentForm.amount}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                    disabled={isAddingPayment}
                                    placeholder={`Max ₹${loan.balance.toFixed(2)}`}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-foreground mb-1">Date *</label>
                                <Input
                                    type="date"
                                    value={paymentForm.date}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                                    disabled={isAddingPayment}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
                                <Input
                                    type="text"
                                    value={paymentForm.notes}
                                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                                    disabled={isAddingPayment}
                                    placeholder="Optional note"
                                />
                            </div>
                            {error && (
                                <div className="bg-red-50 text-red-700 p-2 rounded text-xs">{error}</div>
                            )}
                            <Button
                                type="submit"
                                className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                                disabled={isAddingPayment}
                            >
                                {isAddingPayment ? 'Adding...' : 'Add Payment'}
                            </Button>
                        </form>
                    </Card>
                )}

                {/* Payment History */}
                <Card className="p-5">
                    <h4 className="font-semibold text-foreground mb-4">
                        Payment History
                        <span className="ml-2 text-xs bg-muted text-secondary-foreground px-2 py-0.5 rounded-full">
                            {payments.length}
                        </span>
                    </h4>
                    {payments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {payments.map((payment) => (
                                <div
                                    key={payment._id}
                                    className="flex justify-between items-start p-2 bg-background rounded-lg"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">
                                            ₹{payment.amount.toFixed(2)}
                                        </p>
                                        {payment.notes && (
                                            <p className="text-xs text-muted-foreground mt-0.5">{payment.notes}</p>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(payment.date).toLocaleDateString('en-IN')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
