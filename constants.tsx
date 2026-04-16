import React from "react";
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
  Gavel,
} from "lucide-react";
import { SidebarItem } from "./types";

export const NAV_ITEMS: SidebarItem[] = [
  {
    name: "Dashboard",
    icon: LayoutDashboard,
    path: "/app/dashboard",
  },

  // PRIMARY SECTION: REPORTS
  {
    name: "Core Reports",
    icon: BarChartHorizontal,
    path: "/app/reports",
    category: "Reports",
    badge: "Core",
    children: [
      { name: "Overview", icon: PieChart, path: "/app/reports/overview", permissions: ["reports:read"] },
      {
        name: "Daily Operations",
        icon: ClipboardList,
        path: "/app/reports/daily-operations",
        permissions: ["reports:read"],
      },
      { name: "Stock Loss", icon: Droplets, path: "/app/reports/stock-loss", permissions: ["reports:read"] },
      {
        name: "Profitability",
        icon: TrendingUp,
        path: "/app/reports/profitability",
        permissions: ["reports:read"],
      },
      {
        name: "Credit & Cashflow",
        icon: Coins,
        path: "/app/reports/credit-cashflow",
        permissions: ["reports:read"],
      },
      {
        name: "Station Comparison",
        icon: Building2,
        path: "/app/reports/station-comparison",
        permissions: ["reports:read"],
      },
      { name: "Exports", icon: FileText, path: "/app/exports", permissions: ["reports:read"] },
    ],
  },

  // SECTION: OPERATIONS
  {
    name: "Shifts",
    icon: History,
    path: "/app/shifts",
    category: "Operations",
    children: [
      { name: "Open Shift", icon: Layers, path: "/app/shifts/open", permissions: ["shifts:open"] },
      { name: "Close Shift", icon: Scale, path: "/app/shifts/close", permissions: ["shifts:close"] },
      { name: "Shift History", icon: History, path: "/app/shifts/history", permissions: ["shifts:read"] },
    ],
  },
  {
    name: "Sales",
    icon: ShoppingCart,
    path: "/app/sales",
    category: "Operations",
    children: [
      { name: "POS Terminal", icon: CreditCard, path: "/app/sales/pos", permissions: ["sales:pos"] },
      { name: "Receipts", icon: Receipt, path: "/app/sales/receipts", permissions: ["sales:read"] },
      { name: "Transactions", icon: FileText, path: "/app/sales/transactions", permissions: ["sales:read"] },
    ],
  },
  {
    name: "Inventory",
    icon: Droplets,
    path: "/app/inventory",
    category: "Operations",
    children: [
      { name: "Dip Readings", icon: Droplets, path: "/app/inventory/dips", permissions: ["inventory:read", "inventory:write"] },
      {
        name: "Reconciliation",
        icon: Scale,
        path: "/app/inventory/reconciliation",
        permissions: ["inventory:read", "inventory:write"],
      },
      {
        name: "Variance Analysis",
        icon: TrendingUp,
        path: "/app/inventory/variance",
        permissions: ["inventory:read", "inventory:write"],
      },
    ],
  },
  {
    name: "Deliveries",
    icon: Truck,
    path: "/app/deliveries",
    category: "Operations",
    children: [
      { name: "Create Delivery", icon: Truck, path: "/app/deliveries/create", permissions: ["deliveries:write"] },
      { name: "GRN Entry", icon: ClipboardList, path: "/app/deliveries/grn", permissions: ["deliveries:read", "deliveries:write"] },
      {
        name: "Delivery History",
        icon: History,
        path: "/app/deliveries/history",
        permissions: ["deliveries:read"],
      },
    ],
  },
  {
    name: "Transfers",
    icon: ArrowLeftRight,
    path: "/app/transfers",
    category: "Operations",
    children: [
      {
        name: "Tank to Tank",
        icon: Layers,
        path: "/app/transfers/tank-to-tank",
        permissions: ["transfers:write"],
      },
      {
        name: "Station to Station",
        icon: Building2,
        path: "/app/transfers/station-to-station",
        permissions: ["transfers:write"],
      },
      { name: "Adjustments", icon: Scale, path: "/app/transfers/adjustments", permissions: ["adjustments:write"] },
    ],
  },

  // SECTION: FINANCE
  {
    name: "Accounts Receivable",
    icon: CreditCard,
    path: "/app/credit",
    category: "Finance",
    children: [
      { name: "Customers", icon: Users, path: "/app/credit/customers", permissions: ["credit:read"] },
      { name: "Invoices", icon: FileText, path: "/app/credit/invoices", permissions: ["credit:read"] },
      { name: "Statements", icon: Receipt, path: "/app/credit/statements", permissions: ["credit:read"] },
      { name: "Aging Report", icon: History, path: "/app/credit/aging", permissions: ["credit:read"] },
    ],
  },
  {
    name: "Accounts Payable",
    icon: Building2,
    path: "/app/payables",
    category: "Finance",
    children: [
      { name: "Suppliers", icon: Building2, path: "/app/payables/suppliers", permissions: ["payables:read"] },
      { name: "Invoices", icon: FileText, path: "/app/payables/invoices", permissions: ["payables:read"] },
      { name: "Aging Report", icon: History, path: "/app/payables/aging", permissions: ["payables:read"] },
    ],
  },
  {
    name: "Expenses",
    icon: Wallet,
    path: "/app/expenses",
    category: "Finance",
    children: [
      { name: "Expense Entries", icon: Coins, path: "/app/expenses/entries", permissions: ["expenses:read"] },
      { name: "Petty Cash", icon: Wallet, path: "/app/expenses/petty-cash", permissions: ["expenses:read"] },
      { name: "Categories", icon: Layers, path: "/app/expenses/categories", permissions: ["expenses:read"] },
    ],
  },

  // SECTION: SETUP
  {
    name: "System Setup",
    icon: Settings,
    path: "/app/setup",
    category: "Setup",
    children: [
      { name: "Companies", icon: Building2, path: "/app/setup/companies", permissions: ["setup:read", "reports:read"] },
      { name: "Stations", icon: MapPin, path: "/app/setup/stations", permissions: ["setup:read", "reports:read"] },
      { name: "Branches", icon: Anchor, path: "/app/setup/branches", permissions: ["setup:read", "reports:read"] },
      { name: "Tanks", icon: Layers, path: "/app/setup/tanks", permissions: ["setup:read", "reports:read"] },
      { name: "Pumps & Nozzles", icon: Fuel, path: "/app/setup/pumps-nozzles", permissions: ["setup:read", "reports:read"] },
      { name: "Products", icon: Package, path: "/app/setup/products", permissions: ["setup:read", "reports:read"] },
      {
        name: "Users & Roles",
        icon: ShieldCheck,
        path: "/app/setup/users-roles",
        permissions: ["setup:write"],
      },
    ],
  },
  {
    name: "Governance",
    icon: Gavel,
    path: "/app/governance",
    category: "Governance",
    children: [
      {
        name: "Approvals Inbox",
        icon: ClipboardList,
        path: "/app/governance/approvals",
        permissions: ["setup:read", "reports:read", "shifts:read", "expenses:read", "sales:read", "deliveries:read", "adjustments:read"],
      },
      { name: "Policies", icon: ShieldCheck, path: "/app/governance/policies", permissions: ["setup:write"] },
      { name: "Audit Log", icon: History, path: "/app/audit-log", permissions: ["audit:read"] },
    ],
  },
];
