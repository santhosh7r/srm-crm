'use client';

import { useRouter } from 'next/navigation';
import ClientForm from '@/components/ClientForm';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export default function NewClientPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: any) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create client');
      }

      router.push('/dashboard/clients');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-8 flex items-center gap-4">
        <Link href="/dashboard/clients">
          <Button variant="outline" className="border-slate-200">
            ← Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">New Client</h1>
          <p className="text-slate-600 mt-1">Add a new client to your system</p>
        </div>
      </div>

      <ClientForm onSubmit={handleSubmit} isLoading={isLoading} />
    </div>
  );
}
