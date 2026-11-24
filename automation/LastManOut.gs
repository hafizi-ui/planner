/** @OnlyCurrentDoc */

/*
 * Last Man Out (MQS): peringatan automatik untuk Setiausaha Jabatan JPPP, KPTM Kuantan.
 *
 * Kod ini ditampal ke dalam Google Sheet oleh staf yang memasangnya ("pentadbir"), dalam akaun
 * Google pentadbir itu (Sambungan > Apps Script). Emel dan jemputan dihantar daripada akaun itu
 * atas nama "JPPP Smart Planner". Setiausaha Jabatan (SU) menerima emel WhatsApp hari bertugas;
 * pentadbir menerima laporan masalah.
 * Panduan langkah demi langkah: automation/PANDUAN.md
 *
 * Tab "Giliran" = CSV giliran yang dieksport dari planner ("Eksport CSV untuk Google Sheet").
 * Setiap pagi (sekitar 7 pagi waktu Malaysia) skrip ini:
 *   - 2 hari sebelum giliran (termasuk Sabtu/Ahad): menghantar emel dan jemputan
 *     Google Calendar kepada pegawai bertugas;
 *   - pada hari pertama giliran: menghantar emel kepada SU dengan pautan WhatsApp
 *     satu-sentuh (mesej siap ditulis; SU tekan Hantar sahaja dari telefonnya).
 * Butang Selesai (pilihan, apabila web app dipasang): pegawai menekan pautan peribadi dan
 * menanda Selesai selepas tugas. Jika tiada pengesahan sebelum had (18:30), Ketua Jabatan
 * dimaklumkan melalui emel (salinan kepada SU dan pentadbir). Rekod dalam tab "Pengesahan".
 * Data staf kekal dalam Google Sheet pentadbir sahaja.
 *
 * Code notes (English): plain V8 Apps Script, no libraries. planActions_(), planConfirm_() and
 * confirmState_() are pure (no Apps Script services) so they can be unit-tested in Node; see
 * automation/test. Every public function can be called from the web app page through
 * google.script.run, so menu functions do nothing unless the Sheets UI is present, and only
 * confirmLmo() is meant for the page. Opening a link (doGet) never writes anything.
 */

/* ===================== Tetapan (boleh diubah) ===================== */
var CFG = {
  SHEET: "Giliran",              // nama tab dalam Google Sheet
  TZ: "Asia/Kuala_Lumpur",       // zon masa Malaysia
  CAL_ID: "primary",             // "primary" = kalendar utama akaun ini
  DRY_RUN: false,                // true = uji sahaja, tiada apa-apa dihantar
  RUN_HOUR: 7,                   // skrip berjalan setiap hari antara 7 dan 8 pagi
  SENDER_NAME: "JPPP Smart Planner",  // nama pengirim emel (emel dihantar daripada akaun pentadbir)
  DAYS_BEFORE: 2,                // emel & jemputan kalendar: 2 hari sebelum giliran
  WARN_DAYS: 7,                  // amaran awal kepada SU jika pegawai tiada emel: 7 hari sebelum giliran
  POPUP_MINUTES: 30,             // peringatan pop-up dalam kalendar SU
  MIN_QUOTA: 5,                  // berhenti menghantar emel jika baki kuota harian kurang daripada ini
  TIME_FROM: "18:00",            // masa lalai jika lajur "Masa mula" kosong
  TIME_TO: "18:15",              // masa lalai jika lajur "Masa tamat" kosong
  KEEP_DAYS: 120,                // rekod "sudah dihantar" disimpan selama 120 hari
  // Butang Selesai dan amaran kepada Ketua Jabatan (perlu web app; lihat PANDUAN langkah 11)
  CONFIRM: true,                 // false = tiada peringatan / amaran Selesai
  DEADLINE: "18:30",             // had pengesahan lalai jika lajur "Had pengesahan" kosong
  REMIND_BEFORE: 15,             // minit sebelum had: emel peringatan kepada pegawai (0 = tiada)
  CONFIRM_FROM: "12:00",         // butang Selesai boleh ditekan mulai jam ini pada hari bertugas
  CHECK_FROM: "17:00",           // semakan setiap CHECK_MINUTES minit bermula jam ini (hari bekerja)
  CHECK_MINUTES: 10
};
/* ================================================================== */

// WhatsApp text: sent by the SU from her own phone, so it is signed by her (byte-identical to the planner's lmoWaMsg).
var LMO_SIGNOFF = "Setiausaha Jabatan JPPP, KPTM Kuantan";
// Emails and invitations: sent automatically from the installer's (admin's) account.
var LMO_MAIL_SIGNOFF = "JPPP Smart Planner, Jabatan Pengurusan Perniagaan & Perakaunan, KPTM Kuantan";
var LMO_SU_RE = /setiausaha|secretary/i;
var LMO_CHECKLIST = [
  "Semua lampu ditutup",
  "Penyaman udara & kipas dimatikan",
  "Suis utama dimatikan / palam dicabut",
  "Pintu utama & tingkap dikunci",
  "Tandatangan borang & catat masa keluar"
];
var LMO_DAYS = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
var LMO_MONTHS = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
var LMO_MIN_DEADLINE = "17:15";
var LMO_CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;
var LMO_WEBAPP_RE = /^https:\/\/script\.google\.com\/(macros|a\/macros\/[a-z0-9.-]+)\/s\/[A-Za-z0-9_-]+\/exec$/;
var CONF_SHEET = "Pengesahan";
var CONF_HEAD = ["Tarikh", "ID", "Nama PIC", "Masa disahkan", "Status", "Senarai semak", "Peringatan PIC", "Amaran KJ", "Susulan KJ"];
var CONF_CHECKLIST = "5/5: lampu, penyaman udara, suis/palam, pintu & tingkap, borang & masa keluar";
var CONF_INVALID = "Pautan ini tidak sah atau telah dibatalkan (giliran mungkin telah ditukar). Sila hubungi Setiausaha Jabatan.";

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
  deadline: ["had pengesahan", "confirm by", "confirmation deadline"],
  code: ["kod pengesahan", "confirmation code"],
  kjEmail: ["emel kj", "hod email", "head of department email"],
  noDuty: ["hari tiada tugas", "no duty days"],
  eventId: ["id acara", "event id"],
  note: ["catatan skrip", "script note"]
};
// Columns the script writes; added on the right when missing.
var LMO_WRITE_COLS = { emailSent: "Emel dihantar", calSent: "Kalendar dihantar", eventId: "ID acara", note: "Catatan skrip", code: "Kod pengesahan" };

/* ============================ Menu ============================ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Last Man Out")
    .addItem("Pasang (sekali sahaja)", "install")
    .addItem("Uji tanpa hantar", "testRun")
    .addItem("Hantar emel ujian kepada saya", "sendTestToMe")
    .addItem("Jalankan sekarang", "runNow")
    .addSeparator()
    .addItem("Pautan Selesai (web app)", "showWebAppUrl")
    .addItem("Emel Ketua Jabatan", "setKjEmail")
    .addItem("Emel Setiausaha (WhatsApp)", "setSuEmail")
    .addSeparator()
    .addItem("Henti automatik", "uninstall")
    .addToUi();
}

/** Creates the two triggers (daily 7am run, and the Selesai check every 10 minutes). Safe to run again. */
function install() {
  if (!ui_()) return null;   // menu only (public functions can also be called from the web app page)
  removeTriggers_();
  ScriptApp.newTrigger("dailyRun").timeBased().everyDays(1).atHour(CFG.RUN_HOUR).inTimezone(CFG.TZ).create();
  ScriptApp.newTrigger("deadlineCheck").timeBased().everyMinutes(CFG.CHECK_MINUTES).create();
  var sheet = findSheet_(), info = "", items = [];
  var props = PropertiesService.getScriptProperties().getProperties(), admin = adminEmail_();
  if (!sheet) info = "\n\nAMARAN: tab \"" + CFG.SHEET + "\" belum ada. Import CSV giliran dari planner ke tab itu.";
  else {
    var parsed = parseRows_(sheet.getDataRange().getDisplayValues(), CFG);
    items = parsed.items;
    info = parsed.ok ? "\n\nTab \"" + sheet.getName() + "\": " + parsed.items.length + " giliran dijumpai."
      : "\n\nAMARAN: " + parsed.error;
  }
  var su = suContact_(items, props, admin);
  info += "\n\nEmel WhatsApp hari bertugas kepada: " + (su.email || "-") + " (" + suSourceText_(su) + ").\nLaporan masalah kepada: " + (admin || "-") + " (anda).";
  var url = props.WEBAPP_URL;
  alert_("Automatik dipasang",
    "Skrip akan berjalan setiap hari antara " + CFG.RUN_HOUR + " dan " + (CFG.RUN_HOUR + 1) + " pagi (waktu Malaysia).\n\n" +
    "2 hari sebelum setiap giliran: emel dan jemputan Google Calendar kepada pegawai.\n" +
    "Hari pertama giliran: emel kepada Setiausaha Jabatan dengan pautan WhatsApp.\n" +
    (CFG.CONFIRM && validWebUrl_(url)
      ? "Butang Selesai: disemak setiap " + CFG.CHECK_MINUTES + " minit mulai " + CFG.CHECK_FROM + " pada hari bekerja."
      : "Butang Selesai: belum aktif. Pilih menu \"Pautan Selesai (web app)\" selepas deploy web app (PANDUAN langkah 11).") + info);
  return true;
}

/** Removes both triggers. Records of what was sent are kept, so installing again never resends. */
function uninstall() {
  if (!ui_()) return null;
  var n = removeTriggers_();
  alert_("Automatik dihentikan", n ? "Skrip tidak akan menghantar apa-apa lagi. Pilih \"Pasang (sekali sahaja)\" untuk mula semula."
    : "Automatik memang belum dipasang.");
  return n;
}

/** Run by the daily trigger. */
function dailyRun() {
  return runCore_({ dry: CFG.DRY_RUN });
}

/** Menu: run now (asks first). */
function runNow() {
  var ui = ui_();
  if (!ui) return null;
  var b = ui.alert("Jalankan sekarang",
    "Hantar sekarang semua notis Last Man Out yang perlu dihantar hari ini? Notis yang sudah dihantar tidak akan dihantar semula.",
    ui.ButtonSet.YES_NO);
  if (b !== ui.Button.YES) return null;
  var r = runCore_({ dry: CFG.DRY_RUN });
  alert_("Last Man Out", summary_(r));
  return r;
}

/** Menu: dry run for a chosen date (and optional time, e.g. "5/12/2026 18:35"). Sends nothing and writes nothing. */
function testRun() {
  var ui = ui_(), now = now_(), today = todayIso_(now), day = today, time = "";
  if (!ui) return null;
  var resp = ui.prompt("Uji tanpa hantar",
    "Tarikh untuk diuji, cth. " + dmy_(addDays_(today, 1)) + " (kosongkan = hari ini).\n" +
    "Tambah masa untuk menguji butang Selesai, cth. " + dmy_(today) + " 18:35.\nTiada emel atau jemputan akan dihantar.",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return null;
  var when = parseWhen_(resp.getResponseText(), today);
  if (!when) { alert_("Uji tanpa hantar", "Tarikh tidak difahami: \"" + String(resp.getResponseText()).trim() + "\". Tulis seperti " + dmy_(today) + " atau " + dmy_(today) + " 18:35."); return null; }
  day = when.day; time = when.time;
  var r = runCore_({ dry: true, today: day, time: time });
  alert_("Uji tanpa hantar: " + longDate_(day) + (time ? " " + time : ""), r.plan ? describePlan_(r.plan) : summary_(r));
  return r;
}

/** Menu: sends the next turn's email, a calendar event and the duty-day email to the SU only. */
function sendTestToMe() {
  if (!ui_()) return null;
  var today = todayIso_(now_()), admin = adminEmail_(), sheet = findSheet_();
  if (!sheet) { alert_("Emel ujian", "Tab \"" + CFG.SHEET + "\" tidak dijumpai."); return null; }
  var props = PropertiesService.getScriptProperties().getProperties();
  var rows = confirmActive_(props, CFG) ? ensureCodes_(sheet) : sheet.getDataRange().getDisplayValues();
  var parsed = parseRows_(rows, CFG);
  if (!parsed.ok) { alert_("Emel ujian", parsed.error); return null; }
  withLinks_(parsed.items, props, CFG);
  var su = suContact_(parsed.items, props, admin);
  var r = nextItem_(parsed.items, today);
  if (!r) { alert_("Emel ujian", "Tiada giliran akan datang dalam tab \"" + sheet.getName() + "\"."); return null; }
  if (MailApp.getRemainingDailyQuota() < 2) { alert_("Emel ujian", "Kuota emel harian akaun ini sudah habis. Cuba esok."); return null; }
  var sendDay = addDays_(r.start, -CFG.DAYS_BEFORE);
  var linkNote = r.link ? "\n\nPautan Selesai dalam emel ini ialah pautan sebenar pegawai. Membukanya selamat, tetapi jangan tekan Selesai bagi pihak pegawai." : "";
  MailApp.sendEmail({
    to: admin, name: CFG.SENDER_NAME,
    subject: "[UJIAN] " + mailSubject_(r),
    body: "INI EMEL UJIAN. Emel sebenar akan dihantar kepada " + r.name + " (" + (r.addr ? r.email : "tiada emel dalam Sheet") +
      ") pada " + longDate_(sendDay) + "." + linkNote + "\n\n----------\n\n" + mailBody_(r)
  });
  createLmoEvent_(getCalendar_(), r, { title: "[UJIAN] " + calTitle_(r), guest: "" });
  var text = waText_(r);
  var dg = buildDigest_({ today: r.start, wa: [{ item: r, phone: r.phone, text: text, url: r.phone ? waUrl_(r.phone, text) : "" }] },
    sameEmail_(su.email, admin) ? "all" : "su", { admin: admin });
  var intro = "INI EMEL UJIAN: contoh emel yang Setiausaha Jabatan (" + (su.email || "tiada emel") + ") akan terima pada hari bertugas. " +
    "Jangan tekan Hantar dalam WhatsApp semasa ujian.";
  MailApp.sendEmail({
    to: admin, name: CFG.SENDER_NAME, subject: "[UJIAN] " + dg.subject,
    body: intro + "\n\n" + dg.body, htmlBody: "<p><b>" + esc_(intro) + "</b></p>" + dg.html
  });
  alert_("Emel ujian dihantar",
    "Dua emel ujian dihantar ke " + admin + ".\n\nEmel WhatsApp sebenar pada hari bertugas akan dihantar kepada Setiausaha Jabatan: " +
    (su.email || "-") + " (" + suSourceText_(su) + ").\n\nSatu acara \"[UJIAN] " + calTitle_(r) + "\" juga dicipta dalam Google Calendar anda pada " +
    longDate_(r.days[0]) + ". Tiada jemputan dihantar kepada pegawai. Padam acara [UJIAN] itu selepas menyemak.");
  return { item: r };
}

/** Menu: store (and show) the web app URL used in the personal Selesai links. */
function showWebAppUrl() {
  var ui = ui_();
  if (!ui) return null;
  var store = PropertiesService.getScriptProperties();
  var cur = store.getProperty("WEBAPP_URL") || "", detected = "";
  try { detected = ScriptApp.getService().getUrl() || ""; } catch (e) { detected = ""; }
  if (!validWebUrl_(detected)) detected = "";
  var url = validWebUrl_(cur) ? cur : detected;
  var resp = ui.prompt("Pautan Selesai (web app)",
    (url ? "URL sekarang:\n" + url + "\n\n" : "") +
    "Tampal URL web app (bermula https://script.google.com/ dan berakhir dengan /exec).\n" +
    (url ? "Kosongkan untuk kekalkan URL di atas." : "Belum ada URL: deploy web app dahulu (PANDUAN langkah 11)."),
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return null;
  var txt = String(resp.getResponseText() || "").trim();
  if (txt) url = txt;
  if (!validWebUrl_(url)) {
    alert_("Pautan Selesai", (url ? "URL tidak sah:\n" + url + "\n\n" : "") +
      "URL mesti bermula https://script.google.com/ dan berakhir dengan /exec (bukan /dev). Salin dari Deploy > Urus deployment.");
    return null;
  }
  store.setProperty("WEBAPP_URL", url);
  // Turns that started before this URL existed had no link in their messages: no KJ alerts for them.
  if (url !== cur) store.setProperty("WEBAPP_SINCE", todayIso_(now_()));
  var sheet = findSheet_(), n = 0;
  if (sheet && CFG.CONFIRM) {
    var before = parseRows_(sheet.getDataRange().getDisplayValues(), CFG).items.filter(function (r) { return r.code; }).length;
    var after = parseRows_(ensureCodes_(sheet), CFG).items.filter(function (r) { return r.code; }).length;
    n = after - before;
  }
  alert_("Pautan Selesai disimpan",
    "URL web app:\n" + url + "\n\n" + (n ? n + " kod pengesahan baharu ditulis dalam tab " + CFG.SHEET + ".\n\n" : "") +
    "Langkah seterusnya (hari ini juga): dalam planner, Giliran Last Man Out > Tetapan giliran > URL web app Selesai: tampal URL ini, " +
    "kemudian eksport CSV untuk Google Sheet dan import semula ke tab " + CFG.SHEET + "." +
    (CFG.CONFIRM ? "" : "\n\nNota: CONFIRM ialah false dalam kod, jadi peringatan dan amaran Selesai tidak dihantar."));
  return url;
}

/** Menu: override the Ketua Jabatan email (e.g. an acting KJ), or go back to the email in the Sheet. */
function setKjEmail() {
  var ui = ui_();
  if (!ui) return null;
  var store = PropertiesService.getScriptProperties(), cur = store.getProperty("KJ_EMAIL") || "";
  var sheet = findSheet_();
  var fromSheet = sheet ? kjEmail_(parseRows_(sheet.getDataRange().getDisplayValues(), CFG).items, {}).email : "";
  var resp = ui.prompt("Emel Ketua Jabatan",
    "Emel Ketua Jabatan sekarang: " + (validEmail_(cur) ? cur + " (ditetapkan di sini)" : fromSheet ? fromSheet + " (dari Sheet)" : "belum ada") + ".\n\n" +
    "Tulis emel lain (contohnya pemangku Ketua Jabatan), atau tulis PADAM untuk kembali kepada emel dalam Sheet. Kosongkan untuk batal.",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return null;
  var txt = String(resp.getResponseText() || "").trim();
  if (!txt) return null;
  if (/^padam$/i.test(txt)) {
    store.deleteProperty("KJ_EMAIL");
    alert_("Emel Ketua Jabatan", "Emel yang ditetapkan di sini dipadam. Amaran akan dihantar kepada: " + (fromSheet || "anda sahaja (tiada emel KJ dalam Sheet)") + ".");
    return "";
  }
  if (!validEmail_(txt)) { alert_("Emel Ketua Jabatan", "Emel tidak sah: " + txt); return null; }
  store.setProperty("KJ_EMAIL", txt);
  alert_("Emel Ketua Jabatan", "Amaran Selesai akan dihantar kepada " + txt + " (salinan kepada Setiausaha Jabatan dan anda).");
  return txt;
}

/** Menu: the Setiausaha Jabatan's email (duty-day WhatsApp email, cc on KJ alerts), or back to the Sheet / admin. */
function setSuEmail() {
  var ui = ui_();
  if (!ui) return null;
  var store = PropertiesService.getScriptProperties(), cur = store.getProperty("SU_EMAIL") || "", admin = adminEmail_();
  var sheet = findSheet_();
  var fromSheet = suContact_(sheet ? parseRows_(sheet.getDataRange().getDisplayValues(), CFG).items : [], {}, admin);
  var resp = ui.prompt("Emel Setiausaha (WhatsApp)",
    "Emel Setiausaha Jabatan sekarang: " + (validEmail_(cur) ? cur + " (ditetapkan di sini)" : (fromSheet.email || "belum ada") + " (" + suSourceText_(fromSheet) + ")") + ".\n\n" +
    "Setiausaha menerima emel WhatsApp pada hari bertugas dan salinan amaran kepada Ketua Jabatan.\n" +
    "Tulis emel lain, atau tulis PADAM untuk kembali kepada emel dalam Sheet. Kosongkan untuk batal.",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return null;
  var txt = String(resp.getResponseText() || "").trim();
  if (!txt) return null;
  if (/^padam$/i.test(txt)) {
    store.deleteProperty("SU_EMAIL");
    alert_("Emel Setiausaha (WhatsApp)", "Emel yang ditetapkan di sini dipadam. Emel WhatsApp akan dihantar kepada: " +
      (fromSheet.email || "-") + " (" + suSourceText_(fromSheet) + ").");
    return "";
  }
  if (!validEmail_(txt)) { alert_("Emel Setiausaha (WhatsApp)", "Emel tidak sah: " + txt); return null; }
  store.setProperty("SU_EMAIL", txt);
  alert_("Emel Setiausaha (WhatsApp)", "Emel WhatsApp hari bertugas akan dihantar kepada " + txt + ".");
  return txt;
}

/** Trigger every 10 minutes: PIC reminder before the deadline, KJ alert after it, "Tiada tugas" record. */
function deadlineCheck() {
  if (!CFG.CONFIRM) return { skipped: "off" };
  var store = PropertiesService.getScriptProperties();
  if (!validWebUrl_(store.getProperty("WEBAPP_URL"))) return { skipped: "no-url" };
  var now = now_(), today = todayIso_(now), hhmm = hhmm_(now), w = weekday_(today);
  if (w === 0 || w === 6) return { skipped: "weekend" };
  if (hhmm < CFG.CHECK_FROM) return { skipped: "early" };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return { busy: true };
  try {
    var sheet = findSheet_();
    if (!sheet) return { error: "Tab \"" + CFG.SHEET + "\" tidak dijumpai." };
    var parsed = parseRows_(ensureCodes_(sheet, CFG.DRY_RUN), CFG);
    if (!parsed.ok) return { error: parsed.error };
    var props = store.getProperties(), admin = adminEmail_(), su = suContact_(parsed.items, props, admin).email;
    var conf = planConfirm_(parsed.items, today, hhmm, props, CFG);
    conf.cc = [su, admin];
    if (CFG.DRY_RUN) { Logger.log(describeConfirm_(conf).join("\n")); return { dry: true, conf: conf }; }
    return { conf: conf, result: executeConfirm_(conf, { ss: SpreadsheetApp.getActiveSpreadsheet(), store: store, su: su, admin: admin, today: today, hhmm: hhmm }) };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== Web app: Selesai page ===================== */

/** Opening a personal link. Read-only: never confirms, never writes, no lock. */
function doGet(e) {
  var p = (e && e.parameter) || {}, st;
  var now = now_(), today = todayIso_(now), hhmm = hhmm_(now);
  try {
    var sheet = findSheet_();
    var items = sheet ? parseRows_(sheet.getDataRange().getDisplayValues(), CFG).items : [];
    var r = findConfirmRow_(items, p.t, p.k);
    st = confirmState_(r, today, hhmm, PropertiesService.getScriptProperties().getProperties(), CFG);
  } catch (err) {
    Logger.log("Last Man Out doGet: " + errText_(err));
    st = { state: "error", text: "Maaf, halaman ini tidak dapat dibuka sekarang. Sila cuba sebentar lagi atau hubungi Setiausaha Jabatan." };
  }
  return HtmlService.createHtmlOutput(confirmPage_(st, CFG))
    .setTitle("Last Man Out: Pengesahan Selesai")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/** Called by the Selesai button (google.script.run). The only function that records a confirmation. */
function confirmLmo(t, k, ticks) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { ok: false, text: "Sistem sibuk. Sila tekan Selesai sekali lagi." }; }
  try {
    var now = now_(), today = todayIso_(now), hhmm = hhmm_(now);
    var store = PropertiesService.getScriptProperties(), props = store.getProperties();
    var sheet = findSheet_();
    var items = sheet ? parseRows_(sheet.getDataRange().getDisplayValues(), CFG).items : [];
    var r = findConfirmRow_(items, t, k);
    var st = confirmState_(r, today, hhmm, props, CFG);
    if (st.state === "done") return { ok: true, already: true, status: st.status, time: st.time, name: r.name, text: confirmDoneText_(r.name, st.time, st.status) };
    if (st.state !== "open") return { ok: false, state: st.state, text: st.text };
    if (!allTicked_(ticks)) return { ok: false, state: "ticks", text: "Sila tanda kelima-lima perkara dalam senarai semak dahulu." };
    var status = hhmm <= r.deadline ? "Tepat masa" : "Lewat";
    var key = "|" + r.id + "|" + today;
    store.setProperty("conf" + key, hhmm + "|" + status);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    upsertConfRow_(ss, store, today, r, { time: hhmm, status: status, checklist: CONF_CHECKLIST });
    if (status === "Lewat" && props["kj" + key] && !props["kjlate" + key]) {
      try {
        var admin = adminEmail_(), su = suContact_(items, props, admin).email;
        var kj = kjEmail_(items, props), m = kjLateMail_(r, today, props["kj" + key], hhmm);
        if (MailApp.getRemainingDailyQuota() < 1) throw new Error("kuota emel harian sudah habis");
        var mail = { to: kj.email || su || admin, subject: m.subject, body: m.body, name: CFG.SENDER_NAME };
        var cc = ccList_(mail.to, [su, admin]);
        if (cc.length) mail.cc = cc.join(",");
        if (su) mail.replyTo = su;
        MailApp.sendEmail(mail);
        store.setProperty("kjlate" + key, hhmm);
        upsertConfRow_(ss, store, today, r, { late: hhmm });
      } catch (e2) { Logger.log("Last Man Out: susulan KJ tidak dihantar: " + errText_(e2)); }
    }
    return { ok: true, status: status, time: hhmm, name: r.name, text: confirmDoneText_(r.name, hhmm, status) };
  } finally {
    lock.releaseLock();
  }
}

/* ======================== Run and execute ======================== */

function now_() { return new Date(); }
function todayIso_(d) { return Utilities.formatDate(d, CFG.TZ, "yyyy-MM-dd"); }
function hhmm_(d) { return Utilities.formatDate(d, CFG.TZ, "HH:mm"); }

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
    var props = store.getProperties(), active = confirmActive_(props, CFG);
    // Personal Selesai codes are written before anything is sent, so every message carries a working link.
    var rows = active ? ensureCodes_(sheet, !!opt.dry) : sheet.getDataRange().getDisplayValues();
    var plan = planActions_(rows, today, props, CFG);
    if (plan.ok && active) {
      // A time (test run "5/12/2026 18:35") shows that evening's checks; otherwise this morning's catch-up for yesterday.
      plan.confirm = opt.time ? planConfirm_(plan.items, today, opt.time, props, CFG)
        : planConfirm_(plan.items, addDays_(today, -1), "23:59", props, CFG, true);
    }
    var admin = adminEmail_(), su = suContact_(plan.items, props, admin).email;
    plan.su = su;
    plan.admin = admin;
    if (plan.confirm) plan.confirm.cc = [su, admin];
    if (opt.dry) { plan.time = opt.time || ""; Logger.log(describePlan_(plan)); return { dry: true, plan: plan }; }
    if (!plan.ok) { reportBroken_(plan.error, today, store); return { plan: plan, error: plan.error }; }
    var res = execute_(plan, { sheet: sheet, store: store, now: now, su: su, admin: admin });
    if (plan.confirm && plan.confirm.actions.length) {
      // All of yesterday evening's checks failed (e.g. Google was down): alert the KJ once now.
      res.catchUp = executeConfirm_(plan.confirm, { ss: SpreadsheetApp.getActiveSpreadsheet(), store: store, su: su, admin: admin, today: today, hhmm: hhmm_(now) });
    }
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

  // Same person (SU installed the script): one summary as before. Otherwise the SU gets only the WhatsApp part
  // and the admin gets problems/warnings in a separate email (each problem reported once, as before).
  var admin = env.admin || env.su || "", su = env.su || admin;
  function sendMail(to, dg) {
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error("kuota emel harian sudah habis");
    MailApp.sendEmail({ to: to, subject: dg.subject, body: dg.body, htmlBody: dg.html, name: CFG.SENDER_NAME });
  }
  function markWa() { out.digestSent = true; out.waTo = su; out.wa.forEach(function (a) { store.setProperty(a.key, a.value); note(a.row, "Pautan WhatsApp diemel kepada SU (" + su + ")"); }); }
  function markProblems() { out.problems.forEach(function (p) { if (p.key) store.setProperty(p.key, stamp); }); }
  if (sameEmail_(su, admin)) {
    var dg = buildDigest_(out, "all", { admin: admin });
    if (dg && su) {
      try { sendMail(su, dg); markWa(); markProblems(); out.adminSent = true; } catch (e2) {
        out.digestError = errText_(e2);
        Logger.log("Last Man Out: ringkasan tidak dihantar: " + out.digestError);
      }
    }
  } else {
    var dsu = buildDigest_(out, "su", { admin: admin });
    if (dsu) {
      try { sendMail(su, dsu); markWa(); } catch (e3) {
        out.digestError = errText_(e3);
        Logger.log("Last Man Out: emel WhatsApp kepada SU tidak dihantar: " + out.digestError);
      }
    }
    var dad = buildDigest_(out, "admin", { su: su, waError: out.digestError || "" });
    if (dad && admin) {
      try { sendMail(admin, dad); markProblems(); out.adminSent = true; } catch (e4) {
        out.adminError = errText_(e4);
        Logger.log("Last Man Out: laporan kepada pentadbir tidak dihantar: " + out.adminError);
      }
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
  var opt = { description: calDetails_(r) };
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
  var key = "warn|sheet|" + today, admin = adminEmail_();
  Logger.log("Last Man Out: " + msg);
  if (store.getProperty(key) || !admin) return;
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    MailApp.sendEmail({
      to: admin, name: CFG.SENDER_NAME, subject: "Last Man Out " + dmy_(today) + ": skrip tidak dapat membaca Sheet",
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
    var h = t.getHandlerFunction();
    if (h === "dailyRun" || h === "deadlineCheck") { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

/**
 * Writes a code (Utilities.getUuid without dashes) into every named, non-holiday row without a valid one,
 * adding the "Kod pengesahan" column if needed. Returns the Sheet values with the codes in place.
 * dryRun: fill the codes in memory only (nothing is written).
 */
function ensureCodes_(sheet, dryRun) {
  var rows = sheet.getDataRange().getDisplayValues();
  var h = findHeader_(rows);
  if (!h) return rows;
  var col = h.cols.code, width = 0, n = 0;
  rows.forEach(function (r) { width = Math.max(width, r.length); });
  for (var i = h.index + 1; i < rows.length; i++) {
    var r = rows[i];
    if (!cell_(r, h.cols, "name") || isYes_(cell_(r, h.cols, "off"))) continue;
    if (col != null && validCode_(cell_(r, h.cols, "code"))) continue;
    if (col == null) {
      col = Math.max(width, dryRun ? 0 : sheet.getLastColumn());
      if (!dryRun) writeCell_(sheet, h.index + 1, col, LMO_WRITE_COLS.code);
      rows.forEach(function (x) { while (x.length <= col) x.push(""); });
      rows[h.index][col] = LMO_WRITE_COLS.code;
      h.cols.code = col;
    }
    var code = dryRun ? "kodsementara" + pad2_(Math.floor(n / 100)) + pad2_(n % 100) : Utilities.getUuid().replace(/-/g, "");
    if (!dryRun) writeCell_(sheet, i + 1, col, code);
    rows[i][col] = code;
    n++;
  }
  return rows;
}

/** Sends PIC reminders and KJ alerts, writes the Pengesahan tab. Each action at most once per duty day. */
function executeConfirm_(conf, env) {
  var store = env.store, res = { sent: [], rows: [], errors: [] };
  var stamp = env.hhmm + (conf.day !== env.today ? " (" + dmy_(env.today) + ")" : "");
  conf.actions.forEach(function (a) {
    try {
      var r = a.item;
      if (a.type === "remind") {
        if (MailApp.getRemainingDailyQuota() < CFG.MIN_QUOTA) throw new Error("kuota emel harian hampir habis");
        var rm = { to: a.to, subject: a.subject, body: a.body, name: CFG.SENDER_NAME };
        if (env.su) rm.replyTo = env.su;   // replies (e.g. "I could not do it today") reach the SU
        MailApp.sendEmail(rm);
        store.setProperty(a.key, env.hhmm);
        res.sent.push(a);
      } else if (a.type === "kjalert") {
        if (MailApp.getRemainingDailyQuota() < 1) throw new Error("kuota emel harian sudah habis");
        var m = kjAlertMail_(r, a.day, a.catchUp, conf.kj.email);
        var mail = { to: conf.kj.email || env.su || env.admin, subject: m.subject, body: m.body, name: CFG.SENDER_NAME };
        var cc = ccList_(mail.to, [env.su, env.admin]);   // SU, and the admin only when different
        if (cc.length) mail.cc = cc.join(",");
        if (env.su) mail.replyTo = env.su;
        if (!mail.to) throw new Error("tiada penerima (emel Ketua Jabatan, Setiausaha dan pentadbir kosong)");
        MailApp.sendEmail(mail);
        store.setProperty(a.key, stamp);
        res.sent.push(a);
        res.rows.push(upsertConfRow_(env.ss, store, a.day, r, { status: "Tidak disahkan", kj: stamp }));
      } else if (a.type === "noduty") {
        res.rows.push(upsertConfRow_(env.ss, store, a.day, r, { status: "Tiada tugas" }));
        store.setProperty(a.key, stamp);
      }
    } catch (e) {
      res.errors.push({ action: a, message: errText_(e) });
      Logger.log("Last Man Out: ralat " + a.type + " " + a.id + " " + a.day + ": " + errText_(e));
    }
  });
  return res;
}

/** The "Pengesahan" tab (MQS evidence), created on first use with a frozen header row. */
function confSheet_(ss) {
  var sh = ss.getSheetByName(CONF_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(CONF_SHEET);
  CONF_HEAD.forEach(function (t, i) { writeCell_(sh, 1, i, t); });
  sh.setFrozenRows(1);
  return sh;
}

/** One row per (Tarikh, ID): found by scanning, created if missing. All cells written as text. */
function upsertConfRow_(ss, store, day, r, f) {
  var sh = confSheet_(ss);
  var vals = sh.getDataRange().getDisplayValues(), row = 0;
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === day && String(vals[i][1]).trim() === r.id) { row = i + 1; break; }
  }
  if (!row) {
    row = Math.max(vals.length, 1) + 1;
    writeCell_(sh, row, 0, day);
    writeCell_(sh, row, 1, r.id);
    writeCell_(sh, row, 2, r.name);
    var rem = store.getProperty("rem|" + r.id + "|" + day);
    if (rem) writeCell_(sh, row, 6, rem);
  }
  if (f.time) writeCell_(sh, row, 3, f.time);
  if (f.status) writeCell_(sh, row, 4, f.status);
  if (f.checklist) writeCell_(sh, row, 5, f.checklist);
  if (f.kj) writeCell_(sh, row, 7, f.kj);
  if (f.late) writeCell_(sh, row, 8, f.late);
  return row;
}

/** The account that installed and runs the script (receives problem reports and test emails). */
function adminEmail_() {
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
  withLinks_(parsed.items, props, cfg);
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
            title: calTitle_(r), description: calDetails_(r) });
        }
      }
      if (r.badTime) problem(r, "time", r.id + ": Masa mula/Masa tamat tidak difahami. Masa " + r.timeFrom + "–" + r.timeTo + " digunakan.");
      if (r.badDeadline) problem(r, "deadline", r.id + ": Had pengesahan tidak sah (mesti selepas Masa tamat dan tidak lebih awal daripada " +
        LMO_MIN_DEADLINE + "). Had " + r.deadline + " digunakan.");
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
    // Had pengesahan: HH:mm, not before Masa tamat and not before 17:15; otherwise the default (or Masa tamat if later).
    var dlRaw = cell_(r, c, "deadline"), dl = parseTime_(dlRaw), badDeadline = false;
    if (!dl || dl < tt || dl < LMO_MIN_DEADLINE) { badDeadline = !!dlRaw; dl = tt > cfg.DEADLINE ? tt : cfg.DEADLINE; }
    var email = cell_(r, c, "email"), code = cell_(r, c, "code"), kj = cell_(r, c, "kjEmail");
    var days = valid ? workDays_(start, end) : [];
    if (valid && !days.length) days = [start];
    var noDuty = splitDates_(cell_(r, c, "noDuty"));
    items.push({
      row: i + 1, id: id || (start ? "lmo-" + start : "baris-" + (i + 1)), start: start, end: end, rawStart: rawStart, rawEnd: rawEnd, valid: valid,
      timeFrom: tf, timeTo: tt, badTime: badTime,
      name: name, email: email, addr: validEmail_(email) ? email.toLowerCase() : "", phone: normPhone_(cell_(r, c, "phone")),
      role: cell_(r, c, "role"), prog: cell_(r, c, "prog"), off: isYes_(cell_(r, c, "off")),
      stamps: { email: cell_(r, c, "emailSent"), cal: cell_(r, c, "calSent"), wa: cell_(r, c, "waSent") },
      eventId: cell_(r, c, "eventId"),
      deadline: dl, badDeadline: badDeadline, code: validCode_(code) ? code : "", kjEmail: validEmail_(kj) ? kj : "",
      noDuty: noDuty, dutyDays: days.filter(function (d) { return noDuty.indexOf(d) < 0; }),
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

/* ---------------- Selesai confirmation (pure) ---------------- */

function validWebUrl_(u) { return LMO_WEBAPP_RE.test(String(u == null ? "" : u)); }
function validCode_(k) { return LMO_CODE_RE.test(String(k == null ? "" : k)); }
function confirmActive_(props, cfg) { return !!((cfg || CFG).CONFIRM && validWebUrl_((props || {}).WEBAPP_URL)); }

/** Personal link (contract): {WEBAPP_URL}?t={ID}&k={code}. */
function linkFor_(url, r) { return url + "?t=" + encodeURIComponent(r.id) + "&k=" + encodeURIComponent(r.code); }

/** Adds r.link (personal Selesai link, or "") and r.confirmOn to each row. */
function withLinks_(items, props, cfg) {
  cfg = cfg || CFG;
  var on = cfg.CONFIRM !== false, url = props && validWebUrl_(props.WEBAPP_URL) ? props.WEBAPP_URL : "";
  (items || []).forEach(function (r) { r.confirmOn = on; r.link = on && url && r.code ? linkFor_(url, r) : ""; });
  return items;
}

/** "2026-12-09;2026-12-10" -> ["2026-12-09", "2026-12-10"] (also accepts 9/12/2026, commas, spaces). */
function splitDates_(v) {
  var out = [];
  String(v == null ? "" : v).split(/[;,\s]+/).forEach(function (x) {
    var d = parseDate_(x);
    if (d && out.indexOf(d) < 0) out.push(d);
  });
  return out;
}

function addMinutes_(hhmm, n) {
  var p = hhmm.split(":"), t = (+p[0] * 60 + +p[1] + n + 1440) % 1440;
  return pad2_(Math.floor(t / 60)) + ":" + pad2_(t % 60);
}

function allTicked_(ticks) {
  if (!ticks || ticks.length !== LMO_CHECKLIST.length) return false;
  for (var i = 0; i < ticks.length; i++) if (ticks[i] !== true) return false;
  return true;
}

/** "5/12/2026", "5/12/2026 18:35", "18:35" (today) or "" (today) -> { day, time }; null when not understood. */
function parseWhen_(txt, today) {
  var s = String(txt == null ? "" : txt).trim(), time = "";
  if (!s) return { day: today, time: "" };
  var m = /^(?:(.*\S)\s+)?(\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s*(?:[ap]\.?m\.?|pg|ptg))?)$/i.exec(s);
  if (m) {
    time = parseTime_(m[2]);
    if (!time) return null;
    s = m[1] || "";
  }
  var day = s ? parseDate_(s) : today;
  return day ? { day: day, time: time } : null;
}

/** KJ email: KJ_EMAIL property, then the most common valid "Emel KJ" in the Sheet, then none. */
function kjEmail_(items, props) {
  if (props && validEmail_(String(props.KJ_EMAIL || "").trim())) return { email: String(props.KJ_EMAIL).trim(), source: "property" };
  var count = {}, first = {}, best = "", n = 0;
  (items || []).forEach(function (r) {
    if (!r.kjEmail) return;
    var k = r.kjEmail.toLowerCase();
    count[k] = (count[k] || 0) + 1;
    if (!(k in first)) first[k] = r.kjEmail;
    if (count[k] > n) { n = count[k]; best = k; }
  });
  return best ? { email: first[best], source: "sheet" } : { email: "", source: "" };
}

/**
 * Setiausaha Jabatan (receives the duty-day WhatsApp email; cc on KJ alerts):
 * SU_EMAIL property, then the most common valid Emel of a row whose Jawatan is Setiausaha/Secretary, then the admin.
 */
function suContact_(items, props, admin) {
  var p = String((props && props.SU_EMAIL) || "").trim();
  if (validEmail_(p)) return { email: p, source: "property" };
  var count = {}, first = {}, best = "", n = 0;
  (items || []).forEach(function (r) {
    if (!r.addr || !LMO_SU_RE.test(r.role || "")) return;
    count[r.addr] = (count[r.addr] || 0) + 1;
    if (!(r.addr in first)) first[r.addr] = r.email;
    if (count[r.addr] > n) { n = count[r.addr]; best = r.addr; }
  });
  if (best) return { email: first[best], source: "sheet" };
  return { email: admin || "", source: admin ? "admin" : "" };
}

function sameEmail_(a, b) { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); }

/** cc list without blanks, duplicates or the "to" address (so the admin is cc'd only when different from the SU). */
function ccList_(to, list) {
  var seen = {}, out = [];
  if (to) seen[String(to).toLowerCase()] = true;
  (list || []).forEach(function (e) {
    var k = String(e || "").trim().toLowerCase();
    if (k && !seen[k]) { seen[k] = true; out.push(String(e).trim()); }
  });
  return out;
}

/** BM description of where the SU address came from (menus and test emails). */
function suSourceText_(su) {
  return { property: "ditetapkan melalui menu Emel Setiausaha (WhatsApp)", sheet: "dari baris Setiausaha dalam Sheet",
    admin: "tiada emel Setiausaha; dihantar kepada pentadbir" }[su.source] || "tiada";
}

/** The row a link points to: same ID and same (valid) code; otherwise null. */
function findConfirmRow_(items, t, k) {
  t = String(t == null ? "" : t);
  k = String(k == null ? "" : k);
  if (!t || !validCode_(k)) return null;
  for (var i = 0; i < (items || []).length; i++) {
    if (items[i].id === t) return items[i].code === k ? items[i] : null;
  }
  return null;
}

/**
 * State of a personal link at a moment (pure): invalid | notToday | done | early | open.
 * Never reveals a name for an invalid link.
 */
function confirmState_(r, today, hhmm, props, cfg) {
  cfg = cfg || CFG;
  props = props || {};
  if (!r || !r.valid || r.off || !r.name || !r.code) return { state: "invalid", text: CONF_INVALID };
  if ((r.dutyDays || []).indexOf(today) < 0) {
    return { state: "notToday", r: r, date: today, text: "Tiada tugas Last Man Out untuk " + r.name + " hari ini. Giliran anda: " + r.period + "." };
  }
  var c = props["conf|" + r.id + "|" + today];
  if (c) {
    var p = String(c).split("|");
    return { state: "done", r: r, date: today, time: p[0], status: p[1] || "", text: "\u2713 Sudah disahkan pada " + p[0] + " (" + (p[1] || "") + "). Terima kasih." };
  }
  if (hhmm < cfg.CONFIRM_FROM) {
    return { state: "early", r: r, date: today, text: "Butang Selesai boleh ditekan mulai " + cfg.CONFIRM_FROM + " pada hari bertugas." };
  }
  return { state: "open", r: r, date: today };
}

function confirmDoneText_(name, time, status) {
  return "\u2713 Terima kasih, " + name + ". Disahkan " + time + " (" + status + ").";
}

/**
 * What the Selesai check does for one day at one time (pure).
 * Actions: remind (PIC, REMIND_BEFORE minutes before the deadline), kjalert (at/after the deadline, KJ + SU cc),
 * noduty (record "Tiada tugas" in the Pengesahan tab). Each once per duty day (rem| kj| noduty| properties).
 */
function planConfirm_(items, day, hhmm, props, cfg, catchUp) {
  cfg = cfg || CFG;
  props = props || {};
  var out = { day: day, time: hhmm, catchUp: !!catchUp, actions: [], kj: kjEmail_(items, props) };
  if (!confirmActive_(props, cfg)) return out;
  withLinks_(items, props, cfg);
  var since = props.WEBAPP_SINCE || "", seen = {};
  (items || []).forEach(function (r) {
    if (!r.valid || seen[r.id]) return;
    seen[r.id] = true;
    if (r.off || !r.name || !r.code || r.days.indexOf(day) < 0) return;
    var key = "|" + r.id + "|" + day;
    if (r.noDuty.indexOf(day) >= 0) {
      if (hhmm >= r.deadline && !props["noduty" + key]) out.actions.push({ type: "noduty", id: r.id, day: day, item: r, key: "noduty" + key });
      return;
    }
    if (since && r.start < since) return;        // turn began before the Selesai link existed: no link was sent
    if (props["conf" + key]) return;
    if (cfg.REMIND_BEFORE > 0 && !catchUp && hhmm >= addMinutes_(r.deadline, -cfg.REMIND_BEFORE) && hhmm < r.deadline &&
        !props["rem" + key] && r.addr) {
      var m = picReminderMail_(r, day);
      out.actions.push({ type: "remind", id: r.id, day: day, item: r, key: "rem" + key, to: r.email, subject: m.subject, body: m.body });
    }
    if (hhmm >= r.deadline && !props["kj" + key]) out.actions.push({ type: "kjalert", id: r.id, day: day, item: r, key: "kj" + key, catchUp: !!catchUp });
  });
  return out;
}

/* ---------------- Message templates (BM, same wording as the planner) ---------------- */

function lmoChecklist_() {
  return LMO_CHECKLIST.map(function (t, i) { return (i + 1) + ". " + t; }).join("\n");
}

/**
 * Contract paragraph after the checklist: with the personal link when the web app is set up,
 * otherwise "maklumkan SELESAI" to the SU. Left out only when CONFIRM is false.
 */
function confirmPara_(r) {
  if (r.confirmOn === false) return "";
  return r.link
    ? "Selepas tugas selesai setiap hari bertugas, tekan pautan ini dan tanda Selesai sebelum " + r.deadline + ":\n" + r.link +
      "\nJika tiada pengesahan, Ketua Jabatan akan dimaklumkan."
    : "Selepas tugas selesai setiap hari bertugas, maklumkan SELESAI kepada Setiausaha Jabatan melalui WhatsApp atau emel sebelum " +
      r.deadline + ". Jika tiada pengesahan, Ketua Jabatan akan dimaklumkan.";
}

function paraAfter_(r) { var p = confirmPara_(r); return p ? "\n\n" + p : ""; }

function waText_(r) {
  return "Salam " + r.name + ",\n\nPeringatan: tuan/puan bertugas sebagai *Pegawai Last Man Out* " + (r.single ? "hari ini" : "minggu ini") +
    " (" + r.period + ").\n\nSebelum pulang (sekitar " + r.timeFrom + "), sila pastikan:\n" + lmoChecklist_() + paraAfter_(r) +
    "\n\nTerima kasih.\n" + LMO_SIGNOFF;
}

function mailSubject_(r) { return "Giliran Last Man Out (MQS): " + r.period; }

function mailBody_(r) {
  return "Salam " + r.name + ",\n\nTuan/puan dijadualkan sebagai Pegawai Last Man Out (MQS) Jabatan JPPP pada " + r.period +
    ".\n\nSetiap hari bertugas, sebelum meninggalkan pejabat (sekitar " + r.timeFrom + "–" + r.timeTo + "):\n" + lmoChecklist_() + paraAfter_(r) +
    "\n\nJemputan Google Calendar turut dihantar. Jika tidak dapat bertugas (cuti/kursus), sila maklumkan Setiausaha Jabatan segera supaya giliran boleh ditukar." +
    "\n\nTerima kasih.\n" + LMO_MAIL_SIGNOFF;
}

function calTitle_(r) { return "Last Man Out (MQS): " + r.name; }

function calDetails_(r) {
  return "Tugas Pegawai Last Man Out sebelum meninggalkan pejabat:\n" + lmoChecklist_() + (r ? paraAfter_(r) : "") +
    "\n\nJadual Bertugas Last Man Out, Jabatan JPPP, KPTM Kuantan (MQS).";
}

/** Email to the PIC REMIND_BEFORE minutes before the deadline (section 6). */
function picReminderMail_(r, day) {
  return {
    subject: "Peringatan: tekan Selesai Last Man Out sebelum " + r.deadline,
    body: "Salam " + r.name + ",\n\nTuan/puan bertugas sebagai Pegawai Last Man Out hari ini (" + longDate_(day) + "). Pengesahan belum diterima." +
      "\n\nSelepas selesai, tekan pautan ini dan tanda Selesai sebelum " + r.deadline + ":\n" + r.link +
      "\n\nJika tiada pengesahan, Ketua Jabatan akan dimaklumkan secara automatik.\n\nTerima kasih.\n" + LMO_MAIL_SIGNOFF
  };
}

function roleProg_(r) { return [r.role, r.prog].filter(function (x) { return x; }).join(" / "); }

/** Email to the KJ (SU in cc) when the PIC has not confirmed by the deadline (section 6). */
function kjAlertMail_(r, day, catchUp, kjAddr) {
  var rp = roleProg_(r);
  var body = "Salam Tuan/Puan Ketua Jabatan,\n\nUntuk makluman, Pegawai Last Man Out pada " + longDate_(day) + ", " + r.name +
    (rp ? " (" + rp + ")" : "") + ", belum menekan Selesai bagi senarai semak Last Man Out (MQS) sehingga " + r.deadline + ".\n\n" +
    lmoChecklist_() + (r.phone ? "\n\nHubungi pegawai: https://wa.me/" + r.phone : "") +
    "\n\nJika pegawai mengesahkan selepas ini, emel susulan akan dihantar. Rekod: tab " + CONF_SHEET + ".\n\nEmel automatik, JPPP Smart Planner.";
  if (!kjAddr) {
    body = "UNTUK SU: emel ini dihantar kepada anda, bukan kepada Ketua Jabatan, kerana emel Ketua Jabatan belum ada. Isi emel Ketua Jabatan dalam planner " +
      "(Kenalan pasukan, Jawatan: Ketua Jabatan) dan eksport semula CSV giliran, atau minta pentadbir skrip memilih menu Last Man Out > Emel Ketua Jabatan. " +
      "Sementara itu, sila majukan emel ini kepada Ketua Jabatan.\n\n----------\n\n" + body;
  }
  return { subject: "Last Man Out " + dmy_(day) + ": " + r.name + " belum mengesahkan tugas" + (catchUp ? " (semalam)" : ""), body: body };
}

/** Follow-up to the KJ (SU in cc) when the PIC confirms after the alert (section 6). */
function kjLateMail_(r, day, alertTime, time) {
  return {
    subject: "Last Man Out " + dmy_(day) + ": " + r.name + " telah mengesahkan (lewat)",
    body: "Salam Tuan/Puan,\n\nSusulan emel " + alertTime + ": " + r.name + " telah menekan Selesai pada " + time + ", " + longDate_(day) +
      ". Status: Lewat.\n\nTerima kasih."
  };
}

/** The web page for a personal link (mobile-first, BM, accessible). Only the "open" state has a form. */
function confirmPage_(st, cfg) {
  cfg = cfg || CFG;
  var r = st.r, body;
  if (st.state === "open") {
    var boxes = LMO_CHECKLIST.map(function (c, i) {
      return "<label class=\"item\" for=\"c" + i + "\"><input type=\"checkbox\" id=\"c" + i + "\"><span>" + esc_(c) + "</span></label>";
    }).join("");
    var js = "(function(){var f=document.getElementById('f'),b=document.getElementById('b'),s=document.getElementById('s')," +
      "x=f.querySelectorAll('input[type=checkbox]');" +
      "function u(){var a=true;for(var i=0;i<x.length;i++)if(!x[i].checked)a=false;b.disabled=!a;}" +
      "for(var i=0;i<x.length;i++)x[i].addEventListener('change',u);" +
      "f.addEventListener('submit',function(ev){ev.preventDefault();if(b.disabled)return;var t=[];for(var i=0;i<x.length;i++)t.push(x[i].checked);" +
      "b.disabled=true;s.className='status';s.textContent='Sedang menghantar\u2026';" +
      "google.script.run.withSuccessHandler(function(res){if(res&&res.ok){f.hidden=true;s.className='status ok';s.textContent=res.text;s.focus();}" +
      "else{s.className='status err';s.textContent=(res&&res.text)||'Tidak berjaya. Sila cuba lagi.';u();}})" +
      ".withFailureHandler(function(){s.className='status err';s.textContent='Tidak dapat dihubungi. Semak internet dan tekan Selesai sekali lagi.';u();})" +
      ".confirmLmo(" + jsStr_(r.id) + "," + jsStr_(r.code) + ",t);});})();";
    body = "<p class=\"who\">Pegawai: <strong>" + esc_(r.name) + "</strong><br>Tarikh: " + esc_(longDate_(st.date)) + "</p>" +
      "<form id=\"f\" novalidate><fieldset><legend>Senarai semak sebelum pulang</legend>" + boxes + "</fieldset>" +
      "<p id=\"h1\" class=\"hint\">Tanda kelima-lima perkara untuk mengaktifkan butang.</p>" +
      "<button type=\"submit\" id=\"b\" disabled aria-describedby=\"h1 h2\">Selesai / Done</button>" +
      "<p id=\"h2\" class=\"hint\">Had pengesahan " + esc_(r.deadline) + ". Selepas had, pengesahan direkod sebagai Lewat.</p></form>" +
      "<p id=\"s\" class=\"status\" role=\"status\" aria-live=\"polite\" tabindex=\"-1\"></p>" +
      "<script>" + js + "</script>";
  } else {
    var cls = st.state === "done" ? "status ok" : st.state === "invalid" || st.state === "error" ? "status err" : "status";
    body = "<p id=\"s\" class=\"" + cls + "\" role=\"status\" aria-live=\"polite\">" + esc_(st.text) + "</p>";
  }
  return "<!DOCTYPE html><html lang=\"ms\"><head><meta charset=\"utf-8\"><base target=\"_top\">" +
    "<title>Last Man Out: Pengesahan Selesai</title><style>" + CONF_CSS + "</style></head><body><main>" +
    "<h1>Last Man Out (MQS) \u2013 Pengesahan Selesai</h1><p class=\"sub\">Jabatan Pengurusan Perniagaan &amp; Perakaunan, KPTM Kuantan</p>" +
    body + "</main></body></html>";
}

/** A JS string literal safe inside an inline <script>. */
function jsStr_(v) { return JSON.stringify(String(v)).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"); }

var CONF_CSS = "*{box-sizing:border-box}" +
  "body{margin:0;background:#f3f5f4;color:#1b1f1d;font:17px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}" +
  "main{max-width:34rem;margin:0 auto;padding:16px}" +
  "h1{font-size:1.3rem;line-height:1.3;margin:8px 0 4px}" +
  ".sub{margin:0 0 16px;color:#47504c}" +
  ".who,fieldset{background:#fff;border:1px solid #cfd6d2;border-radius:12px}" +
  ".who{padding:12px 14px;margin:0}" +
  "fieldset{margin:16px 0 8px;padding:4px 14px 6px}" +
  "legend{font-weight:700;padding:0 4px}" +
  ".item{display:flex;align-items:center;gap:12px;min-height:48px;padding:8px 0;border-bottom:1px solid #e4e9e6;cursor:pointer}" +
  ".item:last-child{border-bottom:0}" +
  ".item input{width:24px;height:24px;flex:none;margin:0;accent-color:#1d6b40}" +
  "button{display:block;width:100%;min-height:52px;margin:8px 0;border:0;border-radius:12px;background:#1d6b40;color:#fff;" +
  "font-family:inherit;font-size:1.1rem;font-weight:700;cursor:pointer}" +
  "button:disabled{background:#cdd5d1;color:#3b4440;cursor:not-allowed}" +
  ":focus-visible{outline:3px solid #1747c2;outline-offset:2px}" +
  ".hint{color:#47504c;font-size:.95rem;margin:6px 0}" +
  ".status{font-size:1.1rem;font-weight:600;margin:16px 0;min-height:1.5em}" +
  ".ok{color:#1d6b40}.err{color:#a1261b}" +
  "@media (prefers-color-scheme:dark){body{background:#111513;color:#e8ecea}.sub,.hint{color:#b5beba}" +
  ".who,fieldset{background:#1a201d;border-color:#38423d}.item{border-color:#2c3531}" +
  "button{background:#3fa06b;color:#0b0f0d}button:disabled{background:#3a433f;color:#c9d1cd}" +
  ".ok{color:#7bd3a0}.err{color:#ff9d92}:focus-visible{outline-color:#8fb2ff}}";

function waUrl_(phone, text) { return "https://wa.me/" + phone + "?text=" + encodeURIComponent(text); }

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
}

function actionLabel_(a) {
  return { email: "emel", cal: "jemputan Google Calendar", delcal: "batal jemputan kalendar", wa: "pautan WhatsApp",
    remind: "peringatan Selesai", kjalert: "amaran Ketua Jabatan", noduty: "rekod Tiada tugas" }[a.type] || a.type;
}

/** Lines describing a Selesai plan (test run and log). */
function describeConfirm_(conf) {
  return conf.actions.map(function (a) {
    var r = a.item;
    if (a.type === "remind") return "- Peringatan Selesai kepada " + r.name + " (" + a.to + "): \"" + a.subject + "\"";
    if (a.type === "kjalert") {
      var su = (conf.cc || [])[0] || "", to = conf.kj.email || su, cc = ccList_(to, conf.cc || []);
      return "- Amaran kepada " + (conf.kj.email ? "Ketua Jabatan (" + conf.kj.email + ")" : "Setiausaha Jabatan (" + (su || "-") + "; tiada emel KJ)") +
        (cc.length ? ", salinan kepada " + cc.join(", ") : "") + ": " +
        r.name + " belum mengesahkan tugas " + dmy_(a.day) + (a.catchUp ? " (semalam)" : "") + "; rekod \"Tidak disahkan\" dalam tab " + CONF_SHEET;
    }
    return "- Rekod \"Tiada tugas\" untuk " + r.name + " (" + dmy_(a.day) + ") dalam tab " + CONF_SHEET;
  });
}

/**
 * The daily email(s). audience:
 *   "all"   one person is both SU and admin: WhatsApp link(s), what was sent, what needs action (the original summary);
 *   "su"    the Setiausaha: only the WhatsApp part (who is on duty, the wa.me link, or the text to copy);
 *   "admin" the installer: what was sent, cancellations, problems, errors, quota (only when one of the last four exists).
 * info: { admin, su, waError }. Returns null when there is nothing to report.
 */
function buildDigest_(out, audience, info) {
  audience = audience || "all";
  info = info || {};
  var forSu = audience === "su", forAdmin = audience === "admin";
  var wa = forAdmin ? [] : out.wa || [], sent = forSu ? [] : out.sent || [], cancelled = forSu ? [] : out.cancelled || [];
  var problems = forSu ? [] : out.problems || [], errors = forSu ? [] : out.errors || [], quotaLow = forSu ? null : out.quotaLow;
  if (forAdmin && info.waError && (out.wa || []).length) {
    problems = problems.concat([{ text: "Emel WhatsApp hari bertugas kepada Setiausaha Jabatan (" + info.su + ") tidak dihantar: " + info.waError +
      ". Skrip akan cuba lagi esok jika giliran masih berjalan." }]);
  }
  if (forAdmin) { if (!cancelled.length && !problems.length && !errors.length && quotaLow == null) return null; }
  else if (!wa.length && !sent.length && !cancelled.length && !problems.length && !errors.length && quotaLow == null) return null;
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
  if (quotaLow != null) {
    todo.push("Kuota emel harian akaun ini hampir habis (baki " + quotaLow + "). Emel yang belum dihantar akan dicuba semula esok, sebelum giliran bermula.");
  }
  if (todo.length) { head("Perlu tindakan anda"); list(todo); }
  if (forAdmin && (out.wa || []).length && !info.waError) {
    para("Pautan WhatsApp hari ini untuk " + out.wa.map(function (a) { return a.item.name; }).join(", ") +
      " telah diemel kepada Setiausaha Jabatan (" + info.su + ").");
  }
  if (forSu) {
    para("Emel automatik daripada JPPP Smart Planner (skrip Last Man Out" + (info.admin ? ", dipasang oleh " + info.admin + "; hubungi beliau untuk sebarang perubahan" : "") + ").");
  } else {
    para("Emel ini dihantar oleh skrip Last Man Out dalam Google Sheet anda (tab " + CFG.SHEET + "). Untuk berhenti: menu Last Man Out > Henti automatik.");
  }

  var subject = "Last Man Out " + dmy_(out.today) + ": " + (wa.length
    ? "hantar WhatsApp kepada " + wa.map(function (a) { return a.item.name; }).join(", ")
    : sent.length && !forAdmin ? "notis giliran dihantar" : "perlu semakan");
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
    else if (a.type === "wa") {
      lines.push("- Emel kepada Setiausaha Jabatan" + (plan.su ? " (" + plan.su + ")" : "") + " dengan pautan WhatsApp untuk " + r.name +
        (a.url ? "" : " (tiada No. WhatsApp; mesej untuk disalin)"));
    }
  });
  var text = "Pada " + longDate_(plan.today) + " skrip akan:\n" + (lines.length ? lines.join("\n") : "- Tiada notis perlu dihantar.");
  if (plan.confirm) {
    var cl = describeConfirm_(plan.confirm);
    text += "\n\n" + (plan.time ? "Semakan butang Selesai pada " + plan.time + ":\n" : "Susulan butang Selesai semalam (" + dmy_(plan.confirm.day) + "):\n") +
      (cl.length ? cl.join("\n") : "- Tiada peringatan atau amaran.");
  } else if (plan.time) {
    text += "\n\nButang Selesai belum aktif: URL web app belum ditetapkan (menu Pautan Selesai) atau CONFIRM ialah false.";
  }
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
  if (o.wa.length) {
    lines.push("Pautan WhatsApp untuk " + o.wa.map(function (a) { return a.item.name; }).join(", ") +
      (o.digestSent ? " telah diemel kepada Setiausaha Jabatan (" + o.waTo + ")." : " belum diemel."));
  }
  if (o.problems.length || o.errors.length || o.quotaLow != null) lines.push("Ada perkara yang perlu tindakan anda; lihat emel laporan dan lajur \"Catatan skrip\".");
  if (o.digestError) lines.push("Emel WhatsApp/ringkasan tidak dihantar: " + o.digestError);
  if (o.adminError) lines.push("Emel laporan kepada anda tidak dihantar: " + o.adminError);
  if (o.catchUp && o.catchUp.sent.length) lines.push("Amaran Selesai semalam dihantar kepada Ketua Jabatan: " + o.catchUp.sent.length + ".");
  return lines.length ? lines.join("\n") : "Tiada notis perlu dihantar hari ini.";
}
