'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
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
    monthlyData: []
  });
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

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

        setStats({
          totalClients: clientsData.length,
          totalLoans: loansData.length,
          activeLoans,
          completedLoans,
          overdueLoans,
          totalBalance,
          totalPaid,
          totalDisposed,
          monthlyData: Object.values(monthlyStatsMap)
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
        </div>
      </motion.div>
    </div>
  );
}
