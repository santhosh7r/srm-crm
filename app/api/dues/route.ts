import { connectDB } from '@/lib/db';
import Loan from '@/models/Loan';
import Payment from '@/models/Payment';
import { getCurrentUser } from '@/lib/jwt';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const userId = await getCurrentUser();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const now = new Date();

    const loans = await Loan.find({ userId, status: { $ne: 'completed' } })
      .populate('clientId', 'name email phone')
      .populate('planId', 'name planType interestType duration')
      .lean();

    // Payments without populate — loanId is a raw ObjectId, safe for String() comparison
    const payments = await Payment.find({ userId }).lean();

    const weeklyPending: any[] = [];
    const monthlyPending: any[] = [];

    for (const loan of loans) {
      const plan = loan.planId as any;
      if (!plan) continue;

      const loanIdStr = String(loan._id);
      const loanPayments = payments.filter((p) => String(p.loanId) === loanIdStr);

      // Non-initial payments = payments that were NOT auto-recorded at loan creation
      // Both "given" (principal) and "interest" types count as "collected this period"
      const nonInitialPayments = loanPayments.filter(
        (p) => !(p.notes || '').toLowerCase().includes('initial')
      );

      // ─────────────────────────────────────────────────────────────
      // WEEKLY LOANS
      //
      // Rule:
      //  • Loan on Sunday Apr 20 → first shows in dues Sunday Apr 27
      //  • After 7 more days → shows again Apr 27 until payment collected
      //  • One payment = one week settled
      //  • If weeksPassed > plan.duration AND still has balance → OVERDUE (red)
      // ─────────────────────────────────────────────────────────────
      if (plan.planType === 'weekly' && plan.duration) {
        const msInWeek = 7 * 24 * 60 * 60 * 1000;
        const startDate = new Date(loan.startDate);

        // Exact number of 7-day periods since start (uncapped)
        const totalWeeksPassed = Math.floor(
          (now.getTime() - startDate.getTime()) / msInWeek
        );

        // First week hasn't come yet
        if (totalWeeksPassed < 1) continue;

        // Periods within plan duration
        const weeksWithinDuration = Math.min(totalWeeksPassed, plan.duration);

        // paidPeriods = number of non-initial payments collected so far
        const paidPeriods = nonInitialPayments.length;

        // Unpaid periods within duration
        const unpaidWithinDuration = weeksWithinDuration - paidPeriods;

        // Is this loan past its planned duration?
        const isPastDuration = totalWeeksPassed > plan.duration;

        // Principal per week
        const principalPerWeek = loan.disposeAmount / plan.duration;

        // Expected principal collected so far (based on weeks within duration)
        const expectedPrincipal = weeksWithinDuration * principalPerWeek;
        const totalPrincipalPaid = nonInitialPayments
          .filter((p) => p.type === 'given')
          .reduce((sum, p) => sum + p.amount, 0);
        const pendingPrincipal = Math.max(0, expectedPrincipal - totalPrincipalPaid);

        // One-time interest (upfront), not the initial auto-recorded one
        const interestPaid = nonInitialPayments
          .filter((p) => p.type === 'interest')
          .reduce((sum, p) => sum + p.amount, 0);
        const pendingInterest = loan.interestAmount > 0
          ? Math.max(0, loan.interestAmount - interestPaid)
          : 0;

        const totalPendingDue = pendingPrincipal + pendingInterest;

        // Show if: there are unpaid weeks OR past duration with outstanding balance
        const shouldShow = unpaidWithinDuration > 0 || (isPastDuration && (loan.balance || 0) > 0);

        if (shouldShow) {
          // Due date = the first unpaid week's date
          const firstUnpaidWeek = paidPeriods + 1;
          const dueDate = new Date(startDate.getTime() + firstUnpaidWeek * msInWeek);
          const endDate = loan.endDate ? new Date(loan.endDate) : new Date(startDate.getTime() + plan.duration * msInWeek);

          weeklyPending.push({
            ...loan,
            dueAmount: Math.round(totalPendingDue) > 0 ? totalPendingDue : loan.balance || 0,
            pendingPrincipal,
            pendingInterest,
            unpaidWeeks: Math.max(0, unpaidWithinDuration),
            paidPeriods,
            isPastDuration,
            dueDate,
            endDate,
          });
        }
      }

      // ─────────────────────────────────────────────────────────────
      // MONTHLY LOANS
      //
      // Rule:
      //  • Loan given April 20 → first shows in dues May 20
      //  • Shows until ANY payment collected for that month's cycle
      //  • One payment per cycle = that cycle is settled
      //  • Repeats every month until loan is completed (balance = 0)
      // ─────────────────────────────────────────────────────────────
      else if (plan.planType === 'monthly') {
        const start = new Date(loan.startDate);

        // Count how many month anniversaries have passed using exact date logic:
        // e.g. started Apr 20, today May 5 → May 20 not yet passed → dueMonthsSoFar = 0
        //       today May 20 → May 20 has passed → dueMonthsSoFar = 1
        let dueMonthsSoFar = 0;
        for (let n = 1; n <= 600; n++) {
          const anniversary = new Date(start);
          anniversary.setMonth(start.getMonth() + n);
          if (anniversary > now) break;
          dueMonthsSoFar = n;
        }

        // Not a single month anniversary has come due yet — skip
        if (dueMonthsSoFar === 0) continue;

        // If loan balance is 0, it's fully settled — skip (shouldn't happen since we filter completed, but safety)
        if ((loan.balance || 0) <= 0) continue;

        // paidPeriods = count of non-initial payments (interest OR given) collected
        const paidPeriods = nonInitialPayments.length;

        // How many month cycles still unpaid?
        const unpaidMonths = dueMonthsSoFar - paidPeriods;

        if (unpaidMonths <= 0) continue; // all cycles collected so far

        // The first unpaid month's due date
        const firstUnpaidDueDate = new Date(start);
        firstUnpaidDueDate.setMonth(start.getMonth() + paidPeriods + 1);

        // Amount due this cycle
        const interestPerMonth = loan.interestAmount || 0;
        // For interest loans: show monthly interest × unpaid months
        // For interest=0 loans: show outstanding balance as the "what's owed" figure
        const dueAmount = interestPerMonth > 0
          ? unpaidMonths * interestPerMonth
          : 0; // balance shown separately in UI

        monthlyPending.push({
          ...loan,
          dueAmount,
          interestPerMonth,
          unpaidMonths,
          paidPeriods,
          dueMonthsSoFar,
          outstandingBalance: loan.balance || 0,
          dueDate: firstUnpaidDueDate,
          hasInterest: interestPerMonth > 0,
        });
      }
    }

    // Sort: overdue first (weekly), then by amount
    weeklyPending.sort((a, b) => {
      if (a.isPastDuration !== b.isPastDuration) return a.isPastDuration ? -1 : 1;
      return b.dueAmount - a.dueAmount;
    });
    monthlyPending.sort((a, b) => b.dueAmount - a.dueAmount || b.outstandingBalance - a.outstandingBalance);

    return NextResponse.json({
      success: true,
      data: { weekly: weeklyPending, monthly: monthlyPending },
    });
  } catch (error) {
    console.error('Fetch dues error:', error);
    return NextResponse.json({ error: 'Failed to fetch dues' }, { status: 500 });
  }
}
