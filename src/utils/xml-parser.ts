import JSZip from 'jszip';

const SS_NS = 'urn:schemas-microsoft-com:office:spreadsheet';

export interface ParsedSpreadsheet {
  worksheets: ParsedWorksheet[];
  rawXml: string;
}

export interface ParsedWorksheet {
  name: string;
  headerRow: string[];
  dataRows: string[][];
}

/**
 * Extract CrmTranslations.zip from base64 and parse the SpreadsheetML XML inside.
 */
export async function extractAndParseZip(base64Zip: string): Promise<{ xml: string; zip: JSZip }> {
  const binary = atob(base64Zip);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const zip = await JSZip.loadAsync(bytes);
  const xmlFile = zip.file('CrmTranslations.xml');
  if (!xmlFile) {
    throw new Error('CrmTranslations.xml not found in ZIP archive');
  }

  const xml = await xmlFile.async('string');
  return { xml, zip };
}

/**
 * Parse SpreadsheetML XML into structured data.
 */
export function parseSpreadsheetXml(xml: string, englishLcid: string, targetLcid: string): ParsedSpreadsheet {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const worksheets: ParsedWorksheet[] = [];
  const wsNodes = doc.getElementsByTagNameNS(SS_NS, 'Worksheet');

  for (let w = 0; w < wsNodes.length; w++) {
    const ws = wsNodes[w];
    const name = ws.getAttributeNS(SS_NS, 'Name') || '';
    if (name === 'Information') continue;

    const table = ws.getElementsByTagNameNS(SS_NS, 'Table')[0];
    if (!table) continue;

    const rows = table.getElementsByTagNameNS(SS_NS, 'Row');
    if (rows.length < 2) continue;

    const headerRow = getRowValues(rows[0]);
    const dataRows: string[][] = [];

    for (let r = 1; r < rows.length; r++) {
      const maxCol = Math.max(headerRow.length, 20);
      dataRows.push(getRowValues(rows[r], maxCol));
    }

    worksheets.push({ name, headerRow, dataRows });
  }

  return { worksheets, rawXml: xml };
}

/**
 * Get cell values from a SpreadsheetML Row, respecting ss:Index gaps.
 */
function getRowValues(row: Element, maxCol = 50): string[] {
  const values: string[] = new Array(maxCol).fill('');
  const cells = row.getElementsByTagNameNS(SS_NS, 'Cell');

  let currentIdx = 0;
  for (let c = 0; c < cells.length; c++) {
    const cell = cells[c];
    const indexAttr = cell.getAttributeNS(SS_NS, 'Index');
    if (indexAttr) {
      currentIdx = parseInt(indexAttr, 10) - 1;
    }

    if (currentIdx < maxCol) {
      const data = cell.getElementsByTagNameNS(SS_NS, 'Data')[0];
      values[currentIdx] = data?.textContent || '';
    }
    currentIdx++;
  }

  return values;
}

/**
 * Modify a target cell in the SpreadsheetML XML and return updated XML string.
 */
export function updateXmlCell(
  xml: string,
  worksheetName: string,
  rowIndex: number,
  targetLcid: string,
  value: string
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const wsNodes = doc.getElementsByTagNameNS(SS_NS, 'Worksheet');
  let targetWs: Element | null = null;

  for (let w = 0; w < wsNodes.length; w++) {
    if (wsNodes[w].getAttributeNS(SS_NS, 'Name') === worksheetName) {
      targetWs = wsNodes[w];
      break;
    }
  }

  if (!targetWs) return xml;

  const table = targetWs.getElementsByTagNameNS(SS_NS, 'Table')[0];
  if (!table) return xml;

  const rows = table.getElementsByTagNameNS(SS_NS, 'Row');
  if (rowIndex >= rows.length) return xml;

  // Find target column from header
  const headerCells = rows[0].getElementsByTagNameNS(SS_NS, 'Cell');
  let targetCol = -1;
  let headerIdx = 0;

  for (let i = 0; i < headerCells.length; i++) {
    const idxAttr = headerCells[i].getAttributeNS(SS_NS, 'Index');
    if (idxAttr) headerIdx = parseInt(idxAttr, 10) - 1;

    const data = headerCells[i].getElementsByTagNameNS(SS_NS, 'Data')[0];
    const headerVal = data?.textContent?.trim() || '';
    if (headerVal === targetLcid || headerVal === `LCID:${targetLcid}`) {
      targetCol = headerIdx;
      break;
    }
    headerIdx++;
  }

  if (targetCol < 0) return xml;

  // Set cell value in target row
  const row = rows[rowIndex];
  setCellValue(doc, row, targetCol, value);

  // Serialize back
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

export interface CellUpdate {
  worksheetName: string;
  rowIndex: number;
  value: string;
}

/**
 * Apply multiple cell updates to the XML in a single parse/serialize cycle.
 * Much faster than calling updateXmlCell() per update.
 */
export function batchUpdateXmlCells(xml: string, targetLcid: string, updates: CellUpdate[]): string {
  if (updates.length === 0) return xml;

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  // Build worksheet lookup
  const wsNodes = doc.getElementsByTagNameNS(SS_NS, 'Worksheet');
  const wsMap = new Map<string, Element>();
  for (let w = 0; w < wsNodes.length; w++) {
    const name = wsNodes[w].getAttributeNS(SS_NS, 'Name') || '';
    wsMap.set(name, wsNodes[w]);
  }

  // Cache target column per worksheet
  const targetColCache = new Map<string, number>();

  for (const update of updates) {
    const ws = wsMap.get(update.worksheetName);
    if (!ws) continue;

    const table = ws.getElementsByTagNameNS(SS_NS, 'Table')[0];
    if (!table) continue;

    const rows = table.getElementsByTagNameNS(SS_NS, 'Row');
    if (update.rowIndex >= rows.length) continue;

    // Get or compute target column for this worksheet
    let targetCol = targetColCache.get(update.worksheetName);
    if (targetCol === undefined) {
      targetCol = -1;
      const headerCells = rows[0].getElementsByTagNameNS(SS_NS, 'Cell');
      let headerIdx = 0;
      for (let i = 0; i < headerCells.length; i++) {
        const idxAttr = headerCells[i].getAttributeNS(SS_NS, 'Index');
        if (idxAttr) headerIdx = parseInt(idxAttr, 10) - 1;
        const data = headerCells[i].getElementsByTagNameNS(SS_NS, 'Data')[0];
        const headerVal = data?.textContent?.trim() || '';
        if (headerVal === targetLcid || headerVal === `LCID:${targetLcid}`) {
          targetCol = headerIdx;
          break;
        }
        headerIdx++;
      }
      targetColCache.set(update.worksheetName, targetCol);
    }

    if (targetCol < 0) continue;

    setCellValue(doc, rows[update.rowIndex], targetCol, update.value);
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}

/**
 * Set a cell value in a SpreadsheetML row.
 */
function setCellValue(doc: Document, row: Element, colIndex: number, value: string): void {
  const cells = row.getElementsByTagNameNS(SS_NS, 'Cell');
  let currentIdx = 0;

  for (let c = 0; c < cells.length; c++) {
    const cell = cells[c];
    const indexAttr = cell.getAttributeNS(SS_NS, 'Index');
    if (indexAttr) {
      currentIdx = parseInt(indexAttr, 10) - 1;
    }

    if (currentIdx === colIndex) {
      let data = cell.getElementsByTagNameNS(SS_NS, 'Data')[0];
      if (!data) {
        data = doc.createElementNS(SS_NS, 'Data');
        data.setAttributeNS(SS_NS, 'ss:Type', 'String');
        cell.appendChild(data);
      }
      data.textContent = value;
      return;
    }
    currentIdx++;
  }

  // Cell doesn't exist — create new one with ss:Index
  const newCell = doc.createElementNS(SS_NS, 'Cell');
  newCell.setAttributeNS(SS_NS, 'ss:Index', (colIndex + 1).toString());
  const newData = doc.createElementNS(SS_NS, 'Data');
  newData.setAttributeNS(SS_NS, 'ss:Type', 'String');
  newData.textContent = value;
  newCell.appendChild(newData);
  row.appendChild(newCell);
}

/**
 * Re-zip modified XML back into a ZIP and return as base64.
 */
export async function repackZip(zip: JSZip, updatedXml: string): Promise<string> {
  zip.file('CrmTranslations.xml', updatedXml);
  const blob = await zip.generateAsync({ type: 'uint8array' });

  // Convert to base64
  let binary = '';
  for (let i = 0; i < blob.length; i++) {
    binary += String.fromCharCode(blob[i]);
  }
  return btoa(binary);
}
