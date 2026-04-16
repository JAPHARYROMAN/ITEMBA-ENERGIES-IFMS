# IFMS Field Wrappers Reference

All field wrappers live in `components/ifms/forms/Fields.tsx` and integrate with React Hook Form via `useFormContext()`.

## Common Props (all wrappers)

| Prop        | Type      | Description                                      |
|-------------|-----------|--------------------------------------------------|
| `name`      | `string`  | RHF field path (e.g. `"items.0.quantity"`)       |
| `label`     | `string`  | Visible label rendered above the input            |
| `required`  | `boolean` | Shows `<RequiredMark>` asterisk                   |
| `disabled`  | `boolean` | Disables the input                                |
| `readOnly`  | `boolean` | Makes the input read-only (no pointer events)     |
| `hint`      | `string`  | Help text below the input                         |
| `fullWidth` | `boolean` | Spans both columns (`md:col-span-2`)             |
| `className` | `string`  | Additional classes on the wrapper div              |

## Input Styling Standard

All inputs share:
```
h-10 bg-background border border-input rounded-xl px-3 text-sm
focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition-all
disabled:opacity-50 disabled:cursor-not-allowed
```

Error state adds: `border-rose-500 bg-rose-500/5`

## Field Catalog

### Text & Number

| Wrapper         | HTML Element     | Extra Props                          |
|-----------------|------------------|--------------------------------------|
| `TextField`     | `<input>`        | `type`, `placeholder`                |
| `NumberField`   | `<input number>` | `step`, `min`, `max`, `placeholder`  |
| `MoneyField`    | `<input number>` | Currency prefix `$`, `step="0.01"`   |
| `PercentField`  | `<input number>` | Suffix `%`, `step="0.1"`             |

### Selection

| Wrapper             | HTML Element  | Extra Props                                |
|---------------------|---------------|--------------------------------------------|
| `SelectField`       | `<select>`    | `options: {label, value}[]`                |
| `ComboboxField`     | Custom        | `options`, searchable dropdown             |
| `MultiSelectField`  | Custom        | `options`, multi-select with chips         |

### Date

| Wrapper          | HTML Element     | Extra Props          |
|------------------|------------------|----------------------|
| `DateField`      | `<input date>`   | `min`, `max`         |
| `DateRangeField` | Two `<input>`    | `startName`, `endName` |

### Rich Input

| Wrapper            | HTML Element    | Extra Props                    |
|--------------------|-----------------|--------------------------------|
| `TextareaField`    | `<textarea>`    | `rows`, `maxLength`            |
| `FileAttachField`  | `<input file>`  | `accept`, `maxSizeMB`          |

### Toggle & Choice

| Wrapper            | HTML Element    | Extra Props                              |
|--------------------|-----------------|------------------------------------------|
| `ToggleField`      | `<input cb>`    | Toggle switch style                      |
| `CheckboxField`    | `<input cb>`    | Standard checkbox                        |
| `RadioGroupField`  | `<input radio>` | `options: {label, value}[]`              |

### Display

| Wrapper            | Renders         | Extra Props                    |
|--------------------|-----------------|--------------------------------|
| `ReadOnlyField`    | `<div>`         | `value` — display-only field   |
| `EntityPickerField`| Custom          | `entityType`, `onSearch`       |

## Error Handling

Every wrapper reserves space for error messages below the input:
```tsx
<p className="min-h-[1.25rem] text-[11px] text-rose-500 font-bold" role="alert">
  {error?.message}
</p>
```

This prevents layout shift when errors appear/disappear.

## Usage Example

```tsx
import { TextField, NumberField, SelectField } from '@/components/ifms/forms/Fields';

<FormSection title="Product">
  <TextField name="name" label="Product Name" required />
  <NumberField name="price" label="Unit Price" step="0.01" required />
  <SelectField
    name="category"
    label="Category"
    options={[
      { label: 'Fuel', value: 'fuel' },
      { label: 'Lubricant', value: 'lubricant' },
    ]}
    required
  />
</FormSection>
```
