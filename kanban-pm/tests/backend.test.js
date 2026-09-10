/**
 * Backend tests for the Kanban Apps Script API.
 *
 *   node kanban-pm/tests/backend.test.js
 *
 * Runs Code.gs against in-memory fakes for SpreadsheetApp, LockService and
 * friends, so the acceptance criteria (ordering survives a reload, drags
 * persist, concurrent writes do not corrupt rows) are checked without a
 * Google account.
 */

'use strict';

const assert = require('assert');
const { loadBackend } = require('./apps-script-mocks');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok  ' + name);
  } catch (error) {
    failed += 1;
    console.log('FAIL  ' + name);
    console.log('      ' + (error && error.message));
  }
}

/** A backend with the sheets set up and the sample rows removed. */
function freshBoard() {
  const api = loadBackend();
  api.setupSpreadsheet();
  api.getTasks().forEach((task) => api.deleteTask(task.id));
  return api;
}

function titlesIn(api, status) {
  return api.getBoard().tasks.filter((task) => task.status === status).map((task) => task.title);
}

function positionsIn(api, status) {
  return api.getBoard().tasks.filter((task) => task.status === status).map((task) => task.position);
}

function add(api, title, status) {
  return api.createTask({ title: title, status: status }).taskId;
}

/**
 * Values built inside the vm realm have a different Array/Object prototype, so
 * deepStrictEqual would reject them on identity alone. Compare plain shapes.
 */
function eq(actual, expected, message) {
  assert.deepStrictEqual(plain(actual), plain(expected), message);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function throwsWith(fn, fragment) {
  try {
    fn();
  } catch (error) {
    assert.ok(
      String(error.message).indexOf(fragment) !== -1,
      'expected message to contain "' + fragment + '", got "' + error.message + '"'
    );
    return;
  }
  throw new Error('expected an error containing "' + fragment + '"');
}

console.log('\nSetup');

test('creates both sheets with headers and sample rows', () => {
  const api = loadBackend();
  const result = api.setupSpreadsheet();
  eq(result.created, ['Tasks', 'Settings']);

  const tasks = api.spreadsheet.getSheetByName('Tasks');
  eq(tasks.getRange(1, 1, 1, 9).getValues()[0], [
    'ID', 'Title', 'Description', 'Status', 'Start Date', 'Due Date', 'Assignee', 'Position', 'Updated At'
  ]);
  assert.strictEqual(api.getBoard().tasks.length, 4);
  eq(api.getStatuses(), ['Backlog', 'To Do', 'In Progress', 'Done']);
});

test('is safe to run twice and does not duplicate sample rows', () => {
  const api = loadBackend();
  api.setupSpreadsheet();
  const second = api.setupSpreadsheet();
  eq(second.created, []);
  assert.strictEqual(api.getBoard().tasks.length, 4);
});

test('reads board columns from the Settings sheet', () => {
  const api = loadBackend();
  api.setupSpreadsheet();
  const settings = api.spreadsheet.getSheetByName('Settings');
  settings.getRange(2, 1, 4, 1).setValues([['Ideas'], ['Building'], ['Shipped'], ['']]);
  eq(api.getStatuses(), ['Ideas', 'Building', 'Shipped']);
});

console.log('\nCreate');

test('appends a task to the bottom of its column', () => {
  const api = freshBoard();
  add(api, 'First', 'To Do');
  add(api, 'Second', 'To Do');
  eq(titlesIn(api, 'To Do'), ['First', 'Second']);
  eq(positionsIn(api, 'To Do'), [1, 2]);
});

test('defaults to the first column and trims text', () => {
  const api = freshBoard();
  api.createTask({ title: '  Trim me  ', assignee: '  Ada  ' });
  const task = api.getBoard().tasks[0];
  assert.strictEqual(task.status, 'Backlog');
  assert.strictEqual(task.title, 'Trim me');
  assert.strictEqual(task.assignee, 'Ada');
});

test('stores dates as yyyy-MM-dd strings', () => {
  const api = freshBoard();
  api.createTask({ title: 'Dated', startDate: '2026-04-01', dueDate: '2026-04-30' });
  const task = api.getBoard().tasks[0];
  assert.strictEqual(task.startDate, '2026-04-01');
  assert.strictEqual(task.dueDate, '2026-04-30');
});

console.log('\nValidation');

test('rejects an empty title', () => {
  const api = freshBoard();
  throwsWith(() => api.createTask({ title: '   ' }), 'needs a title');
  assert.strictEqual(api.getBoard().tasks.length, 0);
});

test('rejects an unknown status', () => {
  const api = freshBoard();
  throwsWith(() => api.createTask({ title: 'Nope', status: 'Someday' }), 'not one of the board columns');
});

test('rejects malformed and impossible dates', () => {
  const api = freshBoard();
  throwsWith(() => api.createTask({ title: 'Bad', dueDate: '30/04/2026' }), 'must look like');
  throwsWith(() => api.createTask({ title: 'Bad', dueDate: '2026-02-30' }), 'not a real date');
});

test('rejects a due date before the start date', () => {
  const api = freshBoard();
  throwsWith(
    () => api.createTask({ title: 'Backwards', startDate: '2026-05-02', dueDate: '2026-05-01' }),
    'cannot be before'
  );
});

test('rejects writes to non-editable fields', () => {
  const api = freshBoard();
  const id = add(api, 'Locked', 'To Do');
  throwsWith(() => api.updateTask(id, { position: 99 }), 'Cannot edit: position');
  throwsWith(() => api.updateTask(id, { id: 'hijack' }), 'Cannot edit: id');
});

test('rejects edits to a task that no longer exists', () => {
  const api = freshBoard();
  throwsWith(() => api.updateTask('missing', { title: 'x' }), 'no longer exists');
  throwsWith(() => api.moveTask('missing', 'To Do', 0), 'no longer exists');
});

test('matches status names case-insensitively', () => {
  const api = freshBoard();
  const id = add(api, 'Case', 'to do');
  assert.strictEqual(api.getBoard().tasks.find((t) => t.id === id).status, 'To Do');
});

console.log('\nMove (drag and drop)');

test('reorders within a column and renumbers positions', () => {
  const api = freshBoard();
  add(api, 'A', 'To Do');
  add(api, 'B', 'To Do');
  const c = add(api, 'C', 'To Do');

  api.moveTask(c, 'To Do', 0);
  eq(titlesIn(api, 'To Do'), ['C', 'A', 'B']);
  eq(positionsIn(api, 'To Do'), [1, 2, 3]);
});

test('moves between columns at a chosen index', () => {
  const api = freshBoard();
  add(api, 'A', 'To Do');
  add(api, 'B', 'To Do');
  const x = add(api, 'X', 'Backlog');

  api.moveTask(x, 'To Do', 1);
  eq(titlesIn(api, 'To Do'), ['A', 'X', 'B']);
  eq(positionsIn(api, 'To Do'), [1, 2, 3]);
  eq(titlesIn(api, 'Backlog'), []);
});

test('closes the gap in the column a task left', () => {
  const api = freshBoard();
  add(api, 'A', 'To Do');
  const b = add(api, 'B', 'To Do');
  add(api, 'C', 'To Do');

  api.moveTask(b, 'Done', 0);
  eq(titlesIn(api, 'To Do'), ['A', 'C']);
  eq(positionsIn(api, 'To Do'), [1, 2]);
});

test('clamps out-of-range positions instead of failing', () => {
  const api = freshBoard();
  add(api, 'A', 'To Do');
  const b = add(api, 'B', 'Backlog');

  api.moveTask(b, 'To Do', 99);
  eq(titlesIn(api, 'To Do'), ['A', 'B']);
  api.moveTask(b, 'To Do', -5);
  eq(titlesIn(api, 'To Do'), ['B', 'A']);
});

test('ordering survives a fresh read of the sheet', () => {
  const api = freshBoard();
  const a = add(api, 'A', 'To Do');
  add(api, 'B', 'To Do');
  add(api, 'C', 'To Do');
  api.moveTask(a, 'To Do', 2);

  // getBoard re-reads every row from the sheet, exactly like a page refresh.
  eq(titlesIn(api, 'To Do'), ['B', 'C', 'A']);
  eq(positionsIn(api, 'To Do'), [1, 2, 3]);
});

test('returns the updated board with every mutation', () => {
  const api = freshBoard();
  const id = add(api, 'A', 'To Do');
  const result = api.moveTask(id, 'Done', 0);
  assert.strictEqual(result.taskId, id);
  assert.strictEqual(result.board.tasks[0].status, 'Done');
  assert.ok(Array.isArray(result.board.statuses));
});

console.log('\nUpdate and delete');

test('updates only the fields it is given', () => {
  const api = freshBoard();
  const id = api.createTask({ title: 'Original', description: 'Keep me', assignee: 'Ada' }).taskId;
  api.updateTask(id, { title: 'Renamed' });
  const task = api.getBoard().tasks.find((t) => t.id === id);
  assert.strictEqual(task.title, 'Renamed');
  assert.strictEqual(task.description, 'Keep me');
  assert.strictEqual(task.assignee, 'Ada');
});

test('changing status parks the task at the bottom of the new column', () => {
  const api = freshBoard();
  add(api, 'A', 'To Do');
  add(api, 'B', 'To Do');
  const c = add(api, 'C', 'Backlog');

  api.updateTask(c, { status: 'To Do' });
  eq(titlesIn(api, 'To Do'), ['A', 'B', 'C']);
  eq(positionsIn(api, 'To Do'), [1, 2, 3]);
});

test('clearing a date writes an empty cell', () => {
  const api = freshBoard();
  const id = api.createTask({ title: 'Dated', dueDate: '2026-04-30' }).taskId;
  api.updateTask(id, { dueDate: '' });
  assert.strictEqual(api.getBoard().tasks.find((t) => t.id === id).dueDate, '');
});

test('deleting removes the row and renumbers the column', () => {
  const api = freshBoard();
  add(api, 'A', 'To Do');
  const b = add(api, 'B', 'To Do');
  add(api, 'C', 'To Do');

  api.deleteTask(b);
  eq(titlesIn(api, 'To Do'), ['A', 'C']);
  eq(positionsIn(api, 'To Do'), [1, 2]);
  assert.strictEqual(api.spreadsheet.getSheetByName('Tasks').getLastRow(), 3); // header + 2
});

test('deleting a middle row keeps the other rows intact', () => {
  const api = freshBoard();
  const ids = ['A', 'B', 'C', 'D'].map((title) => add(api, title, 'To Do'));
  api.deleteTask(ids[1]);
  const board = api.getBoard();
  eq(board.tasks.map((t) => t.title), ['A', 'C', 'D']);
  eq(board.tasks.map((t) => t.id), [ids[0], ids[2], ids[3]]);
});

console.log('\nConcurrency and data integrity');

test('a stale client index cannot drop or duplicate rows', () => {
  const api = freshBoard();
  const ids = ['A', 'B', 'C'].map((title) => add(api, title, 'To Do'));
  const d = add(api, 'D', 'Backlog');

  // Two clients read the same board, then both write. The second client's
  // index was computed before the first write landed.
  api.moveTask(d, 'To Do', 0);
  api.moveTask(ids[2], 'To Do', 2);

  const board = api.getBoard();
  const seen = board.tasks.map((task) => task.id).sort();
  eq(seen, ids.concat([d]).sort());
  eq(positionsIn(api, 'To Do'), [1, 2, 3, 4]);
});

test('interleaved edits and moves leave every row well-formed', () => {
  const api = freshBoard();
  const ids = ['A', 'B', 'C', 'D', 'E'].map((title, i) => add(api, title, i % 2 ? 'To Do' : 'Backlog'));

  api.updateTask(ids[0], { title: 'A2', assignee: 'Ada' });
  api.moveTask(ids[3], 'In Progress', 0);
  api.updateTask(ids[1], { status: 'Done' });
  api.moveTask(ids[4], 'Backlog', 0);
  api.deleteTask(ids[2]);

  const board = api.getBoard();
  assert.strictEqual(board.tasks.length, 4);
  board.tasks.forEach((task) => {
    assert.ok(task.id, 'every row keeps its id');
    assert.ok(task.title, 'every row keeps its title');
    assert.ok(board.statuses.indexOf(task.status) !== -1, 'every row keeps a valid status');
    assert.ok(task.position >= 1, 'every row keeps a position');
  });
  board.statuses.forEach((status) => {
    const positions = positionsIn(api, status);
    eq(positions, positions.map((_, i) => i + 1), status + ' is contiguous');
  });
});

test('a write that cannot take the lock fails without touching the sheet', () => {
  const api = freshBoard();
  add(api, 'A', 'To Do');
  const before = api.getBoard();

  api.lock.allowLock = false;
  throwsWith(() => api.createTask({ title: 'Blocked' }), 'Someone else is saving');
  api.lock.allowLock = true;

  eq(api.getBoard().tasks, before.tasks);
});

test('every write releases the lock, including failed ones', () => {
  const api = freshBoard();
  const before = api.lock.acquisitions;
  add(api, 'A', 'To Do');
  throwsWith(() => api.createTask({ title: '' }), 'needs a title');
  assert.strictEqual(api.lock.held, false);
  assert.strictEqual(api.lock.releases, api.lock.acquisitions);
  assert.strictEqual(api.lock.acquisitions, before + 2);
});

test('rows with a status missing from Settings are kept, not dropped', () => {
  const api = freshBoard();
  add(api, 'Known', 'To Do');
  const sheet = api.spreadsheet.getSheetByName('Tasks');
  sheet.appendRow(['manual-id', 'Typed by hand', '', 'Blocked', '', '', '', 1, new Date()]);

  const board = api.getBoard();
  assert.strictEqual(board.tasks.length, 2);
  const orphan = board.tasks.find((task) => task.id === 'manual-id');
  assert.strictEqual(orphan.status, 'Blocked');
  // Unknown statuses sort after the configured columns.
  assert.strictEqual(board.tasks[board.tasks.length - 1].id, 'manual-id');
});

test('rows added by hand without a position still get a stable order', () => {
  const api = freshBoard();
  const sheet = api.spreadsheet.getSheetByName('Tasks');
  sheet.appendRow(['hand-1', 'One', '', 'To Do', '', '', '', '', new Date()]);
  sheet.appendRow(['hand-2', 'Two', '', 'To Do', '', '', '', '', new Date()]);
  eq(titlesIn(api, 'To Do'), ['One', 'Two']);

  api.moveTask('hand-2', 'To Do', 0);
  eq(titlesIn(api, 'To Do'), ['Two', 'One']);
  eq(positionsIn(api, 'To Do'), [1, 2]);
});

test('a date stored as a real Date cell reads back as yyyy-MM-dd', () => {
  const api = freshBoard();
  const sheet = api.spreadsheet.getSheetByName('Tasks');
  sheet.appendRow(['date-1', 'Real date', '', 'To Do', '', new Date(2026, 3, 30), '', 1, new Date()]);
  assert.strictEqual(api.getBoard().tasks[0].dueDate, '2026-04-30');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
