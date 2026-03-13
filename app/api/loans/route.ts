import { connectDB } from '@/lib/db';
import Loan from '@/models/Loan';
import Plan from '@/models/Plan';
import Payment from '@/models/Payment';
import { getCurrentUser } from '@/lib/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const userId = await getCurrentUser();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId');

    const query: any = { userId };
    if (clientId) query.clientId = clientId;

    const loans = await Loan.find(query)
      .populate('clientId', 'name email phone')
      .populate('planId', 'name planType interestType duration')
      .sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: loans }, { status: 200 });
  } catch (error) {
    console.error('Fetch loans error:', error);
    return NextResponse.json({ error: 'Failed to fetch loans' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const userId = await getCurrentUser();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const { clientId, planId, disposeAmount, interestAmount, startDate } = body;

    if (!clientId || !planId || disposeAmount == null || interestAmount == null || !startDate) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const plan = await Plan.findById(planId);
    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    const dispose = parseFloat(disposeAmount);
    const interest = parseFloat(interestAmount);
    const total = dispose + interest;
    const start = new Date(startDate);

    // Compute endDate only for weekly plans
    let endDate: Date | undefined;
    if (plan.planType === 'weekly' && plan.duration) {
      endDate = new Date(start);
      endDate.setDate(endDate.getDate() + plan.duration * 7);
    }

    const loan = new Loan({
      userId,
      clientId,
      planId,
      disposeAmount: dispose,
      interestAmount: interest,
      totalAmount: total,
      startDate: start,
      endDate,
      status: 'active',
      balance: total,
      totalPaid: 0,
    });

    await loan.save();

    // Request: in monthly the initial interest need to come as first payment record
    if (plan.planType === 'monthly' && interest > 0) {
      const initialPayment = new Payment({
        userId,
        loanId: loan._id,
        amount: interest,
        type: 'interest',
        date: start,
        notes: 'Initial monthly interest (recorded at allocation)',
      });
      await initialPayment.save();
    }

    return NextResponse.json({ success: true, data: loan }, { status: 201 });
  } catch (error: any) {
    console.error('Create loan error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create loan' }, { status: 500 });
  }
}
