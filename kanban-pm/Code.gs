/**
 * Lightweight Kanban PM tool.
 *
 * Backend for a Google Sheets-backed Kanban board served as an Apps Script
 * web app. The spreadsheet is the database: one row per task on the "Tasks"
 * sheet, one editable status name per row on the "Settings" sheet.
 *
 * Every mutation takes a script lock, writes, flushes, and returns a freshly
 * read board so the client always renders authoritative server state.
 */

var TASKS_SHEET = 'Tasks';
var SETTINGS_SHEET = 'Settings';

var TASK_HEADERS = [
  'ID',
  'Title',
  'Description',
  'Status',
  'Start Date',
  'Due Date',
  'Assignee',
  'Position',
  'Updated At'
];

/** 1-based column positions on the Tasks sheet. */
var COL = {
  ID: 1,
  TITLE: 2,
  DESCRIPTION: 3,
  STATUS: 4,
  START_DATE: 5,
  DUE_DATE: 6,
  ASSIGNEE: 7,
  POSITION: 8,
  UPDATED_AT: 9
};

var SETTINGS_HEADERS = ['Status'];
var DEFAULT_STATUSES = ['Backlog', 'To Do', 'In Progress', 'Done'];

var LOCK_TIMEOUT_MS = 20000;
var MAX_TITLE_LENGTH = 200;
var MAX_DESCRIPTION_LENGTH = 5000;
var MAX_ASSIGNEE_LENGTH = 120;
var EDITABLE_FIELDS = ['title', 'description', 'status', 'startDate', 'dueDate', 'assignee'];

/* -------------------------------------------------------------------------
 * Web app entry points
 * ---------------------------------------------------------------------- */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Kanban Board')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Used by Index.html to inline the CSS and client JS partials. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Adds a menu when the script is bound to the spreadsheet. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kanban')
    .addItem('Set up sheets', 'setupSpreadsheet')
    .addItem('Open board', 'showBoardSidebar')
    .addToUi();
}

function showBoardSidebar() {
  var html = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Kanban Board');
  SpreadsheetApp.getUi().showSidebar(html);
}

/* -------------------------------------------------------------------------
 * Setup
 * ---------------------------------------------------------------------- */

/**
 * Creates the Tasks and Settings sheets (with headers, formatting and a few
 * sample rows) if they do not exist yet. Safe to run repeatedly.
 */
function setupSpreadsheet() {
  return withLock_(function () {
    var ss = getSpreadsheet_();
    var created = [];

    var tasks = ss.getSheetByName(TASKS_SHEET);
    if (!tasks) {
      tasks = ss.insertSheet(TASKS_SHEET);
      created.push(TASKS_SHEET);
    }
    initTasksSheet_(tasks);

    var settings = ss.getSheetByName(SETTINGS_SHEET);
    if (!settings) {
      settings = ss.insertSheet(SETTINGS_SHEET);
      created.push(SETTINGS_SHEET);
    }
    initSettingsSheet_(settings);

    if (tasks.getLastRow() < 2) {
      appendSampleTasks_(tasks);
    }
    return { created: created, spreadsheetUrl: ss.getUrl() };
  });
}

function initTasksSheet_(sheet) {
  sheet.getRange(1, 1, 1, TASK_HEADERS.length)
    .setValues([TASK_HEADERS])
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange(1, COL.START_DATE, sheet.getMaxRows(), 2).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(1, COL.UPDATED_AT, sheet.getMaxRows(), 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.setColumnWidth(COL.ID, 260);
  sheet.setColumnWidth(COL.TITLE, 260);
  sheet.setColumnWidth(COL.DESCRIPTION, 320);
}

function initSettingsSheet_(sheet) {
  sheet.getRange(1, 1, 1, SETTINGS_HEADERS.length)
    .setValues([SETTINGS_HEADERS])
    .setFontWeight('bold');
  sheet.setFrozenRows(1);
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, DEFAULT_STATUSES.length, 1).setValues(DEFAULT_STATUSES.map(function (name) {
      return [name];
    }));
  }
  sheet.getRange(1, 3).setValue('One board column per row, in board order. Edit freely.');
}

function appendSampleTasks_(sheet) {
  var now = new Date();
  var samples = [
    ['Set up the Kanban spreadsheet', 'Run Kanban > Set up sheets from the menu.', 'Done', 'You'],
    ['Deploy the web app', 'Deploy > New deployment > Web app.', 'In Progress', 'You'],
    ['Invite the team', 'Share the web app URL with everyone who needs the board.', 'To Do', ''],
    ['Drag me to another column', 'Cards keep their order after a refresh.', 'Backlog', '']
  ];
  var rows = samples.map(function (sample) {
    return [Utilities.getUuid(), sample[0], sample[1], sample[2], '', '', sample[3], 1, now];
  });
  sheet.getRange(2, 1, rows.length, TASK_HEADERS.length).setValues(rows);
}

/* -------------------------------------------------------------------------
 * Reads
 * ---------------------------------------------------------------------- */

/** Returns { statuses, tasks, serverTime } - everything the board needs. */
function getBoard() {
  return readBoard_(getSpreadsheet_());
}

/** Returns every task as a plain object, ordered by status then position. */
function getTasks() {
  return readBoard_(getSpreadsheet_()).tasks;
}

/** Returns the board columns configured on the Settings sheet. */
function getStatuses() {
  var sheet = getSpreadsheet_().getSheetByName(SETTINGS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) {
    return DEFAULT_STATUSES.slice();
  }
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var statuses = [];
  values.forEach(function (row) {
    var name = String(row[0] == null ? '' : row[0]).trim();
    if (name && statuses.indexOf(name) === -1) {
      statuses.push(name);
    }
  });
  return statuses.length ? statuses : DEFAULT_STATUSES.slice();
}

function readBoard_(ss) {
  var statuses = getStatuses();
  var tasks = readTasks_(getTasksSheet_(ss));
  sortTasks_(tasks, statuses);
  return {
    statuses: statuses,
    tasks: tasks.map(toClientTask_),
    serverTime: new Date().toISOString()
  };
}

/**
 * Reads every populated task row. The returned objects carry their sheet row
 * number so writes can address them without a second lookup.
 */
function readTasks_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var values = sheet.getRange(2, 1, lastRow - 1, TASK_HEADERS.length).getValues();
  var timeZone = sheet.getParent().getSpreadsheetTimeZone();
  var tasks = [];
  values.forEach(function (row, index) {
    var id = String(row[COL.ID - 1] == null ? '' : row[COL.ID - 1]).trim();
    if (!id) {
      return; // blank or stray row
    }
    tasks.push({
      id: id,
      title: readString_(row[COL.TITLE - 1]),
      description: readString_(row[COL.DESCRIPTION - 1]),
      status: readString_(row[COL.STATUS - 1]).trim(),
      startDate: formatDateValue_(row[COL.START_DATE - 1], timeZone),
      dueDate: formatDateValue_(row[COL.DUE_DATE - 1], timeZone),
      assignee: readString_(row[COL.ASSIGNEE - 1]),
      position: toPosition_(row[COL.POSITION - 1], index),
      updatedAt: formatTimestampValue_(row[COL.UPDATED_AT - 1]),
      row: index + 2
    });
  });
  return tasks;
}

/** Strips internal fields before the task crosses to the client. */
function toClientTask_(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    startDate: task.startDate,
    dueDate: task.dueDate,
    assignee: task.assignee,
    position: task.position,
    updatedAt: task.updatedAt
  };
}

/** Orders tasks by column order, then position, then title. */
function sortTasks_(tasks, statuses) {
  tasks.sort(function (a, b) {
    var rankA = statuses.indexOf(a.status);
    var rankB = statuses.indexOf(b.status);
    if (rankA === -1) rankA = statuses.length;
    if (rankB === -1) rankB = statuses.length;
    if (rankA !== rankB) return rankA - rankB;
    if (a.position !== b.position) return a.position - b.position;
    return a.title.localeCompare(b.title);
  });
  return tasks;
}

/* -------------------------------------------------------------------------
 * Writes
 * ---------------------------------------------------------------------- */

/**
 * Appends a task to the bottom of its column.
 * @param {Object} task Fields: title (required), description, status,
 *     startDate, dueDate, assignee.
 * @return {Object} { board, taskId }
 */
function createTask(task) {
  return withLock_(function () {
    var ss = getSpreadsheet_();
    var sheet = getTasksSheet_(ss);
    var statuses = getStatuses();
    var input = task || {};

    var title = validateTitle_(input.title);
    var status = resolveStatus_(input.status, statuses);
    var startDate = validateDate_(input.startDate, 'Start date');
    var dueDate = validateDate_(input.dueDate, 'Due date');
    validateDateOrder_(startDate, dueDate);

    var lastPosition = 0;
    readTasks_(sheet).forEach(function (existing) {
      if (existing.status === status && existing.position > lastPosition) {
        lastPosition = existing.position;
      }
    });

    var id = Utilities.getUuid();
    sheet.appendRow([
      id,
      title,
      validateText_(input.description, MAX_DESCRIPTION_LENGTH, 'Description'),
      status,
      startDate,
      dueDate,
      validateText_(input.assignee, MAX_ASSIGNEE_LENGTH, 'Assignee'),
      lastPosition + 1,
      new Date()
    ]);
    return { board: readBoard_(ss), taskId: id };
  });
}

/**
 * Updates editable fields on a task. Only the keys present in `changes` are
 * written; changing the status parks the task at the bottom of the
 * destination column.
 * @return {Object} { board, taskId }
 */
function updateTask(id, changes) {
  return withLock_(function () {
    var ss = getSpreadsheet_();
    var sheet = getTasksSheet_(ss);
    var statuses = getStatuses();
    var tasks = readTasks_(sheet);
    var task = findTask_(tasks, id);
    var edits = changes || {};

    var unknown = Object.keys(edits).filter(function (key) {
      return EDITABLE_FIELDS.indexOf(key) === -1;
    });
    if (unknown.length) {
      throw new Error('Cannot edit: ' + unknown.join(', ') + '.');
    }

    var next = {
      title: has_(edits, 'title') ? validateTitle_(edits.title) : task.title,
      description: has_(edits, 'description')
        ? validateText_(edits.description, MAX_DESCRIPTION_LENGTH, 'Description')
        : task.description,
      status: has_(edits, 'status') ? resolveStatus_(edits.status, statuses) : task.status,
      startDate: has_(edits, 'startDate') ? validateDate_(edits.startDate, 'Start date') : task.startDate,
      dueDate: has_(edits, 'dueDate') ? validateDate_(edits.dueDate, 'Due date') : task.dueDate,
      assignee: has_(edits, 'assignee')
        ? validateText_(edits.assignee, MAX_ASSIGNEE_LENGTH, 'Assignee')
        : task.assignee
    };
    validateDateOrder_(next.startDate, next.dueDate);

    var statusChanged = next.status !== task.status;
    var position = task.position;
    if (statusChanged) {
      position = 0;
      tasks.forEach(function (other) {
        if (other.id !== task.id && other.status === next.status && other.position > position) {
          position = other.position;
        }
      });
      position += 1;
    }

    sheet.getRange(task.row, 1, 1, TASK_HEADERS.length).setValues([[
      task.id,
      next.title,
      next.description,
      next.status,
      next.startDate,
      next.dueDate,
      next.assignee,
      position,
      new Date()
    ]]);

    if (statusChanged) {
      task.status = next.status;
      task.position = position;
      renumberColumns_(sheet, tasks, statuses);
    }
    return { board: readBoard_(ss), taskId: task.id };
  });
}

/**
 * Persists a drag: moves a task to `status` at zero-based `position` and
 * renumbers the affected columns so ordering survives a refresh.
 * @return {Object} { board, taskId }
 */
function moveTask(id, status, position) {
  return withLock_(function () {
    var ss = getSpreadsheet_();
    var sheet = getTasksSheet_(ss);
    var statuses = getStatuses();
    var tasks = readTasks_(sheet);
    var task = findTask_(tasks, id);
    var target = resolveStatus_(status, statuses);

    var destination = tasks.filter(function (other) {
      return other.id !== task.id && other.status === target;
    }).sort(byPosition_);

    var index = Math.round(Number(position));
    if (!isFinite(index) || index < 0) {
      index = 0;
    }
    if (index > destination.length) {
      index = destination.length;
    }

    task.status = target;
    destination.splice(index, 0, task);
    destination.forEach(function (item, i) {
      item.position = i + 1;
    });

    sheet.getRange(task.row, COL.STATUS).setValue(target);
    sheet.getRange(task.row, COL.UPDATED_AT).setValue(new Date());
    renumberColumns_(sheet, tasks, statuses);

    return { board: readBoard_(ss), taskId: task.id };
  });
}

/**
 * Deletes a task and closes the gap in its column.
 * @return {Object} { board, taskId }
 */
function deleteTask(id) {
  return withLock_(function () {
    var ss = getSpreadsheet_();
    var sheet = getTasksSheet_(ss);
    var statuses = getStatuses();
    var tasks = readTasks_(sheet);
    var task = findTask_(tasks, id);

    sheet.deleteRow(task.row);

    var remaining = [];
    tasks.forEach(function (other) {
      if (other.id === task.id) {
        return;
      }
      if (other.row > task.row) {
        other.row -= 1; // rows below the deleted one shifted up
      }
      remaining.push(other);
    });
    renumberColumns_(sheet, remaining, statuses);

    return { board: readBoard_(ss), taskId: task.id };
  });
}

/**
 * Assigns contiguous 1..n positions within every column and writes the whole
 * Position column back in a single range write.
 */
function renumberColumns_(sheet, tasks, statuses) {
  if (!tasks.length) {
    return;
  }
  var byStatus = {};
  tasks.forEach(function (task) {
    var key = statuses.indexOf(task.status) === -1 ? ' orphans' : task.status;
    if (!byStatus[key]) {
      byStatus[key] = [];
    }
    byStatus[key].push(task);
  });
  Object.keys(byStatus).forEach(function (key) {
    byStatus[key].sort(byPosition_).forEach(function (task, index) {
      task.position = index + 1;
    });
  });

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return;
  }
  var range = sheet.getRange(2, COL.POSITION, lastRow - 1, 1);
  var values = range.getValues();
  tasks.forEach(function (task) {
    var offset = task.row - 2;
    if (offset >= 0 && offset < values.length) {
      values[offset][0] = task.position;
    }
  });
  range.setValues(values);
}

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

/**
 * Serializes writes across users. Without this, two people dragging at once
 * can read the same positions and write rows over each other.
 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error('Someone else is saving right now. Please try again in a moment.');
  }
  try {
    return fn();
  } finally {
    try {
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }
}

/**
 * Resolves the spreadsheet: the bound one, or the id in the SPREADSHEET_ID
 * script property when the script is standalone.
 */
function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) {
    return SpreadsheetApp.openById(id);
  }
  var active = SpreadsheetApp.getActive();
  if (!active) {
    throw new Error(
      'No spreadsheet found. Bind this script to a Sheet, or set the SPREADSHEET_ID script property.'
    );
  }
  return active;
}

function getTasksSheet_(ss) {
  var sheet = ss.getSheetByName(TASKS_SHEET);
  if (!sheet) {
    throw new Error('The "' + TASKS_SHEET + '" sheet is missing. Run Kanban > Set up sheets.');
  }
  return sheet;
}

function findTask_(tasks, id) {
  var wanted = String(id == null ? '' : id).trim();
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === wanted) {
      return tasks[i];
    }
  }
  throw new Error('That task no longer exists. Refresh the board.');
}

function byPosition_(a, b) {
  if (a.position !== b.position) {
    return a.position - b.position;
  }
  return a.row - b.row;
}

function has_(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readString_(value) {
  return String(value == null ? '' : value);
}

function toPosition_(value, fallbackIndex) {
  var number = Number(value);
  return isFinite(number) && number > 0 ? number : fallbackIndex + 1;
}

/** Dates round-trip as yyyy-MM-dd strings whether the cell holds text or a date. */
function formatDateValue_(value, timeZone) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
  }
  var text = readString_(value).trim();
  if (!text) {
    return '';
  }
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

function formatTimestampValue_(value) {
  return value instanceof Date ? value.toISOString() : readString_(value);
}

function validateTitle_(value) {
  var title = readString_(value).trim();
  if (!title) {
    throw new Error('A task needs a title.');
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error('Title must be ' + MAX_TITLE_LENGTH + ' characters or fewer.');
  }
  return title;
}

function validateText_(value, maxLength, label) {
  var text = readString_(value).trim();
  if (text.length > maxLength) {
    throw new Error(label + ' must be ' + maxLength + ' characters or fewer.');
  }
  return text;
}

/** Accepts '' or an ISO yyyy-MM-dd date that is a real calendar day. */
function validateDate_(value, label) {
  if (value == null) {
    return '';
  }
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var text = String(value).trim();
  if (!text) {
    return '';
  }
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    throw new Error(label + ' must look like 2026-04-30.');
  }
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(label + ' is not a real date.');
  }
  return text;
}

function validateDateOrder_(startDate, dueDate) {
  if (startDate && dueDate && dueDate < startDate) {
    throw new Error('Due date cannot be before the start date.');
  }
}

function resolveStatus_(value, statuses) {
  var wanted = readString_(value).trim();
  if (!wanted) {
    return statuses[0];
  }
  for (var i = 0; i < statuses.length; i++) {
    if (statuses[i].toLowerCase() === wanted.toLowerCase()) {
      return statuses[i];
    }
  }
  throw new Error('"' + wanted + '" is not one of the board columns.');
}
