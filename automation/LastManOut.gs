/** @OnlyCurrentDoc */

/*
 * Last Man Out (MQS): peringatan automatik untuk Setiausaha Jabatan JPPP, KPTM Kuantan.
 *
 * Kod ini ditampal ke dalam Google Sheet SU (Sambungan > Apps Script).
 * Panduan langkah demi langkah: automation/PANDUAN.md
 *
 * Tab "Giliran" = CSV giliran yang dieksport dari planner ("Eksport CSV untuk Google Sheet").
 * Setiap pagi (sekitar 7 pagi waktu Malaysia) skrip ini:
 *   - 2 hari sebelum giliran (termasuk Sabtu/Ahad): menghantar emel dan jemputan
 *     Google Calendar kepada pegawai bertugas;
 *   - pada hari pertama giliran: menghantar emel kepada SU dengan pautan WhatsApp
 *     satu-sentuh (mesej siap ditulis; SU tekan Hantar sahaja).
 * Data staf kekal dalam akaun Google SU sahaja.
 *
 * Code notes (English): plain V8 Apps Script, no libraries. planActions_() is a pure
 * function (no Apps Script services) so it can be unit-tested in Node; see automation/test.
 */

/* ===================== Tetapan (boleh diubah) ===================== */
var CFG = {
  SHEET: "Giliran",              // nama tab dalam Google Sheet
  TZ: "Asia/Kuala_Lumpur",       // zon masa Malaysia
  CAL_ID: "primary",             // "primary" = kalendar utama akaun ini
  DRY_RUN: false,                // true = uji sahaja, tiada apa-apa dihantar
  RUN_HOUR: 7,                   // skrip berjalan setiap hari antara 7 dan 8 pagi
  SENDER_NAME: "Setiausaha Jabatan JPPP",
  DAYS_BEFORE: 2,                // emel & jemputan kalendar: 2 hari sebelum giliran
  WARN_DAYS: 7,                  // amaran awal kepada SU jika pegawai tiada emel: 7 hari sebelum giliran
  POPUP_MINUTES: 30,             // peringatan pop-up dalam kalendar SU
  MIN_QUOTA: 5,                  // berhenti menghantar emel jika baki kuota harian kurang daripada ini
  TIME_FROM: "16:45",            // masa lalai jika lajur "Masa mula" kosong
  TIME_TO: "17:15",              // masa lalai jika lajur "Masa tamat" kosong
  KEEP_DAYS: 120                 // rekod "sudah dihantar" disimpan selama 120 hari
};
/* ================================================================== */

var LMO_SIGNOFF = "Setiausaha Jabatan JPPP, KPTM Kuantan";
var LMO_CHECKLIST = [
  "Semua lampu ditutup",
  "Penyaman udara & kipas dimatikan",
  "Suis utama dimatikan / palam dicabut",
  "Pintu utama & tingkap dikunci",
  "Tandatangan borang & catat masa keluar"
];
var LMO_DAYS = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
var LMO_MONTHS = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];

// Column headers (Contract 2), matched after trimming, removing the BOM and dots, lower-casing.
// Column order in the Sheet does not matter.
var LMO_COLS = {
  id: ["id"],
  start: ["mula", "start"],
  end: ["tamat", "end"],
  timeFrom: ["masa mula", "time from", "start time"],
  timeTo: ["masa tamat", "time to", "end time"],
  name: ["nama", "name"],
  email: ["emel", "e-mel", "email", "e-mail"],
  phone: ["no whatsapp", "whatsapp no", "whatsapp", "no telefon", "phone"],
  role: ["jawatan", "role"],
  prog: ["program", "programme"],
  off: ["cuti", "holiday"],
  emailSent: ["emel dihantar", "email sent"],
  calSent: ["kalendar dihantar", "calendar sent"],
  waSent: ["whatsapp dihantar", "whatsapp sent"],
  eventId: ["id acara", "event id"],
  note: ["catatan skrip", "script note"]
};
// Columns the script writes; added on the right when missing.
var LMO_WRITE_COLS = { emailSent: "Emel dihantar", calSent: "Kalendar dihantar", eventId: "ID acara", note: "Catatan skrip" };

/* ============================ Menu ============================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Last Man Out")
    .addItem("Pasang (sekali sahaja)", "install")
    .addItem("Uji tanpa hantar", "testRun")
    .addItem("Hantar emel ujian kepada saya", "sendTestToMe")
    .addItem("Jalankan sekarang", "runNow")
    .addSeparator()
    .addItem("Henti automatik", "uninstall")
    .addToUi();
}

/** Creates the daily trigger. Safe to run again: old dailyRun triggers are removed first. */
function install() {
  removeTriggers_();
  ScriptApp.newTrigger("dailyRun").timeBased().everyDays(1).atHour(CFG.RUN_HOUR).inTimezone(CFG.TZ).create();
  var sheet = findSheet_(), info = "";
  if (!sheet) info = "\n\nAMARAN: tab \"" + CFG.SHEET + "\" belum ada. Import CSV giliran dari planner ke tab itu.";
  else {
    var parsed = parseRows_(sheet.getDataRange().getDisplayValues(), CFG);
    info = parsed.ok ? "\n\nTab \"" + sheet.getName() + "\": " + parsed.items.length + " giliran dijumpai."
      : "\n\nAMARAN: " + parsed.error;
  }
  alert_("Automatik dipasang",
    "Skrip akan berjalan setiap hari antara " + CFG.RUN_HOUR + " dan " + (CFG.RUN_HOUR + 1) + " pagi (waktu Malaysia).\n\n" +
    "2 hari sebelum setiap giliran: emel dan jemputan Google Calendar kepada pegawai.\n" +
    "Hari pertama giliran: emel kepada anda dengan pautan WhatsApp." + info);
}

/** Removes the daily trigger. Records of what was sent are kept, so installing again never resends. */
function uninstall() {
  var n = removeTriggers_();
  alert_("Automatik dihentikan", n ? "Skrip tidak akan menghantar apa-apa lagi. Pilih \"Pasang (sekali sahaja)\" untuk mula semula."
    : "Automatik memang belum dipasang.");
}

/** Run by the daily trigger. */
function dailyRun() {
  return runCore_({ dry: CFG.DRY_RUN });
}

/** Menu: run now (asks first). */
function runNow() {
  var ui = ui_();
  if (ui) {
    var b = ui.alert("Jalankan sekarang",
      "Hantar sekarang semua notis Last Man Out yang perlu dihantar hari ini? Notis yang sudah dihantar tidak akan dihantar semula.",
      ui.ButtonSet.YES_NO);
    if (b !== ui.Button.YES) return null;
  }
  var r = runCore_({ dry: CFG.DRY_RUN });
  alert_("Last Man Out", summary_(r));
  return r;
}

/** Menu: dry run for a chosen date. Sends nothing and writes nothing. */
function testRun() {
  var ui = ui_(), today = todayIso_(now_()), day = today;
  if (ui) {
    var resp = ui.prompt("Uji tanpa hantar",
      "Tarikh untuk diuji, cth. " + dmy_(addDays_(today, 1)) + " (kosongkan = hari ini).\nTiada emel atau jemputan akan dihantar.",
      ui.ButtonSet.OK_CANCEL);
    if (resp.getSelectedButton() !== ui.Button.OK) return null;
    var txt = String(resp.getResponseText() || "").trim();
    if (txt) {
      day = parseDate_(txt);
      if (!day) { alert_("Uji tanpa hantar", "Tarikh tidak difahami: \"" + txt + "\". Tulis seperti " + dmy_(today) + "."); return null; }
    }
  }
  var r = runCore_({ dry: true, today: day });
  alert_("Uji tanpa hantar: " + longDate_(day), r.plan ? describePlan_(r.plan) : summary_(r));
  return r;
}

/** Menu: sends the next turn's email, a calendar event and the duty-day email to the SU only. */
function sendTestToMe() {
  var today = todayIso_(now_()), su = suEmail_(), sheet = findSheet_();
  if (!sheet) { alert_("Emel ujian", "Tab \"" + CFG.SHEET + "\" tidak dijumpai."); return null; }
  var parsed = parseRows_(sheet.getDataRange().getDisplayValues(), CFG);
  if (!parsed.ok) { alert_("Emel ujian", parsed.error); return null; }
  var r = nextItem_(parsed.items, today);
  if (!r) { alert_("Emel ujian", "Tiada giliran akan datang dalam tab \"" + sheet.getName() + "\"."); return null; }
  if (MailApp.getRemainingDailyQuota() < 2) { alert_("Emel ujian", "Kuota emel harian akaun ini sudah habis. Cuba esok."); return null; }
  var sendDay = addDays_(r.start, -CFG.DAYS_BEFORE);
  MailApp.sendEmail({
    to: su, name: CFG.SENDER_NAME,
    subject: "[UJIAN] " + mailSubject_(r),
    body: "INI EMEL UJIAN. Emel sebenar akan dihantar kepada " + r.name + " (" + (r.addr ? r.email : "tiada emel dalam Sheet") +
      ") pada " + longDate_(sendDay) + ".\n\n----------\n\n" + mailBody_(r)
  });
  createLmoEvent_(getCalendar_(), r, { title: "[UJIAN] " + calTitle_(r), guest: "" });
  var text = waText_(r);
  var dg = buildDigest_({ today: r.start, wa: [{ item: r, phone: r.phone, text: text, url: r.phone ? waUrl_(r.phone, text) : "" }] });
  var intro = "INI EMEL UJIAN: contoh emel yang anda akan terima pada hari bertugas. Jangan tekan Hantar dalam WhatsApp semasa ujian.";
  MailApp.sendEmail({
    to: su, name: CFG.SENDER_NAME, subject: "[UJIAN] " + dg.subject,
    body: intro + "\n\n" + dg.body, htmlBody: "<p><b>" + esc_(intro) + "</b></p>" + dg.html
  });
  alert_("Emel ujian dihantar",
    "Dua emel ujian dihantar ke " + su + ".\n\nSatu acara \"[UJIAN] " + calTitle_(r) + "\" juga dicipta dalam Google Calendar anda pada " +
    longDate_(r.days[0]) + ". Tiada jemputan dihantar kepada pegawai. Padam acara [UJIAN] itu selepas menyemak.");
  return { item: r };
}

/* ======================== Run and execute ======================== */

function now_() { return new Date(); }
function todayIso_(d) { return Utilities.formatDate(d, CFG.TZ, "yyyy-MM-dd"); }

function runCore_(opt) {
  opt = opt || {};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log("Last Man Out: skrip lain sedang berjalan. Cuba lagi sebentar."); return { busy: true }; }
  try {
    var now = now_(), today = opt.today || todayIso_(now);
    var store = PropertiesService.getScriptProperties();
    var sheet = findSheet_();
    if (!sheet) {
      var msg = "Tab \"" + CFG.SHEET + "\" tidak dijumpai dalam Google Sheet ini. Import CSV giliran dari planner ke tab bernama " + CFG.SHEET + ".";
      if (!opt.dry) reportBroken_(msg, today, store);
      return { error: msg };
    }
    var plan = planActions_(sheet.getDataRange().getDisplayValues(), today, store.getProperties(), CFG);
    if (opt.dry) { Logger.log(describePlan_(plan)); return { dry: true, plan: plan }; }
    if (!plan.ok) { reportBroken_(plan.error, today, store); return { plan: plan, error: plan.error }; }
    var res = execute_(plan, { sheet: sheet, store: store, now: now, su: suEmail_() });
    Logger.log(summary_({ plan: plan, result: res }));
    return { plan: plan, result: res };
  } finally {
    lock.releaseLock();
  }
}

function execute_(plan, env) {
  var store = env.store, sheet = env.sheet;
  var stamp = Utilities.formatDate(env.now, CFG.TZ, "yyyy-MM-dd HH:mm");
  var out = { today: plan.today, sent: [], cancelled: [], wa: [], problems: plan.problems.slice(), errors: [], quotaLow: null, notes: {}, digestSent: false };
  var cols = plan.actions.length || plan.problems.length ? ensureCols_(sheet, plan) : plan.cols;
  var cal = null;
  function calendar() { return cal || (cal = getCalendar_()); }
  function note(row, text) { if (row) (out.notes[row] = out.notes[row] || []).push(text); }

  plan.actions.forEach(function (a) {
    try {
      if (a.type === "delcal") {
        var old = a.eventId ? calendar().getEventSeriesById(a.eventId) : null;
        if (old) old.deleteEventSeries();
        store.deleteProperty(a.key);
        writeCell_(sheet, a.row, cols.calSent, "");
        out.cancelled.push(a);
        note(a.row, "Jemputan kalendar untuk " + a.addr + " dibatalkan (" + a.why + ")");
      } else if (a.type === "email") {
        var q = MailApp.getRemainingDailyQuota();
        if (q < CFG.MIN_QUOTA) {
          out.quotaLow = q;
          note(a.row, "Emel belum dihantar: kuota emel harian hampir habis");
          return;
        }
        var mail = { to: a.to, subject: a.subject, body: a.body, name: CFG.SENDER_NAME };
        if (env.su) mail.replyTo = env.su;
        MailApp.sendEmail(mail);
        store.setProperty(a.key, stamp);
        writeCell_(sheet, a.row, cols.emailSent, stamp);
        out.sent.push(a);
        note(a.row, "Emel dihantar kepada " + a.to);
      } else if (a.type === "cal") {
        var ev = createLmoEvent_(calendar(), a.item, { title: a.title, guest: a.guest });
        var evId = ev.getId();
        store.setProperty(a.key, evId);
        writeCell_(sheet, a.row, cols.calSent, stamp);
        writeCell_(sheet, a.row, cols.eventId, evId);
        out.sent.push(a);
        note(a.row, "Jemputan Google Calendar dihantar kepada " + a.guest);
      } else if (a.type === "wa") {
        out.wa.push(a);
      }
    } catch (e) {
      var m = errText_(e);
      out.errors.push({ action: a, message: m });
      note(a.row, "Ralat (" + actionLabel_(a) + "): " + m);
      Logger.log("Last Man Out: ralat " + a.type + " " + a.id + ": " + m);
    }
  });
  out.problems.forEach(function (p) { note(p.row, p.text); });

  var dg = buildDigest_(out);
  if (dg && env.su) {
    try {
      if (MailApp.getRemainingDailyQuota() < 1) throw new Error("kuota emel harian sudah habis");
      MailApp.sendEmail({ to: env.su, subject: dg.subject, body: dg.body, htmlBody: dg.html, name: CFG.SENDER_NAME });
      out.digestSent = true;
      out.wa.forEach(function (a) { store.setProperty(a.key, a.value); note(a.row, "Pautan WhatsApp diemel kepada SU"); });
      out.problems.forEach(function (p) { if (p.key) store.setProperty(p.key, stamp); });
    } catch (e2) {
      out.digestError = errText_(e2);
      Logger.log("Last Man Out: ringkasan kepada SU tidak dihantar: " + out.digestError);
    }
  }

  Object.keys(out.notes).forEach(function (row) {
    writeCell_(sheet, Number(row), cols.note, stamp + " " + out.notes[row].join("; "));
  });
  staleKeys_(store.getProperties(), plan.today, CFG.KEEP_DAYS).forEach(function (k) { store.deleteProperty(k); });
  return out;
}

function createLmoEvent_(cal, r, o) {
  var first = r.days[0];
  var s = Utilities.parseDate(first + " " + r.timeFrom, CFG.TZ, "yyyy-MM-dd HH:mm");
  var e = Utilities.parseDate(first + " " + r.timeTo, CFG.TZ, "yyyy-MM-dd HH:mm");
  var opt = { description: calDetails_() };
  if (o.guest) { opt.guests = o.guest; opt.sendInvites = true; }
  var ev;
  if (r.days.length > 1) {
    var rec = CalendarApp.newRecurrence();
    if (r.contiguous) rec = rec.addDailyRule().times(r.days.length);
    else {
      var W = CalendarApp.Weekday;
      rec = rec.addWeeklyRule().onlyOnWeekdays([W.MONDAY, W.TUESDAY, W.WEDNESDAY, W.THURSDAY, W.FRIDAY]).times(r.days.length);
    }
    ev = cal.createEventSeries(o.title, s, e, rec, opt);
  } else {
    ev = cal.createEvent(o.title, s, e, opt);
  }
  ev.removeAllReminders();
  ev.addPopupReminder(CFG.POPUP_MINUTES);
  ev.setTag("lmoId", r.id);
  return ev;
}

function reportBroken_(msg, today, store) {
  var key = "warn|sheet|" + today, su = suEmail_();
  Logger.log("Last Man Out: " + msg);
  if (store.getProperty(key) || !su) return;
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    MailApp.sendEmail({
      to: su, name: CFG.SENDER_NAME, subject: "Last Man Out " + dmy_(today) + ": skrip tidak dapat membaca Sheet",
      body: "Salam,\n\nSkrip Last Man Out tidak menghantar apa-apa hari ini kerana:\n" + msg +
        "\n\nCara membetulkan: dalam planner, buka Giliran Last Man Out > Eksport CSV untuk Google Sheet, kemudian import fail itu ke tab " +
        CFG.SHEET + " (Fail > Import > Gantikan helaian semasa).\n\nEmel ini dihantar oleh skrip Last Man Out dalam Google Sheet anda."
    });
    store.setProperty(key, "1");
  } catch (e) { Logger.log("Last Man Out: " + errText_(e)); }
}

function findSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CFG.SHEET);
  if (sh) return sh;
  var all = ss.getSheets(), i;
  for (i = 0; i < all.length; i++) if (String(all[i].getName()).trim().toLowerCase() === CFG.SHEET.toLowerCase()) return all[i];
  for (i = 0; i < all.length; i++) if (findHeader_(all[i].getDataRange().getDisplayValues().slice(0, 5))) return all[i];
  return null;
}

function ensureCols_(sheet, plan) {
  var cols = {}, k;
  for (k in plan.cols) cols[k] = plan.cols[k];
  var last = Math.max(sheet.getLastColumn(), plan.width || 0);
  for (k in LMO_WRITE_COLS) {
    if (cols[k] != null) continue;
    last += 1;
    sheet.getRange(plan.headerRow, last).setValue(LMO_WRITE_COLS[k]);
    cols[k] = last - 1;
  }
  return cols;
}

/** Writes plain text (so Sheets does not turn stamps into dates). col is 0-based. */
function writeCell_(sheet, row, col, value) {
  if (col == null || !row) return;
  sheet.getRange(row, col + 1).setNumberFormat("@").setValue(value);
}

function getCalendar_() {
  var c = CFG.CAL_ID === "primary" ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(CFG.CAL_ID);
  if (!c) throw new Error("Kalendar " + CFG.CAL_ID + " tidak dijumpai");
  return c;
}

function removeTriggers_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "dailyRun") { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

function suEmail_() {
  var e = "";
  try { e = Session.getEffectiveUser().getEmail(); } catch (x) { e = ""; }
  if (!e) try { e = Session.getActiveUser().getEmail(); } catch (y) { e = ""; }
  return e || "";
}

function ui_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}

function alert_(title, msg) {
  var ui = ui_();
  if (ui) ui.alert(title, msg, ui.ButtonSet.OK);
  else Logger.log(title + ": " + msg);
}

function errText_(e) { return String(e && e.message ? e.message : e); }

/* ================= Pure functions (no Apps Script services) ================= */

/**
 * Decides what to send today. Pure: depends only on its arguments.
 * rows: Sheet display values (row 1 = header). today: "yyyy-MM-dd" in Malaysia time.
 * props: script properties as a plain object.
 * Returns { ok, error, today, actions:[delcal|email|cal|wa], problems:[{row,id,text,key}], cols, headerRow, width, items }.
 */
function planActions_(rows, today, props, cfg) {
  cfg = cfg || CFG;
  props = props || {};
  var parsed = parseRows_(rows, cfg);
  var plan = {
    ok: parsed.ok, error: parsed.error || "", today: today, cols: parsed.cols || {}, headerRow: parsed.headerRow,
    width: parsed.width, items: parsed.items, actions: [], problems: []
  };
  if (!parsed.ok) return plan;
  var seen = {};
  function problem(r, code, text) {
    var key = "warn|" + r.id + "|" + code;
    if (!props[key]) plan.problems.push({ row: r.row, id: r.id, key: key, text: text });
  }
  parsed.items.forEach(function (r) {
    if (seen[r.id]) {
      problem(r, "dup|" + r.row, "ID " + r.id + " berulang dalam Sheet (baris " + seen[r.id] + " dan " + r.row + "). Baris " + r.row + " diabaikan.");
      return;
    }
    seen[r.id] = r.row;
    if (!r.valid) {
      problem(r, "date|" + r.rawStart + "|" + r.rawEnd, "Baris " + r.row + " (" + (r.name || r.id) + "): tarikh Mula/Tamat tidak difahami (\"" +
        r.rawStart + "\", \"" + r.rawEnd + "\"). Gunakan format 2026-12-07 atau 7/12/2026.");
      return;
    }
    var sendFrom = addDays_(r.start, -cfg.DAYS_BEFORE);
    var inSend = today >= sendFrom && today <= r.start;   // catch up after a missed run, never after the duty starts
    var active = today >= r.start && today <= r.end;
    var holder = !r.off && r.name ? r.addr : "";

    // 1. Cancel calendar invitations held by someone who is no longer on this turn (swap, holiday, name removed).
    var pre = "cal|" + r.id + "|";
    Object.keys(props).sort().forEach(function (k) {
      if (k.indexOf(pre) !== 0) return;
      var addr = k.slice(pre.length);
      if (addr && addr === holder) return;
      var why = r.off ? "cuti umum / tiada tugas" : r.name ? "giliran ditukar kepada " + r.name : "nama pegawai dikosongkan";
      if (today <= r.start) {
        plan.actions.push({ type: "delcal", row: r.row, id: r.id, item: r, addr: addr, eventId: props[k], key: k, why: why });
      } else {
        problem(r, "late|" + addr, r.id + " (" + r.period + "): " + why + " selepas tugas bermula. Jemputan kalendar untuk " + addr +
          " tidak dipadam dan tiada emel automatik dihantar; sila maklumkan pegawai berkenaan sendiri.");
      }
    });
    if (r.off) return;
    if (!r.name) {
      if (inSend || active) problem(r, "noname", r.id + " (" + r.period + "): tiada nama pegawai dalam Sheet.");
      return;
    }
    // 2. Email and calendar invitation, 2 days before (with an early warning to the SU when there is no email).
    if (!r.addr && today >= addDays_(r.start, -cfg.WARN_DAYS) && today < sendFrom) {
      problem(r, "noemail-early|" + r.name.toLowerCase(), r.name + " (" + r.period + "): tiada emel yang sah dalam Sheet. Isi emel dalam planner " +
        "(Kenalan pasukan), eksport semula CSV giliran dan import ke tab " + cfg.SHEET + " sebelum " + longDate_(sendFrom) +
        ", supaya emel dan jemputan Google Calendar dapat dihantar.");
    }
    if (inSend) {
      if (!r.addr) {
        problem(r, "noemail|" + r.name.toLowerCase(), r.name + " (" + r.period + "): tiada emel yang sah dalam Sheet, jadi emel dan jemputan " +
          "Google Calendar tidak dihantar. Isi emel dalam planner (Kenalan pasukan), eksport semula CSV giliran dan import ke tab " + cfg.SHEET + ".");
      } else {
        if (!sentBefore_(props, "email", r, r.stamps.email)) {
          plan.actions.push({ type: "email", row: r.row, id: r.id, item: r, key: "email|" + r.id + "|" + r.addr, to: r.email,
            subject: mailSubject_(r), body: mailBody_(r) });
        }
        if (!sentBefore_(props, "cal", r, r.stamps.cal)) {
          plan.actions.push({ type: "cal", row: r.row, id: r.id, item: r, key: "cal|" + r.id + "|" + r.addr, guest: r.email,
            title: calTitle_(r), description: calDetails_() });
        }
      }
      if (r.badTime) problem(r, "time", r.id + ": Masa mula/Masa tamat tidak difahami. Masa " + r.timeFrom + "–" + r.timeTo + " digunakan.");
    }
    // 3. Duty day: one-tap WhatsApp link for the SU.
    if (active) {
      var dg = props["digest|" + r.id];
      var waDone = dg ? dg === r.name : !!r.stamps.wa;
      if (!waDone) {
        var text = waText_(r);
        plan.actions.push({ type: "wa", row: r.row, id: r.id, item: r, key: "digest|" + r.id, value: r.name,
          phone: r.phone, text: text, url: r.phone ? waUrl_(r.phone, text) : "" });
      }
    }
  });
  return plan;
}

/** A Sheet stamp counts as sent, unless the script's own records show it was for somebody else. */
function sentBefore_(props, ch, r, stamp) {
  var pre = ch + "|" + r.id + "|";
  if (props[pre + r.addr]) return true;
  if (!stamp) return false;
  for (var k in props) if (k.indexOf(pre) === 0) return false;
  return true;
}

function parseRows_(rows, cfg) {
  cfg = cfg || CFG;
  rows = rows || [];
  var h = findHeader_(rows);
  if (!h) {
    return { ok: false, items: [], error: "Baris tajuk tidak dijumpai. Baris 1 tab \"" + cfg.SHEET +
      "\" mesti mengandungi tajuk CSV giliran dari planner (ID, Mula, Tamat, Masa mula, Masa tamat, Nama, Emel, ...)." };
  }
  var c = h.cols, items = [], width = 0;
  rows.forEach(function (r) { width = Math.max(width, (r || []).length); });
  for (var i = h.index + 1; i < rows.length; i++) {
    var r = rows[i] || [];
    var id = cell_(r, c, "id"), rawStart = cell_(r, c, "start"), rawEnd = cell_(r, c, "end"), name = cell_(r, c, "name");
    if (!id && !rawStart && !rawEnd && !name) continue;
    var start = parseDate_(rawStart), end = rawEnd ? parseDate_(rawEnd) : start;
    // A Sheet with US locale shows 7 Dec as 12/7/2026; the ID (plain text) tells which way round it is.
    var idDate = /(\d{4}-\d{2}-\d{2})/.exec(id);
    if (idDate && start !== idDate[1] && parseDateMD_(rawStart) === idDate[1]) {
      start = idDate[1];
      end = rawEnd ? parseDateMD_(rawEnd) : start;
    }
    var valid = !!(start && end && end >= start);
    var tfRaw = cell_(r, c, "timeFrom"), ttRaw = cell_(r, c, "timeTo");
    var tf = parseTime_(tfRaw), tt = parseTime_(ttRaw);
    var badTime = !!((tfRaw && !tf) || (ttRaw && !tt));
    tf = tf || cfg.TIME_FROM;
    tt = tt || cfg.TIME_TO;
    if (tt <= tf) { badTime = true; tf = cfg.TIME_FROM; tt = cfg.TIME_TO; }
    var email = cell_(r, c, "email");
    var days = valid ? workDays_(start, end) : [];
    if (valid && !days.length) days = [start];
    items.push({
      row: i + 1, id: id || (start ? "lmo-" + start : "baris-" + (i + 1)), start: start, end: end, rawStart: rawStart, rawEnd: rawEnd, valid: valid,
      timeFrom: tf, timeTo: tt, badTime: badTime,
      name: name, email: email, addr: validEmail_(email) ? email.toLowerCase() : "", phone: normPhone_(cell_(r, c, "phone")),
      role: cell_(r, c, "role"), prog: cell_(r, c, "prog"), off: isYes_(cell_(r, c, "off")),
      stamps: { email: cell_(r, c, "emailSent"), cal: cell_(r, c, "calSent"), wa: cell_(r, c, "waSent") },
      eventId: cell_(r, c, "eventId"),
      days: days, single: valid && start === end,
      contiguous: days.length <= 1 || isoToUTC_(days[days.length - 1]) - isoToUTC_(days[0]) === (days.length - 1) * 864e5,
      period: valid ? periodText_(start, end) : ""
    });
  }
  return { ok: true, items: items, cols: c, headerRow: h.index + 1, width: width };
}

function cell_(row, cols, key) {
  var i = cols[key];
  if (i == null) return "";
  var v = row[i];
  return v == null ? "" : String(v).trim();
}

function normHeader_(h) {
  return String(h == null ? "" : h).replace(/^﻿/, "").replace(/\./g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function headerMap_(row) {
  var names = (row || []).map(normHeader_), map = {};
  Object.keys(LMO_COLS).forEach(function (k) {
    for (var i = 0; i < names.length; i++) {
      if (LMO_COLS[k].indexOf(names[i]) >= 0) { map[k] = i; return; }
    }
  });
  return map;
}

/** Looks for the header in the first 5 rows (title rows above it are ignored). */
function findHeader_(rows) {
  for (var i = 0; i < Math.min(rows.length, 5); i++) {
    var m = headerMap_(rows[i]);
    if (m.start != null && m.name != null) return { index: i, cols: m };
  }
  return null;
}

function pad2_(n) { return (n < 10 ? "0" : "") + n; }

function isoFromYMD_(y, m, d) {
  var t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return "";
  return y + "-" + pad2_(m) + "-" + pad2_(d);
}

/** "2026-12-07", "2026/12/07", "7/12/2026", "07-12-2026" (day first, Malaysian style) -> "2026-12-07". */
function parseDate_(v) {
  var s = String(v == null ? "" : v).trim().replace(/[\sT]+\d{1,2}:\d{2}(:\d{2})?(\s*[ap]\.?m\.?)?$/i, "");
  var m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(s);
  if (m) return isoFromYMD_(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(s);
  if (m) return isoFromYMD_(+m[3], +m[2], +m[1]);
  return "";
}

/** Month-first reading of "12/7/2026", used only when the row's ID shows the Sheet uses US dates. */
function parseDateMD_(v) {
  var m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/.exec(String(v == null ? "" : v).trim());
  return m ? isoFromYMD_(+m[3], +m[1], +m[2]) : "";
}

/** "16:45", "9:00", "16:45:00", "4:45 PM", "4:45:00 ptg" -> "HH:mm"; "" when blank or not understood. */
function parseTime_(v) {
  var s = String(v == null ? "" : v).trim().toLowerCase();
  var m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?|pg|ptg)?$/.exec(s);
  if (!m) return "";
  var h = +m[1], mi = +m[2], ap = (m[3] || "").replace(/\./g, "");
  if (ap) {
    if (h < 1 || h > 12) return "";
    h = (ap === "pm" || ap === "ptg") ? h % 12 + 12 : h % 12;
  }
  if (h > 23 || mi > 59) return "";
  return pad2_(h) + ":" + pad2_(mi);
}

/** Same rules as the planner: 012-345 6789 -> 60123456789. "" when not a usable number. */
function normPhone_(v) {
  var d = String(v == null ? "" : v).replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.indexOf("00") === 0) d = d.slice(2);
  if (d.charAt(0) === "0") d = "6" + d;
  else if (d.charAt(0) === "1" && d.length >= 9 && d.length <= 10) d = "60" + d;
  return d.length >= 10 && d.length <= 15 ? d : "";
}

function validEmail_(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "")); }

function isYes_(v) { return /^(ya|y|yes|1|true|benar)$/i.test(String(v == null ? "" : v).trim()); }

function isoToUTC_(iso) { var p = iso.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }

function addDays_(iso, n) {
  var d = new Date(isoToUTC_(iso) + n * 864e5);
  return d.getUTCFullYear() + "-" + pad2_(d.getUTCMonth() + 1) + "-" + pad2_(d.getUTCDate());
}

function weekday_(iso) { return new Date(isoToUTC_(iso)).getUTCDay(); }

/** Working days (Mon-Fri) from a to b inclusive. */
function workDays_(a, b) {
  var out = [];
  for (var d = a, i = 0; d <= b && i < 400; d = addDays_(d, 1), i++) {
    var w = weekday_(d);
    if (w !== 0 && w !== 6) out.push(d);
  }
  return out;
}

/** "Isnin, 7 Disember 2026" (same as the planner's long date in BM). */
function longDate_(iso) {
  var p = iso.split("-");
  return LMO_DAYS[weekday_(iso)] + ", " + Number(p[2]) + " " + LMO_MONTHS[Number(p[1]) - 1] + " " + p[0];
}

function dmy_(iso) { var p = iso.split("-"); return Number(p[2]) + "/" + Number(p[1]) + "/" + p[0]; }

/** {tempoh}: one day -> long date; a week -> "start hingga end". */
function periodText_(start, end) { return start === end ? longDate_(start) : longDate_(start) + " hingga " + longDate_(end); }

/** Keys holding a date older than keepDays (rows long past); deleted to stay within the property store limit. */
function staleKeys_(props, today, keepDays) {
  var limit = addDays_(today, -keepDays);
  return Object.keys(props || {}).filter(function (k) {
    var m = /(\d{4}-\d{2}-\d{2})/.exec(k);
    return m && m[1] < limit;
  });
}

function nextItem_(items, today) {
  return (items || []).filter(function (r) { return r.valid && !r.off && r.name && r.end >= today; })
    .sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; })[0] || null;
}

/* ---------------- Message templates (BM, same wording as the planner) ---------------- */

function lmoChecklist_() {
  return LMO_CHECKLIST.map(function (t, i) { return (i + 1) + ". " + t; }).join("\n");
}

function waText_(r) {
  return "Salam " + r.name + ",\n\nPeringatan: tuan/puan bertugas sebagai *Pegawai Last Man Out* " + (r.single ? "hari ini" : "minggu ini") +
    " (" + r.period + ").\n\nSebelum pulang (sekitar " + r.timeFrom + "), sila pastikan:\n" + lmoChecklist_() + "\n\nTerima kasih.\n" + LMO_SIGNOFF;
}

function mailSubject_(r) { return "Giliran Last Man Out (MQS): " + r.period; }

function mailBody_(r) {
  return "Salam " + r.name + ",\n\nTuan/puan dijadualkan sebagai Pegawai Last Man Out (MQS) Jabatan JPPP pada " + r.period +
    ".\n\nSetiap hari bertugas, sebelum meninggalkan pejabat (sekitar " + r.timeFrom + "–" + r.timeTo + "):\n" + lmoChecklist_() +
    "\n\nJemputan Google Calendar turut dihantar. Jika tidak dapat bertugas (cuti/kursus), sila maklumkan saya segera supaya giliran boleh ditukar." +
    "\n\nTerima kasih.\n" + LMO_SIGNOFF;
}

function calTitle_(r) { return "Last Man Out (MQS): " + r.name; }

function calDetails_() {
  return "Tugas Pegawai Last Man Out sebelum meninggalkan pejabat:\n" + lmoChecklist_() +
    "\n\nJadual Bertugas Last Man Out, Jabatan JPPP, KPTM Kuantan (MQS).";
}

function waUrl_(phone, text) { return "https://wa.me/" + phone + "?text=" + encodeURIComponent(text); }

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
}

function actionLabel_(a) {
  return { email: "emel", cal: "jemputan Google Calendar", delcal: "batal jemputan kalendar", wa: "pautan WhatsApp" }[a.type] || a.type;
}

/**
 * The SU's daily email: WhatsApp link(s) for today's officer, what was sent, what needs her action.
 * Returns null when there is nothing to report.
 */
function buildDigest_(out) {
  var wa = out.wa || [], sent = out.sent || [], cancelled = out.cancelled || [], problems = out.problems || [], errors = out.errors || [];
  if (!wa.length && !sent.length && !cancelled.length && !problems.length && !errors.length && out.quotaLow == null) return null;
  var txt = [], html = [];
  function para(t) { txt.push(t); html.push("<p>" + esc_(t).replace(/\n/g, "<br>") + "</p>"); }
  function head(t) { txt.push(t.toUpperCase()); html.push("<h3 style=\"margin:18px 0 6px\">" + esc_(t) + "</h3>"); }
  function list(lines) {
    txt.push(lines.map(function (l) { return "- " + l; }).join("\n"));
    html.push("<ul>" + lines.map(function (l) { return "<li>" + esc_(l) + "</li>"; }).join("") + "</ul>");
  }

  para("Salam,\n\nRingkasan Last Man Out (MQS) untuk " + longDate_(out.today) + ".");
  if (wa.length) {
    head("Hantar peringatan WhatsApp hari ini");
    wa.forEach(function (a) {
      var r = a.item;
      para(r.name + " bertugas " + (r.single ? "hari ini" : "minggu ini") + " (" + r.period + ").");
      if (a.url) {
        txt.push("Tekan pautan ini. WhatsApp akan dibuka dengan mesej siap ditulis; tekan Hantar:\n" + a.url);
        html.push("<p><a href=\"" + esc_(a.url) + "\" style=\"display:inline-block;padding:10px 16px;background:#1f7a4d;color:#ffffff;" +
          "border-radius:8px;text-decoration:none;font-weight:bold\">Buka WhatsApp untuk " + esc_(r.name) + "</a></p>" +
          "<p style=\"color:#555\">Mesej sudah ditulis; tekan Hantar dalam WhatsApp.</p>");
      } else {
        para("Tiada No. WhatsApp yang sah dalam Sheet. Salin mesej di bawah dan hantar sendiri:");
        txt.push(a.text);
        html.push("<pre style=\"white-space:pre-wrap;font-family:inherit;border-left:3px solid #ccc;padding-left:10px\">" + esc_(a.text) + "</pre>");
      }
    });
  }
  if (sent.length || cancelled.length) {
    head("Sudah dihantar oleh skrip hari ini");
    var lines = [], byRow = {}, order = [];
    sent.forEach(function (a) {
      var k = a.row + "|" + (a.to || a.guest);
      if (!byRow[k]) { byRow[k] = { a: a, ch: [] }; order.push(k); }
      byRow[k].ch.push(a.type === "email" ? "Emel" : "jemputan Google Calendar");
    });
    order.forEach(function (k) {
      var g = byRow[k], r = g.a.item;
      lines.push(g.ch.join(" dan ") + " kepada " + r.name + " (" + (g.a.to || g.a.guest) + ") untuk giliran " + r.period +
        ", " + r.timeFrom + "–" + r.timeTo + ".");
    });
    cancelled.forEach(function (a) {
      lines.push("Jemputan kalendar untuk " + a.addr + " (" + a.item.period + ") dibatalkan: " + a.why + ". Sila maklumkan " + a.addr + ".");
    });
    list(lines);
  }
  var todo = problems.map(function (p) { return p.text; });
  errors.forEach(function (e) {
    var r = e.action.item;
    todo.push("Ralat semasa " + actionLabel_(e.action) + " untuk " + (r && r.name ? r.name : e.action.id) + ": " + e.message +
      ". Skrip akan cuba lagi esok jika masih sempat.");
  });
  if (out.quotaLow != null) {
    todo.push("Kuota emel harian akaun ini hampir habis (baki " + out.quotaLow + "). Emel yang belum dihantar akan dicuba semula esok, sebelum giliran bermula.");
  }
  if (todo.length) { head("Perlu tindakan anda"); list(todo); }
  para("Emel ini dihantar oleh skrip Last Man Out dalam Google Sheet anda (tab " + CFG.SHEET + "). Untuk berhenti: menu Last Man Out > Henti automatik.");

  var subject = "Last Man Out " + dmy_(out.today) + ": " + (wa.length
    ? "hantar WhatsApp kepada " + wa.map(function (a) { return a.item.name; }).join(", ")
    : sent.length ? "notis giliran dihantar" : "perlu semakan");
  return {
    subject: subject,
    body: txt.join("\n\n"),
    html: "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5\">" + html.join("") + "</div>"
  };
}

/** Text for "Uji tanpa hantar" (and the log of a dry run). */
function describePlan_(plan) {
  if (!plan.ok) return "Sheet tidak dapat dibaca: " + plan.error;
  var lines = [];
  plan.actions.forEach(function (a) {
    var r = a.item;
    if (a.type === "email") lines.push("- Emel kepada " + r.name + " (" + a.to + "): \"" + a.subject + "\"");
    else if (a.type === "cal") {
      lines.push("- Jemputan Google Calendar kepada " + r.name + " (" + a.guest + "): " + r.days.length + " hari bekerja, " +
        r.timeFrom + "–" + r.timeTo + (r.days.length > 1 ? " (berulang setiap hari)" : ""));
    } else if (a.type === "delcal") lines.push("- Batalkan jemputan kalendar untuk " + a.addr + " (" + a.why + ")");
    else if (a.type === "wa") lines.push("- Emel kepada anda dengan pautan WhatsApp untuk " + r.name + (a.url ? "" : " (tiada No. WhatsApp; mesej untuk disalin)"));
  });
  var text = "Pada " + longDate_(plan.today) + " skrip akan:\n" + (lines.length ? lines.join("\n") : "- Tiada notis perlu dihantar.");
  if (plan.problems.length) text += "\n\nPerlu tindakan anda:\n" + plan.problems.map(function (p) { return "- " + p.text; }).join("\n");
  if (!lines.length) {
    var next = nextItem_(plan.items, addDays_(plan.today, 1));
    if (next) text += "\n\nGiliran seterusnya: " + next.name + ", " + next.period + ". Cuba tarikh " + dmy_(addDays_(next.start, -CFG.DAYS_BEFORE)) + ".";
  }
  return text + "\n\n(Ujian sahaja: tiada apa-apa dihantar.)";
}

/** Short summary after "Jalankan sekarang" (also written to the log). */
function summary_(r) {
  if (!r) return "Tiada apa-apa dijalankan.";
  if (r.busy) return "Skrip sedang berjalan. Cuba lagi sebentar.";
  if (r.error) return "Tiada apa-apa dihantar: " + r.error;
  if (r.dry) return "DRY_RUN aktif: tiada apa-apa dihantar.\n\n" + describePlan_(r.plan);
  var o = r.result, lines = [];
  var mails = o.sent.filter(function (a) { return a.type === "email"; }).length, cals = o.sent.length - mails;
  if (mails || cals) lines.push("Dihantar: " + mails + " emel, " + cals + " jemputan Google Calendar.");
  if (o.cancelled.length) lines.push("Jemputan kalendar dibatalkan: " + o.cancelled.length + ".");
  if (o.wa.length) lines.push("Pautan WhatsApp untuk " + o.wa.map(function (a) { return a.item.name; }).join(", ") + (o.digestSent ? " telah diemel kepada anda." : " belum diemel."));
  if (o.problems.length || o.errors.length || o.quotaLow != null) lines.push("Ada perkara yang perlu tindakan anda; lihat emel ringkasan dan lajur \"Catatan skrip\".");
  if (o.digestError) lines.push("Emel ringkasan tidak dihantar: " + o.digestError);
  return lines.length ? lines.join("\n") : "Tiada notis perlu dihantar hari ini.";
}
