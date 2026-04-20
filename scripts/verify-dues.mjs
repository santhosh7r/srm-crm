import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://santhosh:123@cluster0.olks6.mongodb.net/srm-assocoate-data';

const loanSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  disposeAmount: Number, interestAmount: Number, totalAmount: Number,
  startDate: Date, endDate: Date, status: String, balance: Number, totalPaid: Number,
}, { timestamps: true });

const clientSchema = new mongoose.Schema({ name: String, phone: String }, { timestamps: true });
const planSchema = new mongoose.Schema({ name: String, planType: String, interestType: String, duration: Number }, { timestamps: true });
const paymentSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId, loanId: mongoose.Schema.Types.ObjectId,
  amount: Number, type: String, date: Date, notes: String,
}, { timestamps: true });

const Loan = mongoose.models.Loan || mongoose.model('Loan', loanSchema);
const Client = mongoose.models.Client || mongoose.model('Client', clientSchema);
const Plan = mongoose.models.Plan || mongoose.model('Plan', planSchema);
const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

await mongoose.connect(MONGODB_URI);

const now = new Date();
const loans = await Loan.find({ status: { $ne: 'completed' } })
  .populate('clientId', 'name phone')
  .populate('planId', 'name planType interestType duration')
  .lean();

const allPayments = await Payment.find({}).lean();

const monthly = [];
const weekly = [];

for (const loan of loans) {
  const plan = loan.planId;
  const loanPayments = allPayments.filter(p => String(p.loanId) === String(loan._id));

  if (plan?.planType === 'monthly') {
    const outstandingBalance = loan.balance || 0;
    let pendingInterest = 0;

    if (loan.interestAmount > 0) {
      const start = new Date(loan.startDate);
      let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
      if (now.getDate() < start.getDate()) months--;
      months = Math.max(0, months);
      if (months >= 1) {
        const expected = months * loan.interestAmount;
        const paid = loanPayments
          .filter(p => p.type === 'interest' && !(p.notes||'').toLowerCase().includes('initial'))
          .reduce((s, p) => s + p.amount, 0);
        pendingInterest = Math.max(0, expected - paid);
      }
    }

    const total = outstandingBalance + pendingInterest;
    if (Math.round(total) > 0) {
      monthly.push({ name: loan.clientId?.name, balance: outstandingBalance, interest: pendingInterest, total });
    }
  } else if (plan?.planType === 'weekly' && plan?.duration) {
    const msInWeek = 7 * 24 * 60 * 60 * 1000;
    const start = new Date(loan.startDate);
    let wk = Math.floor((now.getTime() - start.getTime()) / msInWeek);
    if (wk < 1) continue;
    wk = Math.min(wk, plan.duration);
    const expected = wk * (loan.disposeAmount / plan.duration);
    const paid = loanPayments.filter(p => p.type === 'given').reduce((s, p) => s + p.amount, 0);
    const pendingPrincipal = Math.max(0, expected - paid);
    const interestPaid = loanPayments.filter(p => p.type === 'interest').reduce((s, p) => s + p.amount, 0);
    const pendingInterest = loan.interestAmount > 0 ? Math.max(0, loan.interestAmount - interestPaid) : 0;
    const total = pendingPrincipal + pendingInterest;
    if (Math.round(total) > 0) weekly.push({ name: loan.clientId?.name, total });
  }
}

console.log(`\n✅ WEEKLY DUES (${weekly.length} clients):`);
weekly.forEach(c => console.log(`  ${c.name}: ₹${Math.round(c.total).toLocaleString('en-IN')}`));

console.log(`\n✅ MONTHLY DUES (${monthly.length} clients):`);
monthly.sort((a,b) => b.total - a.total);
monthly.forEach(c => console.log(`  ${c.name}: balance=₹${Math.round(c.balance).toLocaleString('en-IN')} interest=₹${Math.round(c.interest).toLocaleString('en-IN')} total=₹${Math.round(c.total).toLocaleString('en-IN')}`));

await mongoose.disconnect();
