export interface CsvRow {
  [key: string]: string;
}

export interface CsvParseResult {
  headers: string[];
  rows: CsvRow[];
  delimiter: string;
  rowCount: number;
}

export function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;

  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
  return text;
}

function parseRow(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        result.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }
  result.push(current);
  return result;
}

export function parseCsv(text: string): CsvParseResult {
  const cleaned = stripBom(text);
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], delimiter: ',', rowCount: 0 };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseRow(lines[0], delimiter).map(h => h.trim());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i], delimiter);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? '').trim();
    }
    rows.push(row);
  }

  return { headers, rows, delimiter, rowCount: rows.length };
}
