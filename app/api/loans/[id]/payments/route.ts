import { connectDB } from '@/lib/db';
import Payment from '@/models/Payment';
import Loan from '@/models/Loan'; // must be imported to register schema for Payment.populate('loanId')
import { getCurrentUser } from '@/lib/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const userId = await getCurrentUser();
    if (!userId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const payments = await Payment.find({
      userId,
      loanId: id,
    }).sort({ date: -1 });

    return NextResponse.json({ success: true, data: payments }, { status: 200 });
  } catch (error) {
    console.error('Fetch loan payments error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}
