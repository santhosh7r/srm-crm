'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ClientForm from '@/components/ClientForm';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ClientData {
  _id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  status: 'active' | 'inactive';
}

interface Loan {
  _id: string;
  disposeAmount: number;
  interestAmount: number;
  totalAmount: number;
  balance: number;
  totalPaid: number;
  status: 'active' | 'completed' | 'overdue';
  startDate: string;
  planId?: {
    name: string;
    totalAmount: number;
    planType: 'weekly' | 'monthly';
    duration?: number;
  };
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700 border border-green-200',
    completed: 'bg-muted text-secondary-foreground border border-border',
    overdue: 'bg-red-100 text-red-700 border border-red-200',
  };
  return `px-2 py-0.5 rounded text-xs font-semibold ${map[status] || 'bg-muted text-secondary-foreground'}`;
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [showEditForm, setShowEditForm] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientRes, loansRes] = await Promise.all([
          fetch(`/api/clients/${id}`),
          fetch(`/api/loans?clientId=${id}`),
        ]);
        if (clientRes.ok) setClient((await clientRes.json()).data);
        if (loansRes.ok) setLoans((await loansRes.json()).data || []);
      } catch (error) {
        console.error('Failed to fetch client:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleUpdate = async (data: any) => {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/clients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update client');
      const updated = await response.json();
      setClient(updated.data);
      setShowEditForm(false);
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <p className="text-secondary-foreground">Loading client...</p>
      </Card>
    );
  }

  if (!client) {
    return (
      <Card className="p-8 text-center">
        <p className="text-secondary-foreground mb-4">Client not found</p>
        <Link href="/dashboard/clients">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Back to Clients</Button>
        </Link>
      </Card>
    );
  }

  const activeLoans = loans.filter((l) => l.status === 'active' || l.status === 'overdue');
  const completedLoans = loans.filter((l) => l.status === 'completed');

  const LoanRow = ({ loan }: { loan: Loan }) => {
    const totalRepay = loan.totalAmount ?? 0;
    const progress = totalRepay > 0 ? Math.min(100, ((loan.totalPaid ?? 0) / totalRepay) * 100) : 0;

    return (
      <div className="border border-border rounded-lg p-4 hover:border-border transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <p className="font-semibold text-foreground text-sm">
                {loan.planId?.name || 'Loan'}
              </p>
              <span className={statusBadge(loan.status)}>{loan.status}</span>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground mb-2">
              <span>Disbursed: <span className="font-medium text-foreground">₹{(loan.disposeAmount ?? 0).toFixed(2)}</span></span>
              <span>Paid: <span className="font-medium text-green-700">₹{(loan.totalPaid ?? 0).toFixed(2)}</span></span>
              <span>Balance: <span className="font-medium text-red-600">₹{(loan.balance ?? 0).toFixed(2)}</span></span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 max-w-sm">
              <div
                className="bg-green-500 h-1.5 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{progress.toFixed(0)}% repaid</p>
          </div>
          <div className="ml-4">
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => router.push(`/dashboard/loans/${loan._id}?from=client&clientId=${id}`)}
            >
              View →
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/clients">
            <Button variant="outline" className="border-border">← Back</Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{client.name}</h1>
            <p className="text-secondary-foreground mt-1">Client profile & loan history</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="border-border"
            onClick={() => setShowEditForm(!showEditForm)}
          >
            {showEditForm ? 'Cancel Edit' : '✏️ Edit Details'}
          </Button>
          <Link href="/dashboard/loans/new">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">+ Assign Loan</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left col */}
        <div className="lg:col-span-2 space-y-6">

          {/* Edit form — only shown when toggled */}
          {showEditForm && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold text-foreground">Edit Client Details</h3>
              </div>
              <ClientForm initialData={client} onSubmit={handleUpdate} isLoading={isUpdating} />
            </div>
          )}

          {/* Client details card (always visible) */}
          {!showEditForm && (
            <Card className="p-6">
              <h3 className="font-semibold text-foreground mb-4">Client Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {[
                  ['Name', client.name],
                  ['Phone', client.phone],
                  ['Email', client.email],
                  ['Address', client.address],
                  ['City', client.city],
                  ['Country', client.country],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="font-medium text-foreground">{value || '—'}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Active Loans */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="font-semibold text-foreground">Active Loans</h3>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                {activeLoans.length}
              </span>
            </div>
            {activeLoans.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">No active loans</p>
                <Link href="/dashboard/loans/new">
                  <Button variant="outline" size="sm" className="border-border">
                    Assign a Loan
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {activeLoans.map((loan) => <LoanRow key={loan._id} loan={loan} />)}
              </div>
            )}
          </Card>

          {/* Completed Loans */}
          {completedLoans.length > 0 && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="font-semibold text-foreground">Completed Loans</h3>
                <span className="text-xs bg-muted text-secondary-foreground px-2 py-0.5 rounded-full font-medium">
                  {completedLoans.length}
                </span>
              </div>
              <div className="space-y-3">
                {completedLoans.map((loan) => <LoanRow key={loan._id} loan={loan} />)}
              </div>
            </Card>
          )}
        </div>

        {/* Right col: summary */}
        <div className="space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold text-foreground mb-4">Loan Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary-foreground">Total Loans</span>
                <span className="font-semibold">{loans.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-foreground">Active</span>
                <span className="font-semibold text-green-700">{activeLoans.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary-foreground">Completed</span>
                <span className="font-semibold text-muted-foreground">{completedLoans.length}</span>
              </div>
              <div className="border-t border-border/50 pt-3 mt-2 space-y-2">
                <div className="flex justify-between">
                  <span className="text-secondary-foreground">Total Paid</span>
                  <span className="font-semibold text-green-700">
                    ₹{loans.reduce((s, l) => s + (l.totalPaid ?? 0), 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-secondary-foreground">Total Balance</span>
                  <span className="font-semibold text-red-600">
                    ₹{loans.reduce((s, l) => s + (l.balance ?? 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
