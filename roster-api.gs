/**
 * ASMH CarePortal — Duty Roster API (Google Apps Script)
 *
 * Stores the duty roster edited on the CarePortal website in a
 * "ROSTER_DB" tab of the shared ER handover Google Sheet.
 *
 * SET-UP (once, ~5 minutes)
 *  1. Go to https://script.google.com → New project. Name it "ASMH Roster API".
 *  2. Replace the code with this file and Save.
 *  3. Project Settings (gear) → Script properties → Add property:
 *        PIN = <a PIN for staff allowed to edit the roster>
 *  4. Deploy → New deployment → type "Web app"
 *        Execute as: Me      Who has access: Anyone
 *     Authorise when asked, then copy the Web app URL (ends in /exec).
 *  5. In index.html, search for  var ROSTER_API=''  and paste the URL
 *     between the quotes. Commit — everyone now shares one roster.
 *
 * Anyone with the URL can READ the roster; SAVING requires the PIN.
 */
var SHEET_ID = '1QIrXpL3iukUIyy2fVTHVya9Fp_DegpLYAxsvGJ0GnOE';
var TAB = 'ROSTER_DB';
var HEAD = ['section', 'date', 'shift', 'dept', 'area', 'name', 'role', 'phone', 'ext', 'label', 'notes', 'when'];
var SECTIONS = ['mo', 'cons', 'contacts', 'esc', 'people'];

function doGet() {
  return json({ ok: true, data: readAll(), updated: updatedAt() });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'Bad request' }); }
  var pin = PropertiesService.getScriptProperties().getProperty('PIN');
  if (!pin || String(body.pin || '') !== String(pin)) return json({ ok: false, error: 'Wrong PIN' });
  if (body.action !== 'save' || !body.data) return json({ ok: false, error: 'Unknown action' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var current = updatedAt();
    if (current && body.base && body.base !== current) {
      return json({ ok: false, error: 'Someone else changed the roster just now. Reload the page and try again.' });
    }
    writeAll(body.data);
    var stamp = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty('updated', stamp);
    return json({ ok: true, data: readAll(), updated: stamp });
  } finally {
    lock.releaseLock();
  }
}

function sheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(TAB);
  if (!sh) {
    sh = ss.insertSheet(TAB);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll() {
  var sh = sheet(), out = {};
  SECTIONS.forEach(function (s) { out[s] = []; });
  var n = sh.getLastRow() - 1;
  if (n < 1) return out;
  sh.getRange(2, 1, n, HEAD.length).getDisplayValues().forEach(function (r) {
    var o = {};
    HEAD.forEach(function (h, i) { if (r[i] !== '') o[h] = r[i]; });
    var s = o.section; delete o.section;
    if (out[s]) out[s].push(o);
  });
  return out;
}

function writeAll(data) {
  var sh = sheet(), rows = [];
  SECTIONS.forEach(function (s) {
    (data[s] || []).forEach(function (o) {
      rows.push(HEAD.map(function (h) { return h === 'section' ? s : String(o[h] == null ? '' : o[h]).slice(0, 300); }));
    });
  });
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, HEAD.length).clearContent();
  if (rows.length) {
    var rg = sh.getRange(2, 1, rows.length, HEAD.length);
    rg.setNumberFormat('@');   // keep dates/phones as plain text
    rg.setValues(rows);
  }
}

function updatedAt() { return PropertiesService.getScriptProperties().getProperty('updated') || ''; }

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
