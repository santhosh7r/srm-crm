const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function resetSystem() {
  try {
    console.log('Starting reset process...');
    
    // Basic .env parser for .env.local
    const envPath = path.join(__dirname, '../.env.local');
    if (!fs.existsSync(envPath)) {
        throw new Error(`.env.local not found at ${envPath}`);
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    let MONGODB_URI = '';
    
    for (const line of lines) {
       if (line.startsWith('MONGODB_URI=')) {
           MONGODB_URI = line.substring('MONGODB_URI='.length).trim();
           break;
       }
    }

    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI not found in .env.local');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully.');

    const collections = ['clients', 'loans', 'payments', 'plans', 'users'];
    
    for (const col of collections) {
      console.log(`Clearing collection: ${col}...`);
      try {
        await mongoose.connection.collection(col).deleteMany({});
      } catch (e) {
        console.log(`Collection ${col} might not exist yet, skipping.`);
      }
    }

    console.log('Creating new admin profile...');
    const hashedPassword = await bcrypt.hash('adminpassword123', 10);
    
    await mongoose.connection.collection('users').insertOne({
      name: 'Admin',
      email: 'admin@riyafinance.com',
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('--------------------------------------------------');
    console.log('SUCCESS: System Reset Complete.');
    console.log('All existing data has been deleted.');
    console.log('New Admin Account Created:');
    console.log('Email: admin@riyafinance.com');
    console.log('Password: adminpassword123');
    console.log('--------------------------------------------------');
    console.log('Action Required: Login and change your password immediately in the Profile section.');
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Reset failed:', error);
    process.exit(1);
  }
}

resetSystem();
