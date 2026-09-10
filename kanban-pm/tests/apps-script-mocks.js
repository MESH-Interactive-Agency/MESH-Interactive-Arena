/**
 * Minimal in-memory stand-ins for the Apps Script services Code.gs uses, so
 * the backend can be exercised with `node tests/backend.test.js` without a
 * Google account. Only the surface Code.gs touches is implemented.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}

class FakeRange {
  constructor(sheet, row, column, numRows, numColumns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }

  getValues() {
    const values = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = [];
      for (let c = 0; c < this.numColumns; c++) {
        row.push(this.sheet.readCell(this.row + r, this.column + c));
      }
      values.push(row);
    }
    return values;
  }

  getValue() {
    return this.sheet.readCell(this.row, this.column);
  }

  setValues(values) {
    if (values.length !== this.numRows) {
      throw new Error('setValues row count mismatch: ' + values.length + ' vs ' + this.numRows);
    }
    values.forEach((row, r) => {
      if (row.length !== this.numColumns) {
        throw new Error('setValues column count mismatch: ' + row.length + ' vs ' + this.numColumns);
      }
      row.forEach((value, c) => {
        this.sheet.writeCell(this.row + r, this.column + c, value);
      });
    });
    return this;
  }

  setValue(value) {
    this.sheet.writeCell(this.row, this.column, value);
    return this;
  }

  setNumberFormat() {
    return this;
  }

  setFontWeight() {
    return this;
  }
}

class FakeSheet {
  constructor(name, parent) {
    this.name = name;
    this.parent = parent;
    this.grid = [];
  }

  getName() {
    return this.name;
  }

  getParent() {
    return this.parent;
  }

  readCell(row, column) {
    const line = this.grid[row - 1];
    const value = line ? line[column - 1] : '';
    return value === undefined ? '' : value;
  }

  writeCell(row, column, value) {
    while (this.grid.length < row) {
      this.grid.push([]);
    }
    const line = this.grid[row - 1];
    while (line.length < column) {
      line.push('');
    }
    line[column - 1] = value === undefined ? '' : value;
  }

  getRange(row, column, numRows, numColumns) {
    return new FakeRange(this, row, column, numRows || 1, numColumns || 1);
  }

  getLastRow() {
    for (let r = this.grid.length; r >= 1; r--) {
      const line = this.grid[r - 1] || [];
      if (line.some((cell) => !isBlank(cell))) {
        return r;
      }
    }
    return 0;
  }

  getMaxRows() {
    return Math.max(this.grid.length, 1000);
  }

  appendRow(values) {
    const row = this.getLastRow() + 1;
    values.forEach((value, index) => {
      this.writeCell(row, index + 1, value);
    });
    return this;
  }

  deleteRow(row) {
    this.grid.splice(row - 1, 1);
    return this;
  }

  setFrozenRows() {
    return this;
  }

  setColumnWidth() {
    return this;
  }
}

class FakeSpreadsheet {
  constructor(timeZone) {
    this.sheets = [];
    this.timeZone = timeZone || 'America/New_York';
  }

  getSheetByName(name) {
    return this.sheets.find((sheet) => sheet.getName() === name) || null;
  }

  insertSheet(name) {
    const sheet = new FakeSheet(name, this);
    this.sheets.push(sheet);
    return sheet;
  }

  getSpreadsheetTimeZone() {
    return this.timeZone;
  }

  getUrl() {
    return 'https://docs.google.com/spreadsheets/d/fake';
  }
}

/**
 * Builds a sandbox with the fake services and evaluates Code.gs inside it.
 * Returns the sandbox so tests can call backend functions and inspect the
 * underlying spreadsheet.
 */
function loadBackend(options) {
  const settings = options || {};
  const spreadsheet = new FakeSpreadsheet(settings.timeZone);
  const lock = { held: false, allowLock: true, acquisitions: 0, releases: 0 };
  let uuidCounter = 0;

  const sandbox = {
    console,
    spreadsheet,
    lock,
    // Apps Script runs in a single realm; share the host Date so `instanceof
    // Date` holds for values the test writes into a cell.
    Date,
    SpreadsheetApp: {
      getActive: () => spreadsheet,
      flush: () => {},
      getUi: () => {
        throw new Error('No UI in tests');
      }
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (!lock.allowLock || lock.held) {
            return false;
          }
          lock.held = true;
          lock.acquisitions += 1;
          return true;
        },
        releaseLock: () => {
          lock.held = false;
          lock.releases += 1;
        }
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null,
        setProperty: () => {}
      })
    },
    Session: {
      getScriptTimeZone: () => spreadsheet.getSpreadsheetTimeZone()
    },
    Utilities: {
      getUuid: () => 'uuid-' + (++uuidCounter),
      formatDate: (date, timeZone, format) => {
        // Only the two formats Code.gs asks for, evaluated in local time.
        const pad = (n) => String(n).padStart(2, '0');
        const iso = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
        if (format === 'yyyy-MM-dd') {
          return iso;
        }
        return iso + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
      }
    },
    HtmlService: {
      createTemplateFromFile: () => ({
        evaluate: () => ({
          setTitle: function () { return this; },
          addMetaTag: function () { return this; },
          setXFrameOptionsMode: function () { return this; }
        })
      }),
      createHtmlOutputFromFile: () => ({ getContent: () => '' }),
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
    }
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  vm.runInContext(source, sandbox, { filename: 'Code.gs' });
  return sandbox;
}

module.exports = { loadBackend };
