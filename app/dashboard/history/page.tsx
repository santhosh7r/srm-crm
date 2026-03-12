'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface HistoryRow {
    _id: string;
    clientName: string;
    clientPhone: string;
    planName: string;
    planType: 'weekly' | 'monthly';
    duration: number | null;
    disposeAmount: number;
    initialInterest: number;
    totalAmount: number;
    balance: number;
    totalPaid: number;
    collectedInterest: number;
    collectedGiven: number;
    status: 'active' | 'completed' | 'overdue';
    startDate: string;
    endDate: string | null;
}

interface Plan {
    _id: string;
    name: string;
    planType: 'weekly' | 'monthly';
}

const fmt = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

const statusStyle: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    completed: 'bg-slate-100 text-slate-600',
    overdue: 'bg-red-100 text-red-700',
};

export default function HistoryPage() {
    const [rows, setRows] = useState<HistoryRow[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [planId, setPlanId] = useState('');
    const [status, setStatus] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        if (planId) params.set('planId', planId);
        if (status) params.set('status', status);

        try {
            const [histRes, planRes] = await Promise.all([
                fetch(`/api/history?${params}`),
                fetch('/api/plans'),
            ]);
            if (histRes.ok) setRows((await histRes.json()).data || []);
            if (planRes.ok) setPlans((await planRes.json()).data || []);
        } finally {
            setLoading(false);
        }
    }, [from, to, planId, status]);

    useEffect(() => { fetchData(); }, []);

    const applyFilters = (e: React.FormEvent) => { e.preventDefault(); fetchData(); };

    const clearFilters = () => {
        setFrom(''); setTo(''); setPlanId(''); setStatus('');
        setTimeout(fetchData, 0);
    };

    // ── Excel Export ──
    const downloadExcel = () => {
        const wsData = [
            ['Client Name', 'Phone', 'Plan', 'Duration', 'Dispose Amount', 'Initial Interest',
                'Total Amount', 'Collected Interest', 'Total Given', 'Balance', 'Status', 'Start Date', 'End Date'],
            ...rows.map(r => [
                r.clientName, r.clientPhone, `${r.planName} (${r.planType === 'weekly' ? 'Weekly' : 'Monthly'})`,
                r.duration ? `${r.duration} weeks` : 'N/A',
                r.disposeAmount, r.initialInterest, r.totalAmount,
                r.collectedInterest, r.collectedGiven, r.balance,
                r.status.toUpperCase(), fmtDate(r.startDate), fmtDate(r.endDate),
            ]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = wsData[0].map(() => ({ wch: 18 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'History');
        XLSX.writeFile(wb, `SRM_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // Summary totals
    const totals = rows.reduce((acc, r) => ({
        dispose: acc.dispose + r.disposeAmount,
        interest: acc.interest + r.initialInterest,
        total: acc.total + r.totalAmount,
        collectedInterest: acc.collectedInterest + r.collectedInterest,
        given: acc.given + r.collectedGiven,
        balance: acc.balance + r.balance,
    }), { dispose: 0, interest: 0, total: 0, collectedInterest: 0, given: 0, balance: 0 });

    // ── PDF Export ──
    const downloadPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        const fmtPDF = (n: number) => (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Metadata extraction
        const selectedPlan = plans.find(p => p._id === planId)?.name || 'All Plans';

        let statusDisplay = 'ALL LOANS';
        if (status === 'active') statusDisplay = 'ACTIVE';
        else if (status === 'completed') statusDisplay = 'COMPLETED';
        else if (status === 'overdue') statusDisplay = 'OVERDUE';

        let periodDisplay = 'All Time';
        if (from && to) periodDisplay = `${new Date(from).toLocaleDateString('en-IN')} - ${new Date(to).toLocaleDateString('en-IN')}`;
        else if (from) periodDisplay = `From ${new Date(from).toLocaleDateString('en-IN')}`;
        else if (to) periodDisplay = `Up to ${new Date(to).toLocaleDateString('en-IN')}`;

        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const totalPagesExp = '{total_pages_count_string}';

        autoTable(doc, {
            startY: 57,
            head: [[
                'Client', 'Plan', 'Dispose Amount', 'Interest Amount',
                'Total Amount', 'Collected Interest', 'Collected Given', 'Balance', 'Status', 'Start Date', 'End Date'
            ]],
            body: rows.map(r => [
                r.clientName,
                `${r.planName}\n(${r.planType === 'weekly' ? 'Weekly' : 'Monthly'})`,
                fmtPDF(r.disposeAmount),
                fmtPDF(r.initialInterest),
                fmtPDF(r.totalAmount),
                fmtPDF(r.collectedInterest),
                fmtPDF(r.collectedGiven),
                fmtPDF(r.balance),
                r.status.toUpperCase(),
                fmtDate(r.startDate),
                fmtDate(r.endDate),
            ]),
            foot: [[
                'TOTALS', '',
                fmtPDF(totals.dispose),
                fmtPDF(totals.interest),
                fmtPDF(totals.total),
                fmtPDF(totals.collectedInterest),
                fmtPDF(totals.given),
                fmtPDF(totals.balance),
                '', '', ''
            ]],
            styles: { fontSize: 7, cellPadding: 3, textColor: [15, 23, 42] },
            headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
            footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                2: { halign: 'right' },
                3: { halign: 'right' },
                4: { halign: 'right' },
                5: { halign: 'right' },
                6: { halign: 'right' },
                7: { halign: 'right' },
            },
            showFoot: 'lastPage',
            margin: { top: 57, bottom: 22 },
            didDrawPage: function (data) {
                // Header (Repeated on every page)
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 23, 42);
                doc.text('SRM ASSOCIATES', 14, 16);

                doc.setFontSize(12);
                doc.setFont('helvetica', 'normal');
                doc.text('Loan History Report', 14, 23);

                doc.setFontSize(9);
                doc.setTextColor(71, 85, 105);
                doc.text(`Generated Date: ${new Date().toLocaleDateString('en-IN')}`, 14, 31);
                doc.text(`Report Period: ${periodDisplay}`, 14, 36);
                doc.text(`Plan Name: ${selectedPlan}`, 14, 41);

                doc.setFont('helvetica', 'bold');
                doc.text(`Status: ${statusDisplay}`, 14, 46);

                // Top Divider
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.5);
                doc.line(14, 54, pageWidth - 14, 54);

                // Bottom Divider
                doc.line(14, pageHeight - 18, pageWidth - 14, pageHeight - 18);

                // Footer (Repeated on every page)
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text('Generated by SRM Associates Finance Management System', 14, pageHeight - 13);
                doc.text('This report is generated for internal company use.', 14, pageHeight - 8);

                const pageStr = `Page ${(doc as any).internal.getNumberOfPages()} of ${totalPagesExp}`;
                doc.text(pageStr, pageWidth - 14 - doc.getTextWidth(pageStr), pageHeight - 10);
            }
        });

        if (typeof doc.putTotalPages === 'function') {
            doc.putTotalPages(totalPagesExp);
        }

        doc.save(`SRM_History_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    return (
        <div>
            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Payment History</h1>
                    <p className="text-slate-500 text-sm mt-0.5">All loan records with payment summaries</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={downloadExcel}
                        disabled={rows.length === 0}
                        variant="outline"
                        className="border-green-300 text-green-700 hover:bg-green-50 gap-2"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Excel
                    </Button>
                    <Button
                        onClick={downloadPDF}
                        disabled={rows.length === 0}
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50 gap-2"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        PDF
                    </Button>
                </div>
            </div>

            {/* ── Filters ── */}
            <Card className="p-4 mb-5">
                <form onSubmit={applyFilters}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">From Date</label>
                            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">To Date</label>
                            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Plan</label>
                            <select
                                value={planId}
                                onChange={e => setPlanId(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                            >
                                <option value="">All Plans</option>
                                {plans.map(p => (
                                    <option key={p._id} value={p._id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                            <select
                                value={status}
                                onChange={e => setStatus(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                            >
                                <option value="">All Status</option>
                                <option value="active">Active</option>
                                <option value="completed">Completed</option>
                                <option value="overdue">Overdue</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white px-5">
                            Apply Filters
                        </Button>
                        <Button type="button" variant="outline" onClick={clearFilters} className="border-slate-200">
                            Clear
                        </Button>
                        <span className="ml-auto text-xs text-slate-400 self-center">
                            {rows.length} record{rows.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </form>
            </Card>

            {/* ── Summary totals bar ── */}
            {rows.length > 0 && (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
                    {[
                        { label: 'Total Disposed', value: fmt(totals.dispose), color: 'text-slate-900' },
                        { label: 'Init. Interest', value: fmt(totals.interest), color: 'text-slate-700' },
                        { label: 'Total Loans', value: fmt(totals.total), color: 'text-slate-900' },
                        { label: 'Coll. Interest', value: fmt(totals.collectedInterest), color: 'text-blue-700' },
                        { label: 'Total Given', value: fmt(totals.given), color: 'text-green-700' },
                        { label: 'Total Balance', value: fmt(totals.balance), color: 'text-red-600' },
                    ].map(s => (
                        <Card key={s.label} className="p-3 text-center">
                            <p className="text-xs text-slate-400 mb-1">{s.label}</p>
                            <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                        </Card>
                    ))}
                </div>
            )}

            {/* ── Table ── */}
            {loading ? (
                <Card className="p-10 text-center">
                    <div className="h-6 w-6 bg-slate-200 rounded-full animate-pulse mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">Loading history...</p>
                </Card>
            ) : rows.length === 0 ? (
                <Card className="p-10 text-center">
                    <p className="text-slate-500">No records found. Try adjusting your filters.</p>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-900 text-white">
                                    {['Client', 'Plan', 'Disposed', 'Init. Interest', 'Total',
                                        'Coll. Interest', 'Given', 'Balance', 'Status', 'Start', 'End'].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">
                                                {h}
                                            </th>
                                        ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map((r, i) => (
                                    <tr key={r._id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{r.clientName}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <p className="text-slate-900 font-medium mb-1">{r.planName}</p>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${r.planType === 'weekly' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                                                {r.planType === 'weekly' ? `Weekly${r.duration ? ` (${r.duration}w)` : ''}` : 'Monthly'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-900 font-medium">{fmt(r.disposeAmount)}</td>
                                        <td className="px-4 py-3 text-slate-900">{fmt(r.initialInterest)}</td>
                                        <td className="px-4 py-3 font-semibold text-slate-900">{fmt(r.totalAmount)}</td>
                                        <td className="px-4 py-3 text-blue-700 font-medium">{fmt(r.collectedInterest)}</td>
                                        <td className="px-4 py-3 text-green-700 font-medium">{fmt(r.collectedGiven)}</td>
                                        <td className="px-4 py-3 text-red-600 font-medium">{fmt(r.balance)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle[r.status]}`}>
                                                {r.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{fmtDate(r.startDate)}</td>
                                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{fmtDate(r.endDate)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {rows.map(r => (
                            <div key={r._id} className="p-4 space-y-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-semibold text-slate-900">{r.clientName}</p>
                                        <p className="text-xs text-slate-500">{r.planName} · {r.planType === 'weekly' ? `Weekly${r.duration ? ` (${r.duration}w)` : ''}` : 'Monthly'}</p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle[r.status]}`}>
                                        {r.status.toUpperCase()}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                        <p className="text-slate-400">Disposed</p>
                                        <p className="font-semibold text-slate-900">{fmt(r.disposeAmount)}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400">Init. Interest</p>
                                        <p className="font-semibold text-slate-900">{fmt(r.initialInterest)}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400">Total</p>
                                        <p className="font-semibold text-slate-900">{fmt(r.totalAmount)}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400">Coll. Interest</p>
                                        <p className="font-semibold text-blue-700">{fmt(r.collectedInterest)}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400">Given</p>
                                        <p className="font-semibold text-green-700">{fmt(r.collectedGiven)}</p>
                                    </div>
                                    <div>
                                        <p className="text-slate-400">Balance</p>
                                        <p className="font-semibold text-red-600">{fmt(r.balance)}</p>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</p>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
}
