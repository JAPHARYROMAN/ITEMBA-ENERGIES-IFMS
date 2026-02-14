/**
 * Client-side export utilities for CSV and print/PDF-style exports.
 */

export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const line = (arr: (string | number)[]) => arr.map(escape).join(',');
  const csv = [line(headers), ...rows.map(r => line(r))].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function triggerPrint(): void {
  window.print();
}

export function exportTableToCSV(filename: string, data: Record<string, unknown>[], columns: { header: string; accessorKey: string }[]): void {
  const headers = columns.map(c => c.header);
  const rows = data.map(row => columns.map(c => (row[c.accessorKey] ?? '') as string | number));
  downloadCSV(filename, headers, rows);
}
