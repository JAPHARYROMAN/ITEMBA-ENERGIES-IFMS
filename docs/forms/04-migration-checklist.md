# IFMS Form Migration Checklist

Use this checklist when creating a new form or migrating a legacy form to the standardized system.

## Pre-Flight

- [ ] Define a Zod schema for all form fields
- [ ] Create a TypeScript type with `z.infer<typeof schema>`
- [ ] Set up `useForm` with `zodResolver(schema)` and sensible `defaultValues`
- [ ] Wrap the form in `<FormProvider {...methods}>`

## Structure

- [ ] Outer container is `<FormShell>` with `title`, `description`, and `actions`
- [ ] Actions are wrapped in `<PermissionGuard>`
- [ ] Submit button uses `<FormSubmitState loading={…} label="…" />`
- [ ] Fields are grouped in `<FormSection title="…" description="…">`
- [ ] Full-width fields use the `fullWidth` prop (not manual `col-span-2`)

## Fields

- [ ] **No raw `<input>`** — use `TextField`, `NumberField`, `MoneyField`, etc.
- [ ] **No raw `<select>`** — use `SelectField` or `ComboboxField`
- [ ] **No raw `<textarea>`** — use `TextareaField`
- [ ] Every field has a `label` prop
- [ ] Required fields have `required` prop (renders asterisk)
- [ ] Numeric fields use `step` where appropriate
- [ ] Help text uses the `hint` prop

## Exceptions (raw inputs allowed)

Raw `<input>` is acceptable **only** in these cases:

1. **Grid/table cells** (e.g. meter readings inside `<table>`) — must still follow styling standard:
   - `h-10 bg-background border border-input rounded-xl px-3 text-sm font-black`
   - `text-right tabular-nums` for numbers
   - `focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none`
   - `aria-label` for accessibility
   - Keyboard navigation (Enter/ArrowDown to next row)
   - Per-row error display

2. **POS terminal inputs** — borderless inline inputs within styled cards

3. **Non-form inputs** — standalone search bars, note editors outside RHF context

## Accessibility

- [ ] All inputs have associated `<label>` (via field wrapper or `aria-label`)
- [ ] Error messages have `role="alert"`
- [ ] Error space is reserved (no layout shift)
- [ ] Disabled inputs have `disabled:opacity-50 disabled:cursor-not-allowed`
- [ ] Focus rings are visible: `focus:ring-2 focus:ring-primary/40`

## UX Guards

- [ ] Add `<UnsavedChangesGuard>` if the form has navigation risk
- [ ] Add `<FormErrorBanner>` for root-level validation errors (e.g. `superRefine`)
- [ ] Sticky action bar works on desktop, non-sticky on mobile

## Complex Patterns

- [ ] Repeating rows use `useFieldArray` from RHF
- [ ] Grid data entry uses keyboard navigation
- [ ] Computed values use `<ComputedFieldBlock>` or dark summary cards
- [ ] Add/remove buttons follow the standard style

## Post-Migration Verification

- [ ] Form submits successfully with valid data
- [ ] Validation errors display inline under each field
- [ ] Required fields show asterisk
- [ ] Tab order is logical
- [ ] Mobile layout is single-column, no horizontal overflow
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] No raw `<input>`, `<select>`, or `<textarea>` outside exceptions

## Migrated Forms Status

| Form                   | Status      | Notes                                    |
|------------------------|-------------|------------------------------------------|
| `ExpenseForm`          | ✅ Complete | Fully refactored from legacy FormShell   |
| `CustomerForm`         | ✅ Complete | Already standardized                     |
| `ProductForm`          | ✅ Complete | Already standardized                     |
| `GeneralSetupForm`     | ✅ Complete | Already standardized                     |
| `NozzleSetupForm`      | ✅ Complete | Already standardized                     |
| `PettyCashForm`        | ✅ Complete | Already standardized                     |
| `CreditInvoiceForm`    | ✅ Complete | Already standardized                     |
| `RecordPaymentForm`    | ✅ Complete | Allocation input standardized            |
| `ReceiveDeliveryForm`  | ✅ Complete | Already standardized                     |
| `CustomerManagement`   | ✅ Complete | Note textareas standardized              |
| `OpenShiftForm`        | ✅ Complete | Meter input standardized + keyboard nav  |
| `CloseShiftForm`       | ✅ Complete | Meter input standardized + keyboard nav  |
| `POSPage`              | ✅ Complete | Tender inputs: aria-label + tabular-nums |
| `TankForm`             | ✅ Complete | Already standardized                     |
| `CreateDeliveryForm`   | ✅ Complete | Already standardized                     |
| `ExpenseEntryForm`     | ✅ Complete | Already standardized                     |
| `GovernancePolicies`   | ✅ Complete | Already standardized                     |
