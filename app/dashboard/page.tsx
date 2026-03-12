'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';

interface Stats {
  totalClients: number;
  totalLoans: number;
  activeLoans: number;
  totalBalance: number;
  totalPaid: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    totalLoans: 0,
    activeLoans: 0,
    totalBalance: 0,
    totalPaid: 0,
  });
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [clientsRes, loansRes, userRes] = await Promise.all([
          fetch('/api/clients').then(res => res.json()),
          fetch('/api/loans').then(res => res.json()),
          fetch('/api/auth/me').then(res => res.json())
        ]);

        const clientsData = clientsRes.data || [];
        const loansData = loansRes.data || [];

        const totalBalance = loansData.reduce((sum: number, loan: any) => sum + loan.balance, 0);
        const totalPaid = loansData.reduce((sum: number, loan: any) => sum + loan.totalPaid, 0);
        const activeLoans = loansData.filter((loan: any) => loan.status === 'active').length;

        setStats({
          totalClients: clientsData.length,
          totalLoans: loansData.length,
          activeLoans,
          totalBalance,
          totalPaid,
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

  const statCards = [
    {
      title: 'Total Clients',
      value: stats.totalClients,
      color: 'bg-green-50',
      textColor: 'text-green-700',
    },
    {
      title: 'Total Loans',
      value: stats.totalLoans,
      color: 'bg-blue-50',
      textColor: 'text-blue-700',
    },
    {
      title: 'Active Loans',
      value: stats.activeLoans,
      color: 'bg-slate-50',
      textColor: 'text-slate-700',
    },
    {
      title: 'Total Balance',
      value: `₹${stats.totalBalance.toFixed(2)}`,
      color: 'bg-red-50',
      textColor: 'text-red-700',
    },
    {
      title: 'Total Paid',
      value: `₹${stats.totalPaid.toFixed(2)}`,
      color: 'bg-green-50',
      textColor: 'text-green-700',
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Welcome{userName ? `, ${userName}` : ''}!
        </h1>
        <p className="text-slate-600 mt-1">
          Here's an overview of your finance management
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className={`p-6 ${stat.color}`}>
            <p className="text-sm font-medium text-slate-600 mb-2">
              {stat.title}
            </p>
            <p className={`text-2xl font-bold ${stat.textColor}`}>
              {loading ? '...' : stat.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-12">
        <Card className="p-8 text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Get Started
          </h2>
          <p className="text-slate-600 mb-6">
            Start managing your clients and loans efficiently. Visit the Clients
            or Loans section to begin.
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="/dashboard/clients"
              className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors"
            >
              Manage Clients
            </a>
            <a
              href="/dashboard/loans"
              className="px-4 py-2 border border-slate-300 text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
            >
              View Loans
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
