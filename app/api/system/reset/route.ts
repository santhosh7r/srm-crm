import { connectDB } from '@/lib/db';
import User from '@/models/User';
import Client from '@/models/Client';
import Loan from '@/models/Loan';
import Payment from '@/models/Payment';
import Plan from '@/models/Plan';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    await connectDB();

    // 1. Clear all existing data from all collections
    await Promise.all([
      User.deleteMany({}),
      Client.deleteMany({}),
      Loan.deleteMany({}),
      Payment.deleteMany({}),
      Plan.deleteMany({}),
    ]);

    // 2. Create the single new admin profile
    const newAdmin = await User.create({
      name: 'Admin',
      email: 'admin@riyafinance.com',
      password: 'adminpassword123', // User can change this later in Profile
    });

    return new Response(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f8fafc; margin: 0;">
          <div style="background: white; padding: 2rem; border-radius: 1rem; shadow: 0 10px 15px -3px rgba(0,0,0,0.1); max-width: 400px; text-align: center;">
            <h1 style="color: #0f172a; margin-top: 0;">System Reset Success!</h1>
            <p style="color: #64748b;">All existing data has been cleared.</p>
            <div style="background: #f1f5f9; padding: 1rem; border-radius: 0.5rem; text-align: left; margin: 1.5rem 0;">
              <p><strong>Admin Email:</strong> admin@riyafinance.com</p>
              <p><strong>Password:</strong> adminpassword123</p>
            </div>
            <p style="color: #ef4444; font-weight: bold; font-size: 0.875rem;">IMPORTANT: Log in now and change your password in the Profile section!</p>
            <a href="/login" style="display: inline-block; background: #0f172a; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: bold; margin-top: 1rem;">Go to Login</a>
          </div>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Reset failed' }, { status: 500 });
  }
}
