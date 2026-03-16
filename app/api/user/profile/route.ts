import { connectDB } from '@/lib/db';
import User from '@/models/User';
import { getCurrentUser } from '@/lib/jwt';
import { NextResponse } from 'next/server';
import bcryptjs from 'bcryptjs';

export async function PUT(req: Request) {
  try {
    await connectDB();

    const userId = await getCurrentUser();
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { name, email, currentPassword, newPassword } = await req.json();

    const user = await User.findById(userId).select('+password');
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: 'Current password is required to set a new password' }, { status: 400 });
      }

      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return NextResponse.json({ error: 'Incorrect current password' }, { status: 400 });
      }

      user.password = newPassword;
    }

    // Update other fields
    if (name) user.name = name;
    if (email) user.email = email;

    await user.save();

    return NextResponse.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update profile' }, { status: 500 });
  }
}
