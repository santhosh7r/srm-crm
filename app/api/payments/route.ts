import { connectDB } from '@/lib/db';
import Payment from '@/models/Payment';
import Loan from '@/models/Loan';
import Plan from '@/models/Plan'; // register schema for any nested populate chains
import Client from '@/models/Client'; // register schema for any nested populate chains
import { getCurrentUser } from '@/lib/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const userId = await getCurrentUser();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const payments = await Payment.find({ userId }).populate('loanId').sort({ date: -1 });
    return NextResponse.json({ success: true, data: payments }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const userId = await getCurrentUser();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const { loanId, amount, type = 'given', date, notes } = body;

    if (!loanId || !amount) {
      return NextResponse.json({ error: 'loanId and amount are required' }, { status: 400 });
    }

    const loan = await Loan.findById(loanId);
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });

    // Create payment
    const payment = new Payment({
      userId,
      loanId,
      amount,
      type,           // 'given' or 'interest'
      date: date ? new Date(date) : new Date(),
      notes: notes || '',
    });

    // Only deduct from balance for 'given' payments (actual repayments)
    // 'interest' payments are tracked separately — don't reduce principal balance
    if (type === 'given') {
      loan.balance = Math.max(0, loan.balance - amount);
      loan.totalPaid += amount;

      if (loan.balance <= 0) {
        loan.status = 'completed';
        loan.balance = 0;
      } else if (loan.endDate && new Date() > loan.endDate && loan.status === 'active') {
        loan.status = 'overdue';
      }

      await loan.save();
    }

    await payment.save();
    return NextResponse.json({ success: true, data: payment }, { status: 201 });
  } catch (error: any) {
    console.error('Create payment error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create payment' },
      { status: 500 }
    );
  }
}
