import { connectDB } from './lib/db.ts';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  try {
    const conn = await connectDB();
    console.log("Connected to MongoDB successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
}

testConnection();
