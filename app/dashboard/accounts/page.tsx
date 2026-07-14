'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { IndianRupee, TrendingUp, Wallet } from 'lucide-react';

interface AccountData {
  totalDisposed: number;
  totalGiven: number;
}

export default function AccountsPage() {
  const [investment, setInvestment] = useState('0');
  const [data, setData] = useState<AccountData>({
    totalDisposed: 0,
    totalGiven: 0,
  });
  const [loading, setLoading] = useState(true);

  // Load investment from localStorage
  useEffect(() => {
    const stored = window.localStorage.getItem('accounts.investment');
    if (stored !== null) setInvestment(stored);
  }, []);

  // Fetch real data from History API (same as History page)
  useEffect(() => {
    let intervalId: number | undefined;

    const fetchData = async () => {
      try {
        const historyRes = await fetch('/api/history');
        const historyData = historyRes.ok ? await historyRes.json() : { data: [] };
        const records = historyData.data || [];

        // Calculate totals from history records
        const totalDisposed = records.reduce((sum: number, r: any) => sum + (r.disposeAmount || 0), 0);
        const totalGiven = records.reduce((sum: number, r: any) => sum + (r.collectedGiven || 0), 0);

        setData({
          totalDisposed,
          totalGiven,
        });
      } catch (error) {
        console.error('Failed to load account data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    intervalId = window.setInterval(fetchData, 10000);

    return () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  const investmentAmount = parseFloat(investment) || 0;
  const availableBalance = investmentAmount - data.totalDisposed + data.totalGiven;

  const fmt = (n: number) =>
    `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtAbs = (n: number) =>
    `₹${Math.abs(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleInvestmentChange = (value: string) => {
    if (/^\d*(\.\d{0,2})?$/.test(value) || value === '') {
      setInvestment(value);
      window.localStorage.setItem('accounts.investment', value);
    }
  };

  return (
    <div className="pb-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Accounts</h1>
        <p className="text-secondary-foreground mt-1">Account summary and real-time balance tracking</p>
      </div>

      {loading ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Loading account data...</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Investment Input - Main Focus */}
          <Card className="p-6 border-2 border-primary/30 bg-linear-to-br from-primary/5 to-transparent">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">Investment Amount</p>
                  <p className="text-xs text-muted-foreground">Only editable field - Enter amount to see real-time balance</p>
                </div>
              </div>
              <Input
                type="number"
                value={investment}
                onChange={(e) => handleInvestmentChange(e.target.value)}
                placeholder="Enter investment amount"
                className="text-lg font-bold h-12"
                step="100"
                min="0"
              />
              <p className="text-3xl font-bold text-primary">{fmt(investmentAmount)}</p>
            </div>
          </Card>

          {/* Account Summary Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="p-4 hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground font-semibold mb-2 uppercase">Total Disposed</p>
              <p className="text-2xl font-bold text-foreground">{fmt(data.totalDisposed)}</p>
              <p className="text-xs text-muted-foreground mt-2">Amount loaned out to clients</p>
            </Card>

            <Card className="p-4 hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground font-semibold mb-2 uppercase">Collection Amount</p>
              <p className="text-2xl font-bold text-gold-strong">{fmt(data.totalGiven)}</p>
              <p className="text-xs text-muted-foreground mt-2">Principal collected back</p>
            </Card>

          </div>

          {/* Key Metrics - Available Balance & Account Balance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Available Balance */}
            <Card className="p-6 bg-linear-to-br from-gold/12 to-gold/5 dark:from-gold/12 dark:to-gold/5 border-gold/30 dark:border-gold/25">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-gold-strong dark:text-gold-strong mb-1">TOTAL AVAILABLE BALANCE</p>
                  <p className="text-xs text-gold-strong dark:text-gold-strong">Investment − Disposed + Collected</p>
                </div>
                <TrendingUp className="w-5 h-5 text-gold-strong" />
              </div>
              <p className="text-4xl font-bold text-gold-strong dark:text-gold-strong mb-4">{fmtAbs(availableBalance)}</p>
              <div className="bg-card dark:bg-black/30 rounded-lg p-3 text-xs space-y-2 border border-gold/25">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Investment:</span>
                  <span className="font-semibold text-foreground">{fmt(investmentAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Disposed:</span>
                  <span className="font-semibold text-destructive">{fmt(data.totalDisposed)}</span>
                </div>
                <div className="border-t border-border/50 pt-2 flex justify-between">
                  <span className="text-muted-foreground">Collected:</span>
                  <span className="font-semibold text-gold-strong">{fmt(data.totalGiven)}</span>
                </div>
              </div>
            </Card>

            {/* Account Balance (Invested) */}
            <Card className="p-6 bg-linear-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 border-primary/30">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-primary mb-1">ACCOUNT BALANCE</p>
                  <p className="text-xs text-muted-foreground">Investment − Disposed + Collected</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <IndianRupee className="w-5 h-5 text-primary" />
                </div>
              </div>
              <p className={`text-4xl font-bold mb-4 ${availableBalance >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {fmtAbs(availableBalance)}
              </p>
              <div className="bg-card dark:bg-black/30 rounded-lg p-3 text-xs text-muted-foreground border border-border">
                {availableBalance >= 0
                  ? '✓ Positive balance - Operations healthy'
                  : '⚠ Negative balance - Review investments'}
              </div>
            </Card>
          </div>

          {/* Info Bar */}
          <Card className="p-4 bg-muted/50 border-dashed">
            <div className="flex items-start gap-3 text-sm">
              <div className="text-lg">💡</div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">Real-time Calculation</p>
                <p className="text-muted-foreground">Formula: Investment − Total Disposed + Total Given (Collected). All totals update from current loans and payments. Only the Investment field is editable.</p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
