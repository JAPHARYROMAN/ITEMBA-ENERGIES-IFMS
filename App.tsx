import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  Link,
  Outlet,
  useSearchParams,
  useParams,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Layout from "./components/Layout";
import Dashboard from "./components/Dashboard";
import ModulePlaceholder from "./components/ModulePlaceholder";
import { GenericTablePage } from "./components/pages/GenericTablePage";
import { TankForm } from "./components/forms/TankForm";
import { ExpenseEntryForm } from "./components/forms/ExpenseEntryForm";
import { PettyCashForm } from "./components/forms/PettyCashForm";
import { CustomerManagement } from "./components/forms/CustomerManagement";
import { CustomerForm } from "./components/forms/CustomerForm";
import { CloseShiftForm } from "./components/forms/CloseShiftForm";
import { OpenShiftForm } from "./components/forms/OpenShiftForm";
import { NozzleSetupForm } from "./components/forms/NozzleSetupForm";
import { CreateDeliveryForm } from "./components/forms/CreateDeliveryForm";
import { CreditInvoiceForm } from "./components/forms/CreditInvoiceForm";
import { RecordPaymentForm } from "./components/forms/RecordPaymentForm";
import { GeneralSetupForm } from "./components/forms/GeneralSetupForm";
import { ProductForm } from "./components/forms/ProductForm";
import { ExpenseSummaryDrawer } from "./components/expenses/ExpenseSummaryDrawer";
import POSPage from "./components/pos/POSPage";
import ReportsOverview from "./components/pages/ReportsOverview";
import DailyOperationsReport from "./components/pages/DailyOperationsReport";
import StockLossReport from "./components/pages/StockLossReport";
import ProfitabilityReport from "./components/pages/ProfitabilityReport";
import CreditCashflowReport from "./components/pages/CreditCashflowReport";
import StationComparisonReport from "./components/pages/StationComparisonReport";
import ExportsPage from "./components/pages/ExportsPage";
import GovernanceApprovalsPage from "./components/pages/GovernanceApprovalsPage";
import GovernancePoliciesPage from "./components/pages/GovernancePoliciesPage";
import NotificationsPage from "./components/pages/NotificationsPage";
import NotificationSettingsPage from "./components/pages/NotificationSettingsPage";
import AuditLogPage from "./components/pages/AuditLogPage";
import UsersRolesPage from "./components/pages/UsersRolesPage";
import DipsPage from "./components/pages/DipsPage";
import ReconciliationsPage from "./components/pages/ReconciliationsPage";
import VariancesPage from "./components/pages/VariancesPage";
import TankToTankTransfersPage from "./components/pages/TankToTankTransfersPage";
import StationToStationTransfersPage from "./components/pages/StationToStationTransfersPage";
import AdjustmentsPage from "./components/pages/AdjustmentsPage";
import SuppliersPage from "./components/pages/SuppliersPage";
import SupplierInvoicesPage from "./components/pages/SupplierInvoicesPage";
import PayablesAgingPage from "./components/pages/PayablesAgingPage";
import SalesTransactionsPage from "./components/pages/SalesTransactionsPage";
import CreditAgingPage from "./components/pages/CreditAgingPage";
import ExpenseCategoriesPage from "./components/pages/ExpenseCategoriesPage";
import { matchesPermissionRequirement, useAppStore, useAuthStore, useReportsStore } from "./store";
import {
  shiftRepo,
  saleRepo,
  deliveryRepo,
  customerRepo,
  expenseRepo,
  invoiceRepo,
  paymentRepo,
  pettyCashRepo,
  resetRepositoryCaches,
} from "./lib/repositories";
import { setupDataSource } from "./lib/data-source";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CommandMenu } from "./components/ifms/CommandMenu";
import { ToastContainer } from "./components/ifms/Toast";
import DetailsDrawer from "./components/ifms/DetailsDrawer";
import { frontendEnv } from "./lib/env.client";
import { AuthShell } from "./components/ifms/auth/AuthShell";
import { AuthCard } from "./components/ifms/auth/AuthCard";
import { AuthBrandPanel } from "./components/ifms/auth/AuthBrandPanel";
import { PasswordField } from "./components/ifms/auth/PasswordField";
import { useLogin } from "./hooks/auth/useLogin";
import { useForgotPassword } from "./hooks/auth/useForgotPassword";
import { useResetPassword } from "./hooks/auth/useResetPassword";
import { useSignup } from "./hooks/auth/useSignup";
import { useCurrency } from "./lib/hooks/useCurrency";
import { permissionGroups } from "./lib/permissions";
import { resolveAuthCacheScope, type AuthCacheScope } from "./lib/cache-scope";
import type { PermissionMatch } from "./types";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function TitleManager() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname.split("/").pop() || "Dashboard";
    const formatted =
      path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, " ");
    document.title = `${formatted} | IFMS Suite`;
  }, [location]);
  return null;
}

function AuthRouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs font-semibold text-muted-foreground">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
          aria-hidden="true"
        />
        Preparing secure session...
      </div>
    </div>
  );
}

function AuthCacheBoundary() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const isAuthReady = useAuthStore((s) => s.isAuthReady);
  const setReportFilters = useReportsStore((s) => s.setFilters);
  const previousUserId = useRef<AuthCacheScope>(undefined);

  useEffect(() => {
    const result = resolveAuthCacheScope(previousUserId.current, isAuthReady, userId);
    previousUserId.current = result.nextUserId;

    if (!result.shouldReset) return;

    queryClient.clear();
    resetRepositoryCaches();
    setReportFilters({ stationId: null, productId: null });
  }, [isAuthReady, queryClient, setReportFilters, userId]);

  return null;
}

function PublicAuthRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAuthReady } = useAuthStore();
  if (!isAuthReady) return <AuthRouteLoading />;
  if (isAuthenticated) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
}

function ForgotPasswordPage() {
  const { submitForgotPassword, isSubmitting, successMessage, errorMessage } =
    useForgotPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
    mode: "onBlur",
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    await submitForgotPassword(values.email);
  };

  return (
    <AuthShell
      brandPanel={<AuthBrandPanel demoMode={frontendEnv.demoMode} />}
      formPanel={
        <AuthCard
          title="Forgot password"
          subtitle="Enter your work email to receive reset instructions"
          footer={
            <p className="text-xs text-muted-foreground">
              Remembered your password?{" "}
              <Link
                to="/login"
                className="font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Back to sign in
              </Link>
            </p>
          }
        >
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <InputField
              id="forgot-email"
              type="email"
              label="Email"
              registration={register("email")}
              placeholder="you@itemba-energies.com"
              autoComplete="email"
              error={errors.email?.message}
            />

            <div className="min-h-[42px]" aria-live="polite">
              {successMessage ? <InlineAlert message={successMessage} /> : null}
              {errorMessage ? <InlineAlert message={errorMessage} /> : null}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-primary-foreground transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                    aria-hidden="true"
                  />
                  Sending link
                </>
              ) : (
                "Send reset link"
              )}
            </button>
          </form>
        </AuthCard>
      }
    />
  );
}

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { submitResetPassword, isSubmitting, successMessage, errorMessage } =
    useResetPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
    mode: "onBlur",
  });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    if (!token) return;
    await submitResetPassword(token, values.newPassword);
  };

  if (!token) {
    return (
      <AuthShell
        brandPanel={<AuthBrandPanel demoMode={frontendEnv.demoMode} />}
        formPanel={
          <AuthCard
            title="Invalid reset link"
            subtitle="The password reset link is missing or malformed."
            footer={
              <p className="text-xs text-muted-foreground">
                <Link
                  to="/forgot-password"
                  className="font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  Request a new reset link
                </Link>
              </p>
            }
          >
            <InlineAlert message="No reset token found in the URL. Please use the link sent to your email." />
          </AuthCard>
        }
      />
    );
  }

  return (
    <AuthShell
      brandPanel={<AuthBrandPanel demoMode={frontendEnv.demoMode} />}
      formPanel={
        <AuthCard
          title="Reset password"
          subtitle="Enter your new password below"
          footer={
            <p className="text-xs text-muted-foreground">
              Remembered your password?{" "}
              <Link
                to="/login"
                className="font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Back to sign in
              </Link>
            </p>
          }
        >
          {successMessage ? (
            <div className="space-y-4">
              <div
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-relaxed text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                role="status"
              >
                {successMessage}
              </div>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-primary-foreground transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.99]"
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              <PasswordField
                id="reset-new-password"
                label="New password"
                registration={register("newPassword")}
                placeholder="Enter new password"
                autoComplete="new-password"
                error={errors.newPassword?.message}
              />

              <PasswordField
                id="reset-confirm-password"
                label="Confirm password"
                registration={register("confirmPassword")}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
              />

              <div className="min-h-[42px]" aria-live="polite">
                {errorMessage ? <InlineAlert message={errorMessage} /> : null}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-primary-foreground transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                      aria-hidden="true"
                    />
                    Resetting password
                  </>
                ) : (
                  "Reset password"
                )}
              </button>
            </form>
          )}
        </AuthCard>
      }
    />
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, isAuthReady } = useAuthStore();

  if (!isAuthReady) return <AuthRouteLoading />;
  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}

function PermissionProtectedRoute({
  permissions,
  permissionMatch = "any",
  children,
}: {
  permissions: string[];
  permissionMatch?: PermissionMatch;
  children: React.ReactNode;
}) {
  const { user } = useAuthStore();
  if (!matchesPermissionRequirement(user, permissions, permissionMatch)) {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}

function CustomerProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-[60] bg-background">
      <CustomerManagement
        initialId={id}
        onSuccess={() => navigate(-1)}
        onCancel={() => navigate(-1)}
      />
    </div>
  );
}

interface ExpenseRow {
  id: string;
  timestamp: string;
  vendor: string;
  category: string;
  amount: number;
  status: string;
  governanceApprovalStatus?: string;
}

function ExpensesPage() {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<ExpenseRow | null>(null);
  const { fmt, header } = useCurrency();

  const columns = useMemo(
    () => [
      { header: "ID", accessorKey: "id" },
      {
        header: "Date",
        accessorKey: "timestamp",
        cell: (e: ExpenseRow) => new Date(e.timestamp).toLocaleDateString(),
      },
      { header: "Vendor", accessorKey: "vendor" },
      { header: "Category", accessorKey: "category" },
      {
        header: header('Amount'),
        accessorKey: "amount",
        cell: (e: ExpenseRow) => fmt(e.amount),
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: (e: ExpenseRow) => (
          <div className="flex flex-col items-start gap-1">
            <span
              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                e.status === "Approved"
                  ? "bg-emerald-100 text-emerald-800"
                  : e.status === "Rejected"
                    ? "bg-rose-100 text-rose-800"
                    : "bg-amber-100 text-amber-800"
              }`}
            >
              {e.status}
            </span>
            {String(e.governanceApprovalStatus ?? "").toLowerCase() ===
              "submitted" && (
              <a
                href="#/app/governance/approvals"
                className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-blue-100 text-blue-800 hover:underline"
              >
                Pending Governance
              </a>
            )}
          </div>
        ),
      },
    ],
    [fmt, header],
  );

  return (
    <>
      <GenericTablePage<ExpenseRow>
        title="Expense Control Center"
        description="Global expenditure audit and authorization workflow."
        queryKey={["expenses"]}
        queryFn={async () => {
          const expenses = await expenseRepo.list();
          return expenses.map((expense) => ({
            id: expense.id,
            timestamp: expense.timestamp,
            vendor: expense.vendor,
            category: expense.category,
            amount: expense.amount,
            status: expense.status,
            governanceApprovalStatus: expense.governanceApprovalStatus,
          }));
        }}
        entityName="Expense"
        FormComponent={ExpenseEntryForm}
        columns={columns}
        writePermissions={permissionGroups.expensesWrite}
        onRowClick={(e: ExpenseRow) => setReviewItem(e)}
      />
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => setSummaryOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-xs font-black uppercase tracking-widest text-primary hover:bg-muted transition-all"
        >
          View Analytics
        </button>
      </div>

      <DetailsDrawer
        isOpen={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title="Intelligence"
        subtitle="Fiscal analytics"
      >
        <ExpenseSummaryDrawer />
      </DetailsDrawer>

      <DetailsDrawer
        isOpen={!!reviewItem}
        onClose={() => setReviewItem(null)}
        title="Verification"
        subtitle="Audit details"
      >
        {reviewItem && (
          <ExpenseEntryForm
            initialData={reviewItem}
            onSuccess={() => setReviewItem(null)}
            onCancel={() => setReviewItem(null)}
          />
        )}
      </DetailsDrawer>
    </>
  );
}

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid corporate email address."),
  password: z.string().min(1, "Password is required."),
});

const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Full name is required."),
    email: z.string().trim().email("Enter a valid corporate email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .superRefine((data, ctx) => {
    if (data.confirmPassword !== data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;
type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid corporate email address."),
});

const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128)
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/,
        "Must include uppercase, lowercase, number, and special character",
      ),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.confirmPassword !== data.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

function InlineAlert({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-relaxed text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300"
      role="alert"
      aria-live="assertive"
    >
      {message}
    </div>
  );
}

function InputField({
  id,
  label,
  type,
  registration,
  placeholder,
  autoComplete,
  error,
}: {
  id: string;
  label: string;
  type: "text" | "email";
  registration: {
    name: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => void;
    ref: React.Ref<HTMLInputElement>;
  };
  placeholder?: string;
  autoComplete?: string;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-black uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      <input
        {...registration}
        id={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? errorId : undefined}
        className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-[box-shadow,border-color,background-color] duration-150 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/35"
      />
      {error ? (
        <p
          id={errorId}
          className="text-xs font-medium text-rose-600"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function LoginPage() {
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/app/dashboard";
  const { submitLogin, isSubmitting, errorMessage, resetError } = useLogin();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onBlur",
  });

  const onSubmit = async (values: LoginFormValues) => {
    resetError();
    await submitLogin({
      email: values.email,
      password: values.password,
      nextPath,
    });
  };

  return (
    <AuthShell
      brandPanel={<AuthBrandPanel demoMode={frontendEnv.demoMode} />}
      formPanel={
        <AuthCard
          title="Sign in"
          subtitle="Use your corporate account"
          footer={
            <p className="text-xs text-muted-foreground">
              New to IFMS?{" "}
              <Link
                to="/signup"
                className="font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Create an account
              </Link>
            </p>
          }
        >
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <InputField
              id="login-email"
              type="email"
              label="Email"
              registration={register("email")}
              placeholder="you@itemba-energies.com"
              autoComplete="email"
              error={errors.email?.message}
            />

            <Controller
              name="password"
              control={control}
              render={({ field, fieldState }) => (
                <PasswordField
                  id="login-password"
                  label="Password"
                  value={field.value}
                  onChange={field.onChange}
                  required
                  minLength={8}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  error={fieldState.error?.message}
                />
              )}
            />

            <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
              Never share your password. Admins will never ask for it.
            </p>

            <div className="min-h-[42px]" aria-live="polite">
              {errorMessage ? <InlineAlert message={errorMessage} /> : null}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <Link
                to="/forgot-password"
                className="text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-primary-foreground transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                    aria-hidden="true"
                  />
                  Signing in
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </AuthCard>
      }
    />
  );
}

function SignupPage() {
  const navigate = useNavigate();
  const {
    submitSignup,
    isSubmitting,
    errorMessage,
    inviteOnlyMode,
    inviteOnlyMessage,
    resetError,
  } = useSignup();
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onBlur",
  });

  const passwordValue = watch("password");

  const onSubmit = async (values: SignupFormValues) => {
    resetError();
    await submitSignup({
      name: values.name,
      email: values.email,
      password: values.password,
    });
  };

  return (
    <AuthShell
      brandPanel={<AuthBrandPanel demoMode={frontendEnv.demoMode} />}
      formPanel={
        <AuthCard
          title="Create account"
          subtitle="Set up your corporate access"
          footer={
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Sign in
              </Link>
            </p>
          }
        >
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <InputField
              id="signup-name"
              type="text"
              label="Full name"
              registration={register("name")}
              placeholder="Jane Doe"
              autoComplete="name"
              error={errors.name?.message}
            />

            <InputField
              id="signup-email"
              type="email"
              label="Email"
              registration={register("email")}
              placeholder="you@itemba-energies.com"
              autoComplete="email"
              error={errors.email?.message}
            />

            <Controller
              name="password"
              control={control}
              render={({ field, fieldState }) => (
                <PasswordField
                  id="signup-password"
                  label="Password"
                  value={field.value}
                  onChange={field.onChange}
                  required
                  minLength={8}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  error={fieldState.error?.message}
                />
              )}
            />

            <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
              Never share your password. Admins will never ask for it.
            </p>

            <p className="text-[11px] text-muted-foreground">
              Strong password recommended: at least 12 characters with a mix of
              letters, numbers, and symbols.
            </p>

            <Controller
              name="confirmPassword"
              control={control}
              render={({ field, fieldState }) => (
                <PasswordField
                  id="signup-confirm-password"
                  label="Confirm password"
                  value={field.value}
                  onChange={field.onChange}
                  required
                  minLength={8}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  error={fieldState.error?.message}
                />
              )}
            />

            {passwordValue && passwordValue.length < 12 ? (
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Password is valid but could be stronger with 12+ characters.
              </p>
            ) : null}

            <div className="min-h-[42px]" aria-live="polite">
              {inviteOnlyMode ? (
                <InlineAlert message={inviteOnlyMessage} />
              ) : null}
              {!inviteOnlyMode && errorMessage ? (
                <InlineAlert message={errorMessage} />
              ) : null}
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              By continuing, you agree to IFMS Terms of Service and Privacy
              Policy.
            </p>

            <button
              type="submit"
              disabled={isSubmitting || inviteOnlyMode}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-black uppercase tracking-widest text-primary-foreground transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                    aria-hidden="true"
                  />
                  Creating account
                </>
              ) : (
                "Create an account"
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-xs font-black uppercase tracking-widest text-foreground transition-[background-color,transform] duration-150 hover:bg-muted active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Back to sign in
            </button>
          </form>
        </AuthCard>
      }
    />
  );
}

function AppContent() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicAuthRoute>
            <LoginPage />
          </PublicAuthRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicAuthRoute>
            <ForgotPasswordPage />
          </PublicAuthRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicAuthRoute>
            <ResetPasswordPage />
          </PublicAuthRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicAuthRoute>
            <SignupPage />
          </PublicAuthRoute>
        }
      />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route
          path="setup/*"
          element={
            <PermissionProtectedRoute
              permissions={[...permissionGroups.setupRead, ...permissionGroups.setupWrite]}
            >
              <Outlet />
            </PermissionProtectedRoute>
          }
        >
          <Route
            path="companies"
            element={
              <GenericTablePage
                title="Entities"
                description="Manage organizations."
                queryKey={["companies"]}
                queryFn={setupDataSource.companies.list}
                entityName="Company"
                FormComponent={(props) => (
                  <GeneralSetupForm {...props} entityName="Company" />
                )}
                writePermissions={permissionGroups.setupWrite}
                columns={[
                  { header: "Code", accessorKey: "code" },
                  { header: "Name", accessorKey: "name" },
                  { header: "Currency", accessorKey: "currency" },
                ]}
                onDeleteRow={(row) => setupDataSource.companies.delete(row.id)}
              />
            }
          />
          <Route
            path="stations"
            element={
              <GenericTablePage
                title="Stations"
                description="Manage station nodes."
                queryKey={["stations"]}
                queryFn={setupDataSource.stations.list}
                entityName="Station"
                FormComponent={(props) => (
                  <GeneralSetupForm {...props} entityName="Station" />
                )}
                writePermissions={permissionGroups.setupWrite}
                columns={[
                  { header: "ID", accessorKey: "id" },
                  { header: "Name", accessorKey: "name" },
                ]}
                onDeleteRow={(row) => setupDataSource.stations.delete(row.id)}
              />
            }
          />
          <Route
            path="branches"
            element={
              <GenericTablePage
                title="Branches"
                description="Granular branch management."
                queryKey={["branches"]}
                queryFn={() => setupDataSource.branches.list()}
                entityName="Branch"
                FormComponent={(props) => (
                  <GeneralSetupForm {...props} entityName="Branch" />
                )}
                writePermissions={permissionGroups.setupWrite}
                columns={[
                  { header: "ID", accessorKey: "id" },
                  { header: "Name", accessorKey: "name" },
                ]}
                onDeleteRow={(row) => setupDataSource.branches.delete(row.id)}
              />
            }
          />
          <Route
            path="products"
            element={
              <GenericTablePage
                title="Products"
                description="Product catalog."
                queryKey={["products"]}
                queryFn={setupDataSource.products.list}
                entityName="Product"
                FormComponent={ProductForm}
                writePermissions={permissionGroups.setupWrite}
                columns={[
                  { header: "Code", accessorKey: "code" },
                  { header: "Name", accessorKey: "name" },
                  { header: "Price", accessorKey: "pricePerUnit" },
                ]}
                onDeleteRow={(row) => setupDataSource.products.delete(row.id)}
              />
            }
          />
          <Route
            path="tanks"
            element={
              <GenericTablePage
                title="Tanks"
                description="Fuel tank monitoring."
                queryKey={["tanks"]}
                queryFn={() => setupDataSource.tanks.list()}
                entityName="Tank"
                FormComponent={TankForm}
                writePermissions={permissionGroups.setupWrite}
                columns={[
                  { header: "Code", accessorKey: "code" },
                  { header: "Capacity", accessorKey: "capacity" },
                ]}
                onDeleteRow={(row) => setupDataSource.tanks.delete(row.id)}
              />
            }
          />
          <Route
            path="pumps-nozzles"
            element={
              <GenericTablePage
                title="Hardware"
                description="Hardware mapping."
                queryKey={["nozzles"]}
                queryFn={setupDataSource.nozzles.list}
                entityName="Nozzle"
                FormComponent={NozzleSetupForm}
                writePermissions={permissionGroups.setupWrite}
                columns={[
                  { header: "Pump", accessorKey: "pumpCode" },
                  { header: "Nozzle", accessorKey: "nozzleCode" },
                ]}
                onDeleteRow={(row) => setupDataSource.nozzles.delete(row.id)}
              />
            }
          />
          <Route
            path="users-roles"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.usersAdmin}>
                <UsersRolesPage />
              </PermissionProtectedRoute>
            }
          />
        </Route>
        <Route path="shifts/*">
          <Route
            path="open"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.shiftsOpen}>
                <div className="max-w-4xl mx-auto pt-6">
                  <OpenShiftForm
                    onSuccess={() => navigate(-1)}
                    onCancel={() => navigate(-1)}
                  />
                </div>
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="close"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.shiftsClose}>
                <div className="max-w-4xl mx-auto pt-6">
                  <CloseShiftForm
                    onSuccess={() => navigate(-1)}
                    onCancel={() => navigate(-1)}
                  />
                </div>
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="history"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.shiftsRead}>
                <GenericTablePage
                  title="Shift Journal"
                  description="Archive of activity."
                  queryKey={["shifts"]}
                  queryFn={shiftRepo.list}
                  columns={[
                    { header: "ID", accessorKey: "id" },
                    { header: "Status", accessorKey: "status" },
                  ]}
                />
              </PermissionProtectedRoute>
            }
          />
        </Route>
        <Route path="inventory/*">
          <Route
            path="dips"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.inventoryRead}>
                <DipsPage />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="reconciliation"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.inventoryRead}>
                <ReconciliationsPage />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="variance"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.inventoryRead}>
                <VariancesPage />
              </PermissionProtectedRoute>
            }
          />
        </Route>
        <Route path="transfers/*">
          <Route
            path="tank-to-tank"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.transfersRead}>
                <TankToTankTransfersPage />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="station-to-station"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.transfersRead}>
                <StationToStationTransfersPage />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="adjustments"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.adjustmentsRead}>
                <AdjustmentsPage />
              </PermissionProtectedRoute>
            }
          />
        </Route>
        <Route path="sales/*">
          <Route
            path="pos"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.salesPos}>
                <POSPage />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="receipts"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.salesRead}>
                <GenericTablePage
                  title="Electronic Journal"
                  description="Point-of-sale events."
                  queryKey={["sales"]}
                  queryFn={saleRepo.list}
                  columns={[
                    { header: "ID", accessorKey: "id" },
                    { header: "Total", accessorKey: "totalAmount" },
                  ]}
                />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="transactions"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.salesRead}>
                <SalesTransactionsPage />
              </PermissionProtectedRoute>
            }
          />
        </Route>
        <Route path="deliveries/*">
          <Route
            path="create"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.deliveriesWrite}>
                <div className="max-w-4xl mx-auto pt-6">
                  <CreateDeliveryForm
                    onSuccess={() => navigate(-1)}
                    onCancel={() => navigate(-1)}
                  />
                </div>
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="grn"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.deliveriesRead}>
                <GenericTablePage
                  title="GRN Portal"
                  description="Replenishment audit."
                  queryKey={["del-pending"]}
                  queryFn={deliveryRepo.list}
                  columns={[
                    { header: "ID", accessorKey: "id" },
                    { header: "Status", accessorKey: "status" },
                  ]}
                  onRowClick={(d) => navigate("/app/deliveries/grn/" + d.id)}
                />
              </PermissionProtectedRoute>
            }
          />
        </Route>
        <Route path="credit/*">
          <Route
            path="customers/:id"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.creditRead}>
                <CustomerProfilePage />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="customers"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.creditRead}>
                <GenericTablePage
                  title="Accounts"
                  description="Corporate accounts."
                  queryKey={["customers"]}
                  queryFn={customerRepo.list}
                  entityName="Customer"
                  FormComponent={CustomerForm}
                  writePermissions={permissionGroups.creditWrite}
                  columns={[
                    { header: "Name", accessorKey: "name" },
                    { header: "Balance", accessorKey: "balance" },
                  ]}
                  onRowClick={(c) => navigate("/app/credit/customers/" + c.id)}
                />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="invoices"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.creditRead}>
                <GenericTablePage
                  title="Invoices"
                  description="Manage invoices."
                  queryKey={["invoices"]}
                  queryFn={invoiceRepo.list}
                  entityName="Invoice"
                  FormComponent={CreditInvoiceForm}
                  writePermissions={permissionGroups.creditWrite}
                  columns={[
                    { header: "Inv #", accessorKey: "invoiceNumber" },
                    { header: "Balance", accessorKey: "balanceRemaining" },
                  ]}
                />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="statements"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.creditRead}>
                <GenericTablePage
                  title="Receivables"
                  description="Ledger entries."
                  queryKey={["payments"]}
                  queryFn={paymentRepo.list}
                  entityName="Payment"
                  FormComponent={RecordPaymentForm}
                  writePermissions={permissionGroups.creditWrite}
                  columns={[
                    { header: "Ref #", accessorKey: "id" },
                    { header: "Amount", accessorKey: "amount" },
                  ]}
                />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="aging"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.creditRead}>
                <CreditAgingPage />
              </PermissionProtectedRoute>
            }
          />
        </Route>
        <Route path="expenses/*">
          <Route
            path="entries"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.expensesRead}>
                <ExpensesPage />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="petty-cash"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.expensesRead}>
                <GenericTablePage
                  title="Petty Cash"
                  description="Liquid fund audit."
                  queryKey={["petty-cash-transactions"]}
                  queryFn={pettyCashRepo.list}
                  entityName="Transaction"
                  FormComponent={PettyCashForm}
                  writePermissions={permissionGroups.expensesWrite}
                  columns={[
                    { header: "ID", accessorKey: "id" },
                    { header: "Type", accessorKey: "type" },
                    { header: "Amount", accessorKey: "amount" },
                  ]}
                />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="categories"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.expensesRead}>
                <ExpenseCategoriesPage />
              </PermissionProtectedRoute>
            }
          />
        </Route>
        <Route path="payables/*">
          <Route
            path="suppliers"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.payablesRead}>
                <SuppliersPage />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="invoices"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.payablesRead}>
                <SupplierInvoicesPage />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="aging"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.payablesRead}>
                <PayablesAgingPage />
              </PermissionProtectedRoute>
            }
          />
        </Route>
        <Route
          path="reports/*"
          element={
            <PermissionProtectedRoute permissions={permissionGroups.reportsRead}>
              <Outlet />
            </PermissionProtectedRoute>
          }
        >
          <Route path="overview" element={<ReportsOverview />} />
          <Route path="daily-operations" element={<DailyOperationsReport />} />
          <Route path="stock-loss" element={<StockLossReport />} />
          <Route path="profitability" element={<ProfitabilityReport />} />
          <Route path="credit-cashflow" element={<CreditCashflowReport />} />
          <Route
            path="station-comparison"
            element={<StationComparisonReport />}
          />
        </Route>
        <Route
          path="exports"
          element={
            <PermissionProtectedRoute permissions={permissionGroups.reportsRead}>
              <ExportsPage />
            </PermissionProtectedRoute>
          }
        />
        <Route path="governance/*">
          <Route
            path="approvals"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.governanceRead}>
                <GovernanceApprovalsPage />
              </PermissionProtectedRoute>
            }
          />
          <Route
            path="policies"
            element={
              <PermissionProtectedRoute permissions={permissionGroups.setupWrite}>
                <GovernancePoliciesPage />
              </PermissionProtectedRoute>
            }
          />
        </Route>
        <Route path="notifications" element={<NotificationsPage />} />
        <Route
          path="settings/notifications"
          element={<NotificationSettingsPage />}
        />
        <Route
          path="audit-log"
          element={
            <PermissionProtectedRoute permissions={permissionGroups.auditRead}>
              <AuditLogPage />
            </PermissionProtectedRoute>
          }
        />
        <Route path="*" element={<ModulePlaceholder />} />
      </Route>
      <Route
        path="/"
        element={
          <Navigate
            to={isAuthenticated ? "/app/dashboard" : "/login"}
            replace
          />
        }
      />
    </Routes>
  );
}

export default function App() {
  const { theme } = useAppStore();
  const hydrateAuth = useAuthStore((s) => s.hydrateAuth);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    void hydrateAuth();
  }, [hydrateAuth]);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    const onLogout = () => logout();
    window.addEventListener("ifms:auth-logout", onLogout);
    return () => window.removeEventListener("ifms:auth-logout", onLogout);
  }, [logout]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <AuthCacheBoundary />
          <TitleManager />
          <CommandMenu />
          <ToastContainer />
          <AppContent />
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
