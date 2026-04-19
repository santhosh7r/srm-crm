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
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clients</h1>
          <p className="text-secondary-foreground mt-1">
            Manage your clients and their information
          </p>
        </div>
        <Link href="/dashboard/clients/new">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
            Add Client
          </Button>
        </Link>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search clients by name, phone, or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full md:w-1/3 px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>

      {loading ? (
        <Card className="p-8 text-center">
          <p className="text-secondary-foreground">Loading clients...</p>
        </Card>
      ) : clients.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-secondary-foreground mb-4">No clients yet.</p>
          <Link href="/dashboard/clients/new">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Create Your First Client
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredClients.map((client) => (
            <Card
              key={client._id}
              className="p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <Link href={`/dashboard/clients/${client._id}`}>
                    <h3 className="font-semibold text-foreground hover:text-foreground cursor-pointer">
                      {client.name}
                    </h3>
                  </Link>
                  <p className="text-sm text-secondary-foreground">{client.email}</p>
                  <div className="flex gap-4 mt-2 text-sm text-secondary-foreground">
                    <span>{client.phone}</span>
                    <span className={client.status === 'active' ? "text-green-600 font-medium" : "text-secondary-foreground font-medium"}>
                      {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/dashboard/clients/${client._id}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-border"
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
