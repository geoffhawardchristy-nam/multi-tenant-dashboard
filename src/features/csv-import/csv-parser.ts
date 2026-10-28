import Papa from 'papaparse';
import type { CsvImportInitRowInput } from '@/types/api';

export interface ParsedCsvRawRow {
  readonly [key: string]: string;
}

export interface ParseCsvResult {
  readonly headers: ReadonlyArray<string>;
  readonly rawRows: ReadonlyArray<ParsedCsvRawRow>;
  readonly parseError?: string;
}

export const MAX_CSV_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_CSV_ROW_COUNT = 10000;

export function validateCsvFileMetadata(file: {
  readonly name: string;
  readonly size: number;
  readonly type?: string;
}): string | null {
  const lowerName = file.name.trim().toLowerCase();
  const isCsvExt = lowerName.endsWith('.csv');
  const isCsvMime =
    !file.type ||
    file.type === 'text/csv' ||
    file.type === 'application/vnd.ms-excel' ||
    file.type === 'text/plain';

  if (!isCsvExt && !isCsvMime) {
    return 'Invalid file type. Please upload a valid .csv file.';
  }
  if (file.size <= 0) {
    return 'The selected CSV file is empty (0 bytes).';
  }
  if (file.size > MAX_CSV_FILE_SIZE_BYTES) {
    return `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 15 MB maximum limit.`;
  }
  return null;
}

/**
 * Parses CSV text with RFC-4180 compliance (supporting quoted fields, escaped quotes,
 * embedded commas, and multi-line values).
 */
export function parseCsvString(csvText: string): Promise<ParseCsvResult> {
  return new Promise((resolve) => {
    Papa.parse<ParsedCsvRawRow>(csvText, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const rawRows = results.data ?? [];

        const criticalError = results.errors.find(
          (err) => err.type === 'Quotes' || err.type === 'Delimiter'
        );

        if (criticalError) {
          resolve({
            headers,
            rawRows: [],
            parseError: `Row ${(criticalError.row ?? 0) + 1}: ${criticalError.message}`,
          });
          return;
        }

        if (rawRows.length > MAX_CSV_ROW_COUNT) {
          resolve({
            headers,
            rawRows: [],
            parseError: `CSV file contains ${rawRows.length.toLocaleString()} rows, exceeding the 10,000-row limit.`,
          });
          return;
        }

        resolve({ headers, rawRows });
      },
      error: (error: Error) => {
        resolve({ headers: [], rawRows: [], parseError: error.message });
      },
    });
  });
}

export interface ColumnMappingConfig {
  readonly firstNameField: string;
  readonly lastNameField: string;
  readonly emailField: string;
  readonly departmentField: string;
  readonly roleTitleField: string;
  readonly statusField: string;
  readonly salaryField: string;
  readonly hireDateField: string;
}

export function autoDetectColumnMapping(headers: ReadonlyArray<string>): ColumnMappingConfig {
  const findBestMatch = (keywords: ReadonlyArray<string>, fallbackIdx: number): string => {
    for (const kw of keywords) {
      const exact = headers.find((h) => h.toLowerCase() === kw);
      if (exact) return exact;
      const partial = headers.find((h) => h.toLowerCase().includes(kw));
      if (partial) return partial;
    }
    return headers[fallbackIdx] ?? headers[0] ?? '';
  };

  return {
    firstNameField: findBestMatch(['first name', 'firstname', 'first', 'fname', 'given'], 0),
    lastNameField: findBestMatch(['last name', 'lastname', 'last', 'lname', 'surname'], 1),
    emailField: findBestMatch(['work email', 'email', 'mail', 'e-mail'], 2),
    departmentField: findBestMatch(['department', 'dept', 'division', 'team'], 3),
    roleTitleField: findBestMatch(['role title', 'roletitle', 'job title', 'role', 'title'], 4),
    statusField: findBestMatch(['status', 'employment status', 'state'], 5),
    salaryField: findBestMatch(['salary', 'salaryusd', 'annual salary', 'pay'], 6),
    hireDateField: findBestMatch(['hire date', 'hiredate', 'start date', 'joined'], 7),
  };
}

export function mapRawCsvRowsToImportInputs(
  rawRows: ReadonlyArray<ParsedCsvRawRow>,
  mapping: ColumnMappingConfig
): CsvImportInitRowInput[] {
  return rawRows.map((row, idx) => ({
    rowNumber: idx + 1,
    firstName: (row[mapping.firstNameField] ?? '').trim(),
    lastName: (row[mapping.lastNameField] ?? '').trim(),
    email: (row[mapping.emailField] ?? '').trim(),
    department: (row[mapping.departmentField] ?? 'Engineering').trim(),
    roleTitle: (row[mapping.roleTitleField] ?? 'Software Engineer').trim(),
    status: (row[mapping.statusField] ?? 'ACTIVE').trim(),
    salaryUsd: Number((row[mapping.salaryField] ?? '90000').replace(/[^0-9.-]/g, '')) || 0,
    hireDate: (row[mapping.hireDateField] ?? '2026-01-15').trim(),
  }));
}

/**
 * Deterministically generates `rowCount` CSV rows (e.g. 10,000 rows) for testing
 * the 10,000-row -> 7,000-row partial failure and resume workflow without freezing the browser.
 */
export function generateBulkImportRows(
  rowCount: number,
  batchTag = 'batch2026'
): CsvImportInitRowInput[] {
  const departments = [
    'Engineering',
    'Product',
    'Design',
    'Sales',
    'Finance',
    'Operations',
    'People',
    'Security',
  ] as const;

  const roles = [
    'Software Engineer',
    'Senior Engineer',
    'Product Manager',
    'Product Designer',
    'Account Executive',
    'Financial Analyst',
    'Operations Lead',
    'Security Architect',
  ] as const;

  const rows: CsvImportInitRowInput[] = new Array(rowCount);
  for (let i = 1; i <= rowCount; i++) {
    rows[i - 1] = {
      rowNumber: i,
      firstName: `ImportUser${i}`,
      lastName: `Candidate${i}`,
      email: `import.user.${batchTag}.${i}@acme-import.io`,
      department: departments[i % departments.length] ?? 'Engineering',
      roleTitle: roles[i % roles.length] ?? 'Software Engineer',
      status: 'ACTIVE',
      salaryUsd: 80000 + ((i * 37) % 90000),
      hireDate: '2026-02-01',
    };
  }
  return rows;
}