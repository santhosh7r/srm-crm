import { connectDB } from '@/lib/db';
import Payment from '@/models/Payment';
import Loan from '@/models/Loan';
import { getCurrentUser } from '@/lib/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const userId = await getCurrentUser();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const payment = await Payment.findOneAndDelete({ _id: id, userId });
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

    // Undo what POST /api/payments did to the loan. Interest payments never touched
    // the balance, so only 'given' payments need reversing.
    if (payment.type === 'given') {
      const loan = await Loan.findOne({ _id: payment.loanId, userId });
      if (loan) {
        loan.balance = Math.min(loan.totalAmount, loan.balance + payment.amount);
        loan.totalPaid = Math.max(0, loan.totalPaid - payment.amount);

        // A loan this payment had closed is open again — and back on the Dues list.
        if (loan.balance > 0 && loan.status === 'completed') {
          loan.status = loan.endDate && new Date() > loan.endDate ? 'overdue' : 'active';
        }

        await loan.save();
      }
    }

    return NextResponse.json({ success: true, message: 'Payment deleted' }, { status: 200 });
  } catch (error: any) {
    console.error('Delete payment error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete payment' },
      { status: 500 }
    );
  }
}
