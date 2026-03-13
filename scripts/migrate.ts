import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import dns from "dns"

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
}

const planSchema = new mongoose.Schema({
    planType: String,
});
const Plan = mongoose.models.Plan || mongoose.model('Plan', planSchema);

const loanSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    interestAmount: Number,
    startDate: Date,
});
const Loan = mongoose.models.Loan || mongoose.model('Loan', loanSchema);

const paymentSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    loanId: mongoose.Schema.Types.ObjectId,
    amount: Number,
    type: String,
    date: Date,
    notes: String,
});
const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

async function run() {
    const uri = MONGODB_URI!;
    const match = uri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/(.*)$/);
    if (!match) {
        await mongoose.connect(uri, { bufferCommands: false });
    } else {
        const [, user, pass, host, rest] = match;
        const resolver = new dns.Resolver();
        resolver.setServers(["8.8.8.8", "8.8.4.4"]);

        const srvRecords = await new Promise<dns.SrvRecord[]>((resolve, reject) => {
            resolver.resolveSrv(`_mongodb._tcp.${host}`, (err, records) => {
                if (err) reject(err);
                else resolve(records);
            });
        });

        const txtRecords = await new Promise<string[][]>((resolve) => {
            resolver.resolveTxt(host, (err, records) => {
                if (err) resolve([]);
                else resolve(records);
            });
        });

        const hosts = srvRecords.map((r) => `${r.name}:${r.port}`).join(",");
        const txtOptions = txtRecords.flat().join("&");
        const dbName = rest.split("?")[0];
        const directUri = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hosts}/${dbName}?ssl=true${txtOptions ? `&${txtOptions}` : ""}`;

        await mongoose.connect(directUri, { bufferCommands: false });
    }
    console.log('Connected to MongoDB');

    const loans = await Loan.find({}).populate('planId');
    let migratedCount = 0;

    for (const loan of loans) {
        if (!loan.planId) continue;

        // Explicit typing since we're using generic schema
        const planType = (loan.planId as any).planType;
        if (planType === 'monthly' && loan.interestAmount > 0) {

            const existingPayment = await Payment.findOne({
                loanId: loan._id,
                type: 'interest',
                // In JS Date objects from MongoDB might not match deep equality, but doing a time match or just looking for 'Initial monthly interest' note
            });

            // To prevent duplication, check if this loan already has ANY interest payment on its exact start date OR with the migration note
            const dateStr = new Date(loan.startDate).toISOString();
            const alreadyHasInitial = await Payment.findOne({
                loanId: loan._id,
                type: 'interest',
                notes: { $regex: /Initial monthly interest/i }
            });

            if (!alreadyHasInitial) {
                console.log(`Migrating missing initial interest for loan ${loan._id}`);
                const p = new Payment({
                    userId: loan.userId,
                    loanId: loan._id,
                    amount: loan.interestAmount,
                    type: 'interest',
                    date: loan.startDate,
                    notes: 'Initial monthly interest (migrated)'
                });
                await p.save();
                migratedCount++;
            }
        }
    }

    console.log(`Successfully migrated ${migratedCount} initial interest records.`);
    process.exit(0);
}

run().catch(console.error);
