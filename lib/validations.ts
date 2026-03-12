import { z } from 'zod';

// Auth schemas
export const LoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Client schemas
export const ClientSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().min(7, 'Invalid phone number'),
  address: z.string().optional().default(''),
  city: z.string().optional().default(''),
  country: z.string().optional().default(''),
  status: z.enum(['active', 'inactive']).default('active'),
});

// Plan schemas — rules only, no monetary values
export const PlanSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(1, 'Description is required'),
  planType: z.enum(['weekly', 'monthly']),
  interestType: z.enum(['fixed', 'percentage']),
  duration: z.number().min(1).optional(), // only for weekly plans
});

// Loan schemas — monetary values entered at allocation time
export const LoanSchema = z.object({
  clientId: z.string(),
  planId: z.string(),
  disposeAmount: z.number().min(0),
  interestAmount: z.number().min(0),
  totalAmount: z.number().min(0),
  startDate: z.string(),
});

// Payment schemas
export const PaymentSchema = z.object({
  loanId: z.string(),
  amount: z.number().min(0, 'Amount must be greater than 0'),
  type: z.enum(['given', 'interest']).default('given'),
  date: z.date(),
  notes: z.string().optional(),
});
