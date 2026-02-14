
import React from 'react';
import { 
  LayoutDashboard, 
  Settings, 
  Users, 
  FileText, 
  ShieldCheck,
  CreditCard,
  PieChart,
  Fuel,
  Truck,
  ArrowLeftRight,
  ClipboardList,
  History,
  ShoppingCart,
  Receipt,
  Layers,
  BarChartHorizontal,
  Wallet,
  Coins,
  Building2,
  MapPin,
  Anchor,
  Droplets,
  Package,
  TrendingUp,
  Scale,
  Gavel
} from 'lucide-react';
import { SidebarItem } from './types';

export const NAV_ITEMS: SidebarItem[] = [
  { 
    name: 'Dashboard', 
    icon: LayoutDashboard, 
    path: '/app/dashboard',
    roles: ['manager', 'cashier', 'auditor']
  },
  
  // PRIMARY SECTION: REPORTS
  {
    name: 'Core Reports',
    icon: BarChartHorizontal,
    path: '/app/reports',
    category: 'Reports',
    badge: 'Core',
    roles: ['manager', 'auditor'],
    children: [
      { name: 'Overview', icon: PieChart, path: '/app/reports/overview' },
      { name: 'Daily Operations', icon: ClipboardList, path: '/app/reports/daily-operations' },
      { name: 'Stock Loss', icon: Droplets, path: '/app/reports/stock-loss' },
      { name: 'Profitability', icon: TrendingUp, path: '/app/reports/profitability' },
      { name: 'Credit & Cashflow', icon: Coins, path: '/app/reports/credit-cashflow' },
      { name: 'Station Comparison', icon: Building2, path: '/app/reports/station-comparison' },
    ]
  },

  // SECTION: OPERATIONS
  {
    name: 'Shifts',
    icon: History,
    path: '/app/shifts',
    category: 'Operations',
    roles: ['manager', 'cashier'],
    children: [
      { name: 'Open Shift', icon: Layers, path: '/app/shifts/open' },
      { name: 'Close Shift', icon: Scale, path: '/app/shifts/close' },
      { name: 'Shift History', icon: History, path: '/app/shifts/history' },
    ]
  },
  {
    name: 'Sales',
    icon: ShoppingCart,
    path: '/app/sales',
    category: 'Operations',
    roles: ['manager', 'cashier', 'auditor'],
    children: [
      { name: 'POS Terminal', icon: CreditCard, path: '/app/sales/pos' },
      { name: 'Receipts', icon: Receipt, path: '/app/sales/receipts' },
      { name: 'Transactions', icon: FileText, path: '/app/sales/transactions' },
    ]
  },
  {
    name: 'Inventory',
    icon: Droplets,
    path: '/app/inventory',
    category: 'Operations',
    roles: ['manager', 'auditor'],
    children: [
      { name: 'Dip Readings', icon: Droplets, path: '/app/inventory/dips' },
      { name: 'Reconciliation', icon: Scale, path: '/app/inventory/reconciliation' },
      { name: 'Variance Analysis', icon: TrendingUp, path: '/app/inventory/variance' },
    ]
  },
  {
    name: 'Deliveries',
    icon: Truck,
    path: '/app/deliveries',
    category: 'Operations',
    roles: ['manager', 'cashier'],
    children: [
      { name: 'Create Delivery', icon: Truck, path: '/app/deliveries/create' },
      { name: 'GRN Entry', icon: ClipboardList, path: '/app/deliveries/grn' },
      { name: 'Delivery History', icon: History, path: '/app/deliveries/history' },
    ]
  },
  {
    name: 'Transfers',
    icon: ArrowLeftRight,
    path: '/app/transfers',
    category: 'Operations',
    roles: ['manager'],
    children: [
      { name: 'Tank to Tank', icon: Layers, path: '/app/transfers/tank-to-tank' },
      { name: 'Station to Station', icon: Building2, path: '/app/transfers/station-to-station' },
      { name: 'Adjustments', icon: Scale, path: '/app/transfers/adjustments' },
    ]
  },

  // SECTION: FINANCE
  {
    name: 'Accounts Receivable',
    icon: CreditCard,
    path: '/app/credit',
    category: 'Finance',
    roles: ['manager', 'auditor'],
    children: [
      { name: 'Customers', icon: Users, path: '/app/credit/customers' },
      { name: 'Invoices', icon: FileText, path: '/app/credit/invoices' },
      { name: 'Statements', icon: Receipt, path: '/app/credit/statements' },
      { name: 'Aging Report', icon: History, path: '/app/credit/aging' },
    ]
  },
  {
    name: 'Accounts Payable',
    icon: Building2,
    path: '/app/payables',
    category: 'Finance',
    roles: ['manager', 'auditor'],
    children: [
      { name: 'Suppliers', icon: Building2, path: '/app/payables/suppliers' },
      { name: 'Invoices', icon: FileText, path: '/app/payables/invoices' },
      { name: 'Aging Report', icon: History, path: '/app/payables/aging' },
    ]
  },
  {
    name: 'Expenses',
    icon: Wallet,
    path: '/app/expenses',
    category: 'Finance',
    roles: ['manager', 'cashier'],
    children: [
      { name: 'Expense Entries', icon: Coins, path: '/app/expenses/entries' },
      { name: 'Petty Cash', icon: Wallet, path: '/app/expenses/petty-cash' },
      { name: 'Categories', icon: Layers, path: '/app/expenses/categories' },
    ]
  },

  // SECTION: SETUP
  {
    name: 'System Setup',
    icon: Settings,
    path: '/app/setup',
    category: 'Setup',
    roles: ['manager'],
    children: [
      { name: 'Companies', icon: Building2, path: '/app/setup/companies' },
      { name: 'Stations', icon: MapPin, path: '/app/setup/stations' },
      { name: 'Branches', icon: Anchor, path: '/app/setup/branches' },
      { name: 'Tanks', icon: Layers, path: '/app/setup/tanks' },
      { name: 'Pumps & Nozzles', icon: Fuel, path: '/app/setup/pumps-nozzles' },
      { name: 'Products', icon: Package, path: '/app/setup/products' },
      { name: 'Users & Roles', icon: ShieldCheck, path: '/app/setup/users-roles' },
    ]
  },
  {
    name: 'Governance',
    icon: Gavel,
    path: '/app/governance',
    category: 'Governance',
    roles: ['manager', 'cashier', 'auditor'],
    children: [
      { name: 'Approvals Inbox', icon: ClipboardList, path: '/app/governance/approvals' },
      { name: 'Policies', icon: ShieldCheck, path: '/app/governance/policies' },
    ],
  }
];
