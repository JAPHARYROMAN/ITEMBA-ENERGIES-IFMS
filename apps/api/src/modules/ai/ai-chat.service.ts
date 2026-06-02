import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletion,
} from 'groq-sdk/resources/chat/completions';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.module';
import * as Schema from '../../database/schema';
import { extractTenantScope, type TenantScope } from '../../common/helpers/scope.helper';
import type { ChatMessageDto, ConfirmAction, ResponseCardDto } from './dto/chat.dto';
import { ExportsService } from '../exports/exports.service';
import { EmailTransport } from '../notifications/transports/email.transport';
import type { JwtPayloadUser } from '../auth/decorators/current-user.decorator';
import type { ExportType } from '../exports/exports.types';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { ExpensesService } from '../expenses/expenses.service';
import { PaymentsService } from '../credit/payments.service';
import { SalesService } from '../sales/sales.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolContext {
  userId: string;
  email: string;
  permissions: string[];
}

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permission: string;
}

interface TenantScopedColumns {
  companyId?: AnyColumn<{ data: string }>;
  branchId?: AnyColumn<{ data: string }>;
}

interface TenantEntityScope {
  companyId: string;
  branchId?: string;
}

/** Tracks the last AI-assisted write per user for undo support. */
interface LastWrite {
  action: ConfirmAction;
  entityId: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Reusable parameter fragments
// ---------------------------------------------------------------------------

const DATE_RANGE_PROPS = {
  dateFrom: { type: 'string' as const, description: 'Start date (YYYY-MM-DD)' },
  dateTo: { type: 'string' as const, description: 'End date (YYYY-MM-DD)' },
};

const LIMIT_PROP = {
  limit: { type: 'number' as const, description: 'Max rows to return (default 10, max 50)' },
};

const TENANT_FILTER_PROPS = {
  companyId: { type: 'string' as const, description: 'Optional UUID to narrow within your company scope' },
  branchId: { type: 'string' as const, description: 'Optional UUID to narrow within your branch scope' },
};

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS: ToolDef[] = [
  {
    name: 'query_sales_summary',
    description:
      'Query sales transaction totals. Can filter by date range, payment type, and status. Returns total revenue, count, average, and breakdown by payment type.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        ...DATE_RANGE_PROPS,
        paymentType: {
          type: 'string',
          description: 'Filter by payment type (e.g. cash, mobile, card)',
        },
        status: {
          type: 'string',
          description: 'Filter by status (completed, voided, pending_void_approval)',
        },
      },
    },
    permission: 'sales:read',
  },
  {
    name: 'query_inventory_levels',
    description:
      'Query current tank inventory levels. Returns tank code, product, current level, capacity, and percentage filled.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        tankCode: { type: 'string', description: 'Filter by tank code' },
        belowPercent: {
          type: 'number',
          description: 'Only show tanks below this fill percentage (0-100)',
        },
      },
    },
    permission: 'inventory:read',
  },
  {
    name: 'query_shifts',
    description:
      'Query shift data. Can filter by status, date range. Returns shift code, type, start/end time, status, and cash variance.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        ...DATE_RANGE_PROPS,
        status: {
          type: 'string',
          description: 'Filter by status (open, closed, pending_approval, approved)',
        },
        ...LIMIT_PROP,
      },
    },
    permission: 'shifts:read',
  },
  {
    name: 'query_deliveries',
    description:
      'Query fuel deliveries. Can filter by status and date range. Returns delivery note, product, ordered/received quantities, and status.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        ...DATE_RANGE_PROPS,
        status: {
          type: 'string',
          description: 'Filter by status (pending, received, cancelled)',
        },
        ...LIMIT_PROP,
      },
    },
    permission: 'deliveries:read',
  },
  {
    name: 'query_credit_invoices',
    description:
      'Query credit invoices. Can filter by status, date range, and overdue flag. Returns invoice number, customer, total, balance remaining, due date, and status.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        ...DATE_RANGE_PROPS,
        status: { type: 'string', description: 'Filter by status (unpaid, partial, paid)' },
        overdue: {
          type: 'boolean',
          description: 'Only show overdue invoices (due date in the past with balance > 0)',
        },
        ...LIMIT_PROP,
      },
    },
    permission: 'credit:read',
  },
  {
    name: 'query_customers',
    description:
      'Query credit customers. Can filter by status, name search. Returns customer code, name, credit limit, balance, and status.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        search: { type: 'string', description: 'Search customer by name (partial match)' },
        status: { type: 'string', description: 'Filter by status (active, inactive)' },
        ...LIMIT_PROP,
      },
    },
    permission: 'credit:read',
  },
  {
    name: 'query_variances',
    description:
      'Query inventory variances. Can filter by date range and classification. Returns date, tank, volume variance, value variance, and classification.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        ...DATE_RANGE_PROPS,
        classification: {
          type: 'string',
          description:
            'Filter by classification (evaporation, leakage, calibration, theft, unknown)',
        },
        ...LIMIT_PROP,
      },
    },
    permission: 'inventory:read',
  },
  {
    name: 'generate_report',
    description:
      'Generate a report as PDF or CSV for download. Available report types: overview (business overview with KPIs), daily-operations (shift and pump performance), stock-loss (tank losses and shrinkage), profitability (margins and P&L), credit-cashflow (AR/AP aging and cash flow), station-comparison (ranked station performance). Returns a download card when the export is queued.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        reportType: {
          type: 'string',
          description:
            'Report type. One of: overview, daily-operations, stock-loss, profitability, credit-cashflow, station-comparison',
        },
        format: {
          type: 'string',
          description: 'Export format: pdf or csv (default: pdf)',
        },
        ...DATE_RANGE_PROPS,
      },
    },
    permission: 'reports:read',
  },
  {
    name: 'email_report',
    description:
      'Generate a report and email it to a recipient. Same report types as generate_report. The report will be generated and emailed automatically once ready.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        reportType: {
          type: 'string',
          description:
            'Report type. One of: overview, daily-operations, stock-loss, profitability, credit-cashflow, station-comparison',
        },
        format: {
          type: 'string',
          description: 'Export format: pdf or csv (default: pdf)',
        },
        recipientEmail: {
          type: 'string',
          description: 'Email address to send the generated report to',
        },
        ...DATE_RANGE_PROPS,
      },
    },
    permission: 'reports:read',
  },
  // Write tools — return confirmation cards, not direct writes
  {
    name: 'create_delivery',
    description:
      'Create a new fuel delivery order. Extracts delivery details from the user message and returns a confirmation card for the user to review before submitting. Required: branchId, deliveryNote, orderedQty, expectedDate. Optional: vehicleNo, driverName, productId, supplierId.',
    parameters: {
      type: 'object',
      properties: {
        branchId: { type: 'string', description: 'UUID of the branch' },
        deliveryNote: { type: 'string', description: 'Delivery note / reference number' },
        orderedQty: { type: 'number', description: 'Ordered quantity in litres' },
        expectedDate: { type: 'string', description: 'Expected delivery date (YYYY-MM-DD)' },
        vehicleNo: { type: 'string', description: 'Vehicle registration number' },
        driverName: { type: 'string', description: 'Driver name' },
        productId: { type: 'string', description: 'UUID of the product (fuel type)' },
        supplierId: { type: 'string', description: 'UUID of the supplier' },
      },
    },
    permission: 'deliveries:create',
  },
  {
    name: 'create_expense',
    description:
      'Log a new expense entry. Extracts expense details and returns a confirmation card for review. Required: branchId, companyId, category, amount, vendor, paymentMethod. Optional: description, billableDepartment.',
    parameters: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'UUID of the company' },
        branchId: { type: 'string', description: 'UUID of the branch' },
        category: {
          type: 'string',
          description: 'Expense category name (e.g. fuel, utilities, maintenance)',
        },
        amount: { type: 'number', description: 'Expense amount in TZS' },
        vendor: { type: 'string', description: 'Vendor / payee name' },
        paymentMethod: {
          type: 'string',
          description: 'Payment method: petty_cash, bank, cash, card, or other',
        },
        description: { type: 'string', description: 'Description / notes' },
        billableDepartment: { type: 'string', description: 'Department to bill' },
      },
    },
    permission: 'expenses:create',
  },
  {
    name: 'record_payment',
    description:
      'Record a customer payment against their credit invoices. Extracts payment details and returns a confirmation card for review. Required: customerId, amount, method. Optional: paymentDate, referenceNo.',
    parameters: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'UUID of the customer' },
        amount: { type: 'number', description: 'Payment amount in TZS' },
        method: {
          type: 'string',
          description: 'Payment method: cash, card, bank_transfer, mobile_money, or cheque',
        },
        paymentDate: {
          type: 'string',
          description: 'Payment date (YYYY-MM-DD), defaults to today',
        },
        referenceNo: { type: 'string', description: 'Reference / receipt number' },
      },
    },
    permission: 'credit:create',
  },
  {
    name: 'void_sale',
    description:
      'Void / cancel a sales transaction. Requires the transaction ID and a reason for voiding. Returns a confirmation card for the user to review before executing. This reverses the sale and restores stock levels.',
    parameters: {
      type: 'object',
      properties: {
        transactionId: {
          type: 'string',
          description: 'UUID of the sales transaction to void',
        },
        reason: {
          type: 'string',
          description:
            'Reason for voiding the transaction (e.g. customer refund, incorrect entry, duplicate)',
        },
      },
    },
    permission: 'sales:void',
  },
  // Predictive & advisory tools — Phase 4
  {
    name: 'forecast_demand',
    description:
      'Forecast product demand based on historical delivery and sales data. Predicts when a product/tank will need reordering by analyzing consumption rates over the past 30–90 days. Returns estimated days until reorder, projected reorder date, and average daily consumption. All values are ESTIMATES.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        productName: {
          type: 'string',
          description: 'Filter by product name (e.g. diesel, petrol). Partial match supported.',
        },
        daysBack: {
          type: 'number',
          description: 'Number of historical days to analyze (default 60, max 180)',
        },
      },
    },
    permission: 'inventory:read',
  },
  {
    name: 'project_cashflow',
    description:
      'Project cash flow for the next 7–30 days based on recent revenue, expense, and credit payment trends. Returns projected daily inflows, outflows, and net position. All values are ESTIMATES based on historical averages.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        projectionDays: {
          type: 'number',
          description: 'Number of days to project forward (default 14, max 30)',
        },
        daysBack: {
          type: 'number',
          description: 'Number of historical days to base projection on (default 30, max 90)',
        },
      },
    },
    permission: 'sales:read',
  },
  {
    name: 'analyze_pricing',
    description:
      'Analyze pricing performance by product. Shows revenue contribution, sales volume, and average transaction value per product. Helps identify pricing opportunities and underperforming products. ESTIMATE-based advisory.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        ...DATE_RANGE_PROPS,
        productName: {
          type: 'string',
          description: 'Filter by product name (partial match)',
        },
      },
    },
    permission: 'sales:read',
  },
  {
    name: 'recommend_staffing',
    description:
      'Recommend shift staffing levels based on historical sales patterns. Analyzes revenue and transaction volume by shift type (morning, afternoon, night) and day of week to suggest optimal staffing. All recommendations are ESTIMATES.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        daysBack: {
          type: 'number',
          description: 'Number of historical days to analyze (default 30, max 90)',
        },
      },
    },
    permission: 'shifts:read',
  },
  {
    name: 'analyze_trends',
    description:
      'Analyze seasonal and period-over-period trends. Compares current period metrics (sales, expenses, deliveries) against the previous period to identify growth or decline patterns. Returns percentage changes and trend direction. ESTIMATE-based analysis.',
    parameters: {
      type: 'object',
      properties: {
        ...TENANT_FILTER_PROPS,
        metric: {
          type: 'string',
          description:
            'Which metric to analyze: sales, expenses, deliveries, or credit. Default: sales.',
        },
        periodDays: {
          type: 'number',
          description:
            'Period length in days for comparison (default 30 = this month vs last month)',
        },
      },
    },
    permission: 'sales:read',
  },
  // Undo tool — reverts the last AI-assisted write
  {
    name: 'undo_last_write',
    description:
      'Undo / reverse the last AI-assisted write operation (delivery, expense, or payment) for the current user. Only the most recent write can be undone, and only within 10 minutes of creation. Returns a confirmation card so the user can review before undoing.',
    parameters: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description:
            'Set to true to actually undo. The assistant should first explain what will be undone before calling with confirm=true.',
        },
      },
    },
    permission: 'deliveries:create',
  },
];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an intelligent assistant for IFMS (Integrated Fuel Management System), a fuel station management platform used in Tanzania.

Current date: {{currentDate}}
User role: {{userRole}}

Your responsibilities:
- Answer questions about fuel station operations by calling the available tools.
- Always use tools to retrieve data — NEVER fabricate numbers or invent data.
- Format all monetary values in TZS (Tanzanian Shillings) with thousands separators.
- Keep responses concise, professional, and actionable.
- If the user asks for something you don't have a tool for, politely explain what data you can access.
- When presenting tabular data, use markdown tables.
- Highlight anomalies, risks, or anything that needs attention.
- You can generate reports as PDF or CSV. Available report types: overview, daily-operations, stock-loss, profitability, credit-cashflow, station-comparison.
- You can also email reports to any recipient. Always confirm the email address before sending.
- When a report is generated, tell the user it will be ready shortly and they can download it.

Data entry capabilities:
- You can help create deliveries, log expenses, record customer payments, and void sales transactions.
- When the user wants to create/record data, extract all the details from their message and call the appropriate write tool.
- The system will show them a confirmation card with the parsed details so they can review and edit before submitting.
- NEVER execute writes without confirmation — always return a confirmation card first.
- Only use companyId and branchId values that are in the current user's permission scope. If the scoped company or branch is not explicit and cannot be resolved unambiguously, ask the user to specify it.
- If the user says "undo", "reverse", or "that was wrong", use the undo_last_write tool. Only the most recent AI write (within 10 minutes) can be undone.

Predictive & advisory capabilities:
- You can forecast product demand and reorder timing based on historical consumption.
- You can project cash flow for the next 7–30 days based on recent revenue, expenses, and credit payment trends.
- You can analyze pricing performance and revenue breakdown by product and payment type.
- You can recommend shift staffing levels based on historical sales patterns by shift type and day of week.
- You can analyze period-over-period trends for sales, expenses, deliveries, and credit metrics.
- IMPORTANT: All predictive results are ESTIMATES. Always clearly label them as estimates or projections.
- Include confidence levels and disclaimers in your response when presenting predictions.
- Never present estimates as definitive facts. Use language like "based on the last X days", "estimated", "projected".

Multi-language:
- If the user writes in a language other than English, respond in the same language while keeping technical terms (e.g. report names, tool references) in English.
- Default to English when uncertain about the user's language preference.
`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);
  private client: Groq | null = null;
  private model = 'llama-3.1-8b-instant';
  /** Per-user last write tracker for undo support (in-memory, resets on restart). */
  private readonly lastWrites = new Map<string, LastWrite>();

  constructor(
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof Schema>,
    private readonly exportsService: ExportsService,
    private readonly emailTransport: EmailTransport,
    private readonly deliveriesService: DeliveriesService,
    private readonly expensesService: ExpensesService,
    private readonly paymentsService: PaymentsService,
    private readonly salesService: SalesService,
  ) {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (apiKey) {
      this.client = new Groq({ apiKey });
    } else {
      this.logger.warn('GROQ_API_KEY not set — AI chat will be unavailable');
    }
    this.model = this.config.get<string>('GROQ_MODEL') || 'llama-3.1-8b-instant';
  }

  // -------------------------------------------------------------------------
  // Input sanitization — strip prompt injection patterns
  // -------------------------------------------------------------------------

  private sanitizeInput(text: string): string {
    // Strip common prompt-injection patterns (case-insensitive)
    let clean = text
      .replace(
        /\b(ignore|disregard|forget)\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?|context)\b/gi,
        '[filtered]',
      )
      .replace(
        /\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be|new\s+instructions?)\b/gi,
        '[filtered]',
      )
      .replace(/\bsystem\s*:\s*/gi, '')
      .replace(/```\s*(system|prompt|instruction)/gi, '``` $1');

    // Limit length to prevent token-stuffing
    if (clean.length > 4000) {
      clean = clean.slice(0, 4000) + '…';
    }
    return clean.trim();
  }

  // -------------------------------------------------------------------------
  // LLM argument validation helpers
  // -------------------------------------------------------------------------

  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  private static readonly DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  private validateUuid(value: unknown, fieldName: string): string {
    const s = String(value ?? '').trim();
    if (!AiChatService.UUID_RE.test(s)) {
      throw new Error(`Invalid ${fieldName}: expected a UUID, got "${s}"`);
    }
    return s;
  }

  private validateDate(value: unknown, fieldName: string): string {
    const s = String(value ?? '').trim();
    if (!AiChatService.DATE_RE.test(s)) {
      throw new Error(`Invalid ${fieldName}: expected YYYY-MM-DD format, got "${s}"`);
    }
    const d = new Date(s);
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid ${fieldName}: "${s}" is not a valid date`);
    }
    return s;
  }

  private validatePositiveNumber(value: unknown, fieldName: string): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`Invalid ${fieldName}: expected a positive number, got "${value}"`);
    }
    return n;
  }

  private validateOptionalUuid(value: unknown, fieldName: string): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return this.validateUuid(value, fieldName);
  }

  private validateOptionalDate(value: unknown, fieldName: string): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return this.validateDate(value, fieldName);
  }

  private validateString(value: unknown, fieldName: string, maxLen = 500): string {
    const s = String(value ?? '')
      .trim()
      .slice(0, maxLen);
    if (!s) throw new Error(`${fieldName} is required`);
    return s;
  }

  private static readonly TENANT_UUID_RE =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

  private requireTenantScope(context: ToolContext): TenantScope {
    const parsed = extractTenantScope(context.permissions ?? []);
    const scope = {
      companyIds: [...new Set(parsed.companyIds)],
      branchIds: [...new Set(parsed.branchIds)],
    };

    if (scope.companyIds.length === 0 && scope.branchIds.length === 0) {
      throw new ForbiddenException('No company or branch scopes are assigned to this account');
    }

    return scope;
  }

  private validateTenantUuid(value: unknown, fieldName: string): string {
    const s = String(value ?? '').trim();
    if (!AiChatService.TENANT_UUID_RE.test(s)) {
      throw new BadRequestException(`Invalid ${fieldName}: expected a UUID, got "${s}"`);
    }
    return s;
  }

  private validateOptionalTenantUuid(value: unknown, fieldName: string): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    return this.validateTenantUuid(value, fieldName);
  }

  private assertCompanyInScope(companyId: string, scope: TenantScope): void {
    if (scope.companyIds.length === 0 || !scope.companyIds.includes(companyId)) {
      throw new ForbiddenException('Requested company is outside your access scope');
    }
  }

  private assertBranchInScope(branchId: string, scope: TenantScope): void {
    if (scope.branchIds.length === 0 || !scope.branchIds.includes(branchId)) {
      throw new ForbiddenException('Requested branch is outside your access scope');
    }
  }

  private resolveSingleCompanyId(scope: TenantScope): string {
    if (scope.companyIds.length === 1) return scope.companyIds[0];
    throw new BadRequestException(
      'companyId is required because your company scope is ambiguous',
    );
  }

  private resolveSingleBranchId(scope: TenantScope): string {
    if (scope.branchIds.length === 1) return scope.branchIds[0];
    throw new BadRequestException('branchId is required because your branch scope is ambiguous');
  }

  private tenantScopePredicates(
    args: Record<string, unknown> | undefined,
    context: ToolContext,
    columns: TenantScopedColumns,
  ): SQL[] {
    const scope = this.requireTenantScope(context);
    const requestedCompanyId = this.validateOptionalTenantUuid(args?.companyId, 'companyId');
    const requestedBranchId = this.validateOptionalTenantUuid(args?.branchId, 'branchId');
    const predicates: SQL[] = [];

    if (requestedCompanyId) this.assertCompanyInScope(requestedCompanyId, scope);
    if (requestedBranchId) this.assertBranchInScope(requestedBranchId, scope);

    if (columns.companyId) {
      if (requestedCompanyId) predicates.push(eq(columns.companyId, requestedCompanyId));
      else if (scope.companyIds.length > 0) predicates.push(inArray(columns.companyId, scope.companyIds));
    }

    if (columns.branchId) {
      if (requestedBranchId) predicates.push(eq(columns.branchId, requestedBranchId));
      else if (scope.branchIds.length > 0) predicates.push(inArray(columns.branchId, scope.branchIds));
    }

    if (predicates.length === 0) {
      throw new ForbiddenException('Tenant scope cannot be applied to this AI request');
    }

    return predicates;
  }

  private validateTenantReferencesInPayload(payload: unknown, context: ToolContext): void {
    const scope = this.requireTenantScope(context);
    this.walkTenantReferences(payload, 'payload', (field, value, path) => {
      const id = this.validateTenantUuid(value, path);
      if (field === 'companyId') this.assertCompanyInScope(id, scope);
      if (field === 'branchId') this.assertBranchInScope(id, scope);
    });
  }

  private walkTenantReferences(
    value: unknown,
    path: string,
    visit: (field: 'companyId' | 'branchId', value: unknown, path: string) => void,
  ): void {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => this.walkTenantReferences(item, `${path}[${index}]`, visit));
      return;
    }
    if (typeof value !== 'object') return;

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (key === 'companyId' || key === 'branchId') {
        if (child === undefined || child === null || child === '') continue;
        visit(key, child, childPath);
      }
      this.walkTenantReferences(child, childPath, visit);
    }
  }

  private async getAllowedBranchScope(
    branchId: string,
    context: ToolContext,
  ): Promise<Required<TenantEntityScope>> {
    const scope = this.requireTenantScope(context);
    this.assertBranchInScope(branchId, scope);

    const [branch] = await this.db
      .select({ id: Schema.branches.id, companyId: Schema.branches.companyId })
      .from(Schema.branches)
      .where(and(eq(Schema.branches.id, branchId), isNull(Schema.branches.deletedAt)))
      .limit(1);

    if (!branch) throw new BadRequestException('Branch not found');
    if (scope.companyIds.length > 0) this.assertCompanyInScope(branch.companyId, scope);
    return { companyId: branch.companyId, branchId: branch.id };
  }

  private async getAllowedCustomerScope(
    customerId: string,
    context: ToolContext,
  ): Promise<Required<TenantEntityScope>> {
    const [customer] = await this.db
      .select({
        companyId: Schema.customers.companyId,
        branchId: Schema.customers.branchId,
      })
      .from(Schema.customers)
      .where(and(eq(Schema.customers.id, customerId), isNull(Schema.customers.deletedAt)))
      .limit(1);

    if (!customer) throw new BadRequestException('Customer not found');
    this.assertEntityTenantScope(customer, context, 'Customer');
    return customer;
  }

  private async getAllowedSaleScope(
    transactionId: string,
    context: ToolContext,
  ): Promise<Required<TenantEntityScope>> {
    const [sale] = await this.db
      .select({
        companyId: Schema.salesTransactions.companyId,
        branchId: Schema.salesTransactions.branchId,
      })
      .from(Schema.salesTransactions)
      .where(
        and(eq(Schema.salesTransactions.id, transactionId), isNull(Schema.salesTransactions.deletedAt)),
      )
      .limit(1);

    if (!sale) throw new BadRequestException('Sale transaction not found');
    this.assertEntityTenantScope(sale, context, 'Sale transaction');
    return sale;
  }

  private async assertProductScope(
    productId: string | undefined,
    context: ToolContext,
    expectedCompanyId?: string,
  ): Promise<void> {
    if (!productId) return;

    const [product] = await this.db
      .select({ companyId: Schema.products.companyId })
      .from(Schema.products)
      .where(and(eq(Schema.products.id, productId), isNull(Schema.products.deletedAt)))
      .limit(1);

    if (!product) throw new BadRequestException('Product not found');
    this.assertEntityTenantScope({ companyId: product.companyId }, context, 'Product');
    if (expectedCompanyId && product.companyId !== expectedCompanyId) {
      throw new ForbiddenException('Product is outside the selected company scope');
    }
  }

  private async assertSupplierScope(
    supplierId: string | undefined,
    context: ToolContext,
    expectedCompanyId?: string,
  ): Promise<void> {
    if (!supplierId) return;

    const [supplier] = await this.db
      .select({ companyId: Schema.suppliers.companyId })
      .from(Schema.suppliers)
      .where(and(eq(Schema.suppliers.id, supplierId), isNull(Schema.suppliers.deletedAt)))
      .limit(1);

    if (!supplier) throw new BadRequestException('Supplier not found');
    this.assertEntityTenantScope({ companyId: supplier.companyId }, context, 'Supplier');
    if (expectedCompanyId && supplier.companyId !== expectedCompanyId) {
      throw new ForbiddenException('Supplier is outside the selected company scope');
    }
  }

  private assertEntityTenantScope(
    entityScope: TenantEntityScope,
    context: ToolContext,
    label: string,
  ): void {
    const scope = this.requireTenantScope(context);
    this.assertCompanyInScope(entityScope.companyId, scope);
    if (entityScope.branchId) this.assertBranchInScope(entityScope.branchId, scope);
    if (!entityScope.branchId && scope.companyIds.length === 0) {
      throw new ForbiddenException(`${label} tenant scope cannot be verified`);
    }
  }

  // -------------------------------------------------------------------------
  // Token budget management — trim & summarise old history
  // -------------------------------------------------------------------------

  private static readonly MAX_HISTORY_MESSAGES = 20;
  private static readonly MAX_HISTORY_CHARS = 24_000; // ~6k tokens

  private trimHistory(history: ChatMessageDto[]): ChatMessageDto[] {
    if (!history || history.length === 0) return [];

    // Hard cap on message count
    let trimmed = history.slice(-AiChatService.MAX_HISTORY_MESSAGES);

    // Check total character budget
    let totalChars = trimmed.reduce((sum, m) => sum + m.content.length, 0);
    if (totalChars <= AiChatService.MAX_HISTORY_CHARS) return trimmed;

    // Evict oldest messages until within budget, prepend a summary note
    const evicted: string[] = [];
    while (totalChars > AiChatService.MAX_HISTORY_CHARS && trimmed.length > 2) {
      const removed = trimmed.shift()!;
      totalChars -= removed.content.length;
      evicted.push(`[${removed.role}]: ${removed.content.slice(0, 80)}…`);
    }

    if (evicted.length > 0) {
      const summaryNote: ChatMessageDto = {
        role: 'assistant',
        content: `[Earlier conversation summarised — ${evicted.length} messages trimmed. Key topics discussed: ${evicted.slice(0, 3).join('; ')}]`,
      };
      trimmed = [summaryNote, ...trimmed];
    }

    return trimmed;
  }

  // -------------------------------------------------------------------------
  // Smart tool selection — reduces token overhead per request
  // -------------------------------------------------------------------------

  private static readonly TOOL_KEYWORDS: Record<string, string[]> = {
    query_sales_summary: ['sales', 'revenue', 'transaction', 'income', 'pos'],
    query_inventory_levels: ['tank', 'inventory', 'stock', 'level', 'fuel', 'capacity'],
    query_shifts: ['shift', 'staff', 'open', 'close', 'approve'],
    query_deliveries: ['deliver', 'supply', 'order', 'receive', 'grn'],
    query_credit_invoices: ['invoice', 'credit', 'overdue', 'unpaid', 'owing'],
    query_customers: ['customer', 'client', 'debtor', 'account'],
    query_variances: ['variance', 'loss', 'shrinkage', 'discrepancy', 'leak'],
    generate_report: ['report', 'pdf', 'csv', 'export', 'download'],
    email_report: ['email', 'send', 'report'],
    create_delivery: ['create delivery', 'new delivery', 'order fuel'],
    create_expense: ['log expense', 'new expense', 'create expense', 'record expense'],
    record_payment: ['payment', 'pay', 'receipt', 'settle'],
    void_sale: ['void', 'cancel', 'reverse', 'refund'],
    forecast_demand: ['forecast', 'predict', 'reorder', 'demand', 'consumption'],
    project_cashflow: ['cashflow', 'cash flow', 'projection', 'project'],
    analyze_pricing: ['pricing', 'price', 'margin', 'profit'],
    recommend_staffing: ['staffing', 'staff', 'schedule', 'recommend'],
    analyze_trends: ['trend', 'growth', 'compare', 'seasonal', 'decline'],
    undo_last_write: ['undo', 'reverse', 'revert'],
  };

  private static readonly PAGE_TOOLS: Record<string, string[]> = {
    dashboard: [
      'query_sales_summary',
      'query_inventory_levels',
      'query_shifts',
      'generate_report',
      'forecast_demand',
      'project_cashflow',
      'analyze_trends',
    ],
    sales: [
      'query_sales_summary',
      'query_customers',
      'void_sale',
      'record_payment',
      'generate_report',
    ],
    inventory: ['query_inventory_levels', 'query_variances', 'query_deliveries', 'forecast_demand'],
    deliveries: ['query_deliveries', 'create_delivery', 'query_inventory_levels'],
    shifts: ['query_shifts', 'recommend_staffing'],
    credit: ['query_credit_invoices', 'query_customers', 'record_payment'],
    customers: ['query_customers', 'query_credit_invoices', 'record_payment'],
    expenses: ['create_expense', 'generate_report'],
    reports: ['generate_report', 'email_report', 'analyze_trends', 'analyze_pricing'],
  };

  private static readonly MAX_TOOLS_PER_REQUEST = 10;

  private selectTools(permittedTools: ToolDef[], message: string, pageContext?: string): ToolDef[] {
    if (permittedTools.length <= AiChatService.MAX_TOOLS_PER_REQUEST) return permittedTools;

    const scores = new Map<string, number>();
    for (const t of permittedTools) scores.set(t.name, 0);

    // Boost tools matching page context
    if (pageContext) {
      const page = pageContext.replace(/^\//, '').split('/')[0] || 'dashboard';
      const pageTools = AiChatService.PAGE_TOOLS[page];
      if (pageTools) {
        for (const name of pageTools) {
          if (scores.has(name)) scores.set(name, (scores.get(name) ?? 0) + 5);
        }
      }
    }

    // Boost tools matching message keywords
    const lower = message.toLowerCase();
    for (const [toolName, keywords] of Object.entries(AiChatService.TOOL_KEYWORDS)) {
      if (!scores.has(toolName)) continue;
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          scores.set(toolName, (scores.get(toolName) ?? 0) + 3);
          break;
        }
      }
    }

    // Always include undo if it's permitted
    if (scores.has('undo_last_write'))
      scores.set('undo_last_write', (scores.get('undo_last_write') ?? 0) + 1);

    // Sort by score descending, take top N
    const sorted = permittedTools
      .slice()
      .sort((a, b) => (scores.get(b.name) ?? 0) - (scores.get(a.name) ?? 0));

    return sorted.slice(0, AiChatService.MAX_TOOLS_PER_REQUEST);
  }

  // -------------------------------------------------------------------------
  // chat
  // -------------------------------------------------------------------------

  async chat(
    message: string,
    history: ChatMessageDto[],
    context: ToolContext,
    pageContext?: string,
  ): Promise<ChatMessageDto> {
    if (!this.client) {
      return {
        role: 'assistant',
        content: 'AI chat is unavailable — GROQ_API_KEY not configured.',
      };
    }

    // 0. Sanitize user input
    const sanitizedMessage = this.sanitizeInput(message);

    // 1. Filter tools by user permissions + page context (reduces token overhead)
    const allowedTools = this.selectTools(
      TOOL_DEFINITIONS.filter((t) => context.permissions.includes(t.permission)),
      sanitizedMessage,
      pageContext,
    );

    const groqTools: ChatCompletionTool[] | undefined =
      allowedTools.length > 0
        ? allowedTools.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          }))
        : undefined;

    // 2. Build system prompt
    const userRole = this.inferRole(context.permissions);
    const systemPrompt = SYSTEM_PROMPT.replace(
      '{{currentDate}}',
      new Date().toISOString().slice(0, 10),
    ).replace('{{userRole}}', userRole);

    // 3. Convert history to Groq messages format (with token budget management)
    const trimmedHistory = this.trimHistory(history);
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...trimmedHistory.map(
        (m) =>
          ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          }) as ChatCompletionMessageParam,
      ),
      {
        role: 'user',
        content: pageContext
          ? `[Page context: ${pageContext}]\n${sanitizedMessage}`
          : sanitizedMessage,
      },
    ];

    try {
      // 4. Call Groq (with retry on rate-limit)
      const groqCall = async (
        opts: Parameters<typeof this.client.chat.completions.create>[0],
        retries = 2,
      ): Promise<ChatCompletion> => {
        for (let attempt = 0; ; attempt++) {
          try {
            return (await this.client!.chat.completions.create(opts)) as ChatCompletion;
          } catch (e: unknown) {
            const status = (e as { status?: number }).status;
            const msg = (e as Error).message ?? '';
            const isRateLimit =
              status === 429 || msg.includes('rate_limit') || msg.includes('Rate limit');
            if (isRateLimit && attempt < retries) {
              const wait = (attempt + 1) * 2000; // 2s, 4s
              this.logger.warn(
                `Groq rate-limited, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`,
              );
              await new Promise((r) => setTimeout(r, wait));
              continue;
            }
            throw e;
          }
        }
      };

      const response = await groqCall({
        model: this.model,
        messages,
        tools: groqTools,
        tool_choice: groqTools ? 'auto' : undefined,
        temperature: 0.3,
        max_tokens: 4096,
      });

      const choice = response.choices[0];
      const toolCalls = choice?.message?.tool_calls;

      // 5. Check for function call
      if (toolCalls && toolCalls.length > 0) {
        const toolCall = toolCalls[0];
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');
        this.logger.debug(`Function call: ${name}(${JSON.stringify(args)})`);

        const toolResult = await this.executeTool(name, args as Record<string, unknown>, context);

        // Send tool result back to Groq for a natural language response
        const followUpMessages: ChatCompletionMessageParam[] = [
          ...messages,
          {
            role: 'assistant',
            tool_calls: [toolCall],
          },
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          },
        ];

        const followUp = await groqCall({
          model: this.model,
          messages: followUpMessages,
          temperature: 0.3,
          max_tokens: 4096,
        });

        const text =
          followUp.choices[0]?.message?.content ??
          'I retrieved the data but could not generate a summary.';

        const cards: ResponseCardDto[] = [];
        const isWriteTool = AiChatService.WRITE_TOOLS.includes(name);
        const isForecastTool = AiChatService.FORECAST_TOOLS.includes(name);
        if (isWriteTool && toolResult.action) {
          cards.push({ type: 'confirmation', title: name, content: toolResult });
        } else if (name === 'generate_report' || name === 'email_report') {
          cards.push({ type: 'download', title: name, content: toolResult });
        } else if (isForecastTool) {
          cards.push({ type: 'forecast', title: name, content: toolResult });
        } else if (Array.isArray(toolResult.rows)) {
          cards.push({ type: 'table', title: name, content: toolResult.rows });
        } else {
          cards.push({ type: 'data', title: name, content: toolResult });
        }

        return { role: 'assistant', content: text, cards };
      }

      // No function call — plain text response
      const text = choice?.message?.content ?? 'I could not generate a response. Please try again.';
      return { role: 'assistant', content: text };
    } catch (err) {
      this.logger.error('AI chat error', (err as Error).stack);

      const errMsg = (err as Error).message ?? '';
      const errStatus = (err as { status?: number }).status;
      if (
        errStatus === 429 ||
        errMsg.includes('429') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.includes('quota') ||
        errMsg.includes('rate_limit') ||
        errMsg.toLowerCase().includes('rate limit')
      ) {
        return {
          role: 'assistant',
          content:
            'The AI service is temporarily rate-limited. Please wait a minute and try again.',
        };
      }

      return {
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request. Please try again.',
      };
    }
  }

  // -------------------------------------------------------------------------
  // getProactiveInsights
  // -------------------------------------------------------------------------

  async getProactiveInsights(context: ToolContext): Promise<ResponseCardDto[]> {
    this.requireTenantScope(context);

    const cards: ResponseCardDto[] = [];

    try {
      // Low tank alerts (<20% capacity)
      if (context.permissions.includes('inventory:read')) {
        const lowTanks = await this.db
          .select({
            code: Schema.tanks.code,
            currentLevel: Schema.tanks.currentLevel,
            capacity: Schema.tanks.capacity,
          })
          .from(Schema.tanks)
          .where(
            and(
              isNull(Schema.tanks.deletedAt),
              ...this.tenantScopePredicates(undefined, context, {
                companyId: Schema.tanks.companyId,
                branchId: Schema.tanks.branchId,
              }),
              sql`(${Schema.tanks.currentLevel}::numeric / NULLIF(${Schema.tanks.capacity}::numeric, 0)) < 0.2`,
            ),
          );

        if (lowTanks.length > 0) {
          cards.push({
            type: 'alert',
            title: 'Low Tank Levels',
            content: lowTanks.map((t) => ({
              tank: t.code,
              currentLevel: Number(t.currentLevel),
              capacity: Number(t.capacity),
              percentFull: Math.round((Number(t.currentLevel) / Number(t.capacity)) * 100),
            })),
          });
        }
      }

      // Overdue shifts (open > 12 hours)
      if (context.permissions.includes('shifts:read')) {
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        const overdueShifts = await this.db
          .select({
            code: Schema.shifts.code,
            type: Schema.shifts.type,
            startTime: Schema.shifts.startTime,
            status: Schema.shifts.status,
          })
          .from(Schema.shifts)
          .where(
            and(
              isNull(Schema.shifts.deletedAt),
              ...this.tenantScopePredicates(undefined, context, {
                companyId: Schema.shifts.companyId,
                branchId: Schema.shifts.branchId,
              }),
              eq(Schema.shifts.status, 'open'),
              lte(Schema.shifts.startTime, twelveHoursAgo),
            ),
          );

        if (overdueShifts.length > 0) {
          cards.push({
            type: 'alert',
            title: 'Overdue Open Shifts',
            content: overdueShifts.map((s) => ({
              shift: s.code,
              type: s.type,
              openSince: s.startTime,
              hoursOpen: Math.round((Date.now() - new Date(s.startTime).getTime()) / 3_600_000),
            })),
          });
        }
      }

      // Unusual sales spike (today vs 30-day avg, threshold ≥40%)
      if (context.permissions.includes('sales:read')) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

        const [todaySales] = await this.db
          .select({
            total: sql<string>`COALESCE(SUM(${Schema.salesTransactions.totalAmount}::numeric), 0)`,
          })
          .from(Schema.salesTransactions)
          .where(
            and(
              isNull(Schema.salesTransactions.deletedAt),
              ...this.tenantScopePredicates(undefined, context, {
                companyId: Schema.salesTransactions.companyId,
                branchId: Schema.salesTransactions.branchId,
              }),
              eq(Schema.salesTransactions.status, 'completed'),
              gte(Schema.salesTransactions.transactionDate, todayStart),
            ),
          );

        const [avgSales] = await this.db
          .select({
            avgDaily: sql<string>`COALESCE(SUM(${Schema.salesTransactions.totalAmount}::numeric) / NULLIF(COUNT(DISTINCT DATE(${Schema.salesTransactions.transactionDate})), 0), 0)`,
          })
          .from(Schema.salesTransactions)
          .where(
            and(
              isNull(Schema.salesTransactions.deletedAt),
              ...this.tenantScopePredicates(undefined, context, {
                companyId: Schema.salesTransactions.companyId,
                branchId: Schema.salesTransactions.branchId,
              }),
              eq(Schema.salesTransactions.status, 'completed'),
              gte(Schema.salesTransactions.transactionDate, thirtyDaysAgo),
              lte(Schema.salesTransactions.transactionDate, todayStart),
            ),
          );

        const todayTotal = Number(todaySales?.total ?? 0);
        const dailyAvg = Number(avgSales?.avgDaily ?? 0);
        if (dailyAvg > 0 && todayTotal >= dailyAvg * 1.4) {
          const spikePercent = Math.round(((todayTotal - dailyAvg) / dailyAvg) * 100);
          cards.push({
            type: 'alert',
            title: 'Unusual Sales Spike',
            content: {
              todayRevenue: todayTotal,
              thirtyDayAvg: Math.round(dailyAvg),
              spikePercent,
              message: `Today's sales are ${spikePercent}% above the 30-day daily average.`,
            },
          });
        }
      }

      // Credit customers near limit (balance ≥90% of creditLimit)
      if (context.permissions.includes('credit:read')) {
        const nearLimitCustomers = await this.db
          .select({
            code: Schema.customers.code,
            name: Schema.customers.name,
            creditLimit: Schema.customers.creditLimit,
            balance: Schema.customers.balance,
          })
          .from(Schema.customers)
          .where(
            and(
              isNull(Schema.customers.deletedAt),
              ...this.tenantScopePredicates(undefined, context, {
                companyId: Schema.customers.companyId,
                branchId: Schema.customers.branchId,
              }),
              eq(Schema.customers.status, 'active'),
              sql`${Schema.customers.creditLimit}::numeric > 0`,
              sql`(${Schema.customers.balance}::numeric / NULLIF(${Schema.customers.creditLimit}::numeric, 0)) >= 0.9`,
            ),
          );

        if (nearLimitCustomers.length > 0) {
          cards.push({
            type: 'alert',
            title: 'Credit Customers Near Limit',
            content: nearLimitCustomers.map((c) => ({
              code: c.code,
              name: c.name,
              creditLimit: Number(c.creditLimit),
              balance: Number(c.balance),
              utilization: Math.round((Number(c.balance) / Number(c.creditLimit)) * 100),
            })),
          });
        }
      }

      // Expense anomaly (current month category vs prior month avg, threshold ≥3×)
      if (context.permissions.includes('expenses:read')) {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const priorMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const currentExpenses = await this.db
          .select({
            category: Schema.expenseEntries.category,
            total: sql<string>`COALESCE(SUM(${Schema.expenseEntries.amount}::numeric), 0)`,
          })
          .from(Schema.expenseEntries)
          .where(
            and(
              isNull(Schema.expenseEntries.deletedAt),
              ...this.tenantScopePredicates(undefined, context, {
                companyId: Schema.expenseEntries.companyId,
                branchId: Schema.expenseEntries.branchId,
              }),
              gte(Schema.expenseEntries.createdAt, currentMonthStart),
            ),
          )
          .groupBy(Schema.expenseEntries.category);

        const priorExpenses = await this.db
          .select({
            category: Schema.expenseEntries.category,
            total: sql<string>`COALESCE(SUM(${Schema.expenseEntries.amount}::numeric), 0)`,
          })
          .from(Schema.expenseEntries)
          .where(
            and(
              isNull(Schema.expenseEntries.deletedAt),
              ...this.tenantScopePredicates(undefined, context, {
                companyId: Schema.expenseEntries.companyId,
                branchId: Schema.expenseEntries.branchId,
              }),
              gte(Schema.expenseEntries.createdAt, priorMonthStart),
              lte(Schema.expenseEntries.createdAt, currentMonthStart),
            ),
          )
          .groupBy(Schema.expenseEntries.category);

        const priorMap = new Map(priorExpenses.map((e) => [e.category, Number(e.total)]));
        const anomalies = currentExpenses
          .map((e) => {
            const prior = priorMap.get(e.category) ?? 0;
            const current = Number(e.total);
            return {
              category: e.category,
              currentMonth: current,
              priorMonth: prior,
              multiplier: prior > 0 ? Math.round((current / prior) * 10) / 10 : null,
            };
          })
          .filter((a) => a.multiplier !== null && a.multiplier >= 3);

        if (anomalies.length > 0) {
          cards.push({
            type: 'alert',
            title: 'Expense Anomalies',
            content: anomalies.map((a) => ({
              ...a,
              message: `${a.category} spending is ${a.multiplier}× the prior month.`,
            })),
          });
        }
      }
    } catch (err) {
      this.logger.error('Proactive insights error', (err as Error).stack);
    }

    return cards;
  }

  // -------------------------------------------------------------------------
  // executeTool router
  // -------------------------------------------------------------------------

  private static readonly WRITE_TOOLS = [
    'create_delivery',
    'create_expense',
    'record_payment',
    'void_sale',
  ];

  private static readonly FORECAST_TOOLS = [
    'forecast_demand',
    'project_cashflow',
    'analyze_pricing',
    'recommend_staffing',
    'analyze_trends',
  ];

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    switch (name) {
      case 'query_sales_summary':
        return this.querySalesSummary(args, context);
      case 'query_inventory_levels':
        return this.queryInventoryLevels(args, context);
      case 'query_shifts':
        return this.queryShifts(args, context);
      case 'query_deliveries':
        return this.queryDeliveries(args, context);
      case 'query_credit_invoices':
        return this.queryCreditInvoices(args, context);
      case 'query_customers':
        return this.queryCustomers(args, context);
      case 'query_variances':
        return this.queryVariances(args, context);
      case 'generate_report':
        return this.generateReport(args, context);
      case 'email_report':
        return this.emailReport(args, context);
      case 'create_delivery':
        return this.prepareConfirmation('create_delivery', args, context);
      case 'create_expense':
        return this.prepareConfirmation('create_expense', args, context);
      case 'record_payment':
        return this.prepareConfirmation('record_payment', args, context);
      case 'void_sale':
        return this.prepareConfirmation('void_sale', args, context);
      case 'forecast_demand':
        return this.forecastDemand(args, context);
      case 'project_cashflow':
        return this.projectCashflow(args, context);
      case 'analyze_pricing':
        return this.analyzePricing(args, context);
      case 'recommend_staffing':
        return this.recommendStaffing(args, context);
      case 'analyze_trends':
        return this.analyzeTrends(args, context);
      case 'undo_last_write':
        return this.undoLastWrite(args, context);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  // -------------------------------------------------------------------------
  // Query helpers
  // -------------------------------------------------------------------------

  private async querySalesSummary(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const conditions: SQL[] = [
      isNull(Schema.salesTransactions.deletedAt),
      ...this.tenantScopePredicates(args, context, {
        companyId: Schema.salesTransactions.companyId,
        branchId: Schema.salesTransactions.branchId,
      }),
    ];

    if (args.dateFrom) {
      conditions.push(
        gte(Schema.salesTransactions.transactionDate, new Date(args.dateFrom as string)),
      );
    }
    if (args.dateTo) {
      const to = new Date(args.dateTo as string);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(Schema.salesTransactions.transactionDate, to));
    }
    if (args.paymentType) {
      conditions.push(eq(Schema.salesTransactions.paymentType, args.paymentType as string));
    }
    if (args.status) {
      conditions.push(eq(Schema.salesTransactions.status, args.status as string));
    }

    const summary = await this.db
      .select({
        totalRevenue: sql<string>`COALESCE(SUM(${Schema.salesTransactions.totalAmount}::numeric), 0)`,
        transactionCount: count(Schema.salesTransactions.id),
        avgTransaction: sql<string>`COALESCE(AVG(${Schema.salesTransactions.totalAmount}::numeric), 0)`,
      })
      .from(Schema.salesTransactions)
      .where(and(...conditions));

    const byPaymentType = await this.db
      .select({
        paymentType: Schema.salesTransactions.paymentType,
        total: sql<string>`SUM(${Schema.salesTransactions.totalAmount}::numeric)`,
        txCount: count(Schema.salesTransactions.id),
      })
      .from(Schema.salesTransactions)
      .where(and(...conditions))
      .groupBy(Schema.salesTransactions.paymentType);

    const row = summary[0];
    return {
      totalRevenue: Number(row?.totalRevenue ?? 0),
      transactionCount: Number(row?.transactionCount ?? 0),
      averageTransaction: Number(Number(row?.avgTransaction ?? 0).toFixed(2)),
      byPaymentType: byPaymentType.map((r) => ({
        paymentType: r.paymentType,
        total: Number(r.total),
        count: Number(r.txCount),
      })),
    };
  }

  private async queryInventoryLevels(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const conditions: SQL[] = [
      isNull(Schema.tanks.deletedAt),
      ...this.tenantScopePredicates(args, context, {
        companyId: Schema.tanks.companyId,
        branchId: Schema.tanks.branchId,
      }),
    ];

    if (args.tankCode) {
      conditions.push(eq(Schema.tanks.code, args.tankCode as string));
    }

    const rows = await this.db
      .select({
        code: Schema.tanks.code,
        productName: Schema.products.name,
        currentLevel: Schema.tanks.currentLevel,
        capacity: Schema.tanks.capacity,
        minLevel: Schema.tanks.minLevel,
        status: Schema.tanks.status,
      })
      .from(Schema.tanks)
      .leftJoin(Schema.products, eq(Schema.tanks.productId, Schema.products.id))
      .where(and(...conditions));

    let result = rows.map((r) => ({
      tankCode: r.code,
      product: r.productName,
      currentLevel: Number(r.currentLevel),
      capacity: Number(r.capacity),
      minLevel: Number(r.minLevel),
      percentFull: Math.round((Number(r.currentLevel) / Number(r.capacity)) * 100),
      status: r.status,
    }));

    if (args.belowPercent) {
      const threshold = Number(args.belowPercent);
      result = result.filter((r) => r.percentFull < threshold);
    }

    return { rows: result };
  }

  private async queryShifts(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const limit = Math.min(Number(args.limit) || 10, 50);
    const conditions: SQL[] = [
      isNull(Schema.shifts.deletedAt),
      ...this.tenantScopePredicates(args, context, {
        companyId: Schema.shifts.companyId,
        branchId: Schema.shifts.branchId,
      }),
    ];

    if (args.dateFrom) {
      conditions.push(gte(Schema.shifts.startTime, new Date(args.dateFrom as string)));
    }
    if (args.dateTo) {
      const to = new Date(args.dateTo as string);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(Schema.shifts.startTime, to));
    }
    if (args.status) {
      conditions.push(eq(Schema.shifts.status, args.status as string));
    }

    const rows = await this.db
      .select({
        code: Schema.shifts.code,
        type: Schema.shifts.type,
        startTime: Schema.shifts.startTime,
        endTime: Schema.shifts.endTime,
        status: Schema.shifts.status,
        totalExpectedAmount: Schema.shifts.totalExpectedAmount,
        totalCollectedAmount: Schema.shifts.totalCollectedAmount,
        varianceAmount: Schema.shifts.varianceAmount,
      })
      .from(Schema.shifts)
      .where(and(...conditions))
      .orderBy(desc(Schema.shifts.startTime))
      .limit(limit);

    return {
      rows: rows.map((r) => ({
        code: r.code,
        type: r.type,
        startTime: r.startTime,
        endTime: r.endTime,
        status: r.status,
        expectedAmount: Number(r.totalExpectedAmount ?? 0),
        collectedAmount: Number(r.totalCollectedAmount ?? 0),
        variance: Number(r.varianceAmount ?? 0),
      })),
    };
  }

  private async queryDeliveries(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const limit = Math.min(Number(args.limit) || 10, 50);
    const conditions: SQL[] = [
      isNull(Schema.deliveries.deletedAt),
      ...this.tenantScopePredicates(args, context, {
        companyId: Schema.deliveries.companyId,
        branchId: Schema.deliveries.branchId,
      }),
    ];

    if (args.dateFrom) {
      conditions.push(gte(Schema.deliveries.createdAt, new Date(args.dateFrom as string)));
    }
    if (args.dateTo) {
      const to = new Date(args.dateTo as string);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(Schema.deliveries.createdAt, to));
    }
    if (args.status) {
      conditions.push(eq(Schema.deliveries.status, args.status as string));
    }

    const rows = await this.db
      .select({
        deliveryNote: Schema.deliveries.deliveryNote,
        productName: Schema.products.name,
        orderedQty: Schema.deliveries.orderedQty,
        receivedQty: Schema.deliveries.receivedQty,
        status: Schema.deliveries.status,
        expectedDate: Schema.deliveries.expectedDate,
      })
      .from(Schema.deliveries)
      .leftJoin(Schema.products, eq(Schema.deliveries.productId, Schema.products.id))
      .where(and(...conditions))
      .orderBy(desc(Schema.deliveries.createdAt))
      .limit(limit);

    return {
      rows: rows.map((r) => ({
        deliveryNote: r.deliveryNote,
        product: r.productName,
        orderedQty: Number(r.orderedQty),
        receivedQty: r.receivedQty ? Number(r.receivedQty) : null,
        status: r.status,
        expectedDate: r.expectedDate,
      })),
    };
  }

  private async queryCreditInvoices(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const limit = Math.min(Number(args.limit) || 10, 50);
    const conditions: SQL[] = [
      isNull(Schema.creditInvoices.deletedAt),
      ...this.tenantScopePredicates(args, context, {
        companyId: Schema.creditInvoices.companyId,
        branchId: Schema.creditInvoices.branchId,
      }),
    ];

    if (args.dateFrom) {
      conditions.push(gte(Schema.creditInvoices.invoiceDate, new Date(args.dateFrom as string)));
    }
    if (args.dateTo) {
      const to = new Date(args.dateTo as string);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(Schema.creditInvoices.invoiceDate, to));
    }
    if (args.status) {
      conditions.push(eq(Schema.creditInvoices.status, args.status as string));
    }
    if (args.overdue) {
      conditions.push(lte(Schema.creditInvoices.dueDate, new Date()));
      conditions.push(sql`${Schema.creditInvoices.balanceRemaining}::numeric > 0`);
    }

    const rows = await this.db
      .select({
        invoiceNumber: Schema.creditInvoices.invoiceNumber,
        customerName: Schema.customers.name,
        totalAmount: Schema.creditInvoices.totalAmount,
        balanceRemaining: Schema.creditInvoices.balanceRemaining,
        dueDate: Schema.creditInvoices.dueDate,
        status: Schema.creditInvoices.status,
      })
      .from(Schema.creditInvoices)
      .leftJoin(Schema.customers, eq(Schema.creditInvoices.customerId, Schema.customers.id))
      .where(and(...conditions))
      .orderBy(desc(Schema.creditInvoices.invoiceDate))
      .limit(limit);

    return {
      rows: rows.map((r) => ({
        invoiceNumber: r.invoiceNumber,
        customer: r.customerName,
        totalAmount: Number(r.totalAmount),
        balanceRemaining: Number(r.balanceRemaining),
        dueDate: r.dueDate,
        status: r.status,
      })),
    };
  }

  private async queryCustomers(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const limit = Math.min(Number(args.limit) || 10, 50);
    const conditions: SQL[] = [
      isNull(Schema.customers.deletedAt),
      ...this.tenantScopePredicates(args, context, {
        companyId: Schema.customers.companyId,
        branchId: Schema.customers.branchId,
      }),
    ];

    if (args.search) {
      conditions.push(ilike(Schema.customers.name, `%${args.search}%`));
    }
    if (args.status) {
      conditions.push(eq(Schema.customers.status, args.status as string));
    }

    const rows = await this.db
      .select({
        code: Schema.customers.code,
        name: Schema.customers.name,
        creditLimit: Schema.customers.creditLimit,
        balance: Schema.customers.balance,
        status: Schema.customers.status,
      })
      .from(Schema.customers)
      .where(and(...conditions))
      .orderBy(Schema.customers.name)
      .limit(limit);

    return {
      rows: rows.map((r) => ({
        code: r.code,
        name: r.name,
        creditLimit: Number(r.creditLimit),
        balance: Number(r.balance),
        utilization: r.creditLimit
          ? Math.round((Number(r.balance) / Number(r.creditLimit)) * 100)
          : 0,
        status: r.status,
      })),
    };
  }

  private async queryVariances(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const limit = Math.min(Number(args.limit) || 10, 50);
    const conditions: SQL[] = [
      isNull(Schema.variances.deletedAt),
      ...this.tenantScopePredicates(args, context, {
        companyId: Schema.variances.companyId,
        branchId: Schema.variances.branchId,
      }),
    ];

    if (args.dateFrom) {
      conditions.push(gte(Schema.variances.varianceDate, new Date(args.dateFrom as string)));
    }
    if (args.dateTo) {
      const to = new Date(args.dateTo as string);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(Schema.variances.varianceDate, to));
    }
    if (args.classification) {
      conditions.push(eq(Schema.variances.classification, args.classification as string));
    }

    const rows = await this.db
      .select({
        varianceDate: Schema.variances.varianceDate,
        tankCode: Schema.tanks.code,
        volumeVariance: Schema.variances.volumeVariance,
        valueVariance: Schema.variances.valueVariance,
        classification: Schema.variances.classification,
      })
      .from(Schema.variances)
      .leftJoin(Schema.tanks, eq(Schema.variances.tankId, Schema.tanks.id))
      .where(and(...conditions))
      .orderBy(desc(Schema.variances.varianceDate))
      .limit(limit);

    return {
      rows: rows.map((r) => ({
        date: r.varianceDate,
        tank: r.tankCode,
        volumeVariance: Number(r.volumeVariance),
        valueVariance: r.valueVariance ? Number(r.valueVariance) : null,
        classification: r.classification,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Report generation helpers
  // -------------------------------------------------------------------------

  private static readonly VALID_REPORT_TYPES = [
    'overview',
    'daily-operations',
    'stock-loss',
    'profitability',
    'credit-cashflow',
    'station-comparison',
  ] as const;

  private async generateReport(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const reportType = args.reportType as string | undefined;
    const format = ((args.format as string) || 'pdf').toLowerCase();

    if (!reportType || !AiChatService.VALID_REPORT_TYPES.includes(reportType as any)) {
      return {
        error: `Invalid report type. Valid types: ${AiChatService.VALID_REPORT_TYPES.join(', ')}`,
      };
    }
    if (format !== 'pdf' && format !== 'csv') {
      return { error: 'Invalid format. Must be pdf or csv.' };
    }

    const exportType = `reports.${reportType}` as ExportType;

    try {
      const tenantParams = await this.resolveReportTenantParams(args, context);
      const params: Record<string, unknown> = { ...tenantParams };
      if (args.dateFrom) params.dateFrom = args.dateFrom;
      if (args.dateTo) params.dateTo = args.dateTo;

      const user: JwtPayloadUser = {
        sub: context.userId,
        email: context.email,
        permissions: context.permissions,
      };

      const result = await this.exportsService.createExport(
        { exportType, format: format as 'pdf' | 'csv', params },
        user,
        { actorUserId: context.userId },
      );

      return {
        exportId: result.id,
        status: result.status,
        format,
        reportType: exportType,
        downloadUrl: `/api/exports/${result.id}/download`,
      };
    } catch (err) {
      this.logger.error('Report generation error', (err as Error).stack);
      return { error: (err as Error).message || 'Failed to queue report generation.' };
    }
  }

  private async resolveReportTenantParams(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<{ companyId: string; branchId?: string }> {
    const scope = this.requireTenantScope(context);
    let companyId = this.validateOptionalTenantUuid(args.companyId, 'companyId');
    const branchId = this.validateOptionalTenantUuid(args.branchId, 'branchId');

    if (branchId) {
      const branchScope = await this.getAllowedBranchScope(branchId, context);
      if (companyId && companyId !== branchScope.companyId) {
        throw new ForbiddenException('Requested branch is outside the selected company scope');
      }
      companyId = branchScope.companyId;
    }

    if (companyId) {
      this.assertCompanyInScope(companyId, scope);
    } else {
      companyId = this.resolveSingleCompanyId(scope);
    }

    return branchId ? { companyId, branchId } : { companyId };
  }

  private async emailReport(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const recipientEmail = args.recipientEmail as string | undefined;
    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return { error: 'A valid recipient email address is required.' };
    }

    // Generate the report first
    const reportResult = await this.generateReport(args, context);
    if (reportResult.error) return reportResult;

    const exportId = reportResult.exportId as string;
    const reportType = reportResult.reportType as string;

    // Fire-and-forget: poll for completion then send email
    this.pollAndEmailReport(exportId, recipientEmail, reportType).catch((err) =>
      this.logger.error(`Failed to email report ${exportId}`, (err as Error).stack),
    );

    return {
      ...reportResult,
      emailRecipient: recipientEmail,
      emailStatus: 'queued',
      message: `Report queued. It will be emailed to ${recipientEmail} once generated.`,
    };
  }

  private async pollAndEmailReport(
    exportId: string,
    recipientEmail: string,
    reportType: string,
  ): Promise<void> {
    const maxAttempts = 30;
    const intervalMs = 2000;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));

      const row = await this.db
        .select({ status: Schema.exportsTable.status, fileName: Schema.exportsTable.fileName })
        .from(Schema.exportsTable)
        .where(eq(Schema.exportsTable.id, exportId))
        .limit(1);

      const status = row[0]?.status;
      if (status === 'ready') {
        const downloadUrl = `${this.config.get<string>('FRONTEND_ORIGIN', 'http://localhost:5173')}/app/exports`;
        const friendlyName = reportType.replace('reports.', '').replace(/-/g, ' ');

        await this.emailTransport.send({
          to: recipientEmail,
          subject: `IFMS Report Ready: ${friendlyName}`,
          body: `Your ${friendlyName} report is ready for download.\n\nVisit: ${downloadUrl}\n\nThis link will expire in 72 hours.`,
          html: `<p>Your <strong>${friendlyName}</strong> report is ready for download.</p><p><a href="${downloadUrl}">View exports</a></p><p><small>This link will expire in 72 hours.</small></p>`,
        });
        this.logger.log(`Report ${exportId} emailed to ${recipientEmail}`);
        return;
      }
      if (status === 'failed') {
        this.logger.warn(`Report ${exportId} failed — email not sent to ${recipientEmail}`);
        return;
      }
    }
    this.logger.warn(`Report ${exportId} timed out — email not sent to ${recipientEmail}`);
  }

  private async resolveScopedConfirmationPayload(
    action: ConfirmAction,
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    this.validateTenantReferencesInPayload(args, context);
    const scope = this.requireTenantScope(context);
    const payload = { ...args };

    switch (action) {
      case 'create_delivery': {
        let branchId = this.validateOptionalTenantUuid(payload.branchId, 'branchId');
        if (!branchId) {
          branchId = this.resolveSingleBranchId(scope);
          payload.branchId = branchId;
        }
        const branchScope = await this.getAllowedBranchScope(branchId, context);
        const companyId = this.validateOptionalTenantUuid(payload.companyId, 'companyId');
        if (companyId && companyId !== branchScope.companyId) {
          throw new ForbiddenException('Requested branch is outside the selected company scope');
        }
        payload.companyId = companyId ?? branchScope.companyId;
        await this.assertProductScope(
          this.validateOptionalUuid(payload.productId, 'productId'),
          context,
          branchScope.companyId,
        );
        await this.assertSupplierScope(
          this.validateOptionalUuid(payload.supplierId, 'supplierId'),
          context,
          branchScope.companyId,
        );
        break;
      }

      case 'create_expense': {
        let branchId = this.validateOptionalTenantUuid(payload.branchId, 'branchId');
        if (!branchId) {
          branchId = this.resolveSingleBranchId(scope);
          payload.branchId = branchId;
        }
        const branchScope = await this.getAllowedBranchScope(branchId, context);
        const companyId =
          this.validateOptionalTenantUuid(payload.companyId, 'companyId') ?? branchScope.companyId;
        this.assertCompanyInScope(companyId, scope);
        if (companyId !== branchScope.companyId) {
          throw new ForbiddenException('Requested branch is outside the selected company scope');
        }
        payload.companyId = companyId;
        await this.assertExpenseCategoryScope(
          this.validateOptionalUuid(payload.categoryId, 'categoryId'),
          context,
          companyId,
          branchId,
        );
        break;
      }

      case 'record_payment': {
        const customerId = this.validateOptionalUuid(payload.customerId, 'customerId');
        if (customerId) {
          const customerScope = await this.getAllowedCustomerScope(customerId, context);
          this.assertPayloadScopeMatchesEntity(payload, customerScope, 'Customer');
          payload.companyId = payload.companyId ?? customerScope.companyId;
          payload.branchId = payload.branchId ?? customerScope.branchId;
        }
        break;
      }

      case 'void_sale': {
        const transactionId = this.validateOptionalUuid(payload.transactionId, 'transactionId');
        if (transactionId) {
          const saleScope = await this.getAllowedSaleScope(transactionId, context);
          this.assertPayloadScopeMatchesEntity(payload, saleScope, 'Sale transaction');
          payload.companyId = payload.companyId ?? saleScope.companyId;
          payload.branchId = payload.branchId ?? saleScope.branchId;
        }
        break;
      }
    }

    this.validateTenantReferencesInPayload(payload, context);
    return payload;
  }

  private async assertExpenseCategoryScope(
    categoryId: string | undefined,
    context: ToolContext,
    expectedCompanyId: string,
    expectedBranchId: string,
  ): Promise<void> {
    if (!categoryId) return;

    const [category] = await this.db
      .select({
        companyId: Schema.expenseCategories.companyId,
        branchId: Schema.expenseCategories.branchId,
      })
      .from(Schema.expenseCategories)
      .where(and(eq(Schema.expenseCategories.id, categoryId), isNull(Schema.expenseCategories.deletedAt)))
      .limit(1);

    if (!category) throw new BadRequestException('Expense category not found');
    this.assertEntityTenantScope(category, context, 'Expense category');
    if (category.companyId !== expectedCompanyId || category.branchId !== expectedBranchId) {
      throw new ForbiddenException('Expense category is outside the selected branch scope');
    }
  }

  private assertPayloadScopeMatchesEntity(
    payload: Record<string, unknown>,
    entityScope: Required<TenantEntityScope>,
    label: string,
  ): void {
    const payloadCompanyId = this.validateOptionalTenantUuid(payload.companyId, 'companyId');
    const payloadBranchId = this.validateOptionalTenantUuid(payload.branchId, 'branchId');

    if (payloadCompanyId && payloadCompanyId !== entityScope.companyId) {
      throw new ForbiddenException(`${label} is outside the selected company scope`);
    }
    if (payloadBranchId && payloadBranchId !== entityScope.branchId) {
      throw new ForbiddenException(`${label} is outside the selected branch scope`);
    }
  }

  // -------------------------------------------------------------------------
  // Confirmation card preparation (write tools)
  // -------------------------------------------------------------------------

  private async prepareConfirmation(
    action: ConfirmAction,
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    let scopedArgs: Record<string, unknown>;
    try {
      scopedArgs = await this.resolveScopedConfirmationPayload(action, args, context);
    } catch (err) {
      return { error: (err as Error).message || 'Unable to resolve tenant scope for this action.' };
    }

    // Enrich with human-readable labels for customer/product names
    const enriched = { ...scopedArgs } as Record<string, unknown>;
    if (scopedArgs.customerId) {
      const [cust] = await this.db
        .select({ name: Schema.customers.name })
        .from(Schema.customers)
        .where(eq(Schema.customers.id, scopedArgs.customerId as string))
        .limit(1);
      if (cust) enriched._customerName = cust.name;
    }
    if (scopedArgs.productId) {
      const [prod] = await this.db
        .select({ name: Schema.products.name })
        .from(Schema.products)
        .where(eq(Schema.products.id, scopedArgs.productId as string))
        .limit(1);
      if (prod) enriched._productName = prod.name;
    }

    return {
      action,
      payload: enriched,
      message: 'Please review the details below and confirm to submit.',
    };
  }

  // -------------------------------------------------------------------------
  // Confirm and execute a write operation
  // -------------------------------------------------------------------------

  private static readonly ACTION_PERMISSION_MAP: Record<string, string> = {
    create_delivery: 'deliveries:write',
    create_expense: 'expenses:write',
    record_payment: 'credit:write',
    void_sale: 'sales:void',
  };

  async confirmWrite(
    action: ConfirmAction,
    payload: Record<string, unknown>,
    context: ToolContext,
  ): Promise<{ success: boolean; message: string; entityId?: string }> {
    // Verify the user has the required permission for this action
    const requiredPermission = AiChatService.ACTION_PERMISSION_MAP[action];
    if (requiredPermission && !context.permissions?.includes(requiredPermission)) {
      return {
        success: false,
        message: `You do not have permission (${requiredPermission}) to perform this action.`,
      };
    }

    const auditCtx = { userId: context.userId, userAgent: 'ai-assistant' };

    try {
      this.validateTenantReferencesInPayload(payload, context);
      let entityId: string | undefined;

      switch (action) {
        case 'create_delivery': {
          const branchId = this.validateUuid(payload.branchId, 'branchId');
          const branchScope = await this.getAllowedBranchScope(branchId, context);
          const payloadCompanyId = this.validateOptionalTenantUuid(payload.companyId, 'companyId');
          if (payloadCompanyId && payloadCompanyId !== branchScope.companyId) {
            throw new ForbiddenException('Requested branch is outside the selected company scope');
          }
          await this.assertProductScope(
            this.validateOptionalUuid(payload.productId, 'productId'),
            context,
            branchScope.companyId,
          );
          await this.assertSupplierScope(
            this.validateOptionalUuid(payload.supplierId, 'supplierId'),
            context,
            branchScope.companyId,
          );
          const orderedQty = this.validatePositiveNumber(payload.orderedQty, 'orderedQty');
          const deliveryNote = this.validateString(
            payload.deliveryNote || `DEL-${Date.now()}`,
            'deliveryNote',
            100,
          );
          const expectedDate =
            this.validateOptionalDate(payload.expectedDate, 'expectedDate') ||
            new Date().toISOString().slice(0, 10);
          const result = await this.deliveriesService.create(
            {
              branchId,
              deliveryNote,
              orderedQty,
              expectedDate,
              vehicleNo: payload.vehicleNo ? String(payload.vehicleNo).slice(0, 50) : undefined,
              driverName: payload.driverName ? String(payload.driverName).slice(0, 100) : undefined,
              productId: this.validateOptionalUuid(payload.productId, 'productId'),
              supplierId: this.validateOptionalUuid(payload.supplierId, 'supplierId'),
            },
            auditCtx,
          );
          entityId = result.id;
          this.lastWrites.set(context.userId, { action, entityId, timestamp: Date.now() });
          return {
            success: true,
            message: `Delivery ${result.deliveryNote} created successfully.`,
            entityId,
          };
        }

        case 'create_expense': {
          const companyId = this.validateUuid(payload.companyId, 'companyId');
          const branchId = this.validateUuid(payload.branchId, 'branchId');
          const branchScope = await this.getAllowedBranchScope(branchId, context);
          const scope = this.requireTenantScope(context);
          this.assertCompanyInScope(companyId, scope);
          if (companyId !== branchScope.companyId) {
            throw new ForbiddenException('Requested branch is outside the selected company scope');
          }
          await this.assertExpenseCategoryScope(
            this.validateOptionalUuid(payload.categoryId, 'categoryId'),
            context,
            companyId,
            branchId,
          );
          const amount = this.validatePositiveNumber(payload.amount, 'amount');
          const category = this.validateString(payload.category, 'category', 100);
          const result = await this.expensesService.createExpenseEntry(
            {
              companyId,
              branchId,
              category,
              amount,
              vendor: payload.vendor ? String(payload.vendor).slice(0, 200) : '',
              paymentMethod: payload.paymentMethod
                ? String(payload.paymentMethod).slice(0, 50)
                : 'cash',
              description: payload.description
                ? String(payload.description).slice(0, 500)
                : undefined,
              billableDepartment: payload.billableDepartment
                ? String(payload.billableDepartment).slice(0, 100)
                : undefined,
            },
            auditCtx,
          );
          entityId = result.id;
          this.lastWrites.set(context.userId, { action, entityId, timestamp: Date.now() });
          return {
            success: true,
            message: `Expense ${result.entryNumber} (TZS ${Number(result.amount).toLocaleString()}) recorded.`,
            entityId,
          };
        }

        case 'record_payment': {
          const customerId = this.validateUuid(payload.customerId, 'customerId');
          const customerScope = await this.getAllowedCustomerScope(customerId, context);
          this.assertPayloadScopeMatchesEntity(payload, customerScope, 'Customer');
          const amount = this.validatePositiveNumber(payload.amount, 'amount');
          const result = await this.paymentsService.create(
            {
              customerId,
              amount,
              method: payload.method ? String(payload.method).slice(0, 50) : 'cash',
              paymentDate: this.validateOptionalDate(payload.paymentDate, 'paymentDate'),
              referenceNo: payload.referenceNo
                ? String(payload.referenceNo).slice(0, 100)
                : undefined,
            },
            auditCtx,
          );
          entityId = result.id;
          this.lastWrites.set(context.userId, { action, entityId, timestamp: Date.now() });
          return {
            success: true,
            message: `Payment ${result.paymentNumber} (TZS ${Number(result.amount).toLocaleString()}) recorded.`,
            entityId,
          };
        }

        case 'void_sale': {
          const txId = this.validateUuid(payload.transactionId, 'transactionId');
          const saleScope = await this.getAllowedSaleScope(txId, context);
          this.assertPayloadScopeMatchesEntity(payload, saleScope, 'Sale transaction');
          const reason = payload.reason
            ? String(payload.reason).slice(0, 500)
            : 'Voided via AI assistant';
          const result = await this.salesService.voidTransaction(txId, reason, auditCtx);
          return {
            success: true,
            message: `Transaction ${result.receiptNumber} voided successfully.`,
            entityId: result.id,
          };
        }

        default:
          return { success: false, message: `Unknown action: ${action}` };
      }
    } catch (err) {
      this.logger.error(`AI confirm write error [${action}]`, (err as Error).stack);
      return {
        success: false,
        message: (err as Error).message || 'Failed to execute write operation.',
      };
    }
  }

  // -------------------------------------------------------------------------
  // Undo last AI-assisted write
  // -------------------------------------------------------------------------

  private static readonly UNDO_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

  private async undoLastWrite(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const lastWrite = this.lastWrites.get(context.userId);
    if (!lastWrite) {
      return { error: 'No recent AI-assisted write found to undo.' };
    }

    const elapsed = Date.now() - lastWrite.timestamp;
    if (elapsed > AiChatService.UNDO_WINDOW_MS) {
      this.lastWrites.delete(context.userId);
      return {
        error: `The last write was ${Math.round(elapsed / 60_000)} minutes ago. Undo is only available within 10 minutes.`,
      };
    }

    // If confirm flag is not set, return info about what would be undone
    if (!args.confirm) {
      return {
        canUndo: true,
        action: lastWrite.action,
        entityId: lastWrite.entityId,
        minutesAgo: Math.round(elapsed / 60_000),
        message: `The last AI write was "${lastWrite.action}" (ID: ${lastWrite.entityId}), created ${Math.round(elapsed / 60_000)} minute(s) ago. Confirm to undo.`,
      };
    }

    // Execute the undo
    const auditCtx = { userId: context.userId, userAgent: 'ai-assistant-undo' };
    try {
      switch (lastWrite.action) {
        case 'create_delivery':
          await this.deliveriesService.deleteDelivery(lastWrite.entityId, auditCtx);
          break;
        case 'create_expense':
          await this.db
            .update(Schema.expenseEntries)
            .set({ deletedAt: new Date() })
            .where(eq(Schema.expenseEntries.id, lastWrite.entityId));
          break;
        case 'record_payment':
          await this.db
            .update(Schema.payments)
            .set({ deletedAt: new Date() })
            .where(eq(Schema.payments.id, lastWrite.entityId));
          break;
      }

      this.lastWrites.delete(context.userId);
      this.logger.log(
        `Undid ${lastWrite.action} [${lastWrite.entityId}] for user ${context.userId}`,
      );

      return {
        success: true,
        undoneAction: lastWrite.action,
        entityId: lastWrite.entityId,
        message: `Successfully undone: ${lastWrite.action} (${lastWrite.entityId}).`,
      };
    } catch (err) {
      this.logger.error(`Undo failed [${lastWrite.action}]`, (err as Error).stack);
      return {
        error: `Failed to undo: ${(err as Error).message}`,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Predictive & Advisory tools (Phase 4) — all results are ESTIMATES
  // -------------------------------------------------------------------------

  private async forecastDemand(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const daysBack = Math.min(Math.max(Number(args.daysBack) || 60, 7), 180);
    const since = new Date(Date.now() - daysBack * 86_400_000);

    // Get current tank levels with product info
    const tankConditions: SQL[] = [
      isNull(Schema.tanks.deletedAt),
      ...this.tenantScopePredicates(args, context, {
        companyId: Schema.tanks.companyId,
        branchId: Schema.tanks.branchId,
      }),
    ];
    const tanks = await this.db
      .select({
        tankCode: Schema.tanks.code,
        productId: Schema.tanks.productId,
        productName: Schema.products.name,
        currentLevel: Schema.tanks.currentLevel,
        capacity: Schema.tanks.capacity,
        minLevel: Schema.tanks.minLevel,
      })
      .from(Schema.tanks)
      .leftJoin(Schema.products, eq(Schema.tanks.productId, Schema.products.id))
      .where(and(...tankConditions));

    // Get historical delivery volumes per product
    const deliveries = await this.db
      .select({
        productId: Schema.deliveries.productId,
        totalReceived: sql<string>`COALESCE(SUM(${Schema.deliveries.receivedQty}::numeric), 0)`,
        deliveryCount: count(Schema.deliveries.id),
      })
      .from(Schema.deliveries)
      .where(
        and(
          isNull(Schema.deliveries.deletedAt),
          ...this.tenantScopePredicates(args, context, {
            companyId: Schema.deliveries.companyId,
            branchId: Schema.deliveries.branchId,
          }),
          eq(Schema.deliveries.status, 'received'),
          gte(Schema.deliveries.createdAt, since),
        ),
      )
      .groupBy(Schema.deliveries.productId);

    const deliveryMap = new Map(deliveries.map((d) => [d.productId, d]));

    let forecasts = tanks.map((tank) => {
      const delivery = deliveryMap.get(tank.productId);
      const totalReceived = Number(delivery?.totalReceived ?? 0);
      // Estimate daily consumption: received volume / days (rough proxy)
      const dailyConsumption = totalReceived > 0 ? totalReceived / daysBack : 0;
      const currentLevel = Number(tank.currentLevel);
      const minLevel = Number(tank.minLevel);
      const usableStock = Math.max(currentLevel - minLevel, 0);
      const daysUntilReorder =
        dailyConsumption > 0 ? Math.round(usableStock / dailyConsumption) : null;
      const reorderDate =
        daysUntilReorder !== null
          ? new Date(Date.now() + daysUntilReorder * 86_400_000).toISOString().slice(0, 10)
          : null;

      return {
        tank: tank.tankCode,
        product: tank.productName,
        currentLevel,
        capacity: Number(tank.capacity),
        percentFull: Math.round((currentLevel / Number(tank.capacity)) * 100),
        avgDailyConsumption: Math.round(dailyConsumption),
        daysUntilReorder,
        estimatedReorderDate: reorderDate,
        confidence:
          dailyConsumption > 0 ? (daysBack >= 30 ? 'medium' : 'low') : 'insufficient-data',
      };
    });

    // Filter by product name if specified
    if (args.productName) {
      const search = (args.productName as string).toLowerCase();
      forecasts = forecasts.filter((f) => f.product?.toLowerCase().includes(search));
    }

    // Sort by urgency (fewest days until reorder first)
    forecasts.sort((a, b) => (a.daysUntilReorder ?? 999) - (b.daysUntilReorder ?? 999));

    return {
      _isEstimate: true,
      analysisWindow: `${daysBack} days`,
      disclaimer:
        'These projections are estimates based on historical consumption patterns. Actual demand may vary.',
      forecasts,
    };
  }

  private async projectCashflow(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const projectionDays = Math.min(Math.max(Number(args.projectionDays) || 14, 7), 30);
    const daysBack = Math.min(Math.max(Number(args.daysBack) || 30, 7), 90);
    const since = new Date(Date.now() - daysBack * 86_400_000);

    // Historical daily revenue
    const salesData = await this.db
      .select({
        totalRevenue: sql<string>`COALESCE(SUM(${Schema.salesTransactions.totalAmount}::numeric), 0)`,
        txDays: sql<string>`COUNT(DISTINCT DATE(${Schema.salesTransactions.transactionDate}))`,
      })
      .from(Schema.salesTransactions)
      .where(
        and(
          isNull(Schema.salesTransactions.deletedAt),
          ...this.tenantScopePredicates(args, context, {
            companyId: Schema.salesTransactions.companyId,
            branchId: Schema.salesTransactions.branchId,
          }),
          gte(Schema.salesTransactions.transactionDate, since),
          eq(Schema.salesTransactions.status, 'completed'),
        ),
      );

    // Historical daily expenses
    const expenseData = await this.db
      .select({
        totalExpenses: sql<string>`COALESCE(SUM(${Schema.expenseEntries.amount}::numeric), 0)`,
        expDays: sql<string>`COUNT(DISTINCT DATE(${Schema.expenseEntries.createdAt}))`,
      })
      .from(Schema.expenseEntries)
      .where(
        and(
          isNull(Schema.expenseEntries.deletedAt),
          ...this.tenantScopePredicates(args, context, {
            companyId: Schema.expenseEntries.companyId,
            branchId: Schema.expenseEntries.branchId,
          }),
          gte(Schema.expenseEntries.createdAt, since),
        ),
      );

    // Historical credit payments received
    const creditPayments = await this.db
      .select({
        totalPayments: sql<string>`COALESCE(SUM(${Schema.payments.amount}::numeric), 0)`,
        payDays: sql<string>`COUNT(DISTINCT DATE(${Schema.payments.paymentDate}))`,
      })
      .from(Schema.payments)
      .where(
        and(
          ...this.tenantScopePredicates(args, context, {
            companyId: Schema.payments.companyId,
            branchId: Schema.payments.branchId,
          }),
          gte(Schema.payments.paymentDate, since),
        ),
      );

    const totalRevenue = Number(salesData[0]?.totalRevenue ?? 0);
    const activeSalesDays = Math.max(Number(salesData[0]?.txDays ?? 1), 1);
    const totalExpenses = Number(expenseData[0]?.totalExpenses ?? 0);
    const activeExpDays = Math.max(Number(expenseData[0]?.expDays ?? 1), 1);
    const totalPayments = Number(creditPayments[0]?.totalPayments ?? 0);
    const activePayDays = Math.max(Number(creditPayments[0]?.payDays ?? 1), 1);

    const avgDailyRevenue = Math.round(totalRevenue / activeSalesDays);
    const avgDailyExpenses = Math.round(totalExpenses / activeExpDays);
    const avgDailyPayments = Math.round(totalPayments / activePayDays);
    const avgDailyInflow = avgDailyRevenue + avgDailyPayments;
    const avgDailyNet = avgDailyInflow - avgDailyExpenses;

    // Build daily projection
    const projection = Array.from({ length: projectionDays }, (_, i) => {
      const date = new Date(Date.now() + (i + 1) * 86_400_000).toISOString().slice(0, 10);
      return {
        date,
        projectedInflow: avgDailyInflow,
        projectedOutflow: avgDailyExpenses,
        projectedNet: avgDailyNet,
        cumulativeNet: avgDailyNet * (i + 1),
      };
    });

    return {
      _isEstimate: true,
      analysisWindow: `${daysBack} days historical → ${projectionDays} days projected`,
      disclaimer:
        'Cash flow projections are estimates based on recent averages. Actual cash flow may vary significantly.',
      summary: {
        avgDailyRevenue,
        avgDailyCreditPayments: avgDailyPayments,
        avgDailyInflow,
        avgDailyExpenses,
        avgDailyNet,
        projectedTotalNet: avgDailyNet * projectionDays,
      },
      projection,
    };
  }

  private async analyzePricing(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const conditions: SQL[] = [
      isNull(Schema.salesTransactions.deletedAt),
      ...this.tenantScopePredicates(args, context, {
        companyId: Schema.salesTransactions.companyId,
        branchId: Schema.salesTransactions.branchId,
      }),
      eq(Schema.salesTransactions.status, 'completed'),
    ];

    if (args.dateFrom) {
      conditions.push(
        gte(Schema.salesTransactions.transactionDate, new Date(args.dateFrom as string)),
      );
    } else {
      // Default to last 30 days
      conditions.push(
        gte(Schema.salesTransactions.transactionDate, new Date(Date.now() - 30 * 86_400_000)),
      );
    }
    if (args.dateTo) {
      const to = new Date(args.dateTo as string);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(Schema.salesTransactions.transactionDate, to));
    }

    // Get product pricing info
    const products = await this.db
      .select({
        id: Schema.products.id,
        name: Schema.products.name,
        pricePerUnit: Schema.products.pricePerUnit,
        category: Schema.products.category,
      })
      .from(Schema.products)
      .where(
        and(
          isNull(Schema.products.deletedAt),
          ...this.tenantScopePredicates(args, context, {
            companyId: Schema.products.companyId,
          }),
        ),
      );

    // Sales aggregated by product (via nozzle → tank → product chain or directly if available)
    // Simplified: aggregate total sales and transaction counts
    const salesAgg = await this.db
      .select({
        totalRevenue: sql<string>`COALESCE(SUM(${Schema.salesTransactions.totalAmount}::numeric), 0)`,
        totalCount: count(Schema.salesTransactions.id),
        avgTxValue: sql<string>`COALESCE(AVG(${Schema.salesTransactions.totalAmount}::numeric), 0)`,
        byPaymentType: sql<string>`json_agg(DISTINCT ${Schema.salesTransactions.paymentType})`,
      })
      .from(Schema.salesTransactions)
      .where(and(...conditions));

    // Sales by payment type for breakdown
    const byPayment = await this.db
      .select({
        paymentType: Schema.salesTransactions.paymentType,
        revenue: sql<string>`SUM(${Schema.salesTransactions.totalAmount}::numeric)`,
        count: count(Schema.salesTransactions.id),
      })
      .from(Schema.salesTransactions)
      .where(and(...conditions))
      .groupBy(Schema.salesTransactions.paymentType);

    let productList = products.map((p) => ({
      name: p.name,
      category: p.category,
      currentPricePerUnit: Number(p.pricePerUnit),
    }));

    if (args.productName) {
      const search = (args.productName as string).toLowerCase();
      productList = productList.filter((p) => p.name?.toLowerCase().includes(search));
    }

    const totalRevenue = Number(salesAgg[0]?.totalRevenue ?? 0);

    return {
      _isEstimate: true,
      disclaimer:
        'Pricing analysis is advisory. Market conditions and competition should be considered alongside these metrics.',
      overview: {
        totalRevenue,
        transactionCount: Number(salesAgg[0]?.totalCount ?? 0),
        avgTransactionValue: Math.round(Number(salesAgg[0]?.avgTxValue ?? 0)),
      },
      products: productList,
      revenueByPaymentType: byPayment.map((r) => ({
        paymentType: r.paymentType,
        revenue: Number(r.revenue),
        count: Number(r.count),
        sharePercent: totalRevenue > 0 ? Math.round((Number(r.revenue) / totalRevenue) * 100) : 0,
      })),
    };
  }

  private async recommendStaffing(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const daysBack = Math.min(Math.max(Number(args.daysBack) || 30, 7), 90);
    const since = new Date(Date.now() - daysBack * 86_400_000);

    // Shifts with revenue data
    const shifts = await this.db
      .select({
        type: Schema.shifts.type,
        dayOfWeek: sql<string>`EXTRACT(DOW FROM ${Schema.shifts.startTime})`,
        totalCollected: Schema.shifts.totalCollectedAmount,
        startTime: Schema.shifts.startTime,
      })
      .from(Schema.shifts)
      .where(
        and(
          isNull(Schema.shifts.deletedAt),
          ...this.tenantScopePredicates(args, context, {
            companyId: Schema.shifts.companyId,
            branchId: Schema.shifts.branchId,
          }),
          eq(Schema.shifts.status, 'closed'),
          gte(Schema.shifts.startTime, since),
        ),
      );

    // Aggregate by shift type
    const byType = new Map<string, { revenue: number; count: number; days: Set<string> }>();
    for (const s of shifts) {
      const type = s.type || 'unknown';
      if (!byType.has(type)) byType.set(type, { revenue: 0, count: 0, days: new Set() });
      const entry = byType.get(type)!;
      entry.revenue += Number(s.totalCollected ?? 0);
      entry.count += 1;
      entry.days.add(new Date(s.startTime).toISOString().slice(0, 10));
    }

    // Aggregate by day of week
    const byDow = new Map<number, { revenue: number; count: number }>();
    for (const s of shifts) {
      const dow = Number(s.dayOfWeek);
      if (!byDow.has(dow)) byDow.set(dow, { revenue: 0, count: 0 });
      const entry = byDow.get(dow)!;
      entry.revenue += Number(s.totalCollected ?? 0);
      entry.count += 1;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const shiftTypeAnalysis = Array.from(byType.entries()).map(([type, data]) => ({
      shiftType: type,
      totalShifts: data.count,
      totalRevenue: Math.round(data.revenue),
      avgRevenuePerShift: data.count > 0 ? Math.round(data.revenue / data.count) : 0,
      recommendation:
        data.count > 0 &&
        data.revenue / data.count >
          (shifts.length > 0
            ? shifts.reduce((s, sh) => s + Number(sh.totalCollected ?? 0), 0) / shifts.length
            : 0)
          ? 'HIGH PRIORITY — above-average revenue, ensure full staffing'
          : 'STANDARD — average or below-average revenue',
    }));

    const dayOfWeekAnalysis = Array.from(byDow.entries())
      .sort(([a], [b]) => a - b)
      .map(([dow, data]) => ({
        day: dayNames[dow] ?? `Day ${dow}`,
        totalShifts: data.count,
        totalRevenue: Math.round(data.revenue),
        avgRevenuePerShift: data.count > 0 ? Math.round(data.revenue / data.count) : 0,
      }));

    // Find peak and low days
    const sorted = dayOfWeekAnalysis
      .slice()
      .sort((a, b) => b.avgRevenuePerShift - a.avgRevenuePerShift);
    const peakDays = sorted.slice(0, 2).map((d) => d.day);
    const lowDays = sorted.slice(-2).map((d) => d.day);

    return {
      _isEstimate: true,
      analysisWindow: `${daysBack} days`,
      disclaimer:
        'Staffing recommendations are based on historical sales patterns. Consider local events, holidays, and seasonal factors.',
      shiftTypeAnalysis,
      dayOfWeekAnalysis,
      recommendations: {
        peakDays,
        lowDays,
        summary: `Peak revenue days: ${peakDays.join(', ')}. Consider additional staffing on these days. Low revenue days: ${lowDays.join(', ')} — standard staffing sufficient.`,
      },
    };
  }

  private async analyzeTrends(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<Record<string, unknown>> {
    const metric = ((args.metric as string) || 'sales').toLowerCase();
    const periodDays = Math.min(Math.max(Number(args.periodDays) || 30, 7), 90);

    const currentStart = new Date(Date.now() - periodDays * 86_400_000);
    const previousStart = new Date(Date.now() - periodDays * 2 * 86_400_000);
    const previousEnd = currentStart;

    let currentValue = 0;
    let previousValue = 0;
    let currentCount = 0;
    let previousCount = 0;

    switch (metric) {
      case 'sales': {
        const [curr] = await this.db
          .select({
            total: sql<string>`COALESCE(SUM(${Schema.salesTransactions.totalAmount}::numeric), 0)`,
            cnt: count(Schema.salesTransactions.id),
          })
          .from(Schema.salesTransactions)
          .where(
            and(
              isNull(Schema.salesTransactions.deletedAt),
              ...this.tenantScopePredicates(args, context, {
                companyId: Schema.salesTransactions.companyId,
                branchId: Schema.salesTransactions.branchId,
              }),
              eq(Schema.salesTransactions.status, 'completed'),
              gte(Schema.salesTransactions.transactionDate, currentStart),
            ),
          );
        const [prev] = await this.db
          .select({
            total: sql<string>`COALESCE(SUM(${Schema.salesTransactions.totalAmount}::numeric), 0)`,
            cnt: count(Schema.salesTransactions.id),
          })
          .from(Schema.salesTransactions)
          .where(
            and(
              isNull(Schema.salesTransactions.deletedAt),
              ...this.tenantScopePredicates(args, context, {
                companyId: Schema.salesTransactions.companyId,
                branchId: Schema.salesTransactions.branchId,
              }),
              eq(Schema.salesTransactions.status, 'completed'),
              gte(Schema.salesTransactions.transactionDate, previousStart),
              lte(Schema.salesTransactions.transactionDate, previousEnd),
            ),
          );
        currentValue = Number(curr?.total ?? 0);
        previousValue = Number(prev?.total ?? 0);
        currentCount = Number(curr?.cnt ?? 0);
        previousCount = Number(prev?.cnt ?? 0);
        break;
      }
      case 'expenses': {
        const [curr] = await this.db
          .select({
            total: sql<string>`COALESCE(SUM(${Schema.expenseEntries.amount}::numeric), 0)`,
            cnt: count(Schema.expenseEntries.id),
          })
          .from(Schema.expenseEntries)
          .where(
            and(
              isNull(Schema.expenseEntries.deletedAt),
              ...this.tenantScopePredicates(args, context, {
                companyId: Schema.expenseEntries.companyId,
                branchId: Schema.expenseEntries.branchId,
              }),
              gte(Schema.expenseEntries.createdAt, currentStart),
            ),
          );
        const [prev] = await this.db
          .select({
            total: sql<string>`COALESCE(SUM(${Schema.expenseEntries.amount}::numeric), 0)`,
            cnt: count(Schema.expenseEntries.id),
          })
          .from(Schema.expenseEntries)
          .where(
            and(
              isNull(Schema.expenseEntries.deletedAt),
              ...this.tenantScopePredicates(args, context, {
                companyId: Schema.expenseEntries.companyId,
                branchId: Schema.expenseEntries.branchId,
              }),
              gte(Schema.expenseEntries.createdAt, previousStart),
              lte(Schema.expenseEntries.createdAt, previousEnd),
            ),
          );
        currentValue = Number(curr?.total ?? 0);
        previousValue = Number(prev?.total ?? 0);
        currentCount = Number(curr?.cnt ?? 0);
        previousCount = Number(prev?.cnt ?? 0);
        break;
      }
      case 'deliveries': {
        const [curr] = await this.db
          .select({
            total: sql<string>`COALESCE(SUM(${Schema.deliveries.receivedQty}::numeric), 0)`,
            cnt: count(Schema.deliveries.id),
          })
          .from(Schema.deliveries)
          .where(
            and(
              isNull(Schema.deliveries.deletedAt),
              ...this.tenantScopePredicates(args, context, {
                companyId: Schema.deliveries.companyId,
                branchId: Schema.deliveries.branchId,
              }),
              eq(Schema.deliveries.status, 'received'),
              gte(Schema.deliveries.createdAt, currentStart),
            ),
          );
        const [prev] = await this.db
          .select({
            total: sql<string>`COALESCE(SUM(${Schema.deliveries.receivedQty}::numeric), 0)`,
            cnt: count(Schema.deliveries.id),
          })
          .from(Schema.deliveries)
          .where(
            and(
              isNull(Schema.deliveries.deletedAt),
              ...this.tenantScopePredicates(args, context, {
                companyId: Schema.deliveries.companyId,
                branchId: Schema.deliveries.branchId,
              }),
              eq(Schema.deliveries.status, 'received'),
              gte(Schema.deliveries.createdAt, previousStart),
              lte(Schema.deliveries.createdAt, previousEnd),
            ),
          );
        currentValue = Number(curr?.total ?? 0);
        previousValue = Number(prev?.total ?? 0);
        currentCount = Number(curr?.cnt ?? 0);
        previousCount = Number(prev?.cnt ?? 0);
        break;
      }
      case 'credit': {
        const [curr] = await this.db
          .select({
            total: sql<string>`COALESCE(SUM(${Schema.creditInvoices.totalAmount}::numeric), 0)`,
            cnt: count(Schema.creditInvoices.id),
          })
          .from(Schema.creditInvoices)
          .where(
            and(
              isNull(Schema.creditInvoices.deletedAt),
              ...this.tenantScopePredicates(args, context, {
                companyId: Schema.creditInvoices.companyId,
                branchId: Schema.creditInvoices.branchId,
              }),
              gte(Schema.creditInvoices.invoiceDate, currentStart),
            ),
          );
        const [prev] = await this.db
          .select({
            total: sql<string>`COALESCE(SUM(${Schema.creditInvoices.totalAmount}::numeric), 0)`,
            cnt: count(Schema.creditInvoices.id),
          })
          .from(Schema.creditInvoices)
          .where(
            and(
              isNull(Schema.creditInvoices.deletedAt),
              ...this.tenantScopePredicates(args, context, {
                companyId: Schema.creditInvoices.companyId,
                branchId: Schema.creditInvoices.branchId,
              }),
              gte(Schema.creditInvoices.invoiceDate, previousStart),
              lte(Schema.creditInvoices.invoiceDate, previousEnd),
            ),
          );
        currentValue = Number(curr?.total ?? 0);
        previousValue = Number(prev?.total ?? 0);
        currentCount = Number(curr?.cnt ?? 0);
        previousCount = Number(prev?.cnt ?? 0);
        break;
      }
      default:
        return { error: `Unknown metric: ${metric}. Valid: sales, expenses, deliveries, credit.` };
    }

    const valueChange =
      previousValue > 0
        ? Math.round(((currentValue - previousValue) / previousValue) * 100)
        : currentValue > 0
          ? 100
          : 0;
    const countChange =
      previousCount > 0
        ? Math.round(((currentCount - previousCount) / previousCount) * 100)
        : currentCount > 0
          ? 100
          : 0;
    const trend = valueChange > 5 ? 'up' : valueChange < -5 ? 'down' : 'stable';

    return {
      _isEstimate: true,
      disclaimer:
        'Trend analysis compares two consecutive periods. Short-term fluctuations may not reflect long-term patterns.',
      metric,
      periodDays,
      currentPeriod: {
        start: currentStart.toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
        totalValue: Math.round(currentValue),
        recordCount: currentCount,
      },
      previousPeriod: {
        start: previousStart.toISOString().slice(0, 10),
        end: previousEnd.toISOString().slice(0, 10),
        totalValue: Math.round(previousValue),
        recordCount: previousCount,
      },
      changes: {
        valueChangePercent: valueChange,
        countChangePercent: countChange,
        trend,
        trendLabel: trend === 'up' ? '📈 Growing' : trend === 'down' ? '📉 Declining' : '➡️ Stable',
      },
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private inferRole(permissions: string[]): string {
    if (permissions.some((p) => p.includes('write') || p.includes('void'))) return 'Manager';
    if (permissions.includes('audit:read')) return 'Auditor';
    return 'Cashier';
  }
}
