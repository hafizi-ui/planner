// Recorded mocks of the Apps Script services used by LastManOut.gs, for `node --test automation/test`.
// The .gs file is loaded in a vm context; every call that sends, writes or schedules something is recorded.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const GS_PATH = path.join(__dirname, "..", "LastManOut.gs");
const SRC = fs.readFileSync(GS_PATH, "utf8");

/** Loads the script with NO Apps Script services: only the pure functions can run. */
function loadPure() {
  const ctx = vm.createContext({});
  vm.runInContext(SRC, ctx, { filename: "LastManOut.gs" });
  return ctx;
}

/* ---------- time zone helpers (Node has full ICU) ---------- */
function zoneParts(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  const p = {};
  dtf.formatToParts(date).forEach((x) => { p[x.type] = x.value; });
  return { y: +p.year, M: +p.month, d: +p.day, H: +p.hour % 24, m: +p.minute, s: +p.second };
}
function tzOffsetMs(tz, utcMs) {
  const p = zoneParts(new Date(utcMs), tz);
  return Date.UTC(p.y, p.M - 1, p.d, p.H, p.m, p.s) - utcMs;
}
const pad = (n) => String(n).padStart(2, "0");
function formatDate(date, tz, pattern) {
  if (!tz) throw new Error("Utilities.formatDate needs a time zone");
  const p = zoneParts(new Date(date.getTime()), tz);
  return pattern.replace(/yyyy|MM|dd|HH|mm|ss|M|d|H/g, (t) => ({
    yyyy: String(p.y), MM: pad(p.M), dd: pad(p.d), HH: pad(p.H), mm: pad(p.m), ss: pad(p.s), M: String(p.M), d: String(p.d), H: String(p.H)
  })[t]);
}
function parseDate(str, tz, pattern) {
  if (pattern !== "yyyy-MM-dd HH:mm" && pattern !== "yyyy-MM-dd") throw new Error("mock parseDate: unsupported pattern " + pattern);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(str);
  if (!m) throw new Error("mock parseDate: bad input " + str);
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  return new Date(guess - tzOffsetMs(tz, guess));
}

/**
 * Creates a fresh context with mocks.
 * opts: { rows: string[][] (display values, row 1 = header), sheetName, props, quota, user, now (Date|string),
 *         promptText, promptButton, alertButton, calendarFails }
 */
function createGas(opts) {
  opts = opts || {};
  const rec = {
    emails: [], events: [], deleted: [], triggers: [], alerts: [], prompts: [], menus: [], logs: [],
    writes: [], propWrites: [], propDeletes: [], locks: 0
  };
  const state = { quota: opts.quota == null ? 1500 : opts.quota, now: new Date(opts.now || "2026-12-05T07:05:00+08:00"), nextEvent: 1, nextTrigger: 1 };

  /* ----- Spreadsheet ----- */
  function makeSheet(name, rows) {
    const data = (rows || []).map((r) => r.map((c) => (c == null ? "" : String(c))));
    const width = () => data.reduce((w, r) => Math.max(w, r.length), 0);
    return {
      _data: data,
      getName: () => name,
      getLastColumn: () => width(),
      getLastRow: () => data.length,
      getDataRange: () => ({
        getDisplayValues: () => { const w = width(); return data.map((r) => { const c = r.slice(); while (c.length < w) c.push(""); return c; }); }
      }),
      getRange: (row, col) => {
        if (!(row >= 1 && col >= 1)) throw new Error("getRange: bad cell " + row + "," + col);
        const range = {
          setNumberFormat: (f) => { range._fmt = f; return range; },
          setValue: (v) => {
            while (data.length < row) data.push([]);
            while (data[row - 1].length < col) data[row - 1].push("");
            data[row - 1][col - 1] = v == null ? "" : String(v);
            rec.writes.push({ sheet: name, row, col, value: String(v), format: range._fmt || "" });
            return range;
          },
          getDisplayValue: () => ((data[row - 1] || [])[col - 1] || "")
        };
        return range;
      }
    };
  }
  const sheets = [makeSheet(opts.sheetName || "Giliran", opts.rows || [])];
  const ss = {
    getSheetByName: (n) => sheets.find((s) => s.getName() === n) || null,
    getSheets: () => sheets.slice(),
    getName: () => "Giliran Last Man Out (ujian)"
  };
  const Button = { OK: "OK", CANCEL: "CANCEL", YES: "YES", NO: "NO", CLOSE: "CLOSE" };
  const ButtonSet = { OK: "OK", OK_CANCEL: "OK_CANCEL", YES_NO: "YES_NO", YES_NO_CANCEL: "YES_NO_CANCEL" };
  const ui = {
    Button, ButtonSet,
    createMenu: (title) => {
      const menu = { title, items: [] };
      const api = {
        addItem: (label, fn) => { menu.items.push({ label, fn }); return api; },
        addSeparator: () => { menu.items.push({ separator: true }); return api; },
        addToUi: () => { rec.menus.push(menu); }
      };
      return api;
    },
    alert: (a, b, c) => {
      rec.alerts.push(b === undefined ? { title: "", message: a } : { title: a, message: b, buttons: c });
      return opts.alertButton || Button.YES;
    },
    prompt: (title, msg, buttons) => {
      rec.prompts.push({ title, message: msg, buttons });
      return { getSelectedButton: () => opts.promptButton || Button.OK, getResponseText: () => opts.promptText || "" };
    }
  };
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => ss,
    getUi: () => { if (opts.noUi) throw new Error("Cannot call SpreadsheetApp.getUi() from this context."); return ui; }
  };

  /* ----- Calendar ----- */
  function makeEvent(kind, title, start, end, options, recurrence) {
    const ev = {
      kind, title, start: new Date(start.getTime()), end: new Date(end.getTime()), options: Object.assign({}, options || {}),
      recurrence: recurrence ? recurrence._describe() : null, reminders: ["default"], tags: {}, deleted: false,
      id: "evt" + state.nextEvent++ + "@google.com"
    };
    const api = {
      getId: () => ev.id,
      removeAllReminders: () => { ev.reminders = []; return api; },
      addPopupReminder: (m) => { ev.reminders.push(m); return api; },
      setTag: (k, v) => { ev.tags[k] = v; return api; },
      deleteEventSeries: () => { ev.deleted = true; rec.deleted.push(ev.id); },
      deleteEvent: () => { ev.deleted = true; rec.deleted.push(ev.id); }
    };
    ev.api = api;
    rec.events.push(ev);
    return api;
  }
  const calendar = {
    getId: () => "primary",
    createEvent: (title, start, end, options) => {
      if (opts.calendarFails) throw new Error("Calendar service error (mock)");
      return makeEvent("single", title, start, end, options, null);
    },
    createEventSeries: (title, start, end, recurrence, options) => {
      if (opts.calendarFails) throw new Error("Calendar service error (mock)");
      return makeEvent("series", title, start, end, options, recurrence);
    },
    getEventSeriesById: (id) => { const ev = rec.events.find((e) => e.id === id && !e.deleted); return ev ? ev.api : null; },
    getEventById: (id) => { const ev = rec.events.find((e) => e.id === id && !e.deleted); return ev ? ev.api : null; }
  };
  function newRecurrence() {
    const rules = [];
    function rule(kind) {
      const r = { kind, count: null, weekdays: null };
      rules.push(r);
      const api = {
        times: (n) => { r.count = n; return api; },
        until: (d) => { r.until = d; return api; },
        onlyOnWeekdays: (w) => { r.weekdays = w.slice(); return api; },
        addDailyRule: () => rule("daily"),
        addWeeklyRule: () => rule("weekly"),
        _describe: () => rules.map((x) => Object.assign({}, x))
      };
      return api;
    }
    return { addDailyRule: () => rule("daily"), addWeeklyRule: () => rule("weekly"), _describe: () => rules.map((x) => Object.assign({}, x)) };
  }
  const Weekday = { SUNDAY: "SU", MONDAY: "MO", TUESDAY: "TU", WEDNESDAY: "WE", THURSDAY: "TH", FRIDAY: "FR", SATURDAY: "SA" };
  const CalendarApp = {
    Weekday,
    getDefaultCalendar: () => calendar,
    getCalendarById: (id) => (id === "primary" ? calendar : null),
    newRecurrence
  };

  /* ----- Mail ----- */
  const MailApp = {
    getRemainingDailyQuota: () => state.quota,
    sendEmail: (a, subject, body, options) => {
      const m = typeof a === "object" ? Object.assign({}, a) : Object.assign({ to: a, subject, body }, options || {});
      if (state.quota < 1) throw new Error("Service invoked too many times for one day: email.");
      state.quota -= 1;
      rec.emails.push(m);
    }
  };

  /* ----- Properties ----- */
  const store = Object.assign({}, opts.props || {});
  const scriptProps = {
    getProperties: () => Object.assign({}, store),
    getProperty: (k) => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = String(v); rec.propWrites.push([k, String(v)]); return scriptProps; },
    deleteProperty: (k) => { delete store[k]; rec.propDeletes.push(k); return scriptProps; }
  };
  const PropertiesService = { getScriptProperties: () => scriptProps };

  /* ----- Triggers, lock, session, logger ----- */
  const triggers = (opts.triggers || []).map((t) => makeTrigger(t));
  function makeTrigger(cfg) {
    const id = "trig" + state.nextTrigger++;
    return Object.assign({ getHandlerFunction: () => cfg.fn, getUniqueId: () => id, _cfg: cfg });
  }
  const ScriptApp = {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (t) => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: (fn) => {
      const cfg = { fn };
      const b = {
        timeBased: () => { cfg.timeBased = true; return b; },
        everyDays: (n) => { cfg.everyDays = n; return b; },
        atHour: (h) => { cfg.atHour = h; return b; },
        nearMinute: (m) => { cfg.nearMinute = m; return b; },
        inTimezone: (tz) => { cfg.tz = tz; return b; },
        create: () => { const t = makeTrigger(cfg); triggers.push(t); return t; }
      };
      return b;
    }
  };
  const LockService = {
    getScriptLock: () => ({
      tryLock: () => { rec.locks++; return opts.lockBusy ? false : true; },
      waitLock: () => {},
      releaseLock: () => { rec.locks--; },
      hasLock: () => rec.locks > 0
    })
  };
  const user = { getEmail: () => (opts.user == null ? "su@example.com" : opts.user) };
  const Session = { getEffectiveUser: () => user, getActiveUser: () => user, getScriptTimeZone: () => "Asia/Kuala_Lumpur" };
  const Logger = { log: (...a) => { rec.logs.push(a.join(" ")); } };
  const Utilities = { formatDate, parseDate };

  const ctx = vm.createContext({
    SpreadsheetApp, CalendarApp, MailApp, PropertiesService, ScriptApp, LockService, Session, Logger, Utilities, console
  });
  vm.runInContext(SRC, ctx, { filename: "LastManOut.gs" });
  // Injectable clock: the script calls now_() for "now".
  ctx.now_ = () => new Date(state.now.getTime());

  return {
    ctx, rec, store, triggers, sheet: sheets[0],
    setNow: (d) => { state.now = new Date(d); },
    setQuota: (q) => { state.quota = q; },
    setRows: (rows) => { sheets[0]._data.length = 0; rows.forEach((r) => sheets[0]._data.push(r.map(String))); },
    liveEvents: () => rec.events.filter((e) => !e.deleted)
  };
}

/** Minimal CSV parser (same rules as the planner's parseCSV): BOM removed, quotes, \n or \r\n. */
function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

module.exports = { createGas, loadPure, parseCsv, formatDate, parseDate, GS_PATH };
