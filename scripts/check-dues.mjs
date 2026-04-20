import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://santhosh:123@cluster0.olks6.mongodb.net/srm-assocoate-data';

const loanSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  disposeAmount: Number,
  interestAmount: Number,
  totalAmount: Number,
  startDate: Date,
  endDate: Date,
  status: String,
  balance: Number,
  totalPaid: Number,
}, { timestamps: true });

const clientSchema = new mongoose.Schema({
  name: String,
  phone: String,
}, { timestamps: true });

const planSchema = new mongoose.Schema({
  name: String,
  planType: String,
  interestType: String,
  duration: Number,
}, { timestamps: true });

const paymentSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  loanId: mongoose.Schema.Types.ObjectId,
  amount: Number,
  type: String,
  date: Date,
  notes: String,
}, { timestamps: true });

const Loan = mongoose.models.Loan || mongoose.model('Loan', loanSchema);
const Client = mongoose.models.Client || mongoose.model('Client', clientSchema);
const Plan = mongoose.models.Plan || mongoose.model('Plan', planSchema);
const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

await mongoose.connect(MONGODB_URI);
console.log('✅ Connected to MongoDB\n');

const now = new Date();
console.log(`📅 Current date: ${now.toISOString()}\n`);

// Fetch all loans
const loans = await Loan.find({ status: { $ne: 'completed' } })
  .populate('clientId', 'name phone')
  .populate('planId', 'name planType interestType duration')
  .lean();

console.log(`📋 Total active/overdue loans: ${loans.length}\n`);

if (loans.length === 0) {
  console.log('❌ No active loans found in the database!');
  await mongoose.disconnect();
  process.exit(0);
}

// Fetch all payments
const allPayments = await Payment.find({}).lean();
console.log(`💰 Total payments in DB: ${allPayments.length}\n`);

console.log('═══════════════════════════════════════════════════\n');

const weeklyDues = [];
const monthlyDues = [];

for (const loan of loans) {
  const plan = loan.planId;
  const client = loan.clientId;
  const loanIdStr = String(loan._id);

  const loanPayments = allPayments.filter(p => String(p.loanId) === loanIdStr);

  console.log(`─── Loan: ${client?.name || 'Unknown'} ───`);
  console.log(`  Loan ID: ${loanIdStr}`);
  console.log(`  Plan: ${plan?.name || 'No plan'} (${plan?.planType})`);
  console.log(`  Status: ${loan.status}`);
  console.log(`  Dispose Amount: ₹${loan.disposeAmount}`);
  console.log(`  Interest Amount: ₹${loan.interestAmount}`);
  console.log(`  Total Paid: ₹${loan.totalPaid}`);
  console.log(`  Balance: ₹${loan.balance}`);
  console.log(`  Start Date: ${loan.startDate?.toISOString?.() || loan.startDate}`);
  console.log(`  Payments for this loan: ${loanPayments.length}`);

  if (plan?.planType === 'weekly' && plan?.duration) {
    const msInWeek = 7 * 24 * 60 * 60 * 1000;
    const startDate = new Date(loan.startDate);
    const expectedWeeklyPrincipal = loan.disposeAmount / plan.duration;
    let weeksPassed = Math.floor((now.getTime() - startDate.getTime()) / msInWeek);

    console.log(`  Plan Type: WEEKLY | Duration: ${plan.duration} weeks`);
    console.log(`  Weeks since start: ${weeksPassed}`);
    console.log(`  Expected weekly principal: ₹${expectedWeeklyPrincipal.toFixed(2)}`);

    if (weeksPassed < 1) {
      console.log(`  ⏭ Skipped: Less than 1 week passed\n`);
      continue;
    }

    weeksPassed = Math.min(weeksPassed, plan.duration);
    const expectedTotalPrincipalPaid = weeksPassed * expectedWeeklyPrincipal;
    const pendingPrincipal = expectedTotalPrincipalPaid - (loan.totalPaid || 0);

    const interestPayments = loanPayments.filter(p => p.type === 'interest');
    const totalInterestPaid = interestPayments.reduce((s, p) => s + p.amount, 0);
    const pendingInterest = loan.interestAmount > 0 ? Math.max(0, loan.interestAmount - totalInterestPaid) : 0;
    const totalPendingDue = Math.max(0, pendingPrincipal) + pendingInterest;

    console.log(`  Expected total paid by now: ₹${expectedTotalPrincipalPaid.toFixed(2)}`);
    console.log(`  Pending principal: ₹${pendingPrincipal.toFixed(2)}`);
    console.log(`  Pending interest: ₹${pendingInterest.toFixed(2)}`);
    console.log(`  Total Pending Due: ₹${totalPendingDue.toFixed(2)} (rounded: ${Math.round(totalPendingDue)})`);

    if (Math.round(totalPendingDue) > 0) {
      weeklyDues.push({ name: client?.name, amount: totalPendingDue });
      console.log(`  ✅ ADDED TO WEEKLY DUES`);
    } else {
      console.log(`  ✅ All paid up`);
    }

  } else if (plan?.planType === 'monthly') {
    const start = new Date(loan.startDate);
    let fullMonthsPassed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) fullMonthsPassed--;
    const activeMonths = Math.max(0, fullMonthsPassed);

    console.log(`  Plan Type: MONTHLY`);
    console.log(`  Full months passed: ${activeMonths}`);

    if (activeMonths < 1) {
      console.log(`  ⏭ Skipped: Less than 1 month passed\n`);
      continue;
    }

    const expectedRecurringInterest = activeMonths * loan.interestAmount;
    const recurringPayments = loanPayments.filter(p =>
      p.type === 'interest' && !(p.notes || '').toLowerCase().includes('initial')
    );
    const totalRecurringPaid = recurringPayments.reduce((s, p) => s + p.amount, 0);
    const pendingInterest = expectedRecurringInterest - totalRecurringPaid;

    console.log(`  Interest per month: ₹${loan.interestAmount}`);
    console.log(`  Expected total interest by now: ₹${expectedRecurringInterest}`);
    console.log(`  Recurring interest payments (non-initial): ${recurringPayments.length}`);
    console.log(`  Total recurring paid: ₹${totalRecurringPaid}`);
    console.log(`  Pending interest: ₹${pendingInterest.toFixed(2)} (rounded: ${Math.round(pendingInterest)})`);

    if (Math.round(pendingInterest) > 0) {
      monthlyDues.push({ name: client?.name, amount: pendingInterest });
      console.log(`  ✅ ADDED TO MONTHLY DUES`);
    } else {
      console.log(`  ✅ All paid up`);
    }
  } else {
    console.log(`  ⚠️  Unknown plan type: ${plan?.planType}`);
  }

  console.log('');
}

console.log('\n═══════════════════════════════════════════════════');
console.log(`\n📊 SUMMARY:`);
console.log(`  Weekly dues: ${weeklyDues.length} clients`);
weeklyDues.forEach(d => console.log(`    - ${d.name}: ₹${Math.round(d.amount)}`));
console.log(`  Monthly dues: ${monthlyDues.length} clients`);
monthlyDues.forEach(d => console.log(`    - ${d.name}: ₹${Math.round(d.amount)}`));

await mongoose.disconnect();
