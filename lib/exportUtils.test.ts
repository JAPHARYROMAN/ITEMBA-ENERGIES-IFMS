import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { downloadCSV, exportTableToCSV, triggerPrint } from './exportUtils';

/**
 * downloadCSV builds a Blob and triggers a download. We intercept
 * URL.createObjectURL to capture the Blob, then read its text so we can
 * assert on the exact CSV string the user would receive.
 */
let captured: Blob | null;
let lastDownloadName: string | undefined;
let clickSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  captured = null;
  lastDownloadName = undefined;
  clickSpy = vi.fn();

  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob) => {
    captured = blob;
    return 'blob:mock';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  // Capture the <a> the helper creates and stub its click + download.
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag);
    if (tag === 'a') {
      Object.defineProperty(el, 'click', { value: clickSpy, writable: true });
      const anchor = el as HTMLAnchorElement;
      const proto = Object.getOwnPropertyDescriptor(
        HTMLAnchorElement.prototype,
        'download',
      );
      if (!proto) {
        Object.defineProperty(anchor, 'download', { value: '', writable: true });
      }
      const origSetter = Object.getOwnPropertyDescriptor(anchor, 'download');
      // Track whatever the helper assigns to .download
      let dl = '';
      Object.defineProperty(anchor, 'download', {
        get: () => dl,
        set: (v: string) => {
          dl = v;
          lastDownloadName = v;
        },
        configurable: true,
      });
      void origSetter;
    }
    return el;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function csvText(): Promise<string> {
  expect(captured).not.toBeNull();
  return (captured as Blob).text();
}

describe('downloadCSV', () => {
  test('joins headers and rows with CRLF and commas', async () => {
    downloadCSV('out.csv', ['Name', 'Qty'], [
      ['Diesel', 100],
      ['Petrol', 250],
    ]);
    expect(await csvText()).toBe('Name,Qty\r\nDiesel,100\r\nPetrol,250');
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(lastDownloadName).toBe('out.csv');
  });

  test('quotes fields containing commas, quotes, or newlines', async () => {
    downloadCSV('q.csv', ['A', 'B'], [
      ['has,comma', 'plain'],
      ['has"quote', 'line\nbreak'],
    ]);
    const text = await csvText();
    expect(text).toBe(
      'A,B\r\n"has,comma",plain\r\n"has""quote","line\nbreak"',
    );
  });

  test('coerces numbers to strings without quoting', async () => {
    downloadCSV('n.csv', ['X'], [[42], [0]]);
    expect(await csvText()).toBe('X\r\n42\r\n0');
  });

  test('emits header-only CSV when there are no rows', async () => {
    downloadCSV('empty.csv', ['H1', 'H2'], []);
    expect(await csvText()).toBe('H1,H2');
  });

  test('sets the Blob MIME type to text/csv', async () => {
    downloadCSV('mime.csv', ['H'], [['v']]);
    expect((captured as unknown as Blob).type).toContain('text/csv');
  });
});

describe('exportTableToCSV', () => {
  test('maps column headers and accessor keys from row objects', async () => {
    const data = [
      { id: 1, name: 'Alice', total: 1000 },
      { id: 2, name: 'Bob', total: 2000 },
    ];
    const columns = [
      { header: 'ID', accessorKey: 'id' },
      { header: 'Name', accessorKey: 'name' },
      { header: 'Total', accessorKey: 'total' },
    ];
    exportTableToCSV('table.csv', data, columns);
    expect(await csvText()).toBe(
      'ID,Name,Total\r\n1,Alice,1000\r\n2,Bob,2000',
    );
  });

  test('renders missing accessor values as empty cells', async () => {
    const data = [{ name: 'Solo' }];
    const columns = [
      { header: 'Name', accessorKey: 'name' },
      { header: 'Missing', accessorKey: 'nope' },
    ];
    exportTableToCSV('miss.csv', data, columns);
    expect(await csvText()).toBe('Name,Missing\r\nSolo,');
  });
});

describe('triggerPrint', () => {
  test('calls window.print', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    triggerPrint();
    expect(printSpy).toHaveBeenCalledOnce();
  });
});
