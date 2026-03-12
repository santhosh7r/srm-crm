import { clearAuthCookie } from '@/lib/jwt';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    await clearAuthCookie();
    return NextResponse.json(
      { success: true, message: 'Logged out successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}
