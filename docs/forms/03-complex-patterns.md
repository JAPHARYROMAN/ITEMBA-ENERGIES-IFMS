# IFMS Complex Form Patterns

Complex patterns live in `components/ifms/forms/patterns/` and handle repeating rows, grids, and computed summaries.

## Available Patterns

### `MeterReadingsGrid`

**Path**: `patterns/MeterReadingsGrid.tsx`

Grid for entering meter readings per nozzle with computed delta (volume dispensed).

| Prop             | Type     | Description                                |
|------------------|----------|--------------------------------------------|
| `name`           | `string` | RHF field array path (e.g. `"readings"`)   |
| `openingField`   | `string` | Key for opening reading in each row         |
| `closingField`   | `string` | Key for closing reading in each row         |
| `labelField`     | `string` | Key for the row label (e.g. nozzle code)    |

**Features**:
- Keyboard navigation: Enter/ArrowDown moves to next row
- Per-row validation with inline error display
- Computed delta column (closing − opening)
- Mobile: stacked card layout fallback

---

### `PaymentSplitEditor`

**Path**: `patterns/PaymentSplitEditor.tsx`

Split a payment across multiple methods (Cash, Card, Transfer, etc.).

| Prop           | Type       | Description                              |
|----------------|------------|------------------------------------------|
| `name`         | `string`   | RHF field array path (e.g. `"splits"`)   |
| `totalAmount`  | `number`   | Target total to match                     |
| `methods`      | `string[]` | Available payment method options           |

**Features**:
- Add/remove payment method rows
- Auto-sum with remaining balance display
- Validation: sum must equal `totalAmount`
- Summary block with status indicator

---

### `AllocationEditor`

**Path**: `patterns/AllocationEditor.tsx`

Allocate a received quantity across multiple tanks.

| Prop           | Type                                        | Description                    |
|----------------|---------------------------------------------|--------------------------------|
| `name`         | `string`                                    | RHF field array path           |
| `totalQty`     | `number`                                    | Total quantity to allocate     |
| `tanks`        | `{ id, code, capacity, currentLevel }[]`    | Available tanks                |

**Features**:
- Per-row capacity validation (quantity ≤ free capacity)
- Sum check: allocated total must match `totalQty`
- Visual capacity indicator per tank
- Add/remove allocation rows

---

### `LineItemsEditor`

**Path**: `patterns/LineItemsEditor.tsx`

Dynamic line items with per-row product, quantity, price, and computed line total.

| Prop           | Type                          | Description                    |
|----------------|-------------------------------|--------------------------------|
| `name`         | `string`                      | RHF field array path           |
| `products`     | `{ id, name, price }[]`       | Product catalog for selection  |

**Features**:
- Add/remove rows with animation
- Per-row validation (product required, qty > 0, price > 0)
- Computed line total (qty × price)
- Summary: subtotal, tax estimate, grand total

---

### `ComputedFieldBlock`

**Path**: `patterns/ComputedFieldBlock.tsx`

Read-only display block for derived/computed values.

| Prop    | Type                                                        | Description        |
|---------|-------------------------------------------------------------|--------------------|
| `title` | `string`                                                    | Block heading      |
| `items` | `{ label, value, hint?, status: 'success'|'error'|'warning'|'neutral' }[]` | Display items |

**Features**:
- Dashed border, muted background
- 2-column responsive grid
- Color-coded status indicators
- Used alongside form sections for financial summaries

## Layout Rules for Patterns

1. All patterns should be **full-span** (`md:col-span-2` or outside `FormSection`)
2. Wrap in a bordered container with consistent padding
3. Computed/summary values go in a `ComputedFieldBlock` or dark summary card
4. Add/remove buttons use `text-[10px] font-black uppercase tracking-widest text-primary`

## Keyboard Navigation Standard

All grid-style patterns must support:
- **Enter** / **ArrowDown**: Move to same field in next row
- **Tab**: Move to next field in same row
- **Shift+Tab**: Move to previous field
- Auto-select input content on focus for quick overwrite
