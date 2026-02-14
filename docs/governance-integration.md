# Governance Integration

This document describes governance workflow integration for sensitive operations in IFMS API.

## Feature Flag

- `GOVERNANCE_ENABLED` controls all governance enforcement.
- When `false`, existing behavior remains unchanged.
- When `true`, matching policy-controlled actions generate approvals and block/fork execution according to module flow.

## Controlled Actions

## 1) Expenses: Submit Expense

### Trigger
- Endpoint path in flow: `POST /expense-entries/:id/submit` (existing expenses module flow).
- Integration point: `ExpensesService.submitExpenseEntry`.

### Behavior
- If governance disabled OR no matching policy:
  - Expense transitions `draft -> submitted` (existing behavior).
- If governance enabled and matching policy exists:
  - Approval request is created+submitted by governance engine.
  - Expense transitions `draft -> pending_approval`.
  - Approval request carries metadata (`amount`, `category`, `vendor`).

### Approval outcomes
- On governance approval:
  - Expense transitions to `approved`.
- On governance rejection:
  - Expense transitions to `rejected` with `rejectionReason`.

### Audit
- `expense_entries` audit events include `submit_for_approval` and governance decision effects.

## 2) Stock Adjustments: Create Adjustment

### Trigger
- Endpoint path in flow: `POST /adjustments`.
- Integration point: `AdjustmentsService.create`.

### Behavior
- If governance disabled OR no matching policy:
  - Adjustment executes immediately (existing behavior).
- If governance enabled and matching policy exists:
  - Approval request is created+submitted.
  - Adjustment execution is blocked until approval.
  - API returns validation-style error payload with approval request ID/status.

### Approval outcomes
- On governance approval:
  - Adjustment record is created.
  - Tank level is updated.
  - Stock ledger movement is inserted.
- On governance rejection:
  - No adjustment is applied.

### Audit
- Governance decision execution writes adjustment audit event (`governance_approved_create`) plus approval audit trail.

## 3) Sales Void

### Trigger
- Endpoint path in flow: `POST /sales/transactions/:id/void`.
- Integration point: `SalesService.voidTransaction`.

### Behavior
- If governance disabled OR no matching policy:
  - Transaction is voided immediately (existing behavior).
- If governance enabled and matching policy exists:
  - Approval request is created+submitted.
  - Sale status transitions `completed -> pending_void_approval`.
  - Void reason is stored as pending context.

### Approval outcomes
- On governance approval:
  - Sale transitions to `voided`; `voidedAt`, `voidedBy`, `voidReason` set.
- On governance rejection:
  - Sale returns to `completed`.

### Audit
- `sales_transactions` audit includes `void_submitted_for_approval` and governance decision events.

## 4) Shift Close with Variance Threshold

### Trigger
- Endpoint path in flow: `POST /shifts/:id/close`.
- Integration point: `ShiftsService.close`.

### Behavior
- Variance computed from expected vs collected amount.
- If `abs(variance) <= SHIFT_VARIANCE_REQUIRE_REASON_THRESHOLD`:
  - Close executes immediately (existing behavior).
- If `abs(variance) > SHIFT_VARIANCE_REQUIRE_REASON_THRESHOLD` and matching policy exists:
  - Approval request is created+submitted.
  - Shift transitions to `pending_approval`.
  - Closing meter readings + collections are NOT persisted yet; stored in approval metadata.

### Approval outcomes
- On governance approval:
  - Closing meter readings and collections are persisted.
  - Shift is finalized as `closed` with totals/variance.
- On governance rejection:
  - Shift returns to `open` and pending marker is cleared.

### Audit
- Shift close path logs `close_submitted_for_approval` and governance decision events.

## Governance APIs used in these integrations

- `POST /governance/approvals` (draft)
- `POST /governance/approvals/:id/submit`
- `POST /governance/approvals/:id/approve`
- `POST /governance/approvals/:id/reject`
- `POST /governance/approvals/:id/cancel`

## Statuses introduced

- Expense: `pending_approval`.
- Sales transaction: `pending_void_approval`.
- Shift: existing `pending_approval` used in variance governance path.

These are backward-compatible additions to existing string status fields.
