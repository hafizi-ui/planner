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
const HEADER = "ID,Mula,Tamat,Masa mula,Masa tamat,Nama,Emel,No WhatsApp,Jawatan,Program,Cuti,Emel dihantar,Kalendar dihantar,WhatsApp dihantar".split(",");
const SU = "su@example.com";

// Section E templates, written out in full so the tests check the contract, not the script against itself.
const SENARAI = "1. Semua lampu ditutup\n2. Penyaman udara & kipas dimatikan\n3. Suis utama dimatikan / palam dicabut\n" +
  "4. Pintu utama & tingkap dikunci\n5. Tandatangan borang & catat masa keluar";
const SIGNOFF = "Setiausaha Jabatan JPPP, KPTM Kuantan";
const WEEK1 = "Isnin, 7 Disember 2026 hingga Jumaat, 11 Disember 2026";
const expectSubject = (tempoh) => "Giliran Last Man Out (MQS): " + tempoh;
const expectBody = (nama, tempoh, from, to) => "Salam " + nama + ",\n\nTuan/puan dijadualkan sebagai Pegawai Last Man Out (MQS) Jabatan JPPP pada " +
  tempoh + ".\n\nSetiap hari bertugas, sebelum meninggalkan pejabat (sekitar " + from + "–" + to + "):\n" + SENARAI +
  "\n\nJemputan Google Calendar turut dihantar. Jika tidak dapat bertugas (cuti/kursus), sila maklumkan saya segera supaya giliran boleh ditukar.\n\nTerima kasih.\n" + SIGNOFF;
const expectWa = (nama, bila, tempoh, from) => "Salam " + nama + ",\n\nPeringatan: tuan/puan bertugas sebagai *Pegawai Last Man Out* " + bila +
  " (" + tempoh + ").\n\nSebelum pulang (sekitar " + from + "), sila pastikan:\n" + SENARAI + "\n\nTerima kasih.\n" + SIGNOFF;
const CAL_DETAILS = "Tugas Pegawai Last Man Out sebelum meninggalkan pejabat:\n" + SENARAI + "\n\nJadual Bertugas Last Man Out, Jabatan JPPP, KPTM Kuantan (MQS).";

/** One Sheet row in Contract 2 column order. */
function row(o) {
  return [o.id || "lmo-" + o.start, o.start, o.end || o.start, o.from || "16:45", o.to || "17:15", o.name == null ? "Pensyarah Ujian 1" : o.name,
    o.email == null ? "ujian1@example.com" : o.email, o.phone == null ? "60120000001" : o.phone, o.role || "Pensyarah", o.prog == null ? "AA101" : o.prog,
    o.off || "", o.mailStamp || "", o.calStamp || "", o.waStamp || ""];
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
  assert.equal(mails[0].name, "Setiausaha Jabatan JPPP");
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
  assert.equal(Object.keys(cols).length, 14, "all 14 Contract 2 columns recognised");
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
  gas.setNow(at("2027-01-04T07:10:00"));
  gas.ctx.dailyRun();
  assert.match(digests(gas.rec).pop().body, /Tiada No\. WhatsApp yang sah/);
});

test("install() twice leaves exactly one daily trigger at 7am Malaysia time; uninstall() removes it", () => {
  const gas = createGas({ rows: [HEADER, weekRow()], triggers: [{ fn: "somethingElse" }] });
  gas.ctx.install();
  gas.ctx.install();
  const mine = gas.triggers.filter((t) => t.getHandlerFunction() === "dailyRun");
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0]._cfg, { fn: "dailyRun", timeBased: true, everyDays: 1, atHour: 7, tz: "Asia/Kuala_Lumpur" });
  assert.match(gas.rec.alerts.pop().message, /1 giliran dijumpai/);
  gas.ctx.uninstall();
  assert.equal(gas.triggers.filter((t) => t.getHandlerFunction() === "dailyRun").length, 0);
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
