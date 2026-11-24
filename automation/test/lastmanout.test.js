// Tests for automation/LastManOut.gs. Run from the repo root: node --test automation/test
// All names, emails and phone numbers here are fake (example.com, 6012000000x).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { createGas, loadPure, parseCsv } = require("./gas-mock");

const ROOT = path.join(__dirname, "..", "..");
const FIXTURE = path.join(__dirname, "fixtures", "sample-giliran.csv");
// Contract 2 (18 columns since the Selesai addendum) and the old 14-column header, which must keep working.
const HEADER14 = "ID,Mula,Tamat,Masa mula,Masa tamat,Nama,Emel,No WhatsApp,Jawatan,Program,Cuti,Emel dihantar,Kalendar dihantar,WhatsApp dihantar".split(",");
const HEADER = HEADER14.concat(["Had pengesahan", "Kod pengesahan", "Emel KJ", "Hari tiada tugas"]);
// The mock's installer (Session.getEffectiveUser). With no SU_EMAIL property and no Setiausaha row, the SU resolves to
// the installer, so the original tests describe the "same person" case. Tests with a separate SU use SU2 / ADMIN2.
const SU = "su@example.com";
const ADMIN2 = "pentadbir@example.com";
const SU2 = "setiausaha.ujian@example.com";
const KJ = "kj.ujian@example.com";
const WEBAPP = "https://script.google.com/macros/s/AKfycbTestDeployment_0123456789/exec";
const CODE1 = "Kod_Ujian-0000000001";   // 20 chars, matches [A-Za-z0-9_-]{16,64}

// Section E templates, written out in full so the tests check the contract, not the script against itself.
const SENARAI = "1. Semua lampu ditutup\n2. Penyaman udara & kipas dimatikan\n3. Suis utama dimatikan / palam dicabut\n" +
  "4. Pintu utama & tingkap dikunci\n5. Tandatangan borang & catat masa keluar";
const SIGNOFF = "Setiausaha Jabatan JPPP, KPTM Kuantan";                // WhatsApp (sent by the SU herself)
const MAIL_SIGNOFF = "JPPP Smart Planner, Jabatan Pengurusan Perniagaan & Perakaunan, KPTM Kuantan";   // emails from the script
const WEEK1 = "Isnin, 7 Disember 2026 hingga Jumaat, 11 Disember 2026";
// Addendum section 1: the confirmation paragraph that follows the checklist (with or without the personal link).
const paraLink = (had, url) => "Selepas tugas selesai setiap hari bertugas, tekan pautan ini dan tanda Selesai sebelum " + had + ":\n" + url +
  "\nJika tiada pengesahan, Ketua Jabatan akan dimaklumkan.";
const paraNoLink = (had) => "Selepas tugas selesai setiap hari bertugas, maklumkan SELESAI kepada Setiausaha Jabatan melalui WhatsApp atau emel sebelum " +
  had + ". Jika tiada pengesahan, Ketua Jabatan akan dimaklumkan.";
const NO_LINK = paraNoLink("18:30");
const link = (id, code) => WEBAPP + "?t=" + id + "&k=" + code;
const expectSubject = (tempoh) => "Giliran Last Man Out (MQS): " + tempoh;
const expectBody = (nama, tempoh, from, to, para = NO_LINK) => "Salam " + nama + ",\n\nTuan/puan dijadualkan sebagai Pegawai Last Man Out (MQS) Jabatan JPPP pada " +
  tempoh + ".\n\nSetiap hari bertugas, sebelum meninggalkan pejabat (sekitar " + from + "–" + to + "):\n" + SENARAI + "\n\n" + para +
  "\n\nJemputan Google Calendar turut dihantar. Jika tidak dapat bertugas (cuti/kursus), sila maklumkan Setiausaha Jabatan segera supaya giliran boleh ditukar.\n\nTerima kasih.\n" + MAIL_SIGNOFF;
const expectWa = (nama, bila, tempoh, from, para = NO_LINK) => "Salam " + nama + ",\n\nPeringatan: tuan/puan bertugas sebagai *Pegawai Last Man Out* " + bila +
  " (" + tempoh + ").\n\nSebelum pulang (sekitar " + from + "), sila pastikan:\n" + SENARAI + "\n\n" + para + "\n\nTerima kasih.\n" + SIGNOFF;
const calDetails = (para = NO_LINK) => "Tugas Pegawai Last Man Out sebelum meninggalkan pejabat:\n" + SENARAI + "\n\n" + para +
  "\n\nJadual Bertugas Last Man Out, Jabatan JPPP, KPTM Kuantan (MQS).";
const CAL_DETAILS = calDetails();

/** One Sheet row in Contract 2 column order (18 columns). */
function row(o) {
  return [o.id || "lmo-" + o.start, o.start, o.end || o.start, o.from == null ? "16:45" : o.from, o.to == null ? "17:15" : o.to,
    o.name == null ? "Pensyarah Ujian 1" : o.name,
    o.email == null ? "ujian1@example.com" : o.email, o.phone == null ? "60120000001" : o.phone, o.role || "Pensyarah", o.prog == null ? "AA101" : o.prog,
    o.off || "", o.mailStamp || "", o.calStamp || "", o.waStamp || "", o.had || "", o.code || "", o.kj || "", o.noDuty || ""];
}
const weekRow = (o) => row(Object.assign({ start: "2026-12-07", end: "2026-12-11" }, o || {}));
const at = (isoLocal) => isoLocal + "+08:00";   // Malaysia time
const officerMails = (rec) => rec.emails.filter((m) => m.to !== SU);
const digests = (rec) => rec.emails.filter((m) => m.to === SU);
/** Action types as a plain array (the script's arrays live in another vm realm). */
const types = (plan) => Array.from(plan.actions, (a) => a.type);
function col(gas, header) {
  return gas.sheet._data[0].indexOf(header);
}
function cellOf(gas, rowNum, header) {
  return (gas.sheet._data[rowNum - 1] || [])[col(gas, header)] || "";
}

/* =================== Pure planner, no Apps Script mocks =================== */

test("pure: the script loads with no Apps Script services and planActions_ works", () => {
  const g = loadPure();
  const plan = g.planActions_([HEADER, weekRow()], "2026-12-05", {}, g.CFG);
  assert.equal(plan.ok, true);
  assert.deepEqual(types(plan), ["email", "cal"]);
  assert.equal(plan.actions[0].to, "ujian1@example.com");
  assert.equal(plan.actions[0].key, "email|lmo-2026-12-07|ujian1@example.com");
  assert.equal(plan.actions[1].key, "cal|lmo-2026-12-07|ujian1@example.com");
  assert.deepEqual([...plan.actions[1].item.days], ["2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11"]);
});

test("pure: messages follow the section E templates exactly", () => {
  const g = loadPure();
  const weekly = g.planActions_([HEADER, weekRow()], "2026-12-05", {}, g.CFG);
  assert.equal(weekly.actions[0].subject, expectSubject(WEEK1));
  assert.equal(weekly.actions[0].body, expectBody("Pensyarah Ujian 1", WEEK1, "16:45", "17:15"));
  assert.equal(weekly.actions[1].title, "Last Man Out (MQS): Pensyarah Ujian 1");
  assert.equal(weekly.actions[1].description, CAL_DETAILS);
  const wa = g.planActions_([HEADER, weekRow()], "2026-12-07", { "email|lmo-2026-12-07|ujian1@example.com": "x", "cal|lmo-2026-12-07|ujian1@example.com": "e" }, g.CFG);
  assert.equal(wa.actions.length, 1);
  assert.equal(wa.actions[0].text, expectWa("Pensyarah Ujian 1", "minggu ini", WEEK1, "16:45"));

  // daily row, another time slot: "hari ini", single long date, times from the row
  const daily = g.planActions_([HEADER, row({ start: "2026-12-08", from: "17:00", to: "17:30" })], "2026-12-08", {}, g.CFG);
  assert.deepEqual(types(daily), ["email", "cal", "wa"]);
  assert.equal(daily.actions[0].subject, expectSubject("Selasa, 8 Disember 2026"));
  assert.equal(daily.actions[0].body, expectBody("Pensyarah Ujian 1", "Selasa, 8 Disember 2026", "17:00", "17:30"));
  assert.equal(daily.actions[2].text, expectWa("Pensyarah Ujian 1", "hari ini", "Selasa, 8 Disember 2026", "17:00"));
});

test("pure: header found by name in any order, BOM and dots ignored, title row above", () => {
  const g = loadPure();
  const shuffled = ["Nama", "﻿id", " MULA ", "Tamat", "No. WhatsApp", "Emel", "Masa mula", "Masa tamat", "Cuti"];
  const r = weekRow();
  const data = ["Pensyarah Ujian 1", "lmo-2026-12-07", "2026-12-07", "2026-12-11", "60120000001", "ujian1@example.com", "16:45", "17:15", ""];
  const plan = g.planActions_([["Jadual Last Man Out"], shuffled, data], "2026-12-05", {}, g.CFG);
  assert.equal(plan.ok, true);
  assert.equal(plan.headerRow, 2);
  assert.deepEqual(types(plan), ["email", "cal"]);
  assert.equal(plan.actions[0].row, 3);
  assert.equal(plan.actions[1].item.phone, "60120000001");
  assert.ok(r); // weekRow helper still valid

  const bad = g.planActions_([["a", "b"], ["c", "d"]], "2026-12-05", {}, g.CFG);
  assert.equal(bad.ok, false);
  assert.match(bad.error, /Baris tajuk tidak dijumpai/);
});

test("pure: `7/12/2026` and other Sheet display formats are parsed", () => {
  const g = loadPure();
  assert.equal(g.parseDate_("7/12/2026"), "2026-12-07");
  assert.equal(g.parseDate_("07/12/2026"), "2026-12-07");
  assert.equal(g.parseDate_("2026-12-07"), "2026-12-07");
  assert.equal(g.parseDate_("2026/12/07"), "2026-12-07");
  assert.equal(g.parseDate_("7/12/2026 0:00:00"), "2026-12-07");
  assert.equal(g.parseDate_("31/2/2026"), "");
  assert.equal(g.parseDate_("Isnin"), "");
  assert.equal(g.parseTime_("16:45"), "16:45");
  assert.equal(g.parseTime_("9:00"), "09:00");
  assert.equal(g.parseTime_("16:45:00"), "16:45");
  assert.equal(g.parseTime_("4:45 PM"), "16:45");
  assert.equal(g.parseTime_("4:45:00 ptg"), "16:45");
  assert.equal(g.parseTime_("12:15 am"), "00:15");
  assert.equal(g.parseTime_("25:00"), "");
  assert.equal(g.normPhone_("012-000 0001"), "60120000001");
  assert.equal(g.normPhone_("+60 12-000 0001"), "60120000001");
  assert.equal(g.normPhone_("120000001"), "60120000001");
  assert.equal(g.normPhone_("6.01200E+10"), "");
  assert.equal(g.longDate_("2026-12-07"), "Isnin, 7 Disember 2026");
  assert.equal(g.longDate_("2027-01-01"), "Jumaat, 1 Januari 2027");

  // A whole row as Google Sheets shows it after "convert text to numbers and dates" was left ticked
  const plan = g.planActions_([HEADER, weekRow({ start: "7/12/2026", end: "11/12/2026", from: "16:45:00", to: "17:15:00", id: "lmo-2026-12-07" })],
    "2026-12-05", {}, g.CFG);
  assert.deepEqual(types(plan), ["email", "cal"]);
  assert.equal(plan.actions[0].subject, expectSubject(WEEK1));
  assert.equal(plan.actions[1].item.timeFrom, "16:45");
  assert.equal(plan.actions[1].item.days.length, 5);

  // US-locale Sheet shows 7 Dec as 12/7/2026: the ID decides
  const us = g.planActions_([HEADER, weekRow({ start: "12/7/2026", end: "12/11/2026", id: "lmo-2026-12-07" })], "2026-12-05", {}, g.CFG);
  assert.equal(us.items[0].start, "2026-12-07");
  assert.equal(us.items[0].end, "2026-12-11");
});

test("pure: bad dates and missing columns are reported, not fatal", () => {
  const g = loadPure();
  const plan = g.planActions_([HEADER, weekRow({ start: "esok", end: "lusa" }), weekRow({ id: "lmo-2026-12-14", start: "2026-12-14", end: "2026-12-18" })],
    "2026-12-12", {}, g.CFG);
  assert.equal(plan.ok, true);
  assert.equal(plan.problems.length, 1);
  assert.match(plan.problems[0].text, /tarikh Mula\/Tamat tidak difahami/);
  assert.deepEqual(types(plan), ["email", "cal"]);
  // Once reported (warn key stored), the same problem is not reported again
  const again = g.planActions_([HEADER, weekRow({ start: "esok", end: "lusa" })], "2026-12-12", { [plan.problems[0].key]: "x" }, g.CFG);
  assert.equal(again.problems.length, 0);
});

test("pure: staleKeys_ only drops records older than KEEP_DAYS", () => {
  const g = loadPure();
  const keys = [...g.staleKeys_({ "email|lmo-2026-01-05|a@example.com": "1", "cal|lmo-2026-12-07|a@example.com": "e", "other": "1" }, "2026-12-07", 120)];
  assert.deepEqual(keys, ["email|lmo-2026-01-05|a@example.com"]);
});

/* =================== dailyRun with recorded Apps Script mocks =================== */

test("D−3: nothing is sent and nothing is written", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-04T07:10:00") });
  gas.ctx.dailyRun();
  assert.equal(gas.rec.emails.length, 0);
  assert.equal(gas.rec.events.length, 0);
  assert.equal(gas.rec.writes.length, 0);
  assert.equal(gas.rec.propWrites.length, 0);
  assert.equal(gas.rec.locks, 0, "lock released");
});

test("D−2: email + createEventSeries(times(5)) with sendInvites, stamps and records", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00") });
  gas.ctx.dailyRun();
  const mails = officerMails(gas.rec);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, "ujian1@example.com");
  assert.equal(mails[0].subject, expectSubject(WEEK1));
  assert.equal(mails[0].body, expectBody("Pensyarah Ujian 1", WEEK1, "16:45", "17:15"));
  assert.equal(mails[0].name, "JPPP Smart Planner");
  assert.equal(mails[0].replyTo, SU);

  assert.equal(gas.rec.events.length, 1);
  const ev = gas.rec.events[0];
  assert.equal(ev.kind, "series");
  assert.deepEqual(ev.recurrence, [{ kind: "daily", count: 5, weekdays: null }]);
  assert.equal(ev.title, "Last Man Out (MQS): Pensyarah Ujian 1");
  assert.equal(ev.start.toISOString(), "2026-12-07T08:45:00.000Z");   // 16:45 Malaysia time
  assert.equal(ev.end.toISOString(), "2026-12-07T09:15:00.000Z");     // 17:15 Malaysia time
  assert.equal(ev.options.guests, "ujian1@example.com");
  assert.equal(ev.options.sendInvites, true);
  assert.equal(ev.options.description, CAL_DETAILS);
  assert.deepEqual(ev.reminders, [30]);
  assert.deepEqual(ev.tags, { lmoId: "lmo-2026-12-07" });

  assert.equal(gas.store["email|lmo-2026-12-07|ujian1@example.com"], "2026-12-05 07:10");
  assert.equal(gas.store["cal|lmo-2026-12-07|ujian1@example.com"], ev.id);
  assert.equal(cellOf(gas, 2, "Emel dihantar"), "2026-12-05 07:10");
  assert.equal(cellOf(gas, 2, "Kalendar dihantar"), "2026-12-05 07:10");
  assert.equal(cellOf(gas, 2, "ID acara"), ev.id);
  assert.match(cellOf(gas, 2, "Catatan skrip"), /Emel dihantar kepada ujian1@example.com/);
  assert.ok(gas.rec.writes.filter((w) => w.row === 2).every((w) => w.format === "@"), "stamps written as plain text");

  // The SU is told what went out
  const dg = digests(gas.rec);
  assert.equal(dg.length, 1);
  assert.match(dg[0].subject, /^Last Man Out 5\/12\/2026: notis giliran dihantar$/);
  assert.match(dg[0].body, /Emel dan jemputan Google Calendar kepada Pensyarah Ujian 1 \(ujian1@example.com\)/);
});

test("rerun on the same day sends nothing new", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00") });
  gas.ctx.dailyRun();
  const mails = gas.rec.emails.length, events = gas.rec.events.length;
  gas.setNow(at("2026-12-05T15:00:00"));
  gas.ctx.dailyRun();
  gas.setNow(at("2026-12-06T07:10:00"));   // and the next morning (still inside the D−2..D window)
  gas.ctx.dailyRun();
  assert.equal(gas.rec.emails.length, mails);
  assert.equal(gas.rec.events.length, events);
});

test("Monday duty is notified on Saturday; a daily Tuesday turn on Sunday (single event)", () => {
  const g = loadPure();
  assert.equal(g.weekday_("2026-12-07"), 1, "7 Dec 2026 is a Monday");
  assert.equal(g.weekday_("2026-12-05"), 6, "5 Dec 2026 is a Saturday");
  const fri = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-04T07:10:00") });
  fri.ctx.dailyRun();
  assert.equal(fri.rec.emails.length, 0);
  const sat = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00") });
  sat.ctx.dailyRun();
  assert.equal(officerMails(sat.rec).length, 1);

  const daily = createGas({ rows: [HEADER, row({ start: "2026-12-08" })], now: at("2026-12-06T07:10:00") });
  daily.ctx.dailyRun();
  assert.equal(officerMails(daily.rec).length, 1);
  assert.equal(officerMails(daily.rec)[0].subject, expectSubject("Selasa, 8 Disember 2026"));
  assert.equal(daily.rec.events.length, 1);
  assert.equal(daily.rec.events[0].kind, "single");
  assert.equal(daily.rec.events[0].options.sendInvites, true);
  assert.equal(daily.rec.events[0].start.toISOString(), "2026-12-08T08:45:00.000Z");
});

test("'today' is the Malaysian date, not the server's UTC date", () => {
  // Fri 4 Dec 23:30 in Kuala Lumpur (15:30 UTC): still D−3, nothing
  const late = createGas({ rows: [HEADER, weekRow()], now: "2026-12-04T15:30:00Z" });
  late.ctx.dailyRun();
  assert.equal(late.rec.emails.length, 0);
  // Sat 5 Dec 00:30 in Kuala Lumpur is still Fri 4 Dec in UTC: D−2, send
  const early = createGas({ rows: [HEADER, weekRow()], now: "2026-12-04T16:30:00Z" });
  early.ctx.dailyRun();
  assert.equal(officerMails(early.rec).length, 1);
});

test("missed runs catch up until the duty starts, never after", () => {
  const mon = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-07T07:10:00") });
  mon.ctx.dailyRun();
  assert.equal(officerMails(mon.rec).length, 1);
  assert.equal(mon.rec.events.length, 1);
  const tue = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-08T07:10:00") });
  tue.ctx.dailyRun();
  assert.equal(officerMails(tue.rec).length, 0);
  assert.equal(tue.rec.events.length, 0);
});

test("`7/12/2026` in the Sheet (Sheets converted the dates) still sends on D−2", () => {
  const gas = createGas({ rows: [HEADER, weekRow({ start: "7/12/2026", end: "11/12/2026", from: "16:45:00", to: "17:15:00" , id: "lmo-2026-12-07" })],
    now: at("2026-12-05T07:10:00") });
  gas.ctx.dailyRun();
  assert.equal(officerMails(gas.rec).length, 1);
  assert.equal(officerMails(gas.rec)[0].subject, expectSubject(WEEK1));
  assert.equal(gas.rec.events[0].recurrence[0].count, 5);
  assert.equal(gas.rec.events[0].start.toISOString(), "2026-12-07T08:45:00.000Z");
});

test("missing email: no crash, the SU's digest explains, and it is not repeated", () => {
  const gas = createGas({ rows: [HEADER, weekRow({ name: "Ketua Program Ujian", email: "" })], now: at("2026-12-05T07:10:00") });
  assert.doesNotThrow(() => gas.ctx.dailyRun());
  assert.equal(officerMails(gas.rec).length, 0);
  assert.equal(gas.rec.events.length, 0);
  const dg = digests(gas.rec);
  assert.equal(dg.length, 1);
  assert.match(dg[0].subject, /perlu semakan/);
  assert.match(dg[0].body, /Ketua Program Ujian \(Isnin, 7 Disember 2026 hingga Jumaat, 11 Disember 2026\): tiada emel yang sah/);
  assert.match(cellOf(gas, 2, "Catatan skrip"), /tiada emel yang sah/);
  gas.setNow(at("2026-12-06T07:10:00"));
  gas.ctx.dailyRun();
  assert.equal(digests(gas.rec).length, 1, "same problem not emailed again");
  // Email added later (still before the duty): it is sent then
  gas.setRows([HEADER, weekRow({ name: "Ketua Program Ujian", email: "kp.ujian@example.com" })]);
  gas.ctx.dailyRun();
  assert.equal(officerMails(gas.rec).length, 1);
  assert.equal(officerMails(gas.rec)[0].to, "kp.ujian@example.com");
});

test("missing email: early warning to the SU a week before, once", () => {
  const rows = [HEADER, weekRow({ name: "Ketua Program Ujian", email: "" })];
  const early = createGas({ rows, now: at("2026-11-30T07:10:00") });   // Monday, one week before
  early.ctx.dailyRun();
  assert.equal(early.rec.emails.length, 1);
  assert.equal(early.rec.emails[0].to, SU);
  assert.match(early.rec.emails[0].body, /Ketua Program Ujian .*tiada emel yang sah.*sebelum Sabtu, 5 Disember 2026/);
  early.setNow(at("2026-12-01T07:10:00"));
  early.ctx.dailyRun();
  assert.equal(early.rec.emails.length, 1, "not repeated the next day");
  const tooEarly = createGas({ rows, now: at("2026-11-29T07:10:00") });
  tooEarly.ctx.dailyRun();
  assert.equal(tooEarly.rec.emails.length, 0);
});

test("swap after the invite went out: old event deleted, new person invited (Sheet edited directly)", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00") });
  gas.ctx.dailyRun();
  const oldId = gas.rec.events[0].id;
  // SU edits Nama/Emel/No WhatsApp in the Sheet; the script's own stamps stay in their columns
  const d = gas.sheet._data;
  d[1][col(gas, "Nama")] = "Pensyarah Ujian 9";
  d[1][col(gas, "Emel")] = "ujian9@example.com";
  d[1][col(gas, "No WhatsApp")] = "60120000009";
  assert.ok(cellOf(gas, 2, "Kalendar dihantar"), "stale stamp present");
  gas.setNow(at("2026-12-06T07:10:00"));
  gas.ctx.dailyRun();
  assert.deepEqual(gas.rec.deleted, [oldId]);
  assert.equal(gas.store["cal|lmo-2026-12-07|ujian1@example.com"], undefined);
  const live = gas.liveEvents();
  assert.equal(live.length, 1);
  assert.equal(live[0].options.guests, "ujian9@example.com");
  assert.equal(live[0].options.sendInvites, true);
  assert.equal(live[0].title, "Last Man Out (MQS): Pensyarah Ujian 9");
  const mails = officerMails(gas.rec);
  assert.equal(mails.length, 2);
  assert.equal(mails[1].to, "ujian9@example.com");
  assert.equal(mails[1].body, expectBody("Pensyarah Ujian 9", WEEK1, "16:45", "17:15"));
  const dg = digests(gas.rec).pop();
  assert.match(dg.body, /Jemputan kalendar untuk ujian1@example.com .*dibatalkan: giliran ditukar kepada Pensyarah Ujian 9/);
  // Swapping back later re-invites the first person, and never emails them twice
  gas.setRows([HEADER, weekRow()]);
  gas.ctx.dailyRun();
  assert.equal(gas.liveEvents().length, 1);
  assert.equal(gas.liveEvents()[0].options.guests, "ujian1@example.com");
  assert.equal(officerMails(gas.rec).filter((m) => m.to === "ujian1@example.com").length, 1);
});

test("swap via re-import of the planner CSV (stamps blank, extra columns gone)", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00") });
  gas.ctx.dailyRun();
  gas.setRows([HEADER, weekRow({ name: "Pensyarah Ujian 2", email: "ujian2@example.com", phone: "60120000002" })]);
  gas.setNow(at("2026-12-06T07:10:00"));
  gas.ctx.dailyRun();
  assert.equal(gas.rec.deleted.length, 1);
  assert.equal(gas.liveEvents().length, 1);
  assert.equal(gas.liveEvents()[0].options.guests, "ujian2@example.com");
  assert.equal(officerMails(gas.rec).pop().to, "ujian2@example.com");
  // Re-importing the same CSV again resends nothing
  gas.setRows([HEADER, weekRow({ name: "Pensyarah Ujian 2", email: "ujian2@example.com", phone: "60120000002" })]);
  const n = gas.rec.emails.length;
  gas.ctx.dailyRun();
  assert.equal(gas.rec.emails.length, n);
});

test("Cuti = Ya: skipped on D−2 and on the duty day; an invite already sent is cancelled", () => {
  const rows = [HEADER, weekRow({ off: "Ya" })];
  const d2 = createGas({ rows, now: at("2026-12-05T07:10:00") });
  d2.ctx.dailyRun();
  assert.equal(d2.rec.emails.length, 0);
  assert.equal(d2.rec.events.length, 0);
  const dd = createGas({ rows, now: at("2026-12-07T07:10:00") });
  dd.ctx.dailyRun();
  assert.equal(dd.rec.emails.length, 0);

  const later = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00") });
  later.ctx.dailyRun();
  later.setRows([HEADER, weekRow({ off: "Ya" })]);
  later.setNow(at("2026-12-06T07:10:00"));
  later.ctx.dailyRun();
  assert.equal(later.rec.deleted.length, 1);
  assert.equal(officerMails(later.rec).length, 1, "no new officer email");
  assert.match(digests(later.rec).pop().body, /dibatalkan: cuti umum \/ tiada tugas/);
});

test("low email quota: officer emails stop, the SU is told, retried the next day", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00"), quota: 4 });
  gas.ctx.dailyRun();
  assert.equal(officerMails(gas.rec).length, 0);
  assert.equal(gas.store["email|lmo-2026-12-07|ujian1@example.com"], undefined);
  assert.equal(gas.rec.events.length, 1, "calendar invitations do not use the email quota");
  const dg = digests(gas.rec);
  assert.equal(dg.length, 1);
  assert.match(dg[0].body, /Kuota emel harian akaun ini hampir habis \(baki 4\)/);
  gas.setQuota(100);
  gas.setNow(at("2026-12-06T07:10:00"));
  gas.ctx.dailyRun();
  assert.equal(officerMails(gas.rec).length, 1);
  assert.equal(gas.rec.events.length, 1, "invite not duplicated");

  const empty = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00"), quota: 0 });
  assert.doesNotThrow(() => empty.ctx.dailyRun());
  assert.equal(empty.rec.emails.length, 0);
});

test("DRY_RUN sends nothing and writes nothing", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00") });
  gas.ctx.CFG.DRY_RUN = true;
  const r = gas.ctx.dailyRun();
  assert.equal(r.dry, true);
  assert.equal(gas.rec.emails.length, 0);
  assert.equal(gas.rec.events.length, 0);
  assert.equal(gas.rec.writes.length, 0);
  assert.equal(gas.rec.propWrites.length, 0);
  assert.match(gas.rec.logs.join("\n"), /Emel kepada Pensyarah Ujian 1 \(ujian1@example.com\)/);
});

test("duty day: the SU's digest has a correctly encoded wa.me link, sent once", () => {
  const props = { "email|lmo-2026-12-07|ujian1@example.com": "2026-12-05 07:10", "cal|lmo-2026-12-07|ujian1@example.com": "evt0@google.com" };
  const gas = createGas({ rows: [HEADER, weekRow({ phone: "012-000 0001" })], now: at("2026-12-07T07:10:00"), props });
  gas.ctx.dailyRun();
  assert.equal(officerMails(gas.rec).length, 0);
  const dg = digests(gas.rec);
  assert.equal(dg.length, 1);
  assert.equal(dg[0].subject, "Last Man Out 7/12/2026: hantar WhatsApp kepada Pensyarah Ujian 1");
  const m = /https:\/\/wa\.me\/(\d+)\?text=(\S+)/.exec(dg[0].body);
  assert.ok(m, "wa.me link in the plain-text body");
  assert.equal(m[1], "60120000001");
  assert.doesNotMatch(m[2], /[\s\n]/);
  assert.equal(decodeURIComponent(m[2]), expectWa("Pensyarah Ujian 1", "minggu ini", WEEK1, "16:45"));
  assert.equal(m[2], encodeURIComponent(expectWa("Pensyarah Ujian 1", "minggu ini", WEEK1, "16:45")));
  assert.ok(dg[0].htmlBody.includes('href="https://wa.me/60120000001?text=' + m[2] + '"'), "same link as a button in the HTML body");
  assert.equal(gas.store["digest|lmo-2026-12-07"], "Pensyarah Ujian 1");
  gas.setNow(at("2026-12-08T07:10:00"));
  gas.ctx.dailyRun();
  assert.equal(digests(gas.rec).length, 1, "not repeated on Tuesday");

  // No phone: the message is given to copy instead of a link
  const nophone = createGas({ rows: [HEADER, weekRow({ phone: "" })], now: at("2026-12-07T07:10:00"), props });
  nophone.ctx.dailyRun();
  const body = digests(nophone.rec)[0].body;
  assert.doesNotMatch(body, /wa\.me/);
  assert.match(body, /Tiada No\. WhatsApp yang sah/);
  assert.ok(body.includes(expectWa("Pensyarah Ujian 1", "minggu ini", WEEK1, "16:45")));
});

test("stamps from the planner (sent by hand) count as sent", () => {
  const gas = createGas({ rows: [HEADER, weekRow({ mailStamp: "2026-12-04 10:00", calStamp: "2026-12-04 10:00", waStamp: "2026-12-07 08:00" })],
    now: at("2026-12-05T07:10:00") });
  gas.ctx.dailyRun();
  assert.equal(gas.rec.emails.length, 0);
  assert.equal(gas.rec.events.length, 0);
  gas.setNow(at("2026-12-07T09:00:00"));
  gas.ctx.dailyRun();
  assert.equal(gas.rec.emails.length, 0, "WhatsApp already marked sent in the planner");
});

test("a failing calendar call is caught: email still sent, error noted, retried next day", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00"), calendarFails: true });
  assert.doesNotThrow(() => gas.ctx.dailyRun());
  assert.equal(officerMails(gas.rec).length, 1);
  assert.equal(gas.store["cal|lmo-2026-12-07|ujian1@example.com"], undefined);
  assert.match(cellOf(gas, 2, "Catatan skrip"), /Ralat \(jemputan Google Calendar\): Calendar service error/);
  assert.match(digests(gas.rec)[0].body, /Ralat semasa jemputan Google Calendar untuk Pensyarah Ujian 1/);
});

test("the sample rota CSV (Contract 2) imports and plans correctly", () => {
  const rows = parseCsv(fs.readFileSync(FIXTURE, "utf8"));
  assert.deepEqual(rows[0], HEADER, "fixture header is exactly Contract 2");
  const g = loadPure();
  const cols = g.findHeader_(rows).cols;
  assert.equal(Object.keys(cols).length, 18, "all 18 Contract 2 columns recognised");
  // Saturday 12 Dec: D−2 for lmo-2026-12-14; lmo-2026-12-07 is over (no action)
  const gas = createGas({ rows, now: at("2026-12-12T07:10:00") });
  gas.ctx.dailyRun();
  assert.deepEqual(officerMails(gas.rec).map((m) => m.to), ["ujian2@example.com"]);
  assert.equal(gas.rec.events.length, 1);
  // Saturday 19 Dec: D−2 for the row with no email -> problem only
  gas.setNow(at("2026-12-19T07:10:00"));
  gas.ctx.dailyRun();
  assert.equal(officerMails(gas.rec).length, 1);
  assert.match(digests(gas.rec).pop().body, /Ketua Program Ujian .*tiada emel yang sah/);
  // Holiday week: nothing at all
  const before = gas.rec.emails.length;
  gas.setNow(at("2026-12-28T07:10:00"));
  gas.ctx.dailyRun();
  assert.equal(gas.rec.emails.length, before);
  // Sat 2 Jan 2027: D−2 for lmo-2027-01-04 (no phone) and on Mon the SU gets the message to copy
  gas.setNow(at("2027-01-02T07:10:00"));
  gas.ctx.dailyRun();
  assert.equal(officerMails(gas.rec).pop().to, "ujian3@example.com");
  // The fixture has a Setiausaha row (su.ujian@example.com), so the WhatsApp email goes to her, not to the installer
  const toInstaller = digests(gas.rec).length;
  gas.setNow(at("2027-01-04T07:10:00"));
  gas.ctx.dailyRun();
  const wa = gas.rec.emails.filter((m) => m.to === "su.ujian@example.com");
  assert.equal(wa.length, 1);
  assert.match(wa[0].body, /Tiada No\. WhatsApp yang sah/);
  assert.equal(digests(gas.rec).length, toInstaller, "nothing to report to the installer that day");
});

test("install() twice leaves exactly 2 triggers (daily 7am + deadlineCheck every 10 min); uninstall() removes both", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], triggers: [{ fn: "somethingElse" }] });
  gas.ctx.install();
  gas.ctx.install();
  const mine = gas.triggers.filter((t) => t.getHandlerFunction() !== "somethingElse");
  assert.equal(mine.length, 2);
  const daily = mine.find((t) => t.getHandlerFunction() === "dailyRun");
  const check = mine.find((t) => t.getHandlerFunction() === "deadlineCheck");
  assert.deepEqual(daily._cfg, { fn: "dailyRun", timeBased: true, everyDays: 1, atHour: 7, tz: "Asia/Kuala_Lumpur" });
  assert.deepEqual(check._cfg, { fn: "deadlineCheck", timeBased: true, everyMinutes: 10 });
  assert.match(gas.rec.alerts.pop().message, /1 giliran dijumpai/);
  gas.ctx.uninstall();
  assert.equal(gas.triggers.filter((t) => t.getHandlerFunction() !== "somethingElse").length, 0);
  assert.equal(gas.triggers.length, 1, "other triggers untouched");
});

test("onOpen adds the Last Man Out menu", () => {
  const gas = createGas({ rows: [HEADER] });
  gas.ctx.onOpen();
  assert.equal(gas.rec.menus.length, 1);
  assert.equal(gas.rec.menus[0].title, "Last Man Out");
  assert.deepEqual(gas.rec.menus[0].items.filter((i) => !i.separator).map((i) => i.label + " -> " + i.fn), [
    "Pasang (sekali sahaja) -> install",
    "Uji tanpa hantar -> testRun",
    "Hantar emel ujian kepada saya -> sendTestToMe",
    "Jalankan sekarang -> runNow",
    "Pautan Selesai (web app) -> showWebAppUrl",
    "Emel Ketua Jabatan -> setKjEmail",
    "Emel Setiausaha (WhatsApp) -> setSuEmail",
    "Henti automatik -> uninstall"
  ]);
  for (const i of gas.rec.menus[0].items) if (i.fn) assert.equal(typeof gas.ctx[i.fn], "function", i.fn + " exists");
});

test("Uji tanpa hantar: asks for a date, lists what would happen, sends nothing", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-11-23T10:00:00"), promptText: "5/12/2026" });
  gas.ctx.testRun();
  assert.equal(gas.rec.prompts.length, 1);
  assert.equal(gas.rec.emails.length, 0);
  assert.equal(gas.rec.events.length, 0);
  assert.equal(gas.rec.writes.length + gas.rec.propWrites.length, 0);
  const a = gas.rec.alerts.pop();
  assert.equal(a.title, "Uji tanpa hantar: Sabtu, 5 Disember 2026");
  assert.match(a.message, /Emel kepada Pensyarah Ujian 1 \(ujian1@example.com\)/);
  assert.match(a.message, /Jemputan Google Calendar kepada Pensyarah Ujian 1 \(ujian1@example.com\): 5 hari bekerja, 16:45–17:15/);
  assert.match(a.message, /tiada apa-apa dihantar/);

  const none = createGas({ rows: [HEADER, weekRow()], now: at("2026-11-23T10:00:00"), promptText: "" });
  none.ctx.testRun();
  assert.match(none.rec.alerts.pop().message, /Tiada notis perlu dihantar[\s\S]*Cuba tarikh 5\/12\/2026/);
});

test("Hantar emel ujian kepada saya: only the SU receives anything", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-11-23T10:00:00") });
  gas.ctx.sendTestToMe();
  assert.equal(gas.rec.emails.length, 2);
  assert.ok(gas.rec.emails.every((m) => m.to === SU));
  assert.equal(gas.rec.emails[0].subject, "[UJIAN] " + expectSubject(WEEK1));
  assert.ok(gas.rec.emails[0].body.endsWith(expectBody("Pensyarah Ujian 1", WEEK1, "16:45", "17:15")));
  assert.match(gas.rec.emails[1].body, /https:\/\/wa\.me\/60120000001\?text=/);
  assert.equal(gas.rec.events.length, 1);
  assert.equal(gas.rec.events[0].options.guests, undefined);
  assert.equal(gas.rec.events[0].options.sendInvites, undefined);
  assert.match(gas.rec.events[0].title, /^\[UJIAN\] /);
  assert.equal(gas.rec.propWrites.length, 0, "test does not count as sent");
  assert.equal(gas.rec.writes.length, 0);
});

test("missing Giliran tab: the SU is emailed once a day, nothing else happens", () => {
  const gas = createGas({ rows: [["Nota"], ["bukan giliran"]], sheetName: "Helaian1", now: at("2026-12-05T07:10:00") });
  gas.ctx.dailyRun();
  gas.ctx.dailyRun();
  assert.equal(gas.rec.emails.length, 1);
  assert.equal(gas.rec.emails[0].to, SU);
  assert.match(gas.rec.emails[0].body, /Tab "Giliran" tidak dijumpai/);
});

test("a tab with another name but the rota header is found", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], sheetName: "giliran-lmo-2026-12-01", now: at("2026-12-05T07:10:00") });
  gas.ctx.dailyRun();
  assert.equal(officerMails(gas.rec).length, 1);
});

test("a second run while one is running does nothing", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00"), lockBusy: true });
  const r = gas.ctx.dailyRun();
  assert.equal(r.busy, true);
  assert.equal(gas.rec.emails.length, 0);
});

/* =================== Selesai confirmation + Ketua Jabatan escalation (addendum) =================== */

const ID1 = "lmo-2026-12-07";
const TICKS = [true, true, true, true, true];
const CONF_HEAD = ["Tarikh", "ID", "Nama PIC", "Masa disahkan", "Status", "Senarai semak", "Peringatan PIC", "Amaran KJ", "Susulan KJ"];
const CHECKED = "5/5: lampu, penyaman udara, suis/palam, pintu & tingkap, borang & masa keluar";
const INVALID = "Pautan ini tidak sah atau telah dibatalkan (giliran mungkin telah ditukar). Sila hubungi Setiausaha Jabatan.";
/** The Pengesahan tab as rows padded to its 9 columns (null when the tab does not exist). */
const confRows = (gas) => { const d = gas.sheetData("Pengesahan"); return d && d.map((r) => { const c = r.slice(); while (c.length < 9) c.push(""); return c; }); };
const plain = (x) => JSON.parse(JSON.stringify(x));
/** A Selesai-ready Sheet: weekly turn Mon 7 – Fri 11 Dec 2026, with code and KJ email. */
function selesaiGas(o, extra) {
  return createGas(Object.assign({ rows: [HEADER, weekRow(Object.assign({ code: CODE1, kj: KJ }, o || {}))], props: { WEBAPP_URL: WEBAPP } }, extra || {}));
}
const nothingWritten = (rec) => rec.emails.length + rec.writes.length + rec.propWrites.length + rec.propDeletes.length + rec.inserted.length + rec.events.length;

test("Selesai pure: default times 18:00 / 18:15 / 18:30 and Had pengesahan rules", () => {
  const g = loadPure();
  assert.equal(g.CFG.TIME_FROM, "18:00");
  assert.equal(g.CFG.TIME_TO, "18:15");
  assert.equal(g.CFG.DEADLINE, "18:30");
  const parse = (o) => g.parseRows_([HEADER, weekRow(o)], g.CFG).items[0];
  const blank = parse({ from: "", to: "" });
  assert.deepEqual([blank.timeFrom, blank.timeTo, blank.deadline, blank.badDeadline], ["18:00", "18:15", "18:30", false]);
  assert.equal(parse({ from: "", to: "", had: "18:45" }).deadline, "18:45");
  assert.equal(parse({ from: "", to: "", had: "18:15" }).deadline, "18:15", "equal to Masa tamat is allowed");
  const early = parse({ from: "", to: "", had: "18:10" });
  assert.deepEqual([early.deadline, early.badDeadline], ["18:30", true], "before Masa tamat -> default");
  const tooEarly = parse({ from: "16:30", to: "17:00", had: "17:05" });
  assert.deepEqual([tooEarly.deadline, tooEarly.badDeadline], ["18:30", true], "before 17:15 -> default");
  assert.equal(parse({ from: "18:30", to: "19:00" }).deadline, "19:00", "default never before Masa tamat");
  const nd = parse({ noDuty: "2026-12-09;2026-12-10" });
  assert.deepEqual([...nd.noDuty], ["2026-12-09", "2026-12-10"]);
  assert.deepEqual([...nd.dutyDays], ["2026-12-07", "2026-12-08", "2026-12-11"]);
  assert.equal(nd.days.length, 5, "calendar still covers the whole turn");
  assert.equal(parse({ code: "short" }).code, "", "invalid code ignored");
  assert.equal(parse({ code: CODE1, kj: KJ }).kjEmail, KJ);
});

test("Selesai pure: URL regex, code regex and link format follow the contract", () => {
  const g = loadPure();
  for (const u of [WEBAPP, "https://script.google.com/a/macros/kptm.edu.my/s/AKfycb_x-Y/exec"]) assert.equal(g.validWebUrl_(u), true, u);
  for (const u of ["", "http://script.google.com/macros/s/AKfy/exec", "https://script.google.com/macros/s/AKfy/dev",
    "https://script.google.com/macros/s/AKfy/exec?x=1", "https://evil.example.com/macros/s/AKfy/exec", "https://script.google.com/a/macros/KPTM/s/x/exec"]) {
    assert.equal(g.validWebUrl_(u), false, u);
  }
  assert.equal(g.validCode_("abcdefghij012345"), true);
  assert.equal(g.validCode_("a".repeat(64)), true);
  assert.equal(g.validCode_("a".repeat(15)), false);
  assert.equal(g.validCode_("a".repeat(65)), false);
  assert.equal(g.validCode_("abcdefghij01234+"), false);
  assert.equal(g.linkFor_(WEBAPP, { id: ID1, code: CODE1 }), WEBAPP + "?t=" + ID1 + "&k=" + CODE1);
});

test("Selesai pure: email, calendar and WhatsApp carry the exact link paragraph (or the SELESAI line, or nothing if CONFIRM is off)", () => {
  const g = loadPure();
  const props = { WEBAPP_URL: WEBAPP };
  const url = link(ID1, CODE1), withLink = paraLink("18:45", url);
  const d2 = g.planActions_([HEADER, weekRow({ code: CODE1, had: "18:45" })], "2026-12-05", props, g.CFG);
  assert.equal(d2.actions[0].body, expectBody("Pensyarah Ujian 1", WEEK1, "16:45", "17:15", withLink));
  assert.equal(d2.actions[1].description, calDetails(withLink));
  const day = g.planActions_([HEADER, weekRow({ code: CODE1, had: "18:45" })], "2026-12-07", Object.assign({
    "email|lmo-2026-12-07|ujian1@example.com": "x", "cal|lmo-2026-12-07|ujian1@example.com": "e" }, props), g.CFG);
  assert.equal(day.actions[0].text, expectWa("Pensyarah Ujian 1", "minggu ini", WEEK1, "16:45", withLink));
  // No web app: the SELESAI line with the row's deadline
  const none = g.planActions_([HEADER, weekRow({ code: CODE1, had: "18:45" })], "2026-12-05", {}, g.CFG);
  assert.equal(none.actions[0].body, expectBody("Pensyarah Ujian 1", WEEK1, "16:45", "17:15", paraNoLink("18:45")));
  // CONFIRM false: no promise that the KJ will be told
  g.CFG.CONFIRM = false;
  const off = g.planActions_([HEADER, weekRow({ code: CODE1 })], "2026-12-05", props, g.CFG);
  assert.doesNotMatch(off.actions[0].body, /Selesai|SELESAI|Ketua Jabatan/);
  assert.match(off.actions[0].body, /catat masa keluar\n\nJemputan Google Calendar turut dihantar/);
});

test("Selesai pure: confirmState_ gives the five states (weekend inside a turn and no-duty days are notToday)", () => {
  const g = loadPure();
  const r = g.parseRows_([HEADER, weekRow({ code: CODE1, noDuty: "2026-12-09" })], g.CFG).items[0];
  const st = (day, hhmm, props) => g.confirmState_(r, day, hhmm, props || {}, g.CFG);
  assert.equal(st("2026-12-08", "12:00").state, "open");
  assert.equal(st("2026-12-08", "23:59").state, "open");
  const early = st("2026-12-08", "11:59");
  assert.deepEqual([early.state, early.text], ["early", "Butang Selesai boleh ditekan mulai 12:00 pada hari bertugas."]);
  const done = st("2026-12-08", "19:00", { "conf|lmo-2026-12-07|2026-12-08": "18:20|Tepat masa" });
  assert.deepEqual([done.state, done.time, done.status, done.text], ["done", "18:20", "Tepat masa", "✓ Sudah disahkan pada 18:20 (Tepat masa). Terima kasih."]);
  const nd = st("2026-12-09", "18:00");
  assert.deepEqual([nd.state, nd.text], ["notToday", "Tiada tugas Last Man Out untuk Pensyarah Ujian 1 hari ini. Giliran anda: " + WEEK1 + "."]);
  assert.equal(st("2026-12-04", "18:00").state, "notToday", "before the turn");
  assert.equal(st("2026-12-14", "18:00").state, "notToday", "after the turn");
  // A turn that spans a weekend (Thu 10 - Tue 15 Dec): Saturday and Sunday are not duty days
  const span = g.parseRows_([HEADER, row({ start: "2026-12-10", end: "2026-12-15", code: CODE1 })], g.CFG).items[0];
  assert.equal(g.confirmState_(span, "2026-12-12", "18:00", {}, g.CFG).state, "notToday");
  assert.equal(g.confirmState_(span, "2026-12-13", "18:00", {}, g.CFG).state, "notToday");
  assert.equal(g.confirmState_(span, "2026-12-14", "18:00", {}, g.CFG).state, "open");
  // invalid: no row, holiday, no name, no code; never shows a name
  const parse = (o) => g.parseRows_([HEADER, weekRow(o)], g.CFG).items[0];
  for (const x of [null, parse({ code: CODE1, off: "Ya" }), parse({ code: CODE1, name: "" }), parse({})]) {
    const s = g.confirmState_(x, "2026-12-08", "18:00", {}, g.CFG);
    assert.deepEqual([s.state, s.text], ["invalid", INVALID]);
  }
  // the link must match ID and code
  const items = g.parseRows_([HEADER, weekRow({ code: CODE1 })], g.CFG).items;
  assert.equal(g.findConfirmRow_(items, ID1, CODE1).id, ID1);
  assert.equal(g.findConfirmRow_(items, ID1, "Kod_Lain-0000000002"), null);
  assert.equal(g.findConfirmRow_(items, "lmo-2026-12-14", CODE1), null);
  assert.equal(g.findConfirmRow_(items, ID1, ""), null);
});

test("doGet: any parameters write nothing, send nothing, take no lock; names are HTML-escaped; page is accessible", () => {
  const gas = selesaiGas({ name: "Pensyarah <b>Ujian</b> & 'Satu'" }, { now: at("2026-12-08T18:20:00") });
  const calls = [
    { parameter: { t: ID1, k: CODE1 } }, { parameter: {} }, undefined, { parameter: { t: ID1, k: "Kod_Lain-0000000002" } },
    { parameter: { t: "<script>alert(1)</script>", k: "<img src=x onerror=alert(1)>" } }, { parameter: { t: ID1, k: CODE1, ticks: "11111" } }
  ];
  const pages = calls.map((e) => gas.ctx.doGet(e).getContent());
  assert.equal(nothingWritten(gas.rec), 0);
  assert.equal(gas.rec.lockCalls, 0, "no lock");
  assert.equal(gas.rec.html.length, calls.length);
  for (const h of gas.rec.html) {
    assert.deepEqual(h.meta, [["viewport", "width=device-width, initial-scale=1"]]);
    assert.equal(h.title, "Last Man Out: Pengesahan Selesai");
  }
  const open = pages[0];
  assert.match(open, /<html lang="ms">/);
  assert.ok(open.includes("<h1>Last Man Out (MQS) – Pengesahan Selesai</h1>"));
  assert.ok(open.includes("Jabatan Pengurusan Perniagaan &amp; Perakaunan, KPTM Kuantan"));
  assert.ok(open.includes("Pegawai: <strong>Pensyarah &lt;b&gt;Ujian&lt;/b&gt; &amp; &#39;Satu&#39;</strong>"));
  assert.ok(!open.includes("<b>Ujian</b>"));
  assert.ok(open.includes("Tarikh: Selasa, 8 Disember 2026"));
  const boxes = open.match(/<label class="item" for="c\d"><input type="checkbox" id="c\d">/g) || [];
  assert.equal(boxes.length, 5, "five labelled checkboxes");
  for (const item of ["Semua lampu ditutup", "Penyaman udara &amp; kipas dimatikan", "Suis utama dimatikan / palam dicabut", "Pintu utama &amp; tingkap dikunci", "Tandatangan borang &amp; catat masa keluar"]) {
    assert.ok(open.includes("<span>" + item + "</span>"), item);
  }
  assert.match(open, /<button type="submit" id="b" disabled aria-describedby="h1 h2">Selesai \/ Done<\/button>/);
  assert.match(open, /button\{[^}]*min-height:52px/);
  assert.match(open, /\.item\{[^}]*min-height:48px/);
  assert.ok(open.includes("Had pengesahan 18:30. Selepas had, pengesahan direkod sebagai Lewat."));
  assert.match(open, /role="status" aria-live="polite"/);
  assert.ok(open.includes('.confirmLmo("' + ID1 + '","' + CODE1 + '",t)'), "the page confirms only through google.script.run");
  // invalid links: fixed message, no name, no form, nothing reflected
  for (const p of [pages[1], pages[2], pages[3], pages[4]]) {
    assert.ok(p.includes(INVALID));
    assert.ok(!p.includes("Pensyarah"));
    assert.ok(!p.includes("<form"));
    assert.ok(!p.includes("<script>alert") && !p.includes("onerror"));
  }
  // opening the link again still shows the form: GET never confirms
  assert.ok(pages[5].includes("<form"));
  assert.equal(gas.store["conf|lmo-2026-12-07|2026-12-08"], undefined);
});

test("confirmLmo: fewer than 5 ticks rejected; 18:20 is Tepat masa; pressing again changes nothing", () => {
  const gas = selesaiGas({}, { now: at("2026-12-08T18:20:00") });
  const no = gas.ctx.confirmLmo(ID1, CODE1, [true, true, true, true, false]);
  assert.equal(no.ok, false);
  assert.match(no.text, /kelima-lima/);
  assert.equal(gas.ctx.confirmLmo(ID1, CODE1, "11111").ok, false, "ticks must be booleans");
  assert.equal(confRows(gas), null, "nothing recorded yet");
  assert.equal(gas.ctx.confirmLmo(ID1, "Kod_Lain-0000000002", TICKS).text, INVALID);

  const ok = plain(gas.ctx.confirmLmo(ID1, CODE1, TICKS));
  assert.deepEqual(ok, { ok: true, status: "Tepat masa", time: "18:20", name: "Pensyarah Ujian 1",
    text: "✓ Terima kasih, Pensyarah Ujian 1. Disahkan 18:20 (Tepat masa)." });
  assert.equal(gas.store["conf|lmo-2026-12-07|2026-12-08"], "18:20|Tepat masa");
  assert.deepEqual(gas.rec.inserted, ["Pengesahan"]);
  assert.deepEqual(gas.rec.frozen, [{ sheet: "Pengesahan", rows: 1 }]);
  assert.deepEqual(confRows(gas), [CONF_HEAD, ["2026-12-08", ID1, "Pensyarah Ujian 1", "18:20", "Tepat masa", CHECKED, "", "", ""]]);
  assert.ok(gas.rec.writes.filter((w) => w.sheet === "Pengesahan").every((w) => w.format === "@"), "written as text");
  assert.equal(gas.rec.locks, 0, "lock released");

  gas.setNow(at("2026-12-08T18:50:00"));
  const again = gas.ctx.confirmLmo(ID1, CODE1, TICKS);
  assert.deepEqual([again.ok, again.already, again.status, again.time], [true, true, "Tepat masa", "18:20"]);
  assert.equal(confRows(gas).length, 2, "still one row");
  assert.equal(gas.rec.emails.length, 0);
  assert.match(gas.ctx.doGet({ parameter: { t: ID1, k: CODE1 } }).getContent(), /✓ Sudah disahkan pada 18:20 \(Tepat masa\)\. Terima kasih\./);
  // exactly at the deadline is still on time; the next day starts fresh
  const edge = selesaiGas({}, { now: at("2026-12-09T18:30:00") });
  assert.equal(edge.ctx.confirmLmo(ID1, CODE1, TICKS).status, "Tepat masa");
  const morning = selesaiGas({}, { now: at("2026-12-09T11:00:00") });
  assert.equal(morning.ctx.confirmLmo(ID1, CODE1, TICKS).state, "early");
});

test("confirmLmo at 18:45 after the KJ alert: Lewat, one follow-up to the KJ with the SU in cc", () => {
  const gas = selesaiGas({}, { now: at("2026-12-08T18:31:00") });
  gas.ctx.deadlineCheck();
  assert.equal(gas.rec.emails.length, 1);
  gas.setNow(at("2026-12-08T18:45:00"));
  const r = gas.ctx.confirmLmo(ID1, CODE1, TICKS);
  assert.deepEqual([r.ok, r.status, r.time], [true, "Lewat", "18:45"]);
  assert.equal(gas.rec.emails.length, 2);
  const f = gas.rec.emails[1];
  assert.deepEqual([f.to, f.cc], [KJ, SU]);
  assert.equal(f.subject, "Last Man Out 8/12/2026: Pensyarah Ujian 1 telah mengesahkan (lewat)");
  assert.equal(f.body, "Salam Tuan/Puan,\n\nSusulan emel 18:31: Pensyarah Ujian 1 telah menekan Selesai pada 18:45, Selasa, 8 Disember 2026. Status: Lewat.\n\nTerima kasih.");
  assert.deepEqual(confRows(gas), [CONF_HEAD, ["2026-12-08", ID1, "Pensyarah Ujian 1", "18:45", "Lewat", CHECKED, "", "18:31", "18:45"]]);
  gas.ctx.confirmLmo(ID1, CODE1, TICKS);
  gas.setNow(at("2026-12-08T18:55:00"));
  gas.ctx.deadlineCheck();
  assert.equal(gas.rec.emails.length, 2, "no second follow-up, no second alert");
  // the follow-up is sent at most once, even if the confirmation record was lost
  const lost = selesaiGas({}, { now: at("2026-12-08T18:50:00"), props: { WEBAPP_URL: WEBAPP, "kj|lmo-2026-12-07|2026-12-08": "18:31", "kjlate|lmo-2026-12-07|2026-12-08": "18:45" } });
  assert.equal(lost.ctx.confirmLmo(ID1, CODE1, TICKS).status, "Lewat");
  assert.equal(lost.rec.emails.length, 0);
  // late but no alert was sent (e.g. checks failed): Lewat, no follow-up
  const quiet = selesaiGas({}, { now: at("2026-12-08T18:45:00") });
  assert.equal(quiet.ctx.confirmLmo(ID1, CODE1, TICKS).status, "Lewat");
  assert.equal(quiet.rec.emails.length, 0);
});

test("deadlineCheck: 18:14 nothing, 18:15 one reminder, 18:30 one KJ alert (SU cc) and a 'Tidak disahkan' row", () => {
  const gas = selesaiGas({}, { now: at("2026-12-08T18:14:00") });
  gas.ctx.deadlineCheck();
  assert.equal(gas.rec.emails.length, 0);
  gas.setNow(at("2026-12-08T18:15:00"));
  gas.ctx.deadlineCheck();
  gas.setNow(at("2026-12-08T18:25:00"));
  gas.ctx.deadlineCheck();
  assert.equal(gas.rec.emails.length, 1, "one reminder");
  const rem = gas.rec.emails[0];
  assert.equal(rem.to, "ujian1@example.com");
  assert.equal(rem.subject, "Peringatan: tekan Selesai Last Man Out sebelum 18:30");
  assert.equal(rem.body, "Salam Pensyarah Ujian 1,\n\nTuan/puan bertugas sebagai Pegawai Last Man Out hari ini (Selasa, 8 Disember 2026). Pengesahan belum diterima." +
    "\n\nSelepas selesai, tekan pautan ini dan tanda Selesai sebelum 18:30:\n" + link(ID1, CODE1) +
    "\n\nJika tiada pengesahan, Ketua Jabatan akan dimaklumkan secara automatik.\n\nTerima kasih.\n" + MAIL_SIGNOFF);
  gas.setNow(at("2026-12-08T18:30:00"));
  gas.ctx.deadlineCheck();
  gas.setNow(at("2026-12-08T18:40:00"));
  gas.ctx.deadlineCheck();
  assert.equal(gas.rec.emails.length, 2, "one alert");
  const kj = gas.rec.emails[1];
  assert.deepEqual([kj.to, kj.cc], [KJ, SU]);
  assert.equal(kj.subject, "Last Man Out 8/12/2026: Pensyarah Ujian 1 belum mengesahkan tugas");
  assert.equal(kj.body, "Salam Tuan/Puan Ketua Jabatan,\n\nUntuk makluman, Pegawai Last Man Out pada Selasa, 8 Disember 2026, Pensyarah Ujian 1 (Pensyarah / AA101), " +
    "belum menekan Selesai bagi senarai semak Last Man Out (MQS) sehingga 18:30.\n\n" + SENARAI + "\n\nHubungi pegawai: https://wa.me/60120000001" +
    "\n\nJika pegawai mengesahkan selepas ini, emel susulan akan dihantar. Rekod: tab Pengesahan.\n\nEmel automatik, JPPP Smart Planner.");
  assert.deepEqual(confRows(gas), [CONF_HEAD, ["2026-12-08", ID1, "Pensyarah Ujian 1", "", "Tidak disahkan", "", "18:15", "18:30", ""]]);
  assert.equal(gas.rec.locks, 0, "lock released");
  // no phone: no "Hubungi pegawai" line
  const np = selesaiGas({ phone: "" }, { now: at("2026-12-08T18:35:00") });
  np.ctx.deadlineCheck();
  assert.doesNotMatch(np.rec.emails[0].body, /Hubungi pegawai/);
  assert.match(np.rec.emails[0].body, /sehingga 18:30\.\n\n1\. Semua lampu ditutup[\s\S]*masa keluar\n\nJika pegawai mengesahkan/);
});

test("deadlineCheck: REMIND_BEFORE 0 means no reminder; the PIC without email gets none but the KJ is still told", () => {
  const gas = selesaiGas({}, { now: at("2026-12-08T18:20:00") });
  gas.ctx.CFG.REMIND_BEFORE = 0;
  gas.ctx.deadlineCheck();
  assert.equal(gas.rec.emails.length, 0);
  gas.setNow(at("2026-12-08T18:30:00"));
  gas.ctx.deadlineCheck();
  assert.equal(gas.rec.emails.length, 1);
  assert.equal(gas.rec.emails[0].to, KJ);
  const noMail = selesaiGas({ email: "" }, { now: at("2026-12-08T18:20:00") });
  noMail.ctx.deadlineCheck();
  assert.equal(noMail.rec.emails.length, 0);
});

test("deadlineCheck: no alert when confirmed, holiday row or no-duty day; no Sheet read at weekends, before 17:00, without URL or with CONFIRM off", () => {
  const confirmed = selesaiGas({}, { now: at("2026-12-08T18:40:00"), props: { WEBAPP_URL: WEBAPP, "conf|lmo-2026-12-07|2026-12-08": "18:20|Tepat masa" } });
  confirmed.ctx.deadlineCheck();
  assert.equal(confirmed.rec.emails.length, 0);
  const holiday = selesaiGas({ off: "Ya" }, { now: at("2026-12-08T18:40:00") });
  holiday.ctx.deadlineCheck();
  assert.equal(holiday.rec.emails.length, 0);
  const nd = selesaiGas({ noDuty: "2026-12-08" }, { now: at("2026-12-08T18:20:00") });
  nd.ctx.deadlineCheck();
  assert.equal(nd.rec.emails.length + nd.rec.inserted.length, 0, "no reminder; row only at the deadline");
  nd.setNow(at("2026-12-08T18:30:00"));
  nd.ctx.deadlineCheck();
  nd.setNow(at("2026-12-08T18:50:00"));
  nd.ctx.deadlineCheck();
  assert.equal(nd.rec.emails.length, 0);
  assert.deepEqual(confRows(nd).slice(1).map((r) => r.slice(0, 5)), [["2026-12-08", ID1, "Pensyarah Ujian 1", "", "Tiada tugas"]], "written once");
  for (const [label, gas] of [
    ["Saturday", selesaiGas({}, { now: at("2026-12-12T18:40:00") })],
    ["Sunday", selesaiGas({}, { now: at("2026-12-13T18:40:00") })],
    ["16:59", selesaiGas({}, { now: at("2026-12-08T16:59:00") })],
    ["no WEBAPP_URL", selesaiGas({}, { now: at("2026-12-08T18:40:00"), props: {} })],
    ["bad WEBAPP_URL", selesaiGas({}, { now: at("2026-12-08T18:40:00"), props: { WEBAPP_URL: "https://script.google.com/macros/s/x/dev" } })]
  ]) {
    gas.ctx.deadlineCheck();
    assert.equal(gas.rec.reads, 0, label + ": Sheet not read");
    assert.equal(nothingWritten(gas.rec), 0, label);
    assert.equal(gas.rec.lockCalls, 0, label);
  }
  const off = selesaiGas({}, { now: at("2026-12-08T18:40:00") });
  off.ctx.CFG.CONFIRM = false;
  off.ctx.deadlineCheck();
  assert.equal(off.rec.reads + off.rec.emails.length, 0);
});

test("KJ email order: KJ_EMAIL property, then the most common Emel KJ in the Sheet, then the SU alone with a reason", () => {
  const g = loadPure();
  const items = (kjs) => kjs.map((k) => ({ kjEmail: k }));
  assert.equal(g.kjEmail_(items(["a@example.com", "b@example.com", "B@example.com"]), {}).email, "b@example.com");
  assert.equal(g.kjEmail_(items(["a@example.com", "b@example.com"]), {}).email, "a@example.com", "tie: first");
  assert.deepEqual(plain(g.kjEmail_(items(["a@example.com"]), { KJ_EMAIL: " pemangku@example.com " })), { email: "pemangku@example.com", source: "property" });
  assert.deepEqual(plain(g.kjEmail_(items(["a@example.com"]), { KJ_EMAIL: "bukan emel" })), { email: "a@example.com", source: "sheet" });
  assert.deepEqual(plain(g.kjEmail_(items(["", ""]), {})), { email: "", source: "" });

  const override = selesaiGas({}, { now: at("2026-12-08T18:31:00"), props: { WEBAPP_URL: WEBAPP, KJ_EMAIL: "pemangku@example.com" } });
  override.ctx.deadlineCheck();
  assert.deepEqual([override.rec.emails[0].to, override.rec.emails[0].cc], ["pemangku@example.com", SU]);

  const nokj = selesaiGas({ kj: "" }, { now: at("2026-12-08T18:31:00") });
  nokj.ctx.deadlineCheck();
  const m = nokj.rec.emails[0];
  assert.equal(m.to, SU);
  assert.equal(m.cc, undefined);
  assert.match(m.body, /^UNTUK SU: emel ini dihantar kepada anda, bukan kepada Ketua Jabatan, kerana emel Ketua Jabatan belum ada\./);
  assert.match(m.body, /Salam Tuan\/Puan Ketua Jabatan/);
});

test("a missing code is written before the D−2 email; email, calendar and digest carry the link; a changed code kills the old link", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], now: at("2026-12-05T07:10:00"), props: { WEBAPP_URL: WEBAPP } });
  gas.ctx.dailyRun();
  const code = cellOf(gas, 2, "Kod pengesahan");
  assert.match(code, /^[0-9a-f]{32}$/, "Utilities.getUuid() without dashes");
  const firstWrite = gas.rec.writes.findIndex((w) => w.value === code);
  assert.ok(firstWrite >= 0);
  const url = link(ID1, code);
  const mail = officerMails(gas.rec)[0];
  assert.equal(mail.body, expectBody("Pensyarah Ujian 1", WEEK1, "16:45", "17:15", paraLink("18:30", url)));
  assert.equal(gas.rec.events[0].options.description, calDetails(paraLink("18:30", url)));
  gas.setNow(at("2026-12-07T07:10:00"));
  gas.ctx.dailyRun();
  assert.equal(cellOf(gas, 2, "Kod pengesahan"), code, "code kept");
  const dg = digests(gas.rec).pop();
  const m = /https:\/\/wa\.me\/(\d+)\?text=(\S+)/.exec(dg.body);
  assert.equal(decodeURIComponent(m[2]), expectWa("Pensyarah Ujian 1", "minggu ini", WEEK1, "16:45", paraLink("18:30", url)));
  // the link works on a duty day ...
  gas.setNow(at("2026-12-08T18:00:00"));
  assert.match(gas.ctx.doGet({ parameter: { t: ID1, k: code } }).getContent(), /<form/);
  // ... until the rota changes and the new CSV carries a new code for this turn
  gas.setRows([HEADER, weekRow({ name: "Pensyarah Ujian 2", email: "ujian2@example.com", code: CODE1 })]);
  assert.ok(gas.ctx.doGet({ parameter: { t: ID1, k: code } }).getContent().includes(INVALID));
  assert.equal(gas.ctx.confirmLmo(ID1, code, TICKS).ok, false);
  assert.equal(gas.ctx.confirmLmo(ID1, CODE1, TICKS).name, "Pensyarah Ujian 2");

  // old 14-column CSV: the "Kod pengesahan" column is added
  const old = createGas({ rows: [HEADER14, weekRow().slice(0, 14)], now: at("2026-12-05T07:10:00"), props: { WEBAPP_URL: WEBAPP } });
  old.ctx.dailyRun();
  assert.equal(old.sheet._data[0][14], "Kod pengesahan");
  assert.match(old.sheet._data[1][14], /^[0-9a-f]{32}$/);
  assert.ok(officerMails(old.rec)[0].body.includes(link(ID1, old.sheet._data[1][14])));
});

test("old 14-column CSV without the web app still works, with the SELESAI line and the 18:30 default", () => {
  const gas = createGas({ rows: [HEADER14, weekRow({ from: "", to: "" }).slice(0, 14)], now: at("2026-12-05T07:10:00") });
  gas.ctx.dailyRun();
  const mail = officerMails(gas.rec)[0];
  assert.equal(mail.body, expectBody("Pensyarah Ujian 1", WEEK1, "18:00", "18:15", NO_LINK));
  assert.equal(gas.rec.events[0].start.toISOString(), "2026-12-07T10:00:00.000Z", "18:00 Malaysia time");
  assert.equal(cellOf(gas, 2, "Kod pengesahan"), "", "no codes written without the web app");
});

test("missed evening: the KJ is alerted once the next morning '(semalam)'; not for Sunday, not when confirmed", () => {
  const gas = selesaiGas({}, { now: at("2026-12-09T07:10:00") });
  gas.ctx.dailyRun();
  const alerts = gas.rec.emails.filter((m) => m.to === KJ);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].subject, "Last Man Out 8/12/2026: Pensyarah Ujian 1 belum mengesahkan tugas (semalam)");
  assert.equal(alerts[0].cc, SU);
  assert.deepEqual(confRows(gas)[1].slice(0, 8), ["2026-12-08", ID1, "Pensyarah Ujian 1", "", "Tidak disahkan", "", "", "07:10 (9/12/2026)"]);
  gas.setNow(at("2026-12-09T09:00:00"));
  gas.ctx.dailyRun();
  assert.equal(gas.rec.emails.filter((m) => m.to === KJ).length, 1, "once");
  // Monday morning: yesterday was Sunday
  const mon = selesaiGas({ start: "2026-12-14", end: "2026-12-18", id: "lmo-2026-12-14" }, { now: at("2026-12-14T07:10:00") });
  mon.ctx.dailyRun();
  assert.equal(mon.rec.emails.filter((m) => m.to === KJ).length, 0);
  const ok = selesaiGas({}, { now: at("2026-12-09T07:10:00"), props: { WEBAPP_URL: WEBAPP, "conf|lmo-2026-12-07|2026-12-08": "18:10|Tepat masa" } });
  ok.ctx.dailyRun();
  assert.equal(ok.rec.emails.filter((m) => m.to === KJ).length, 0);
  // the evening check already alerted: nothing in the morning
  const done = selesaiGas({}, { now: at("2026-12-08T18:40:00") });
  done.ctx.deadlineCheck();
  done.setNow(at("2026-12-09T07:10:00"));
  done.ctx.dailyRun();
  assert.equal(done.rec.emails.filter((m) => m.to === KJ).length, 1);
});

test("turns that began before the web app URL was saved get no KJ alert (WEBAPP_SINCE)", () => {
  const gas = selesaiGas({}, { now: at("2026-12-08T18:40:00"), props: { WEBAPP_URL: WEBAPP, WEBAPP_SINCE: "2026-12-08" } });
  gas.ctx.deadlineCheck();
  assert.equal(gas.rec.emails.length, 0);
  const next = selesaiGas({}, { now: at("2026-12-08T18:40:00"), props: { WEBAPP_URL: WEBAPP, WEBAPP_SINCE: "2026-12-07" } });
  next.ctx.deadlineCheck();
  assert.equal(next.rec.emails.length, 1);
});

test("menu functions do nothing without the Sheets UI (e.g. called through google.script.run from the web page)", () => {
  const gas = selesaiGas({}, { now: at("2026-12-05T07:10:00"), noUi: true, triggers: [{ fn: "dailyRun" }], promptText: "orang@example.com" });
  for (const fn of ["install", "uninstall", "runNow", "testRun", "sendTestToMe", "showWebAppUrl", "setKjEmail", "setSuEmail"]) {
    assert.equal(gas.ctx[fn](), null, fn);
  }
  assert.equal(nothingWritten(gas.rec), 0);
  assert.equal(gas.triggers.length, 1, "triggers untouched");
});

test("menu Pautan Selesai validates and stores the /exec URL and writes missing codes; menu Emel Ketua Jabatan sets, clears, rejects", () => {
  const bad = createGas({ rows: [HEADER, weekRow()], promptText: "https://script.google.com/macros/s/AKfy/dev", now: at("2026-12-01T10:00:00") });
  assert.equal(bad.ctx.showWebAppUrl(), null);
  assert.equal(bad.store.WEBAPP_URL, undefined);
  assert.match(bad.rec.alerts.pop().message, /URL tidak sah/);

  const gas = createGas({ rows: [HEADER, weekRow(), weekRow({ id: "lmo-2026-12-14", start: "2026-12-14", end: "2026-12-18", code: CODE1 }), weekRow({ id: "lmo-2026-12-21", start: "2026-12-21", end: "2026-12-25", off: "Ya" })],
    promptText: WEBAPP, now: at("2026-12-01T10:00:00") });
  assert.equal(gas.ctx.showWebAppUrl(), WEBAPP);
  assert.equal(gas.store.WEBAPP_URL, WEBAPP);
  assert.equal(gas.store.WEBAPP_SINCE, "2026-12-01");
  assert.match(cellOf(gas, 2, "Kod pengesahan"), /^[0-9a-f]{32}$/);
  assert.equal(cellOf(gas, 3, "Kod pengesahan"), CODE1, "existing code kept");
  assert.equal(cellOf(gas, 4, "Kod pengesahan"), "", "no code for a holiday row");
  const msg = gas.rec.alerts.pop().message;
  assert.ok(msg.includes(WEBAPP));
  assert.match(msg, /1 kod pengesahan baharu/);

  const detected = createGas({ rows: [HEADER, weekRow({ code: CODE1 })], promptText: "", serviceUrl: "https://script.google.com/a/macros/kptm.edu.my/s/AKfycbX/exec" });
  assert.equal(detected.ctx.showWebAppUrl(), "https://script.google.com/a/macros/kptm.edu.my/s/AKfycbX/exec");

  const kj = createGas({ rows: [HEADER, weekRow({ kj: KJ })], promptText: "pemangku@example.com" });
  assert.equal(kj.ctx.setKjEmail(), "pemangku@example.com");
  assert.equal(kj.store.KJ_EMAIL, "pemangku@example.com");
  assert.match(kj.rec.prompts[0].message, /kj\.ujian@example\.com \(dari Sheet\)/);
  const clear = createGas({ rows: [HEADER, weekRow({ kj: KJ })], promptText: "padam", props: { KJ_EMAIL: "pemangku@example.com" } });
  clear.ctx.setKjEmail();
  assert.equal(clear.store.KJ_EMAIL, undefined);
  const wrong = createGas({ rows: [HEADER, weekRow({ kj: KJ })], promptText: "bukan emel" });
  assert.equal(wrong.ctx.setKjEmail(), null);
  assert.equal(wrong.rec.propWrites.length, 0);
});

test("Uji tanpa hantar accepts '8/12/2026 18:35' and lists the reminder / KJ alert it would send, sending nothing", () => {
  const late = selesaiGas({}, { now: at("2026-11-30T10:00:00"), promptText: "8/12/2026 18:35" });
  late.ctx.testRun();
  const a = late.rec.alerts.pop();
  assert.equal(a.title, "Uji tanpa hantar: Selasa, 8 Disember 2026 18:35");
  assert.match(a.message, /Semakan butang Selesai pada 18:35:\n- Amaran kepada Ketua Jabatan \(kj\.ujian@example\.com\), salinan kepada su@example\.com: Pensyarah Ujian 1 belum mengesahkan tugas 8\/12\/2026/);
  const soon = selesaiGas({}, { now: at("2026-11-30T10:00:00"), promptText: "8/12/2026 18:20" });
  soon.ctx.testRun();
  assert.match(soon.rec.alerts.pop().message, /- Peringatan Selesai kepada Pensyarah Ujian 1 \(ujian1@example\.com\): "Peringatan: tekan Selesai Last Man Out sebelum 18:30"/);
  const nourl = createGas({ rows: [HEADER, weekRow()], now: at("2026-11-30T10:00:00"), promptText: "8/12/2026 18:35" });
  nourl.ctx.testRun();
  assert.match(nourl.rec.alerts.pop().message, /Butang Selesai belum aktif/);
  for (const gas of [late, soon, nourl]) assert.equal(nothingWritten(gas.rec), 0);
});

test("sample CSV fixture: the 4 new columns are read (Had pengesahan, Kod pengesahan, Emel KJ, Hari tiada tugas)", () => {
  const g = loadPure();
  const items = g.parseRows_(parseCsv(fs.readFileSync(FIXTURE, "utf8")), g.CFG).items;
  assert.deepEqual([items[0].timeFrom, items[0].timeTo, items[0].deadline], ["18:00", "18:15", "18:30"]);
  assert.equal(items[0].code, "Q2u1aZ0b-Ujian_00001aa");
  assert.deepEqual([...items[0].noDuty], ["2026-12-09"]);
  assert.equal(g.kjEmail_(items, {}).email, KJ);
  assert.ok(items.filter((r) => r.name && !r.off).every((r) => g.validCode_(r.code)), "every named turn has a code");
  assert.equal(items[3].code, "", "holiday row has no code");
});

/* =================== Installer (admin) vs Setiausaha (SU) roles (owner decisions, 24 Nov) =================== */

/** The SU's own turn somewhere in the rota (Jawatan Setiausaha): this is where her email comes from. */
const suRow = (o) => row(Object.assign({ id: "lmo-2027-01-11", start: "2027-01-11", end: "2027-01-15", name: "Setiausaha Ujian", email: SU2,
  phone: "60120000005", role: "Setiausaha", prog: "", code: "Kod_Ujian-0000000005", kj: KJ }, o || {}));
const to = (rec, addr) => rec.emails.filter((m) => m.to === addr);

test("roles pure: SU = SU_EMAIL property, else the most common Setiausaha row email, else the installer", () => {
  const g = loadPure();
  const items = (...rs) => g.parseRows_([HEADER].concat(rs), g.CFG).items;
  const sheet = items(weekRow(), suRow(), suRow({ id: "lmo-2027-03-01", start: "2027-03-01", end: "2027-03-05" }),
    suRow({ id: "lmo-2027-05-03", start: "2027-05-03", end: "2027-05-07", email: "lain@example.com" }));
  assert.deepEqual(plain(g.suContact_(sheet, { SU_EMAIL: " su.baru@example.com " }, ADMIN2)), { email: "su.baru@example.com", source: "property" });
  assert.deepEqual(plain(g.suContact_(sheet, { SU_EMAIL: "bukan emel" }, ADMIN2)), { email: SU2, source: "sheet" }, "invalid property ignored; most common row");
  assert.deepEqual(plain(g.suContact_(items(weekRow(), suRow({ role: "Secretary" })), {}, ADMIN2)), { email: SU2, source: "sheet" }, "English role");
  assert.deepEqual(plain(g.suContact_(items(weekRow(), suRow({ email: "" })), {}, ADMIN2)), { email: ADMIN2, source: "admin" }, "Setiausaha row without email");
  assert.deepEqual(plain(g.suContact_(items(weekRow()), {}, ADMIN2)), { email: ADMIN2, source: "admin" });
  assert.deepEqual([...g.ccList_(KJ, [SU2, ADMIN2])], [SU2, ADMIN2]);
  assert.deepEqual([...g.ccList_(KJ, [SU, "SU@example.com"])], [SU], "admin only when different from the SU");
  assert.deepEqual([...g.ccList_(SU2, [SU2, ADMIN2])], [ADMIN2], "never cc the 'to' address");
});

test("roles: duty-day WhatsApp email goes to the SU (WhatsApp part only); the installer gets nothing when all is well", () => {
  const props = { "email|lmo-2026-12-07|ujian1@example.com": "x", "cal|lmo-2026-12-07|ujian1@example.com": "e" };
  const gas = createGas({ rows: [HEADER, weekRow(), suRow()], user: ADMIN2, props, now: at("2026-12-07T07:10:00") });
  gas.ctx.dailyRun();
  assert.equal(to(gas.rec, ADMIN2).length, 0);
  const wa = to(gas.rec, SU2);
  assert.equal(wa.length, 1);
  assert.equal(wa[0].subject, "Last Man Out 7/12/2026: hantar WhatsApp kepada Pensyarah Ujian 1");
  assert.equal(wa[0].name, "JPPP Smart Planner");
  const m = /https:\/\/wa\.me\/(\d+)\?text=(\S+)/.exec(wa[0].body);
  assert.equal(decodeURIComponent(m[2]), expectWa("Pensyarah Ujian 1", "minggu ini", WEEK1, "16:45"));
  assert.ok(decodeURIComponent(m[2]).endsWith("\n\nTerima kasih.\nSetiausaha Jabatan JPPP, KPTM Kuantan"), "WhatsApp keeps the SU's signoff");
  assert.doesNotMatch(wa[0].body, /PERLU TINDAKAN|SUDAH DIHANTAR|Henti automatik/);
  assert.match(wa[0].body, /dipasang oleh pentadbir@example\.com/);
  assert.equal(gas.store["digest|lmo-2026-12-07"], "Pensyarah Ujian 1");
  gas.ctx.dailyRun();
  assert.equal(gas.rec.emails.length, 1, "not repeated");
  // SU_EMAIL property wins over the Setiausaha row
  const prop = createGas({ rows: [HEADER, weekRow(), suRow()], user: ADMIN2, props: Object.assign({ SU_EMAIL: "su.baru@example.com" }, props), now: at("2026-12-07T07:10:00") });
  prop.ctx.dailyRun();
  assert.deepEqual(prop.rec.emails.map((x) => x.to), ["su.baru@example.com"]);
});

test("roles: problems go to the installer in a separate email, once; the SU's email has no problems", () => {
  // Daily turns: A on Mon 7 Dec (WhatsApp today), B on Wed 9 Dec without email (D−2 today)
  const props = { "email|lmo-2026-12-07|ujian1@example.com": "x", "cal|lmo-2026-12-07|ujian1@example.com": "e" };
  const rows = [HEADER, row({ start: "2026-12-07" }), row({ start: "2026-12-09", name: "Pensyarah Ujian 4", email: "" }), suRow()];
  const gas = createGas({ rows, user: ADMIN2, props, now: at("2026-12-07T07:10:00") });
  gas.ctx.dailyRun();
  const su = to(gas.rec, SU2), admin = to(gas.rec, ADMIN2);
  assert.equal(su.length, 1);
  assert.doesNotMatch(su[0].body, /tiada emel yang sah|Pensyarah Ujian 4/);
  assert.equal(admin.length, 1);
  assert.equal(admin[0].subject, "Last Man Out 7/12/2026: perlu semakan");
  assert.match(admin[0].body, /Pensyarah Ujian 4 \(Rabu, 9 Disember 2026\): tiada emel yang sah/);
  assert.match(admin[0].body, /Pautan WhatsApp hari ini untuk Pensyarah Ujian 1 telah diemel kepada Setiausaha Jabatan \(setiausaha\.ujian@example\.com\)\./);
  assert.doesNotMatch(admin[0].body, /wa\.me/);
  gas.setNow(at("2026-12-08T07:10:00"));
  gas.ctx.dailyRun();
  assert.equal(to(gas.rec, ADMIN2).length, 1, "the same problem is not emailed again");
  // Sent notices alone are not reported to a separate installer (no daily nagging)
  const quiet = createGas({ rows: [HEADER, weekRow(), suRow()], user: ADMIN2, now: at("2026-12-05T07:10:00") });
  quiet.ctx.dailyRun();
  assert.deepEqual(quiet.rec.emails.map((x) => x.to), ["ujian1@example.com"]);
  // Low quota is reported to the installer
  const q = createGas({ rows: [HEADER, weekRow(), suRow()], user: ADMIN2, quota: 4, now: at("2026-12-05T07:10:00") });
  q.ctx.dailyRun();
  assert.deepEqual(q.rec.emails.map((x) => x.to), [ADMIN2]);
  assert.match(q.rec.emails[0].body, /Kuota emel harian akaun ini hampir habis \(baki 4\)/);
  // A missing tab is reported to the installer
  const broken = createGas({ rows: [["Nota"]], sheetName: "Helaian1", user: ADMIN2, now: at("2026-12-05T07:10:00") });
  broken.ctx.dailyRun();
  assert.deepEqual(broken.rec.emails.map((x) => x.to), [ADMIN2]);
});

test("roles: officer emails are sent as JPPP Smart Planner, signed by it, with replies going to the SU", () => {
  const gas = createGas({ rows: [HEADER, weekRow(), suRow()], user: ADMIN2, now: at("2026-12-05T07:10:00") });
  gas.ctx.dailyRun();
  const mail = to(gas.rec, "ujian1@example.com")[0];
  assert.deepEqual([mail.name, mail.replyTo], ["JPPP Smart Planner", SU2]);
  assert.ok(mail.body.endsWith("\n\nTerima kasih.\nJPPP Smart Planner, Jabatan Pengurusan Perniagaan & Perakaunan, KPTM Kuantan"));
  assert.match(mail.body, /sila maklumkan Setiausaha Jabatan segera supaya giliran boleh ditukar\./);
  assert.doesNotMatch(mail.body, /maklumkan saya|Setiausaha Jabatan JPPP, KPTM Kuantan/);
  // PIC reminder
  const rem = selesaiGas({}, { now: at("2026-12-08T18:20:00"), user: ADMIN2 });
  rem.setRows([HEADER, weekRow({ code: CODE1, kj: KJ }), suRow()]);
  rem.ctx.deadlineCheck();
  const r = to(rem.rec, "ujian1@example.com")[0];
  assert.deepEqual([r.name, r.replyTo], ["JPPP Smart Planner", SU2]);
  assert.ok(r.body.endsWith("\n\nTerima kasih.\n" + MAIL_SIGNOFF));
});

test("roles: KJ alert and late follow-up go to the KJ with the SU and the installer in cc, replies to the SU", () => {
  const gas = selesaiGas({}, { now: at("2026-12-08T18:31:00"), user: ADMIN2 });
  gas.setRows([HEADER, weekRow({ code: CODE1, kj: KJ }), suRow()]);
  gas.ctx.deadlineCheck();
  const a = gas.rec.emails[0];
  assert.deepEqual([a.to, a.cc, a.replyTo, a.name], [KJ, SU2 + "," + ADMIN2, SU2, "JPPP Smart Planner"]);
  assert.ok(a.body.endsWith("\n\nEmel automatik, JPPP Smart Planner."));
  gas.setNow(at("2026-12-08T18:45:00"));
  gas.ctx.confirmLmo(ID1, CODE1, TICKS);
  const f = gas.rec.emails[1];
  assert.deepEqual([f.to, f.cc, f.replyTo], [KJ, SU2 + "," + ADMIN2, SU2]);
  // No KJ email: to the SU, installer in cc
  const nokj = selesaiGas({}, { now: at("2026-12-08T18:31:00"), user: ADMIN2 });
  nokj.setRows([HEADER, weekRow({ code: CODE1 }), suRow({ kj: "" })]);
  nokj.ctx.deadlineCheck();
  assert.deepEqual([nokj.rec.emails[0].to, nokj.rec.emails[0].cc], [SU2, ADMIN2]);
  assert.match(nokj.rec.emails[0].body, /^UNTUK SU: /);
  // Morning catch-up uses the same recipients
  const cu = selesaiGas({}, { now: at("2026-12-09T07:10:00"), user: ADMIN2 });
  cu.setRows([HEADER, weekRow({ code: CODE1, kj: KJ }), suRow()]);
  cu.ctx.dailyRun();
  const kjMail = to(cu.rec, KJ)[0];
  assert.deepEqual([kjMail.cc, kjMail.subject], [SU2 + "," + ADMIN2, "Last Man Out 8/12/2026: Pensyarah Ujian 1 belum mengesahkan tugas (semalam)"]);
});

test("roles: menu Emel Setiausaha (WhatsApp) sets, clears (PADAM) and rejects; test emails still go to the installer", () => {
  const set = createGas({ rows: [HEADER, weekRow(), suRow()], user: ADMIN2, promptText: "su.baru@example.com" });
  assert.equal(set.ctx.setSuEmail(), "su.baru@example.com");
  assert.equal(set.store.SU_EMAIL, "su.baru@example.com");
  assert.match(set.rec.prompts[0].message, /setiausaha\.ujian@example\.com \(dari baris Setiausaha dalam Sheet\)/);
  const clear = createGas({ rows: [HEADER, weekRow(), suRow()], user: ADMIN2, promptText: "PADAM", props: { SU_EMAIL: "su.baru@example.com" } });
  assert.equal(clear.ctx.setSuEmail(), "");
  assert.equal(clear.store.SU_EMAIL, undefined);
  assert.match(clear.rec.alerts.pop().message, /setiausaha\.ujian@example\.com/);
  const bad = createGas({ rows: [HEADER, weekRow()], promptText: "bukan emel" });
  assert.equal(bad.ctx.setSuEmail(), null);
  assert.equal(bad.rec.propWrites.length, 0);
  const noUi = createGas({ rows: [HEADER, weekRow()], promptText: "x@example.com", noUi: true });
  assert.equal(noUi.ctx.setSuEmail(), null);
  assert.equal(noUi.rec.propWrites.length, 0);

  const test2 = createGas({ rows: [HEADER, weekRow(), suRow()], user: ADMIN2, now: at("2026-11-30T10:00:00") });
  test2.ctx.sendTestToMe();
  assert.deepEqual(test2.rec.emails.map((x) => x.to), [ADMIN2, ADMIN2]);
  assert.match(test2.rec.emails[1].body, /contoh emel yang Setiausaha Jabatan \(setiausaha\.ujian@example\.com\) akan terima/);
  assert.match(test2.rec.alerts.pop().message, /akan dihantar kepada Setiausaha Jabatan: setiausaha\.ujian@example\.com \(dari baris Setiausaha dalam Sheet\)/);
  const inst = createGas({ rows: [HEADER, weekRow(), suRow()], user: ADMIN2 });
  inst.ctx.install();
  assert.match(inst.rec.alerts.pop().message, /Emel WhatsApp hari bertugas kepada: setiausaha\.ujian@example\.com[\s\S]*Laporan masalah kepada: pentadbir@example\.com/);
});

/* =================== Privacy =================== */

// The author's own public credit lines (README "Built by ..." and the LICENSE copyright) are allowed.
const isOwnerCredit = (f, line) => (f === "README.md" && /^Built by /.test(line)) || (f === "LICENSE" && /^Copyright \(c\) /.test(line));

function repoTextFiles() {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT }).toString();
  return out.split("\n").filter(Boolean).filter((f) => !/\.(png|jpe?g|gif|ico|woff2?|ttf|pdf|zip)$/i.test(f) && fs.existsSync(path.join(ROOT, f)));
}

test("privacy: no member CSV and no Malay full names (X bin/binti/bt Y) in the repo", () => {
  const files = repoTextFiles();
  assert.ok(files.length > 5);
  assert.deepEqual(files.filter((f) => /ahli.*\.csv$|giliran-lmo-.*\.csv$/i.test(f)), [], "staff CSV files must not be in the repo");
  const nameLike = /\b[A-Z][A-Za-z'@]+ (?:bin|binti|bt|bte)\.? [A-Z][A-Za-z']+/i;
  const hits = [];
  for (const f of files) {
    fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").forEach((line, i) => {
      if (isOwnerCredit(f, line)) return;
      if (nameLike.test(line)) hits.push(f + ":" + (i + 1) + ": " + line.trim().slice(0, 80));
    });
  }
  assert.deepEqual(hits, []);
});

test("privacy: none of the members' names appear in the repo (set LMO_MEMBERS_CSV)", { skip: !process.env.LMO_MEMBERS_CSV && "LMO_MEMBERS_CSV not set" }, () => {
  const rows = parseCsv(fs.readFileSync(process.env.LMO_MEMBERS_CSV, "utf8"));
  const nameCol = rows[0].findIndex((h) => /^(nama|name)$/i.test(h.trim()));
  const names = rows.slice(1).map((r) => r[nameCol].trim()).filter(Boolean);
  assert.equal(names.length, 46);
  const hits = [];
  for (const f of repoTextFiles()) {
    fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").forEach((line, i) => {
      if (isOwnerCredit(f, line)) return;
      const l = line.toLowerCase();
      for (const n of names) if (l.includes(n.toLowerCase())) hits.push(f + ":" + (i + 1));
    });
  }
  assert.deepEqual(hits, []);
});
