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
    createdAt: string;
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
    completed: 'bg-muted text-secondary-foreground',
    overdue: 'bg-red-100 text-red-700',
};

export default function HistoryPage() {
    const [rows, setRows] = useState<HistoryRow[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters & Pagination
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [planId, setPlanId] = useState('');
    const [status, setStatus] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [statusPrimary, setStatusPrimary] = useState(true);
    const itemsPerPage = 20;

    const fetchData = useCallback(async () => {
        setLoading(true);
        setCurrentPage(1); // Reset to first page on filter change
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

    // ── Filtering & Sorting Logic (Local) ──
    const sortedFilteredRows = rows
        .filter(r => {
            const matchesSearch = !searchTerm ||
                r.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                r.clientPhone.includes(searchTerm);
            return matchesSearch;
        })
        .sort((a, b) => {
            const timeA = new Date(a.startDate).getTime();
            const timeB = new Date(b.startDate).getTime();
            const createdA = new Date(a.createdAt).getTime();
            const createdB = new Date(b.createdAt).getTime();

            // 1. Status Priority (if enabled)
            if (statusPrimary) {
                const priority: Record<string, number> = { active: 1, overdue: 2, completed: 3 };
                const pA = priority[a.status] || 99;
                const pB = priority[b.status] || 99;
                if (pA !== pB) return pA - pB;
            }

            // 2. Default: Newest First
            if (timeA !== timeB) return timeB - timeA;
            return createdB - createdA;
        });

    const filteredRows = sortedFilteredRows; // For backward compatibility with existing code refs

    const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
    const paginatedRows = filteredRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // ── Excel Export ──
    const downloadExcel = () => {
        const wsData = [
            ['Client Name', 'Phone', 'Plan', 'Duration', 'Dispose Amount', 'Init. Interest',
                'Total Amount', 'Collected Interest', 'Total Given', 'Balance', 'Status', 'Start Date', 'End Date'],
            ...filteredRows.map(r => [
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
        XLSX.writeFile(wb, `RIYA_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // Summary totals based on FILTERED data
    const totals = filteredRows.reduce((acc, r) => ({
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
                'Client', 'Plan', 'Dispose Amount', 'Init. Interest',
                'Total Amount', 'Collected Interest', 'Collected Given', 'Balance', 'Status', 'Start Date', 'End Date'
            ]],
            body: filteredRows.map(r => [
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
                doc.text('RIYA FINANCE LTD', 14, 16);

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
                doc.text('Generated by RIYA FINANCE LTD Finance Management System', 14, pageHeight - 13);
                doc.text('This report is generated for internal company use.', 14, pageHeight - 8);

                const pageStr = `Page ${(doc as any).internal.getNumberOfPages()} of ${totalPagesExp}`;
                doc.text(pageStr, pageWidth - 14 - doc.getTextWidth(pageStr), pageHeight - 10);
            }
        });

        if (typeof doc.putTotalPages === 'function') {
            doc.putTotalPages(totalPagesExp);
        }

        doc.save(`RIYA_History_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    return (
        <div>
            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Payment History</h1>
                    <p className="text-muted-foreground text-sm mt-0.5">All loan records with payment summaries</p>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                        <div className="sm:col-span-2 lg:col-span-2">
                            <label className="block text-xs font-medium text-secondary-foreground mb-1">Search Client</label>
                            <div className="relative">
                                <Input
                                    placeholder="Search by name or phone..."
                                    value={searchTerm}
                                    onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                    className="pl-9"
                                />
                                <svg className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-secondary-foreground mb-1">From Date</label>
                            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-secondary-foreground mb-1">To Date</label>
                            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-secondary-foreground mb-1">Plan</label>
                            <select
                                value={planId}
                                onChange={e => setPlanId(e.target.value)}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-slate-900"
                            >
                                <option value="">All Plans</option>
                                {plans.map(p => (
                                    <option key={p._id} value={p._id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-secondary-foreground mb-1">Status</label>
                            <select
                                value={status}
                                onChange={e => setStatus(e.target.value)}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-slate-900"
                            >
                                <option value="">All Status</option>
                                <option value="active">Active</option>
                                <option value="completed">Completed</option>
                                <option value="overdue">Overdue</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border/50">
                        <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground px-5">
                            Apply Filters
                        </Button>
                        <Button type="button" variant="outline" onClick={clearFilters} className="border-border">
                            Clear
                        </Button>

                        <div className="flex items-center gap-3 ml-auto">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Sorting</span>
                            <Button
                                type="button"
                                onClick={() => setStatusPrimary(!statusPrimary)}
                                className={`h-9 px-4 rounded-xl text-xs font-bold transition-all gap-2 ${statusPrimary
                                        ? 'bg-primary text-primary-foreground shadow-md'
                                        : 'bg-card border border-border text-muted-foreground hover:bg-background'
                                    }`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                Sort by Status: {statusPrimary ? 'ON' : 'OFF'}
                            </Button>
                        </div>

                        <span className="hidden md:inline-block text-xs text-slate-300 mx-2">|</span>

                        <span className="text-xs text-muted-foreground self-center px-1">
                            {filteredRows.length} record{filteredRows.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </form>
            </Card>

            {/* ── Summary totals bar ── */}
            {rows.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
                    {[
                        { label: 'Total Disposed', value: fmt(totals.dispose), color: 'text-foreground' },
                        { label: 'Init. Interest', value: fmt(totals.interest), color: 'text-foreground' },
                        { label: 'Total Loans', value: fmt(totals.total), color: 'text-foreground' },
                        { label: 'Coll. Interest', value: fmt(totals.collectedInterest), color: 'text-blue-700' },
                        { label: 'Total Given', value: fmt(totals.given), color: 'text-green-700' },
                        { label: 'Total Balance', value: fmt(totals.balance), color: 'text-red-600' },
                    ].map(s => (
                        <Card key={s.label} className="p-3 text-center flex flex-col justify-center items-center overflow-hidden">
                            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1 truncate w-full">{s.label}</p>
                            <p className={`text-xs sm:text-sm font-bold ${s.color} truncate w-full`}>{s.value}</p>
                        </Card>
                    ))}
                </div>
            )}

            {/* ── Table ── */}
            {loading ? (
                <Card className="p-10 text-center">
                    <div className="h-6 w-6 bg-muted rounded-full animate-pulse mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">Loading history...</p>
                </Card>
            ) : rows.length === 0 ? (
                <Card className="p-10 text-center">
                    <p className="text-muted-foreground">No records found. Try adjusting your filters.</p>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-primary text-primary-foreground">
                                    {['Client', 'Plan', 'Disposed', 'Init. Interest', 'Total',
                                        'Coll. Interest', 'Given', 'Balance', 'Status', 'Start', 'End'].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">
                                                {h}
                                            </th>
                                        ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedRows.map((r, i) => (
                                    <tr key={r._id} className={`transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-muted/40'} hover:bg-muted/60`}>
                                        <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{r.clientName}</td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <p className="text-foreground font-medium mb-1">{r.planName}</p>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${r.planType === 'weekly' ? 'bg-muted text-blue-700' : 'bg-muted text-secondary-foreground'}`}>
                                                {r.planType === 'weekly' ? `Weekly${r.duration ? ` (${r.duration}w)` : ''}` : 'Monthly'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-foreground font-medium">{fmt(r.disposeAmount)}</td>
                                        <td className="px-4 py-3 text-foreground">{fmt(r.initialInterest)}</td>
                                        <td className="px-4 py-3 font-semibold text-foreground">{fmt(r.totalAmount)}</td>
                                        <td className="px-4 py-3 text-blue-700 font-medium">{fmt(r.collectedInterest)}</td>
                                        <td className="px-4 py-3 text-green-700 font-medium">{fmt(r.collectedGiven)}</td>
                                        <td className="px-4 py-3 text-red-600 font-medium">{fmt(r.balance)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle[r.status]}`}>
                                                {r.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{fmtDate(r.startDate)}</td>
                                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{fmtDate(r.endDate)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden divide-y divide-slate-100">
                        {paginatedRows.map(r => (
                            <div key={r._id} className="p-4 space-y-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-semibold text-foreground">{r.clientName}</p>
                                        <p className="text-xs text-muted-foreground">{r.planName} · {r.planType === 'weekly' ? `Weekly${r.duration ? ` (${r.duration}w)` : ''}` : 'Monthly'}</p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle[r.status]}`}>
                                        {r.status.toUpperCase()}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                        <p className="text-muted-foreground">Disposed</p>
                                        <p className="font-semibold text-foreground">{fmt(r.disposeAmount)}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Init. Interest</p>
                                        <p className="font-semibold text-foreground">{fmt(r.initialInterest)}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Total</p>
                                        <p className="font-semibold text-foreground">{fmt(r.totalAmount)}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Coll. Interest</p>
                                        <p className="font-semibold text-blue-700">{fmt(r.collectedInterest)}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Given</p>
                                        <p className="font-semibold text-green-700">{fmt(r.collectedGiven)}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Balance</p>
                                        <p className="font-semibold text-red-600">{fmt(r.balance)}</p>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground">{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</p>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Pagination Controls */}
            {!loading && filteredRows.length > itemsPerPage && (
                <div className="flex items-center justify-between mt-6 px-1">
                    <p className="text-sm text-muted-foreground">
                        Showing <span className="font-semibold text-foreground">{((currentPage - 1) * itemsPerPage) + 1}</span> to <span className="font-semibold text-foreground">{Math.min(currentPage * itemsPerPage, filteredRows.length)}</span> of <span className="font-semibold text-foreground">{filteredRows.length}</span> results
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            className="bg-card"
                        >
                            Previous
                        </Button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                // Simple sliding window for pagination if many pages
                                let pageNum = i + 1;
                                if (totalPages > 5 && currentPage > 3) {
                                    pageNum = currentPage - 3 + i + 1;
                                    if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                                }

                                return (
                                    <Button
                                        key={pageNum}
                                        variant={currentPage === pageNum ? 'default' : 'outline'}
                                        size="sm"
                                        className={`h-8 w-8 p-0 ${currentPage === pageNum ? 'bg-primary text-primary-foreground' : 'bg-card text-secondary-foreground'}`}
                                        onClick={() => setCurrentPage(pageNum)}
                                    >
                                        {pageNum}
                                    </Button>
                                );
                            })}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            className="bg-card"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
