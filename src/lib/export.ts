"use client";

/**
 * Browser-side file builders for report exports. They only ever receive
 * aggregate tables and record references (the report service never includes
 * names, contact details or household identifiers), and every file carries a
 * classification line.
 */

export interface ExportSheet {
  name: string;
  columns: string[];
  rows: (string | number)[][];
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: string | number) => {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote as needed.
  const safe = /^[=+\-@]/.test(s) && typeof v !== "number" ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function exportCsv(filename: string, header: string[], sheets: ExportSheet[]): number {
  const lines: string[] = header.map((h) => csvCell(h));
  let count = 0;
  for (const sheet of sheets) {
    lines.push("", csvCell(sheet.name), sheet.columns.map(csvCell).join(","));
    for (const row of sheet.rows) {
      lines.push(row.map(csvCell).join(","));
      count += 1;
    }
  }
  download(filename, new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  return count;
}

/* -------------------------------------------------- Minimal XLSX writer */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Store-only (uncompressed) ZIP container, enough for a valid .xlsx package. */
function zip(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name);
    const data = enc.encode(file.data);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(rows: (string | number)[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const ref = `${colName(c)}${r + 1}`;
          return typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export function exportXlsx(filename: string, header: string[], sheets: ExportSheet[]): number {
  const all = [{ name: "About", columns: ["Information"], rows: header.map((h) => [h]) }, ...sheets];
  const safeName = (n: string, i: number) => `${i + 1} ${n.replace(/[\\/?*[\]:]/g, " ")}`.slice(0, 31);
  const files = [
    {
      name: "[Content_Types].xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        all.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        all.map((s, i) => `<sheet name="${xml(safeName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        `</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        all.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `</Relationships>`,
    },
    ...all.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml([s.columns, ...s.rows]) })),
  ];
  download(filename, zip(files));
  return sheets.reduce((n, s) => n + s.rows.length, 0);
}

/** PDF export uses the browser's print dialog ("Save as PDF") on a print-styled preview, which supports every script including Arabic. */
export function exportPdfViaPrint(): void {
  window.print();
}
