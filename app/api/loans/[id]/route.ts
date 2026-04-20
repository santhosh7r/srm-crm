import { connectDB } from '@/lib/db';
import Loan from '@/models/Loan';
import Plan from '@/models/Plan'; // must be imported to register schema for Loan.populate('planId')
import Client from '@/models/Client'; // must be imported to register schema for Loan.populate('clientId')
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
    const loan = await Loan.findOne({ _id: id, userId })
      .populate('clientId')
      .populate('planId');

    if (!loan) {
      return NextResponse.json(
        { error: 'Loan not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: loan }, { status: 200 });
  } catch (error) {
    console.error('Fetch loan error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch loan' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    const loan = await Loan.findOneAndDelete({ _id: id, userId });

    if (!loan) {
      return NextResponse.json(
        { error: 'Loan not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Loan deleted' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete loan error:', error);
    return NextResponse.json(
      { error: 'Failed to delete loan' },
      { status: 500 }
    );
  }
}
