'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Client {
  _id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/clients');
      if (response.ok) {
        const data = await response.json();
        setClients(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const response = await fetch(`/api/clients/${deleteId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setClients(clients.filter((c) => c._id !== deleteId));
        setDeleteId(null);
      }
    } catch (error) {
      console.error('Failed to delete client:', error);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-600 mt-1">
            Manage your clients and their information
          </p>
        </div>
        <Link href="/dashboard/clients/new">
          <Button className="bg-slate-900 hover:bg-slate-800 text-white">
            Add Client
          </Button>
        </Link>
      </div>

      {loading ? (
        <Card className="p-8 text-center">
          <p className="text-slate-600">Loading clients...</p>
        </Card>
      ) : clients.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-slate-600 mb-4">No clients yet.</p>
          <Link href="/dashboard/clients/new">
            <Button className="bg-slate-900 hover:bg-slate-800 text-white">
              Create Your First Client
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {clients.map((client) => (
            <Card
              key={client._id}
              className="p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <Link href={`/dashboard/clients/${client._id}`}>
                    <h3 className="font-semibold text-slate-900 hover:text-slate-700 cursor-pointer">
                      {client.name}
                    </h3>
                  </Link>
                  <p className="text-sm text-slate-600">{client.email}</p>
                  <div className="flex gap-4 mt-2 text-sm text-slate-600">
                    <span>{client.phone}</span>
                    <span className={client.status === 'active' ? "text-green-600 font-medium" : "text-slate-600 font-medium"}>
                      {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/dashboard/clients/${client._id}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-200"
                    >
                      View
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteId(client._id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Client</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this client? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
