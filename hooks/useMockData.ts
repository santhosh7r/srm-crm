// Mock data for demonstration
export const mockClients = [
  { id: '1', name: 'John Doe', email: 'john@example.com', phone: '555-0101', createdAt: new Date('2024-01-15') },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com', phone: '555-0102', createdAt: new Date('2024-01-20') },
  { id: '3', name: 'Bob Johnson', email: 'bob@example.com', phone: '555-0103', createdAt: new Date('2024-02-10') },
];

export const mockPlans = [
  { id: '1', name: 'Basic Plan', duration: 12, interestRate: 5, monthlyPayment: 100 },
  { id: '2', name: 'Standard Plan', duration: 24, interestRate: 7, monthlyPayment: 150 },
  { id: '3', name: 'Premium Plan', duration: 36, interestRate: 4, monthlyPayment: 200 },
];

export const mockLoans = [
  { 
    id: '1', 
    clientId: '1', 
    planId: '1', 
    amount: 5000, 
    status: 'active', 
    balance: 2500, 
    startDate: new Date('2024-01-15'),
    endDate: new Date('2025-01-15'),
    paidAmount: 2500,
  },
  { 
    id: '2', 
    clientId: '2', 
    planId: '2', 
    amount: 10000, 
    status: 'active', 
    balance: 5000, 
    startDate: new Date('2024-02-01'),
    endDate: new Date('2026-02-01'),
    paidAmount: 5000,
  },
  { 
    id: '3', 
    clientId: '3', 
    planId: '3', 
    amount: 15000, 
    status: 'completed', 
    balance: 0, 
    startDate: new Date('2023-01-01'),
    endDate: new Date('2025-12-01'),
    paidAmount: 15000,
  },
];

export const mockPayments = [
  { id: '1', loanId: '1', amount: 500, date: new Date('2024-02-15') },
  { id: '2', loanId: '1', amount: 500, date: new Date('2024-03-15') },
  { id: '3', loanId: '1', amount: 500, date: new Date('2024-04-15') },
  { id: '4', loanId: '1', amount: 500, date: new Date('2024-05-15') },
  { id: '5', loanId: '1', amount: 500, date: new Date('2024-06-15') },
];

export function useMockData() {
  return {
    clients: mockClients,
    plans: mockPlans,
    loans: mockLoans,
    payments: mockPayments,
  };
}
