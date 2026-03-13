'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import {
  Users,
  Briefcase,
  Activity,
  Wallet,
  IndianRupee,
  ArrowRight,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

interface MonthlyData {
  month: string;
  disposed: number;
  collected: number;
}

interface Stats {
  totalClients: number;
  totalLoans: number;
  activeLoans: number;
  completedLoans: number;
  overdueLoans: number;
  totalBalance: number;
  totalPaid: number;
  totalDisposed: number;
  monthlyData: MonthlyData[];
  weeklyPending: any[];
  monthlyPending: any[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    totalLoans: 0,
    activeLoans: 0,
    completedLoans: 0,
    overdueLoans: 0,
    totalBalance: 0,
    totalPaid: 0,
    totalDisposed: 0,
    monthlyData: [],
    weeklyPending: [],
    monthlyPending: []
  });
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [paymentLoan, setPaymentLoan] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentType, setPaymentType] = useState('given');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [clientsRes, loansRes, paymentsRes, userRes] = await Promise.all([
          fetch('/api/clients').then(res => res.json()),
          fetch('/api/loans').then(res => res.json()),
          fetch('/api/payments').then(res => res.json()),
          fetch('/api/auth/me').then(res => res.json())
        ]);

        const clientsData = clientsRes.data || [];
        const loansData = loansRes.data || [];
        const paymentsData = paymentsRes.data || [];

        const totalBalance = loansData.reduce((sum: number, loan: any) => sum + (loan.balance || 0), 0);
        const totalPaid = loansData.reduce((sum: number, loan: any) => sum + (loan.totalPaid || 0), 0);
        const totalDisposed = loansData.reduce((sum: number, loan: any) => sum + (loan.disposeAmount || 0), 0);

        const activeLoans = loansData.filter((loan: any) => loan.status === 'active').length;
        const completedLoans = loansData.filter((loan: any) => loan.status === 'completed').length;
        const overdueLoans = loansData.filter((loan: any) => loan.status === 'overdue').length;

        let minDate = new Date();
        let maxDate = new Date();

        const allDates: number[] = [];
        if (loansData.length > 0) {
          loansData.forEach((l: any) => {
            const tStart = new Date(l.startDate).getTime();
            const tEnd = new Date(l.endDate).getTime();
            if (!isNaN(tStart)) allDates.push(tStart);
            if (!isNaN(tEnd)) allDates.push(tEnd);
          });
        }
        if (paymentsData && paymentsData.length > 0) {
          paymentsData.forEach((p: any) => {
            const t = new Date(p.date).getTime();
            if (!isNaN(t)) allDates.push(t);
          });
        }

        if (allDates.length > 0) {
          minDate = new Date(Math.min(...allDates));
          maxDate = new Date(Math.max(...allDates));
        }

        const fallbackMin = new Date();
        fallbackMin.setMonth(fallbackMin.getMonth() - 5);
        if (minDate > fallbackMin) minDate = new Date(fallbackMin);

        const now = new Date();
        if (maxDate < now) maxDate = new Date(now);

        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthlyStatsMap: Record<string, MonthlyData> = {};

        const curr = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        const endMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

        while (curr <= endMonth) {
          const monthName = months[curr.getMonth()] + ' ' + curr.getFullYear().toString().slice(2);
          monthlyStatsMap[monthName] = { month: monthName, disposed: 0, collected: 0 };
          curr.setMonth(curr.getMonth() + 1);
        }

        loansData.forEach((loan: any) => {
          const d = new Date(loan.startDate);
          const monthName = months[d.getMonth()] + ' ' + d.getFullYear().toString().slice(2);
          if (monthlyStatsMap[monthName]) {
            monthlyStatsMap[monthName].disposed += loan.disposeAmount || 0;
          }
        });

        paymentsData.forEach((payment: any) => {
          const d = new Date(payment.date);
          const monthName = months[d.getMonth()] + ' ' + d.getFullYear().toString().slice(2);
          if (monthlyStatsMap[monthName]) {
            monthlyStatsMap[monthName].collected += payment.amount || 0;
          }
        });

        const weeklyPending: any[] = [];
        const monthlyPending: any[] = [];

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

              if (Math.round(totalPendingDue) > 0) {
                const dueDate = new Date(new Date(loan.startDate).getTime() + (weeksPassed * msInWeek));
                weeklyPending.push({ ...loan, dueAmount: totalPendingDue, dueDate });
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
              monthlyPending.push({ ...loan, dueAmount: pendingInterest, dueDate });
            }
          }
        });

        setStats({
          totalClients: clientsData.length,
          totalLoans: loansData.length,
          activeLoans,
          completedLoans,
          overdueLoans,
          totalBalance,
          totalPaid,
          totalDisposed,
          monthlyData: Object.values(monthlyStatsMap),
          weeklyPending,
          monthlyPending
        });

        setUserName(userRes.user?.name || '');
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
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
          notes: 'Added from dashboard Quick Dues'
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

  const fmt = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statCards = [
    { title: 'Total Clients', value: stats.totalClients, icon: Users, color: 'bg-blue-50 text-blue-600', border: 'border-blue-100' },
    { title: 'Total Loans', value: stats.totalLoans, icon: Briefcase, color: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
    { title: 'Active Loans', value: stats.activeLoans, icon: Activity, color: 'bg-indigo-50 text-indigo-600', border: 'border-indigo-100' },
    { title: 'Total Collected', value: fmt(stats.totalPaid), icon: Wallet, color: 'bg-green-50 text-green-600', border: 'border-green-100' },
    { title: 'Total Balance', value: fmt(stats.totalBalance), icon: IndianRupee, color: 'bg-rose-50 text-rose-600', border: 'border-rose-100' },
  ];

  const pieData = [
    { name: 'Active', value: stats.activeLoans, color: '#4f46e5' },
    { name: 'Completed', value: stats.completedLoans, color: '#10b981' },
    { name: 'Overdue', value: stats.overdueLoans, color: '#ef4444' }
  ].filter(d => d.value > 0);

  const barData = [
    { name: 'Total Collected', Amount: stats.totalPaid, fill: '#10b981' },
    { name: 'Total Balance', Amount: stats.totalBalance, fill: '#ef4444' },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } }
  };

  return (
    <div className="pb-8 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
          Welcome back{userName ? `, ${userName}` : ''}
        </h1>
        <p className="text-slate-500 mt-1 text-sm font-medium">
          Here is your financial portfolio overview for today.
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 mb-8"
      >
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div key={stat.title} variants={itemVariants}>
              <Card className={`p-5 border shadow-sm hover:shadow-md transition-shadow duration-300 ${stat.border}`}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {stat.title}
                  </p>
                  <div className={`p-2 rounded-lg ${stat.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-slate-800">
                  {loading ? (
                    <div className="h-8 w-24 bg-slate-200 animate-pulse rounded"></div>
                  ) : (
                    stat.value
                  )}
                </h3>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Pending Dues Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
      >
        <Card className="p-6 border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold text-slate-800">Weekly Pending Dues</h2>
          </div>
          {stats.weeklyPending.length === 0 ? <p className="text-sm text-slate-500">No pending weekly dues at this time.</p> : (
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              {stats.weeklyPending.slice(0, 10).map((p, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-white p-3 rounded-lg border border-slate-100 transition-all hover:border-indigo-200">
                  <div className="flex-1">
                    <p className="font-bold text-slate-800 text-sm">{p.clientId?.name}</p>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-slate-500 font-medium">₹{Math.round(p.dueAmount)}</p>
                      <p className="text-[10px] text-slate-400 italic">Due Date: {p.dueDate ? new Date(p.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/clients/${p.clientId?._id}`} className="flex-1 sm:flex-none">
                      <Button size="sm" variant="outline" className="h-8 w-full sm:w-auto border-slate-200 hover:bg-slate-100/80">View</Button>
                    </Link>
                    <Button size="sm" onClick={() => { setPaymentLoan(p); setPaymentAmount(Math.round(p.dueAmount).toString()); setPaymentType('given'); }} className="bg-indigo-600 hover:bg-indigo-700 h-8 flex-1 sm:flex-none">Collect</Button>
                  </div>
                </div>
              ))}
              {stats.weeklyPending.length > 10 && (
                <div className="pt-2 pb-1 text-center font-medium">
                  <Link href="/dashboard/dues" className="text-sm text-indigo-600 hover:text-indigo-800 transition-colors">
                    View all {stats.weeklyPending.length} pending dues →
                  </Link>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="p-6 border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-bold text-slate-800">Monthly Pending Dues</h2>
          </div>
          {stats.monthlyPending.length === 0 ? <p className="text-sm text-slate-500">No pending monthly dues at this time.</p> : (
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
              {stats.monthlyPending.slice(0, 10).map((p, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-white p-3 rounded-lg border border-slate-100 transition-all hover:border-emerald-200">
                  <div className="flex-1">
                    <p className="font-bold text-slate-800 text-sm">{p.clientId?.name}</p>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-slate-500 font-medium text-emerald-700">₹{Math.round(p.dueAmount)}</p>
                      <p className="text-[10px] text-slate-400 italic">Due Date: {p.dueDate ? new Date(p.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/clients/${p.clientId?._id}`} className="flex-1 sm:flex-none">
                      <Button size="sm" variant="outline" className="h-8 w-full sm:w-auto border-slate-200 hover:bg-slate-100/80">View</Button>
                    </Link>
                    <Button size="sm" onClick={() => { setPaymentLoan(p); setPaymentAmount(Math.round(p.dueAmount).toString()); setPaymentType('interest'); }} className="bg-emerald-600 hover:bg-emerald-700 h-8 flex-1 sm:flex-none">Collect</Button>
                  </div>
                </div>
              ))}
              {stats.monthlyPending.length > 10 && (
                <div className="pt-2 pb-1 text-center font-medium">
                  <Link href="/dashboard/dues" className="text-sm text-emerald-600 hover:text-emerald-800 transition-colors">
                    View all {stats.monthlyPending.length} pending dues →
                  </Link>
                </div>
              )}
            </div>
          )}
        </Card>
      </motion.div>

      {/* Charts Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8"
      >
        {/* Loan Status Pie Chart */}
        <Card className="p-6 col-span-1 border-slate-200 shadow-sm flex flex-col items-center">
          <div className="flex items-center gap-2 mb-2 self-start">
            <Activity className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold text-slate-800">Loan Distribution</h2>
          </div>
          <p className="text-xs text-slate-500 mb-6 self-start">Current composition of all tracked loans</p>
          <div className="flex-1 w-full min-h-[250px] flex items-center justify-center relative">
            {loading ? (
              <div className="w-40 h-40 border-4 border-slate-100 border-t-indigo-500 rounded-full animate-spin"></div>
            ) : pieData.length > 0 ? (
              <>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                  <p className="text-3xl font-bold text-slate-800">{stats.totalLoans}</p>
                  <p className="text-xs text-slate-500 font-medium">Total Loans</p>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={95}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: number) => [`${value} Loans`, 'Count']}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </>
            ) : (
              <p className="text-slate-400 text-sm">No loan data available.</p>
            )}
          </div>
        </Card>

        {/* Financial Area Chart */}
        <Card className="p-6 col-span-1 lg:col-span-2 border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <h2 className="text-lg font-bold text-slate-800">Financial Overview</h2>
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-6">Aggregate Totals for the System</p>

          <div className="flex-1 w-full min-h-[250px] relative">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex gap-2 items-end h-32">
                  <div className="w-8 h-full bg-slate-200 animate-pulse rounded-t"></div>
                  <div className="w-8 h-2/3 bg-slate-200 animate-pulse rounded-t delay-75"></div>
                  <div className="w-8 h-1/2 bg-slate-200 animate-pulse rounded-t delay-150"></div>
                </div>
              </div>
            ) : (stats.totalPaid > 0 || stats.totalBalance > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    tickFormatter={(value) => value >= 1000 ? `₹${(value / 1000)}k` : `₹${value}`}
                    width={50}
                  />
                  <RechartsTooltip
                    cursor={{ fill: '#f1f5f9' }}
                    formatter={(value: number) => [fmt(value), 'Amount']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }}
                  />
                  <Bar dataKey="Amount" radius={[4, 4, 0, 0]} barSize={80}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <p className="text-slate-400 text-sm">No financial history available yet.</p>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <h2 className="text-lg font-bold text-slate-800 mb-4 px-1">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <a href="/dashboard/clients" className="group">
            <Card className="p-4 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all flex items-center justify-between shadow-sm cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Users className="w-4 h-4" />
                </div>
                <span className="font-semibold text-slate-700">Manage Clients</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
            </Card>
          </a>

          <a href="/dashboard/loans" className="group">
            <Card className="p-4 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all flex items-center justify-between shadow-sm cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Briefcase className="w-4 h-4" />
                </div>
                <span className="font-semibold text-slate-700">View Loans</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
            </Card>
          </a>

          <a href="/dashboard/history" className="group">
            <Card className="p-4 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all flex items-center justify-between shadow-sm cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Activity className="w-4 h-4" />
                </div>
                <span className="font-semibold text-slate-700">Payment History</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all" />
            </Card>
          </a>

          {(stats.overdueLoans > 0) && (
            <a href="/dashboard/loans" className="group">
              <Card className="p-4 border-slate-200 hover:border-rose-300 hover:bg-rose-50/50 transition-all flex items-center justify-between shadow-sm cursor-pointer ring-1 ring-rose-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-100 text-rose-600 rounded-lg group-hover:bg-rose-600 group-hover:text-white transition-colors animate-pulse">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <span className="font-semibold text-rose-700">Overdue Alerts ({stats.overdueLoans})</span>
                </div>
                <ArrowRight className="w-4 h-4 text-rose-400 group-hover:text-rose-600 group-hover:translate-x-1 transition-all" />
              </Card>
            </a>
          )}

          <a href="/dashboard/dues" className="group">
            <Card className="p-4 border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 transition-all flex items-center justify-between shadow-sm cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-600 rounded-lg group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <span className="font-semibold text-slate-700">All Pending Dues</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
            </Card>
          </a>
        </div>
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
