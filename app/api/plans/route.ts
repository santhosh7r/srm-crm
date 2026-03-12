import { connectDB } from '@/lib/db';
import Plan from '@/models/Plan';
import { getCurrentUser } from '@/lib/jwt';
import { PlanSchema } from '@/lib/validations';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const userId = await getCurrentUser();
    if (!userId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const plans = await Plan.find({ userId });
    return NextResponse.json({ success: true, data: plans }, { status: 200 });
  } catch (error) {
    console.error('Fetch plans error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plans' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const userId = await getCurrentUser();
    if (!userId) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validatedData = PlanSchema.parse(body);

    const plan = new Plan({
      userId,
      ...validatedData,
    });

    await plan.save();
    return NextResponse.json({ success: true, data: plan }, { status: 201 });
  } catch (error) {
    console.error('Create plan error:', error);
    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create plan' },
      { status: 500 }
    );
  }
}
