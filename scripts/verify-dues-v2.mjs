import mongoose from 'mongoose';
const URI = 'mongodb+srv://santhosh:123@cluster0.olks6.mongodb.net/srm-assocoate-data';

const Loan = mongoose.models.Loan || mongoose.model('Loan', new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  disposeAmount: Number, interestAmount: Number, startDate: Date, status: String, balance: Number,
}, { timestamps: true }));
const Client = mongoose.models.Client || mongoose.model('Client', new mongoose.Schema({ name: String }));
const Plan = mongoose.models.Plan || mongoose.model('Plan', new mongoose.Schema({ name: String, planType: String, duration: Number }));
const Payment = mongoose.models.Payment || mongoose.model('Payment', new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId, loanId: mongoose.Schema.Types.ObjectId,
  amount: Number, type: String, notes: String,
}));

await mongoose.connect(URI);
const now = new Date();

const loans = await Loan.find({ status: { $ne: 'completed' } })
  .populate('clientId', 'name').populate('planId', 'name planType duration').lean();
const payments = await Payment.find({}).lean();

console.log(`\n📅 Today: ${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`);
console.log(`📋 Active loans: ${loans.length}`);
console.log('');

const results = [];
for (const loan of loans) {
  const plan = loan.planId;
  if (plan?.planType !== 'monthly') continue;
  const start = new Date(loan.startDate);
  const loanPayments = payments.filter(p => String(p.loanId) === String(loan._id));

  // Count due anniversaries
  let dueMonthsSoFar = 0;
  for (let n = 1; n <= 600; n++) {
    const anniversary = new Date(start);
    anniversary.setMonth(start.getMonth() + n);
    if (anniversary > now) break;
    dueMonthsSoFar = n;
  }
  if (dueMonthsSoFar === 0) continue;

  const paidMonths = loanPayments.filter(
    p => p.type === 'interest' && !(p.notes || '').toLowerCase().includes('initial')
  ).length;
  const unpaidMonths = dueMonthsSoFar - paidMonths;

  const firstUnpaidDate = new Date(start);
  firstUnpaidDate.setMonth(start.getMonth() + paidMonths + 1);

  results.push({
    name: loan.clientId?.name,
    start: start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    dueMonthsSoFar,
    paidMonths,
    unpaidMonths,
    interest: loan.interestAmount || 0,
    dueAmount: unpaidMonths * (loan.interestAmount || 0),
    nextDue: firstUnpaidDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    balance: loan.balance,
    show: unpaidMonths > 0 && (loan.interestAmount || 0) > 0,
  });
}

const showing = results.filter(r => r.show);
const hidden = results.filter(r => !r.show);

console.log(`✅ WILL SHOW IN DUES (${showing.length} clients):`);
showing.forEach(r => {
  console.log(`  ${r.name}`);
  console.log(`    Loan start: ${r.start}  |  ₹${r.interest}/month`);
  console.log(`    Months due: ${r.dueMonthsSoFar}  |  Paid: ${r.paidMonths}  |  Unpaid: ${r.unpaidMonths}`);
  console.log(`    Due from: ${r.nextDue}  |  Total due: ₹${r.dueAmount.toLocaleString('en-IN')}`);
  console.log('');
});

console.log(`⚪ NOT SHOWING (${hidden.length} clients — interest=₹0):`);
hidden.forEach(r => console.log(`  ${r.name} — start: ${r.start}, balance: ₹${r.balance?.toLocaleString('en-IN')}, interest: ₹${r.interest}/month`));

await mongoose.disconnect();
