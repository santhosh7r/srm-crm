import { connectDB } from '@/lib/db';
import Loan from '@/models/Loan';
import Payment from '@/models/Payment';
import { getCurrentUser } from '@/lib/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    try {
        await connectDB();
        const userId = await getCurrentUser();
        if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const fromDate = searchParams.get('from');
        const toDate = searchParams.get('to');
        const planType = searchParams.get('planType');
        const planId = searchParams.get('planId');
        const status = searchParams.get('status');

        // Build loan query
        const loanQuery: any = { userId };
        if (status) loanQuery.status = status;

        if (fromDate || toDate) {
            loanQuery.startDate = {};
            if (fromDate) loanQuery.startDate.$gte = new Date(fromDate);
            if (toDate) loanQuery.startDate.$lte = new Date(toDate + 'T23:59:59');
        }

        const loans = await Loan.find(loanQuery)
            .populate('clientId', 'name phone email')
            .populate('planId', 'name planType interestType duration')
            .sort({ createdAt: -1 })
            .lean();

        // Fetch all payments for these loans
        const loanIds = loans.map((l: any) => l._id);
        const paymentQuery: any = { userId, loanId: { $in: loanIds } };

        const payments = await Payment.find(paymentQuery).lean();

        // Group payments by loanId
        const paymentMap: Record<string, { given: number; initialInterest: number; collectedInterest: number }> = {};
        for (const p of payments as any[]) {
            const lid = p.loanId.toString();
            if (!paymentMap[lid]) paymentMap[lid] = { given: 0, initialInterest: 0, collectedInterest: 0 };

            if (p.type === 'interest') {
                const isInitial = (p.notes || '').toLowerCase().includes('initial');
                if (isInitial) {
                    paymentMap[lid].initialInterest += p.amount;
                } else {
                    paymentMap[lid].collectedInterest += p.amount;
                }
            } else {
                paymentMap[lid].given += p.amount;
            }
        }

        // Filter by planType / planId after populate
        let filtered = loans as any[];
        if (planType) filtered = filtered.filter(l => l.planId?.planType === planType);
        if (planId) filtered = filtered.filter(l => l.planId?._id?.toString() === planId);

        const result = filtered.map(l => {
            const lid = l._id.toString();
            const pm = paymentMap[lid] || { given: 0, initialInterest: 0, collectedInterest: 0 };
            return {
                _id: lid,
                clientName: l.clientId?.name ?? '—',
                clientPhone: l.clientId?.phone ?? '',
                planName: l.planId?.name ?? '—',
                planType: l.planId?.planType ?? '—',
                duration: l.planId?.duration ?? null,
                disposeAmount: l.disposeAmount ?? 0,
                initialInterest: pm.initialInterest, // Now returns PAID initial interest
                expectedInterest: l.interestAmount ?? 0, // Keep this just in case, though not used yet
                totalAmount: l.totalAmount ?? 0,
                balance: l.balance ?? 0,
                totalPaid: l.totalPaid ?? 0,
                collectedInterest: pm.collectedInterest,
                collectedGiven: pm.given,
                status: l.status,
                startDate: l.startDate,
                endDate: l.endDate ?? null,
                createdAt: l.createdAt,
            };
        });

        return NextResponse.json({ success: true, data: result }, { status: 200 });
    } catch (error: any) {
        console.error('History error:', error);
        return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
    }
}
