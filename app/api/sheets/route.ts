import { connectDB } from '@/lib/db';
import Sheetbook from '@/models/Sheetbook';
import { getCurrentUser } from '@/lib/jwt';
import { NextRequest, NextResponse } from 'next/server';

/** Guard against a runaway paste filling the document past Mongo's 16 MB cap. */
const MAX_BYTES = 6 * 1024 * 1024;

function isWorkbook(doc: unknown): doc is { sheets: unknown[]; activeId: string } {
  if (!doc || typeof doc !== 'object') return false;
  const d = doc as { sheets?: unknown; activeId?: unknown };
  return Array.isArray(d.sheets) && d.sheets.length > 0 && typeof d.activeId === 'string';
}

export async function GET() {
  try {
    await connectDB();

    const userId = await getCurrentUser();
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const book = await Sheetbook.findOne({ userId }).lean();
    return NextResponse.json(
      {
        success: true,
        data: book ? { doc: book.doc, revision: book.revision, updatedAt: book.updatedAt } : null,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('Fetch sheets error:', error);
    return NextResponse.json({ error: 'Failed to fetch sheets' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectDB();

    const userId = await getCurrentUser();
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const doc = body?.doc;

    if (!isWorkbook(doc)) {
      return NextResponse.json({ error: 'Invalid workbook' }, { status: 400 });
    }
    if (JSON.stringify(doc).length > MAX_BYTES) {
      return NextResponse.json({ error: 'Workbook is too large to save' }, { status: 413 });
    }

    // Keep the previous version alongside the new one, so a bad overwrite is recoverable.
    const existing = await Sheetbook.findOne({ userId }).lean();
    const saved = await Sheetbook.findOneAndUpdate(
      { userId },
      {
        userId,
        doc,
        backup: existing?.doc,
        revision: (existing?.revision ?? 0) + 1,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json(
      { success: true, revision: saved.revision, updatedAt: saved.updatedAt },
      { status: 200 },
    );
  } catch (error) {
    console.error('Save sheets error:', error);
    return NextResponse.json({ error: 'Failed to save sheets' }, { status: 500 });
  }
}
