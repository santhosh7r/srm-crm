import { connectDB } from '@/lib/db';
import Client from '@/models/Client';
import { getCurrentUser } from '@/lib/jwt';
import { ClientSchema } from '@/lib/validations';
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

    const clients = await Client.find({ userId });
    return NextResponse.json({ success: true, data: clients }, { status: 200 });
  } catch (error) {
    console.error('Fetch clients error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
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
    const validatedData = ClientSchema.parse(body);

    const client = new Client({
      userId,
      ...validatedData,
    });

    await client.save();
    return NextResponse.json({ success: true, data: client }, { status: 201 });
  } catch (error) {
    console.error('Create client error:', error);
    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    );
  }
}
