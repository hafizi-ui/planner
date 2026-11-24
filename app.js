/* JPPP Smart Planner (Eisenhower Matrix): a decision coach, not just a list.
   Plain JavaScript, no dependencies. Data stays in this browser (localStorage). */
(function () {
  "use strict";

  /* ================================================================
     Constants
     ================================================================ */
  var KEY = "eisenhower-planner:v1";          // current tasks (kept for backward compatibility)
  var ARCHIVE_KEY = "eisenhower-planner:archive"; // finished / let-go tasks, used by Insight
  var META_KEY = "eisenhower-planner:meta";
  var THEME_KEY = "eisenhower-planner:theme";
  var LANG_KEY = "eisenhower-planner:lang";
  var DAY = 86400000;
  var ARCHIVE_DAYS = 120;
  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  var QIDS = ["do", "schedule", "delegate", "delete"];
  var QSET = Object.create(null);
  QIDS.forEach(function (q) { QSET[q] = true; });

  var ICONS = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5l1.3-3.8A8 8 0 1 1 8.4 18.6L4 19.5z"/><path d="M9 10.5h6M9 13.5h4"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0M19 4v4M17 6h4"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  // Link that opens Google Calendar with an all-day event already filled in (no login or server needed here)
  function gcalUrl(t, guestEmail) {
    var p = t.date.split("-").map(Number);
    var next = new Date(p[0], p[1] - 1, p[2] + 1, 12);
    var start = t.date.replace(/-/g, ""), end = todayISO(next.getTime()).replace(/-/g, "");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(t.text) +
      "&dates=" + start + "/" + end +
      "&details=" + encodeURIComponent(T(t.q === "delegate" ? "calDetailsDel" : "calDetails")) +
      (guestEmail ? "&add=" + encodeURIComponent(guestEmail) : "");
  }
  // Last Man Out duty as a timed Google Calendar event (Malaysia time); a weekly turn repeats on each working day
  function lmoCalUrl(e, c) {
    var name = c ? c.name : e.name, days = workdays(e.start, e.end);
    function stamp(iso, hhmm) { return iso.replace(/-/g, "") + "T" + hhmm.replace(":", "") + "00"; }
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(T("lmoCalText", name)) +
      "&dates=" + stamp(e.start, rota.timeFrom) + "/" + stamp(e.start, rota.timeTo) +
      "&ctz=Asia%2FKuala_Lumpur" +
      (days > 1 ? "&recur=" + encodeURIComponent("RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=" + days) : "") +
      "&details=" + encodeURIComponent(T("lmoCalDetails", T("lmoList"), lmoConfirm(e))) +
      (c && c.email ? "&add=" + encodeURIComponent(c.email) : "");
  }

  /* ================================================================
     Text in two languages (BM / EN)
     ================================================================ */
  var I18N = {
    en: {
      skip: "Skip to task box",
      insight: "Insight", more: "More options", export: "Export backup", import: "Import backup",
      loadSample: "Load sample week", install: "Install app", language: "Language", theme: "Switch light or dark theme",
      h1: "What needs handling today?",
      lede: "Sort department work by priority, delegate meeting actions to each PIC and send Last Man Out reminders on time. Answer two quick questions and the planner puts each task in the right box.",
      placeholder: "Add a task, e.g. Circulate the meeting minutes tomorrow", newTask: "New task", add: "Add task",
      qUrgent: "Is it urgent?", qImportant: "Is it important?", qOther: "Can someone else do it?",
      whatUrgent: "What counts as urgent?", whatImportant: "What counts as important?",
      tipUrgent: "Due within 48 hours, or someone is waiting on you.",
      tipImportant: "It moves a real goal forward: studies, career, health, your students.",
      yesUrgent: "Urgent", noUrgent: "Can wait", yesImportant: "Important", noImportant: "Not really",
      yes: "Yes", no: "No, it's mine",
      goesTo: "Goes to", answerFirst: "Answer the questions to place it",
      needAnswers: "Answer the questions first, so the task lands in the right box.",
      detected: function (w) { return "Found \u201c" + w + "\u201d, so it's marked urgent. Change it if that's wrong."; },
      reviewReady: "Your weekly review is ready.", open: "Open", dismiss: "Dismiss",
      progress: "Progress", progressBar: "Tasks completed",
      progressText: function (d, n) { return "<strong>" + d + "</strong> of " + n + " tasks done"; },
      progressNote: "(Delete box not counted)",
      clearDone: "Clear completed",
      starterText: "New here? Load a sample week to see how it works.",
      axUrgent: "Urgent", axNotUrgent: "Not urgent", axImportant: "Important", axNotImportant: "Not important",
      foot: "Your tasks stay in this browser only. Nothing is sent anywhere. Use Export to back them up.",
      last7: "Last 7 days", insightTitle: "Where did my time go?", close: "Close", undo: "Undo",
      moveTo: "Move to", moveLabel: "Move\u2026", editTask: "Edit task", deleteTask: "Delete task",
      markDone: function (x) { return "Mark as done: " + x; },
      dblEdit: "Double-click to edit", schedDate: "Scheduled date", delegatedTo: "Delegated to", whoPh: "Who handles it?",
      addToCal: function (x) { return "Add to Google Calendar: " + x; },
      calDetails: "Planned in the Schedule box of JPPP Smart Planner (https://hafizi-ui.github.io/planner/).",
      calDetailsDel: "Task assigned via JPPP Smart Planner (https://hafizi-ui.github.io/planner/).",
      fromSchedule: "From Schedule", onlyYou: "Only you", overdue: "Overdue",
      dueDate: "Due date", notified: "Notified", saveContact: "Save contact",
      waAria: function (n, x) { return "Send on WhatsApp to " + n + ": " + x; },
      mailAria: function (n, x) { return "Send email to " + n + ": " + x; },
      msgSubject: function (x) { return "Task for your action: " + x; },
      msgBody: function (name, text, due, cal) {
        return "Hi " + name + ",\n\nA task for your action:\n*" + text + "*" +
          (due ? "\nDue: " + due : "") + (cal ? "\n\nAdd it to Google Calendar:\n" + cal : "") + "\n\nThank you.";
      },
      contacts: "Team contacts",
      contactsNote: "Saved on this device only. Never uploaded anywhere. Included in Export backup.",
      cName: "Name", cPhone: "WhatsApp no.", cEmail: "Email", cSave: "Save", cUpdate: "Update", cCancel: "Cancel",
      cImport: "Import CSV", cTemplate: "CSV template", cExport: "Export CSV", cSearch: "Search contacts",
      cCsvHelp: "CSV columns: Name, WhatsApp no., Email, Role, Programme, LMO rota (Yes/No). Only the name is required. Save from Excel or Google Sheets as .csv.",
      cEmpty: "No contacts yet. Add them one by one, or import a CSV from Excel / Google Sheets.",
      cImported: function (n) { return n + " contacts imported"; }, cBadCsv: "No contacts found in that file",
      cNeed: "Enter a name.",
      cBadPhone: "That WhatsApp number doesn't look right. Example: 012-345 6789",
      cBadEmail: "That email doesn't look right.",
      cDelete: function (n) { return "Delete " + n + " from contacts?"; },
      cSaved: function (n) { return n + " saved"; }, cEdit: "Edit", cDel: "Delete",
      cCount: function (n) { return n + (n === 1 ? " contact" : " contacts"); },
      sendByPic: "Send to each PIC", sendTitle: "Send tasks by PIC",
      sendNote: "One message per person with all their open tasks. Good for meeting minutes.",
      meetingLabel: "From (optional)", meetingPh: "e.g. JPPP Department Meeting 3/2026",
      onlyNew: "Only tasks not yet notified",
      noPics: "No open Delegate tasks with a PIC yet.",
      notSaved: "Not in contacts yet",
      sentAll: function (n) { return "Marked " + n + (n === 1 ? " task" : " tasks") + " as notified"; },
      nOpen: function (n) { return n + (n === 1 ? " open task" : " open tasks"); },
      groupBody: function (name, from, lines) {
        return "Hi " + name + ",\n\n" + (from ? "Action items from " + from + ":" : "Tasks for your action:") + "\n\n" + lines + "\n\nThank you.";
      },
      groupSubject: function (from, n) { return (from ? from + ": " : "") + n + (n === 1 ? " task" : " tasks") + " for your action"; },
      dueShort: "Due",
      monitor: "Monitor", monitorTitle: "Project monitor", monitorEyebrow: "Delegated tasks",
      stNone: "Not started", stDoing: "In progress", stBlocked: "Needs help", stDone: "Done", statusLabel: "Status",
      noteLabel: "Status note", notePh: "Latest update…",
      mActive: "Open", mDoneRate: "Done", mOverdue: "Overdue", mSoon: "Due today/tomorrow", mStale: "No update 5+ days",
      mActiveHelp: "delegated tasks", mDoneHelp: "of all delegated", mStaleHelp: "notified, no news",
      needRemind: "Needs a reminder", byPic: "By person in charge", nothingDue: "Nothing due today or tomorrow. All clear.",
      noDelegated: "No delegated tasks yet. Put a task in Delegate, choose a PIC and set a due date.",
      remind: "Reminder", askStatus: "Ask for status", remindedToday: "Reminded today",
      askedOn: function (d) { return "Status asked " + d; }, updatedAgo: function (d) { return "Updated " + d; },
      never: "No update yet", todayW: "today", yesterdayW: "yesterday", daysAgo: function (n) { return n + " days ago"; },
      dueWhen: function (n) { return n < 0 ? (-n === 1 ? "1 day overdue" : -n + " days overdue") : n === 0 ? "Due today" : n === 1 ? "Due tomorrow" : "Due in " + n + " days"; },
      remindBanner: function (n) { return n + (n === 1 ? " delegated task is" : " delegated tasks are") + " due tomorrow or overdue."; },
      sendReminders: "Send reminders",
      remindMsg: function (name, text, n, date) {
        var when = n < 0 ? "was due on " + date + " (" + (-n) + (n === -1 ? " day" : " days") + " ago)" : n === 0 ? "is due today (" + date + ")" : n === 1 ? "is due tomorrow (" + date + ")" : "is due on " + date;
        return "Hi " + name + ",\n\nA friendly reminder: *" + text + "* " + when + ".\n\nCould you share the latest status? Thank you.";
      },
      askMsg: function (name, lines) {
        return "Hi " + name + ",\n\nCould you share the status of these tasks?\n\n" + lines +
          "\n\nReply with the task number and a letter:\nA = Not started, B = In progress, C = Done, D = Need help\nExample: 1C, 2B\n\nThank you.";
      },
      remindSubject: function (x) { return "Reminder: " + x; }, askSubject: "Task status update",
      progressOf: function (d, n) { return d + " of " + n + " done"; },
      deleteAll: "Delete all", clearN: function (n) { return "Clear " + n + " done"; },
      nTasks: function (n) { return n + (n === 1 ? " task" : " tasks"); },
      taskDeleted: "Task deleted", tasksDeleted: function (n) { return n + " tasks deleted"; },
      tasksCleared: function (n) { return n + " tasks cleared"; },
      addedTo: function (q) { return "Added to " + q; }, movedTo: function (q) { return "Moved to " + q; },
      promoted: function (n) { return n === 1 ? "1 scheduled task is due today, so it moved to Do." : n + " scheduled tasks are due, so they moved to Do."; },
      imported: function (n) { return n + " tasks imported"; }, badFile: "That file is not a planner backup",
      saveFail: "Could not save. Export a backup now.",
      confirmSample: "Replace your current tasks with the sample week? A copy of your tasks is kept, and Export still works.",
      sampleLoaded: "Sample week loaded. Open Insight to see the review.",
      packLmo: "Add pack: Last Man Out (MQS)",
      packAdded: function (n) { return n + " Last Man Out (MQS) tasks added. Fill in the PIC in Delegate."; },
      packExists: "The Last Man Out (MQS) tasks are already in your planner.",
      brandSub: "Department Secretary · KPTM Kuantan",
      cRole: "Role", cProg: "Programme", cProgPh: "e.g. AA101", cRotaCol: "LMO rota", cYes: "Yes", cNo: "No",
      cRoles: ["Head of Department", "Secretary", "Programme Coordinator", "Lecturer"],
      cSample: "Sample Name,012-345 6789,name@kptm.edu.my,Lecturer,AA101,Yes",
      cNoReach: "No WhatsApp no. or email yet",
      cSavedNoReach: function (n) { return n + " saved. Add a WhatsApp no. or email so messages can be sent."; },
      completeContact: "Complete contact", addPhone: "Add WhatsApp no.", addEmail: "Add email",
      rota: "Last Man Out rota", rTitle: "Last Man Out rota",
      rNow: function (n) { return "On duty now: " + n; },
      rNext: function (n, d) { return "Next on duty: " + n + " (" + d + ")"; },
      rNoneYet: "No rota yet",
      rDue: "Notices to send", rNothingDue: "No notices to send right now.",
      rGasOn: "Emails and calendar invitations are sent by Google Apps Script, so only WhatsApp is listed here.",
      rLate: "Late", rToday: "Today", rThisWeek: "This week",
      rSettings: "Rota settings", rMode: "Rota type", rWeek: "Weekly (Mon–Fri)", rDay: "Daily",
      rOrder: "Order", rOrderProg: "By programme (org chart)", rOrderAz: "By name (A–Z)",
      rStart: "Start date", rTimeFrom: "Duty starts", rTimeTo: "Duty ends", rBadTime: "The duty must end after it starts.",
      rMembers: function (n, total) { return "Members in the rota (" + n + "/" + total + ")"; },
      rMembersHint: "Changes apply the next time you rebuild or extend the rota.",
      rNoProg: "No programme",
      rGas: "Email & calendar are sent automatically by Google Apps Script",
      rGenerate: "Create rota", rRegen: "Rebuild from start date", rExtend: "Add one more round",
      rRegenConfirm: function (d) { return "Rebuild the rota from " + d + "? Turns already notified, or starting within 2 days, will not change."; },
      rGenerated: function (n) { return n + (n === 1 ? " turn" : " turns") + " created"; },
      rExtended: function (n) { return n + (n === 1 ? " turn" : " turns") + " added"; },
      rNoMembers: "No one is in the rota yet. Import the staff list (CSV) in Team contacts, then tick who takes turns.",
      rOpenContacts: "Open team contacts",
      rTools: "Print & export", rExportCsv: "Export CSV for Google Sheet",
      rPrintRoster: "Print roster", rPrintCheck: "Print checklist (4 weeks)", rGuide: "Apps Script guide",
      rReexport: "The rota has changed since the last export. Export the CSV again and import it into the Google Sheet, so the script sends to the right people.",
      rExported: function (n) { return "Rota CSV exported (" + n + (n === 1 ? " row)" : " rows)"); },
      rList: "Turns",
      rShowPast: function (n) { return "Show " + n + (n === 1 ? " past turn" : " past turns"); }, rHidePast: "Hide past turns",
      rPerson: function (p) { return "Duty officer, " + p; }, rNoPerson: "— Choose officer —",
      rOff: "Public holiday / no duty",
      rSwapConfirm: function (b, pa, a, pb) { return "Swap turns? " + b + " takes " + pa + " and " + a + " takes " + pb + ". Notices for both turns will be sent again."; },
      rSwapped: "Turns swapped", rReplaced: "Duty officer changed",
      rTellOld: function (n) { return "Let " + n + " know the turn has changed"; },
      rOffOn: "Marked as no duty. Later turns moved back by one, so nobody loses a turn.",
      rOffOff: "No-duty mark removed. Turns moved forward again.",
      rSentMark: function (ch, n) { return ch + " to " + n + " marked as sent"; },
      rUnmark: function (ch, n) { return ch + " to " + n + " marked as not sent"; },
      rChipAria: function (label, n) { return label + ", " + n; },
      rNothingToPrint: "No turns to print yet.",
      rTo: " to ",
      chEmail: "Email", chCal: "Calendar", chWa: "WhatsApp",
      lmoBanner: function (list) { return "Last Man Out: notices for " + list + " are due."; },
      lmoSend: "Send", lmoMore: function (n) { return "+" + n + " more"; },
      lmoList: "1. All lights off\n2. Air-conditioning & fans off\n3. Main switch off / plugs unplugged\n4. Main door & windows locked\n5. Sign the form & record time out",
      lmoSignoff: "Secretary, JPPP Department, KPTM Kuantan",
      lmoWaMsg: function (name, oneDay, period, from, list, signoff, confirm) {
        return "Hi " + name + ",\n\nReminder: you are the *Last Man Out officer* " + (oneDay ? "today" : "this week") + " (" + period + ").\n\n" +
          "Before leaving (around " + from + "), please make sure:\n" + list + "\n\n" + confirm + "\n\nThank you.\n" + signoff;
      },
      lmoMailSubject: function (period) { return "Last Man Out duty (MQS): " + period; },
      lmoMailBody: function (name, period, from, to, list, signoff, confirm) {
        return "Hi " + name + ",\n\nYou are scheduled as the Last Man Out officer (MQS) for the JPPP Department on " + period + ".\n\n" +
          "On each duty day, before leaving the office (around " + from + "–" + to + "):\n" + list + "\n\n" + confirm + "\n\n" +
          "A Google Calendar invitation is also being sent. If you cannot do this duty (leave/course), please let me know as soon as possible so the turn can be swapped.\n\nThank you.\n" + signoff;
      },
      lmoCalText: function (n) { return "Last Man Out (MQS): " + n; },
      lmoCalDetails: function (list, confirm) { return "Last Man Out officer duty before leaving the office:\n" + list + "\n\n" + confirm + "\n\nLast Man Out duty roster, JPPP Department, KPTM Kuantan (MQS)."; },
      pRosterTitle: "Weekly Last Man Out Duty Roster (MQS)", pRosterTitleDay: "Daily Last Man Out Duty Roster (MQS)",
      pDept: "Business Management & Accounting Department, KPTM Kuantan",
      pDutyTime: function (a, b) { return "Duty time: " + a + "–" + b + ", Monday to Friday"; },
      pMqs: "MQS audit evidence: energy saving & office safety",
      pBil: "No.", pWeek: "Week / Date", pName: "Officer", pRole: "Role / Programme", pSign: "Signature", pNote: "Remarks",
      pHoliday: "Public holiday",
      pCheckTitle: "Last Man Out Daily Checklist",
      pDate: "Date", pOfficer: "Officer", pLights: "Lights", pAc: "Air-conditioning", pSwitch: "Main switch / plugs",
      pDoor: "Door & windows locked", pTimeOut: "Time out",
      pCheckedBy: "Checked by: ______________________________     Date: ________________",
      pPrinted: function (d) { return "Printed on " + d; },
      rWebUrl: "“Done” web app URL (optional)", rWebUrlHint: "Copy it from the Google Sheet: menu Last Man Out › Pautan Selesai",
      rBadUrl: "That is not a web app link. It must look like https://script.google.com/macros/s/…/exec",
      rDeadline: "Deadline to press Done",
      rBadDeadline: function (min) { return "The deadline must be at or after " + min + " (the end of the duty, and not before 17:15)."; },
      rDeadlineMoved: function (t) { return "The deadline to press Done moved to " + t + "."; },
      rConfInSheet: "Confirmations are recorded in the Google Sheet, tab Pengesahan.",
      rDayAria: function (d) { return d + ": Last Man Out status"; },
      rDayNone: "Not yet", rDayOk: "Done ✓", rDayOffOpt: "No duty (holiday)", rDayOff: "No duty",
      rDaySet: function (d, st) { return d + ": " + st; },
      rDayKj: "HoD told", rKjPending: function (d, had) { return "Done not confirmed for " + d + " (deadline " + had + ")"; },
      lmoConfirmLine: function (url, had) {
        return url ? "After the duty each day, open this link and press Done before " + had + ":\n" + url + "\nIf it is not confirmed, the Head of Department will be informed."
          : "After the duty each day, tell the Department Secretary SELESAI by WhatsApp or email before " + had + ". If it is not confirmed, the Head of Department will be informed.";
      },
      lmoKjSubject: function (pic, d) { return "Last Man Out " + d + ": " + pic + " has not confirmed the duty"; },
      lmoKjMsg: function (kj, pic, d, had, signoff) {
        return "Dear " + kj + ",\n\nFor your information, the Last Man Out officer on " + d + ", " + pic + ", has not confirmed the Last Man Out (MQS) checklist by " + had + ". I am following up.\n\nThank you.\n" + signoff;
      },
      lmoKjBanner: function (pic, d, had) { return "Last Man Out: " + pic + " has not confirmed Done for " + d + " (deadline " + had + ")."; },
      kjMark: "Mark done", kjMarkAria: function (pic, d) { return "Mark done: " + pic + ", " + d; },
      kjMarked: function (pic, d) { return "Marked done: " + pic + ", " + d; },
      kjWa: "WhatsApp HoD", kjEmail: "Email HoD", kjAdd: "Add Head of Department contact",
      kjTold: function (pic, d) { return "Head of Department told about " + pic + ", " + d; },
      q: {
        "do":       { title: "Do",       sub: "Urgent and important",         hint: "Finish these first.",       empty: "Nothing here yet. Urgent + important tasks land here." },
        "schedule": { title: "Schedule", sub: "Important, not urgent",        hint: "Give each one a date.",     empty: "Add what moves you forward: study, health, planning." },
        "delegate": { title: "Delegate", sub: "Urgent, not important",        hint: "Write who will handle it.", empty: "Nothing to hand over yet." },
        "delete":   { title: "Delete",   sub: "Neither urgent nor important", hint: "Let these go on purpose.",  empty: "Nothing to drop." }
      },
      ins: {
        finished: "Finished", planned: "Planned", reactive: "Reactive", letGo: "Let go",
        plannedHelp: "from Schedule", reactiveHelp: "Do + Delegate", letGoHelp: "dropped on purpose",
        mix: "What you finished, by box", perDay: "Finished per day", whatItMeans: "What this means",
        balance: "Balance score", vsLast: function (d) { return d === 0 ? "same as the week before" : (d > 0 ? "+" + d : d) + " points vs the week before"; },
        noData: "No finished tasks in the last 7 days yet. Tick tasks as done and come back here at the end of the week.",
        reactiveHigh: function (p) { return p + "% of your finished work was urgent. Try to protect two time slots this week for Schedule tasks."; },
        reactiveMid: function (p) { return p + "% of your finished work was urgent. You're close to a healthy balance; one more planned task a day would tip it."; },
        plannedGood: function (p) { return p + "% of your finished work was planned ahead. That's the work that moves you forward. Keep it up."; },
        promotedN: function (n) { return n + (n === 1 ? " task" : " tasks") + " moved from Schedule to Do because the date arrived. Starting earlier keeps them out of the red box."; },
        droppedN: function (n) { return "You let go of " + n + (n === 1 ? " task" : " tasks") + " on purpose. That's " + n + (n === 1 ? " decision" : " decisions") + ", not failures."; },
        onlyYouN: function (n) { return n + " urgent " + (n === 1 ? "task" : "tasks") + " could only be done by you. If this keeps happening, agree on deadlines earlier."; },
        noDateN: function (n) { return n + " Schedule " + (n === 1 ? "task has" : "tasks have") + " no date yet. Give each one a day so it doesn't become urgent."; },
        plan: "Plan next week", balanceHelp: "Share of finished work that was planned (Schedule). Higher is better."
      },
      days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      locale: "en-MY",
      kw: ["today", "tonight", "tomorrow", "asap", "urgent", "deadline", "due", "now", "this morning", "this afternoon"]
    },
    ms: {
      skip: "Langkau ke kotak tugasan",
      insight: "Analisis", more: "Pilihan lain", export: "Eksport sandaran", import: "Import sandaran",
      loadSample: "Muat minggu contoh", install: "Pasang aplikasi", language: "Bahasa", theme: "Tukar tema cerah atau gelap",
      h1: "Apa yang perlu diurus hari ini?",
      lede: "Susun kerja jabatan ikut keutamaan, agihkan tindakan mesyuarat kepada setiap PIC dan hantar peringatan Last Man Out tepat pada masanya. Jawab dua soalan ringkas, dan planner akan letakkan setiap tugasan dalam kotak yang betul.",
      placeholder: "Tambah tugasan, cth. Edarkan minit mesyuarat esok", newTask: "Tugasan baharu", add: "Tambah",
      qUrgent: "Adakah ia segera?", qImportant: "Adakah ia penting?", qOther: "Boleh orang lain buat?",
      whatUrgent: "Apa maksud segera?", whatImportant: "Apa maksud penting?",
      tipUrgent: "Perlu siap dalam 48 jam, atau ada orang sedang menunggu anda.",
      tipImportant: "Ia membawa matlamat sebenar ke hadapan: pelajaran, kerjaya, kesihatan, pelajar anda.",
      yesUrgent: "Segera", noUrgent: "Boleh tunggu", yesImportant: "Penting", noImportant: "Tidak sangat",
      yes: "Ya", no: "Tidak, tugas saya",
      goesTo: "Masuk ke", answerFirst: "Jawab soalan untuk tentukan kotak",
      needAnswers: "Jawab soalan dahulu supaya tugasan masuk ke kotak yang betul.",
      detected: function (w) { return "Jumpa \u201c" + w + "\u201d, jadi ia ditanda segera. Tukar jika tidak tepat."; },
      reviewReady: "Ulasan mingguan anda sudah sedia.", open: "Buka", dismiss: "Tutup",
      progress: "Kemajuan", progressBar: "Tugasan selesai",
      progressText: function (d, n) { return "<strong>" + d + "</strong> daripada " + n + " tugasan selesai"; },
      progressNote: "(Kotak Buang tidak dikira)",
      clearDone: "Kosongkan yang selesai",
      starterText: "Baru di sini? Muat minggu contoh untuk lihat cara ia berfungsi.",
      axUrgent: "Segera", axNotUrgent: "Tidak segera", axImportant: "Penting", axNotImportant: "Tidak penting",
      foot: "Tugasan anda kekal dalam pelayar ini sahaja. Tiada apa-apa dihantar keluar. Guna Eksport untuk sandaran.",
      last7: "7 hari lepas", insightTitle: "Ke mana masa saya pergi?", close: "Tutup", undo: "Batal",
      moveTo: "Pindah ke", moveLabel: "Pindah\u2026", editTask: "Sunting tugasan", deleteTask: "Padam tugasan",
      markDone: function (x) { return "Tanda selesai: " + x; },
      dblEdit: "Klik dua kali untuk sunting", schedDate: "Tarikh dijadualkan", delegatedTo: "Diagihkan kepada", whoPh: "Siapa yang uruskan?",
      addToCal: function (x) { return "Tambah ke Google Calendar: " + x; },
      calDetails: "Dirancang dalam kotak Jadualkan, JPPP Smart Planner (https://hafizi-ui.github.io/planner/).",
      calDetailsDel: "Tugasan diagihkan melalui JPPP Smart Planner (https://hafizi-ui.github.io/planner/).",
      fromSchedule: "Dari Jadualkan", onlyYou: "Hanya anda", overdue: "Lewat",
      dueDate: "Tarikh akhir", notified: "Dimaklumkan", saveContact: "Simpan kenalan",
      waAria: function (n, x) { return "Hantar WhatsApp kepada " + n + ": " + x; },
      mailAria: function (n, x) { return "Hantar emel kepada " + n + ": " + x; },
      msgSubject: function (x) { return "Tugasan untuk tindakan: " + x; },
      msgBody: function (name, text, due, cal) {
        return "Salam " + name + ",\n\nTugasan untuk tindakan tuan/puan:\n*" + text + "*" +
          (due ? "\nTarikh akhir: " + due : "") + (cal ? "\n\nTambah ke Google Calendar:\n" + cal : "") + "\n\nTerima kasih.";
      },
      contacts: "Kenalan jabatan",
      contactsNote: "Disimpan dalam peranti ini sahaja. Tidak dimuat naik ke mana-mana. Termasuk dalam Eksport sandaran.",
      cName: "Nama", cPhone: "No. WhatsApp", cEmail: "Emel", cSave: "Simpan", cUpdate: "Kemas kini", cCancel: "Batal",
      cImport: "Import CSV", cTemplate: "Templat CSV", cExport: "Eksport CSV", cSearch: "Cari kenalan",
      cCsvHelp: "Lajur CSV: Nama, No. WhatsApp, Emel, Jawatan, Program, Giliran LMO (Ya/Tidak). Hanya nama yang wajib. Simpan dari Excel atau Google Sheets sebagai .csv.",
      cEmpty: "Belum ada kenalan. Tambah satu persatu, atau import CSV dari Excel / Google Sheets.",
      cImported: function (n) { return n + " kenalan diimport"; }, cBadCsv: "Tiada kenalan dijumpai dalam fail itu",
      cNeed: "Isi nama.",
      cBadPhone: "No. WhatsApp itu nampak tidak betul. Contoh: 012-345 6789",
      cBadEmail: "Emel itu nampak tidak betul.",
      cDelete: function (n) { return "Padam " + n + " daripada kenalan?"; },
      cSaved: function (n) { return n + " disimpan"; }, cEdit: "Sunting", cDel: "Padam",
      cCount: function (n) { return n + " kenalan"; },
      sendByPic: "Hantar ikut PIC", sendTitle: "Hantar tugasan ikut PIC",
      sendNote: "Satu mesej untuk setiap orang, mengandungi semua tugasan mereka yang belum selesai. Sesuai untuk minit mesyuarat.",
      meetingLabel: "Daripada (pilihan)", meetingPh: "cth. Mesyuarat Jabatan JPPP Bil. 3/2026",
      onlyNew: "Hanya tugasan yang belum dimaklumkan",
      noPics: "Belum ada tugasan Agihkan yang ada PIC.",
      notSaved: "Belum ada dalam kenalan",
      sentAll: function (n) { return n + " tugasan ditanda sebagai dimaklumkan"; },
      nOpen: function (n) { return n + " tugasan belum selesai"; },
      groupBody: function (name, from, lines) {
        return "Salam " + name + ",\n\n" + (from ? "Tindakan daripada " + from + ":" : "Tugasan untuk tindakan tuan/puan:") + "\n\n" + lines + "\n\nTerima kasih.";
      },
      groupSubject: function (from, n) { return (from ? from + ": " : "") + n + " tugasan untuk tindakan"; },
      dueShort: "Tarikh akhir",
      monitor: "Pantauan", monitorTitle: "Pantauan projek", monitorEyebrow: "Tugasan diagihkan",
      stNone: "Belum mula", stDoing: "Sedang buat", stBlocked: "Perlukan bantuan", stDone: "Siap", statusLabel: "Status",
      noteLabel: "Catatan status", notePh: "Perkembangan terkini…",
      mActive: "Aktif", mDoneRate: "Siap", mOverdue: "Lewat", mSoon: "Due hari ini/esok", mStale: "Tiada kemas kini 5+ hari",
      mActiveHelp: "tugasan diagihkan", mDoneHelp: "daripada semua agihan", mStaleHelp: "sudah dimaklumkan, tiada berita",
      needRemind: "Perlu peringatan", byPic: "Ikut PIC", nothingDue: "Tiada yang due hari ini atau esok. Semua terkawal.",
      noDelegated: "Belum ada tugasan diagihkan. Masukkan tugasan ke Agihkan, pilih PIC dan tetapkan tarikh akhir.",
      remind: "Peringatan", askStatus: "Minta status", remindedToday: "Sudah diingatkan hari ini",
      askedOn: function (d) { return "Status diminta " + d; }, updatedAgo: function (d) { return "Dikemas kini " + d; },
      never: "Belum ada kemas kini", todayW: "hari ini", yesterdayW: "semalam", daysAgo: function (n) { return n + " hari lepas"; },
      dueWhen: function (n) { return n < 0 ? "Lewat " + (-n) + " hari" : n === 0 ? "Due hari ini" : n === 1 ? "Due esok" : "Due dalam " + n + " hari"; },
      remindBanner: function (n) { return n + " tugasan diagihkan due esok atau sudah lewat."; },
      sendReminders: "Hantar peringatan",
      remindMsg: function (name, text, n, date) {
        var when = n < 0 ? "sepatutnya siap pada " + date + " (lewat " + (-n) + " hari)" : n === 0 ? "perlu disiapkan hari ini (" + date + ")" : n === 1 ? "perlu disiapkan esok (" + date + ")" : "perlu disiapkan pada " + date;
        return "Salam " + name + ",\n\nPeringatan mesra: tugasan *" + text + "* " + when + ".\n\nBoleh kongsi status terkini? Terima kasih.";
      },
      askMsg: function (name, lines) {
        return "Salam " + name + ",\n\nBoleh kongsi status tugasan berikut?\n\n" + lines +
          "\n\nBalas dengan nombor tugasan dan huruf:\nA = Belum mula, B = Sedang buat, C = Siap, D = Perlukan bantuan\nContoh: 1C, 2B\n\nTerima kasih.";
      },
      remindSubject: function (x) { return "Peringatan: " + x; }, askSubject: "Kemas kini status tugasan",
      progressOf: function (d, n) { return d + " daripada " + n + " siap"; },
      deleteAll: "Padam semua", clearN: function (n) { return "Kosongkan " + n + " selesai"; },
      nTasks: function (n) { return n + " tugasan"; },
      taskDeleted: "Tugasan dipadam", tasksDeleted: function (n) { return n + " tugasan dipadam"; },
      tasksCleared: function (n) { return n + " tugasan dikosongkan"; },
      addedTo: function (q) { return "Ditambah ke " + q; }, movedTo: function (q) { return "Dipindah ke " + q; },
      promoted: function (n) { return n + " tugasan berjadual sudah sampai tarikh, jadi ia dipindah ke Buat."; },
      imported: function (n) { return n + " tugasan diimport"; }, badFile: "Fail itu bukan sandaran planner",
      saveFail: "Tidak dapat simpan. Eksport sandaran sekarang.",
      confirmSample: "Ganti tugasan semasa dengan minggu contoh? Salinan tugasan anda tetap disimpan, dan Eksport masih boleh digunakan.",
      sampleLoaded: "Minggu contoh dimuatkan. Buka Analisis untuk lihat ulasan.",
      packLmo: "Tambah pakej: Last Man Out (MQS)",
      packAdded: function (n) { return n + " tugasan Last Man Out (MQS) ditambah. Isi nama PIC di kotak Agihkan."; },
      packExists: "Tugasan Last Man Out (MQS) sudah ada dalam planner anda.",
      brandSub: "Setiausaha Jabatan · KPTM Kuantan",
      cRole: "Jawatan", cProg: "Program", cProgPh: "cth. AA101", cRotaCol: "Giliran LMO", cYes: "Ya", cNo: "Tidak",
      cRoles: ["Ketua Jabatan", "Setiausaha", "Ketua Program", "Pensyarah"],
      cSample: "Nama Contoh,012-345 6789,nama@kptm.edu.my,Pensyarah,AA101,Ya",
      cNoReach: "Tiada no. WhatsApp / emel",
      cSavedNoReach: function (n) { return n + " disimpan. Tambah no. WhatsApp atau emel supaya mesej boleh dihantar."; },
      completeContact: "Lengkapkan kenalan", addPhone: "Tambah no. WhatsApp", addEmail: "Tambah emel",
      rota: "Giliran Last Man Out", rTitle: "Giliran Last Man Out",
      rNow: function (n) { return "Bertugas sekarang: " + n; },
      rNext: function (n, d) { return "Giliran seterusnya: " + n + " (" + d + ")"; },
      rNoneYet: "Belum ada jadual giliran",
      rDue: "Perlu dihantar", rNothingDue: "Tiada notis yang perlu dihantar sekarang.",
      rGasOn: "Emel dan jemputan kalendar dihantar oleh Google Apps Script, jadi hanya WhatsApp disenaraikan di sini.",
      rLate: "Lewat", rToday: "Hari ini", rThisWeek: "Minggu ini",
      rSettings: "Tetapan giliran", rMode: "Jenis giliran", rWeek: "Mingguan (Isn–Jum)", rDay: "Harian",
      rOrder: "Susunan", rOrderProg: "Ikut program (carta organisasi)", rOrderAz: "Ikut nama (A–Z)",
      rStart: "Tarikh mula", rTimeFrom: "Masa mula bertugas", rTimeTo: "Masa tamat bertugas", rBadTime: "Masa tamat mesti selepas masa mula.",
      rMembers: function (n, total) { return "Ahli dalam giliran (" + n + "/" + total + ")"; },
      rMembersHint: "Perubahan berkuat kuasa apabila jadual dijana semula atau disambung.",
      rNoProg: "Tiada program",
      rGas: "Emel & kalendar dihantar automatik oleh Google Apps Script",
      rGenerate: "Jana jadual", rRegen: "Jana semula dari tarikh mula", rExtend: "Sambung satu pusingan",
      rRegenConfirm: function (d) { return "Jana semula giliran mulai " + d + "? Giliran yang sudah dimaklumkan, atau bermula dalam 2 hari, tidak akan berubah."; },
      rGenerated: function (n) { return n + " giliran dijana"; },
      rExtended: function (n) { return n + " giliran ditambah"; },
      rNoMembers: "Belum ada ahli dalam giliran. Import senarai staf (CSV) di Kenalan jabatan, kemudian tanda siapa yang terlibat.",
      rOpenContacts: "Buka Kenalan jabatan",
      rTools: "Cetak & eksport", rExportCsv: "Eksport CSV untuk Google Sheet",
      rPrintRoster: "Cetak jadual", rPrintCheck: "Cetak senarai semak (4 minggu)", rGuide: "Panduan Apps Script",
      rReexport: "Giliran telah berubah sejak eksport terakhir. Eksport CSV sekali lagi dan import ke Google Sheet supaya skrip menghantar kepada orang yang betul.",
      rExported: function (n) { return "CSV giliran dieksport (" + n + " baris)"; },
      rList: "Senarai giliran",
      rShowPast: function (n) { return "Tunjuk " + n + " giliran lepas"; }, rHidePast: "Sembunyi giliran lepas",
      rPerson: function (p) { return "Pegawai bertugas, " + p; }, rNoPerson: "— Pilih pegawai —",
      rOff: "Cuti umum / tiada tugas",
      rSwapConfirm: function (b, pa, a, pb) { return "Tukar giliran? " + b + " ambil giliran " + pa + " dan " + a + " ambil giliran " + pb + ". Notis bagi kedua-dua giliran akan dihantar semula."; },
      rSwapped: "Giliran ditukar", rReplaced: "Pegawai bertugas ditukar",
      rTellOld: function (n) { return "Maklumkan " + n + " bahawa giliran telah ditukar"; },
      rOffOn: "Ditanda tiada tugas. Giliran seterusnya dianjak satu, jadi tiada sesiapa terlepas giliran.",
      rOffOff: "Tanda tiada tugas dibatalkan. Giliran dikembalikan seperti asal.",
      rSentMark: function (ch, n) { return ch + " kepada " + n + " ditanda sudah dihantar"; },
      rUnmark: function (ch, n) { return ch + " kepada " + n + " ditanda belum dihantar"; },
      rChipAria: function (label, n) { return label + ", " + n; },
      rNothingToPrint: "Belum ada giliran untuk dicetak.",
      rTo: " hingga ",
      chEmail: "Emel", chCal: "Kalendar", chWa: "WhatsApp",
      lmoBanner: function (list) { return "Last Man Out: notis untuk " + list + " perlu dihantar."; },
      lmoSend: "Hantar", lmoMore: function (n) { return "+" + n + " lagi"; },
      lmoList: "1. Semua lampu ditutup\n2. Penyaman udara & kipas dimatikan\n3. Suis utama dimatikan / palam dicabut\n4. Pintu utama & tingkap dikunci\n5. Tandatangan borang & catat masa keluar",
      lmoSignoff: "Setiausaha Jabatan JPPP, KPTM Kuantan",
      lmoWaMsg: function (name, oneDay, period, from, list, signoff, confirm) {
        return "Salam " + name + ",\n\nPeringatan: tuan/puan bertugas sebagai *Pegawai Last Man Out* " + (oneDay ? "hari ini" : "minggu ini") + " (" + period + ").\n\n" +
          "Sebelum pulang (sekitar " + from + "), sila pastikan:\n" + list + "\n\n" + confirm + "\n\nTerima kasih.\n" + signoff;
      },
      lmoMailSubject: function (period) { return "Giliran Last Man Out (MQS): " + period; },
      lmoMailBody: function (name, period, from, to, list, signoff, confirm) {
        return "Salam " + name + ",\n\nTuan/puan dijadualkan sebagai Pegawai Last Man Out (MQS) Jabatan JPPP pada " + period + ".\n\n" +
          "Setiap hari bertugas, sebelum meninggalkan pejabat (sekitar " + from + "–" + to + "):\n" + list + "\n\n" + confirm + "\n\n" +
          "Jemputan Google Calendar turut dihantar. Jika tidak dapat bertugas (cuti/kursus), sila maklumkan saya segera supaya giliran boleh ditukar.\n\nTerima kasih.\n" + signoff;
      },
      lmoCalText: function (n) { return "Last Man Out (MQS): " + n; },
      lmoCalDetails: function (list, confirm) { return "Tugas Pegawai Last Man Out sebelum meninggalkan pejabat:\n" + list + "\n\n" + confirm + "\n\nJadual Bertugas Last Man Out, Jabatan JPPP, KPTM Kuantan (MQS)."; },
      pRosterTitle: "Jadual Bertugas Mingguan Last Man Out (MQS)", pRosterTitleDay: "Jadual Bertugas Harian Last Man Out (MQS)",
      pDept: "Jabatan Pengurusan Perniagaan & Perakaunan, KPTM Kuantan",
      pDutyTime: function (a, b) { return "Masa bertugas: " + a + "–" + b + ", Isnin hingga Jumaat"; },
      pMqs: "Bukti audit MQS: penjimatan tenaga & keselamatan pejabat",
      pBil: "Bil.", pWeek: "Minggu / Tarikh", pName: "Nama Pegawai", pRole: "Jawatan / Program", pSign: "Tandatangan", pNote: "Catatan",
      pHoliday: "Cuti umum",
      pCheckTitle: "Senarai Semak Harian Last Man Out",
      pDate: "Tarikh", pOfficer: "Pegawai", pLights: "Lampu", pAc: "Penyaman udara", pSwitch: "Suis utama / palam",
      pDoor: "Pintu & tingkap dikunci", pTimeOut: "Masa keluar",
      pCheckedBy: "Disemak oleh: ______________________________     Tarikh: ________________",
      pPrinted: function (d) { return "Dicetak pada " + d; },
      rWebUrl: "URL web app Selesai (pilihan)", rWebUrlHint: "Salin dari Google Sheet: menu Last Man Out › Pautan Selesai",
      rBadUrl: "Itu bukan pautan web app. Ia mesti seperti https://script.google.com/macros/s/…/exec",
      rDeadline: "Had pengesahan Selesai",
      rBadDeadline: function (min) { return "Had pengesahan mesti pada atau selepas " + min + " (masa tamat bertugas, dan tidak lebih awal daripada 17:15)."; },
      rDeadlineMoved: function (t) { return "Had pengesahan Selesai dianjak ke " + t + "."; },
      rConfInSheet: "Pengesahan direkod dalam Google Sheet, tab Pengesahan.",
      rDayAria: function (d) { return d + ": status Last Man Out"; },
      rDayNone: "Belum", rDayOk: "Selesai ✓", rDayOffOpt: "Tiada tugas (cuti)", rDayOff: "Tiada tugas",
      rDaySet: function (d, st) { return d + ": " + st; },
      rDayKj: "KJ dimaklumkan", rKjPending: function (d, had) { return "Belum sahkan Selesai untuk " + d + " (had " + had + ")"; },
      lmoConfirmLine: function (url, had) {
        return url ? "Selepas tugas selesai setiap hari bertugas, tekan pautan ini dan tanda Selesai sebelum " + had + ":\n" + url + "\nJika tiada pengesahan, Ketua Jabatan akan dimaklumkan."
          : "Selepas tugas selesai setiap hari bertugas, maklumkan SELESAI kepada Setiausaha Jabatan melalui WhatsApp atau emel sebelum " + had + ". Jika tiada pengesahan, Ketua Jabatan akan dimaklumkan.";
      },
      lmoKjSubject: function (pic, d) { return "Last Man Out " + d + ": " + pic + " belum mengesahkan tugas"; },
      lmoKjMsg: function (kj, pic, d, had, signoff) {
        return "Salam " + kj + ",\n\nUntuk makluman, Pegawai Last Man Out pada " + d + ", " + pic + ", belum mengesahkan senarai semak Last Man Out (MQS) sehingga " + had + ". Saya sedang membuat susulan.\n\nTerima kasih.\n" + signoff;
      },
      lmoKjBanner: function (pic, d, had) { return "Last Man Out: " + pic + " belum sahkan Selesai untuk " + d + " (had " + had + ")."; },
      kjMark: "Tanda Selesai", kjMarkAria: function (pic, d) { return "Tanda Selesai: " + pic + ", " + d; },
      kjMarked: function (pic, d) { return "Ditanda Selesai: " + pic + ", " + d; },
      kjWa: "WhatsApp KJ", kjEmail: "Emel KJ", kjAdd: "Tambah kenalan Ketua Jabatan",
      kjTold: function (pic, d) { return "Ketua Jabatan dimaklumkan tentang " + pic + ", " + d; },
      q: {
        "do":       { title: "Buat",      sub: "Segera dan penting",              hint: "Siapkan ini dahulu.",                 empty: "Belum ada apa-apa. Tugasan segera + penting masuk di sini." },
        "schedule": { title: "Jadualkan", sub: "Penting, tidak segera",           hint: "Tetapkan tarikh untuk setiap satu.",  empty: "Tambah perkara yang membawa anda ke hadapan: belajar, kesihatan, perancangan." },
        "delegate": { title: "Agihkan",   sub: "Segera, tidak penting",           hint: "Tulis siapa yang akan uruskan.",      empty: "Belum ada apa-apa untuk diserahkan." },
        "delete":   { title: "Buang",     sub: "Tidak segera dan tidak penting",  hint: "Lepaskan dengan sengaja.",            empty: "Tiada apa-apa untuk dibuang." }
      },
      ins: {
        finished: "Selesai", planned: "Terancang", reactive: "Reaktif", letGo: "Dilepaskan",
        plannedHelp: "dari Jadualkan", reactiveHelp: "Buat + Agihkan", letGoHelp: "dibuang dengan sengaja",
        mix: "Apa yang anda siapkan, ikut kotak", perDay: "Selesai setiap hari", whatItMeans: "Apa maksudnya",
        balance: "Skor keseimbangan", vsLast: function (d) { return d === 0 ? "sama seperti minggu sebelumnya" : (d > 0 ? "+" + d : d) + " mata berbanding minggu sebelumnya"; },
        noData: "Belum ada tugasan selesai dalam 7 hari lepas. Tanda tugasan yang siap dan kembali ke sini hujung minggu.",
        reactiveHigh: function (p) { return p + "% kerja yang anda siapkan adalah kerja segera. Cuba lindungi dua slot masa minggu ini untuk tugasan Jadualkan."; },
        reactiveMid: function (p) { return p + "% kerja yang anda siapkan adalah kerja segera. Anda hampir seimbang; satu lagi tugasan terancang sehari sudah cukup."; },
        plannedGood: function (p) { return p + "% kerja yang anda siapkan telah dirancang awal. Itulah kerja yang membawa anda ke hadapan. Teruskan."; },
        promotedN: function (n) { return n + " tugasan berpindah dari Jadualkan ke Buat kerana tarikhnya sudah tiba. Mula lebih awal supaya ia tidak masuk kotak merah."; },
        droppedN: function (n) { return "Anda melepaskan " + n + " tugasan dengan sengaja. Itu " + n + " keputusan, bukan kegagalan."; },
        onlyYouN: function (n) { return n + " tugasan segera hanya boleh dibuat oleh anda. Jika ini kerap berlaku, bincang tarikh akhir lebih awal."; },
        noDateN: function (n) { return n + " tugasan Jadualkan belum ada tarikh. Tetapkan hari untuk setiap satu supaya ia tidak menjadi segera."; },
        plan: "Rancang minggu depan", balanceHelp: "Peratus kerja selesai yang dirancang (Jadualkan). Lebih tinggi lebih baik."
      },
      days: ["Ahd", "Isn", "Sel", "Rab", "Kha", "Jum", "Sab"],
      locale: "ms-MY",
      kw: ["hari ini", "harini", "esok", "malam ini", "malam ni", "petang ni", "pagi ni", "segera", "tarikh akhir", "sekarang", "deadline", "due", "asap", "urgent"]
    }
  };

  var lang = "ms";
  function T(key) {
    var dict = I18N[lang], v = dict[key] !== undefined ? dict[key] : I18N.en[key];
    if (typeof v === "function") return v.apply(null, Array.prototype.slice.call(arguments, 1));
    return v === undefined ? key : v;
  }
  function QT(q) { return I18N[lang].q[q]; }
  function INS(key) {
    var v = I18N[lang].ins[key];
    if (typeof v === "function") return v.apply(null, Array.prototype.slice.call(arguments, 1));
    return v;
  }

  /* ================================================================
     Storage and data
     ================================================================ */
  function readJSON(key, fallback) {
    var raw = null;
    try { raw = localStorage.getItem(key); } catch (e) { return fallback; }
    if (raw === null) return fallback;
    try { return JSON.parse(raw); }
    catch (e) {
      // Keep corrupt data aside instead of silently overwriting it
      try { localStorage.setItem(key + ":corrupt-" + Date.now(), raw); } catch (_) {}
      return fallback;
    }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function num(v) { return typeof v === "number" && isFinite(v) && v > 0 ? v : 0; }

  // Turn anything (old saves, imports) into a clean task object
  function normalize(t) {
    if (!t || typeof t !== "object" || typeof t.text !== "string" || !QSET[t.q]) return null;
    var text = t.text.trim().slice(0, 200);
    if (!text) return null;
    var n = {
      id: typeof t.id === "string" && t.id ? t.id.slice(0, 40) : uid(),
      text: text,
      q: t.q,
      done: t.done === true,
      created: num(t.created) || Date.now(),
      date: typeof t.date === "string" && ISO_DATE.test(t.date) ? t.date : "",
      who: typeof t.who === "string" ? t.who.slice(0, 60) : "",
      origin: QSET[t.origin] ? t.origin : t.q,
      doneAt: num(t.doneAt) || null,
      doneQ: QSET[t.doneQ] ? t.doneQ : null,
      promoted: t.promoted === true,
      notifiedAt: num(t.notifiedAt) || null,
      status: t.status === "doing" || t.status === "blocked" ? t.status : "",
      statusNote: typeof t.statusNote === "string" ? t.statusNote.slice(0, 140) : "",
      statusAt: num(t.statusAt) || null,
      remindedAt: num(t.remindedAt) || null,
      askedAt: num(t.askedAt) || null,
      reactive: t.reactive === true,
      moves: Array.isArray(t.moves) ? t.moves.filter(function (m) {
        return m && QSET[m.from] && QSET[m.to] && num(m.at);
      }).slice(-20).map(function (m) { return { from: m.from, to: m.to, at: m.at, auto: m.auto === true }; }) : []
    };
    if (n.done && !n.doneAt) n.doneAt = n.created;
    if (n.done && !n.doneQ) n.doneQ = n.q;
    if (!n.done) { n.doneAt = null; n.doneQ = null; }
    if (num(t.archivedAt)) n.archivedAt = t.archivedAt;
    if (t.dropped === true) n.dropped = true;
    return n;
  }
  function cleanList(arr, seen) {
    seen = seen || Object.create(null);
    var out = [];
    if (!Array.isArray(arr)) return out;
    arr.forEach(function (x) {
      var n = normalize(x);
      if (!n) return;
      while (seen[n.id]) n.id = uid();
      seen[n.id] = true;
      out.push(n);
    });
    return out;
  }

  var tasks = [], archive = [], meta = {}, contacts = [], rota = null;
  var CONTACTS_KEY = "eisenhower-planner:contacts";
  var ROTA_KEY = "eisenhower-planner:rota";       // Last Man Out duty rota

  /* ---------- Contacts (team members: name, WhatsApp, email) ---------- */
  // Malaysian-friendly: 012-345 6789 -> 60123456789; +60 12... -> 60123456789
  function normPhone(v) {
    var d = String(v || "").replace(/[^0-9]/g, "");
    if (!d) return "";
    if (d.indexOf("00") === 0) d = d.slice(2);
    if (d.charAt(0) === "0") d = "6" + d;
    else if (d.charAt(0) === "1" && d.length >= 9 && d.length <= 10) d = "60" + d;   // Excel dropped the leading 0
    return d.length >= 10 && d.length <= 15 ? d : "invalid";
  }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  // "Giliran LMO" column: Ya/Y/Yes/1/TRUE or Tidak/N/No/0/FALSE; anything else means "not stated"
  function yesNo(v) {
    if (v === true || v === false) return v;
    var s = String(v === null || v === undefined ? "" : v).trim().toLowerCase();
    if (/^(ya|y|yes|1|true)$/.test(s)) return true;
    if (/^(tidak|tak|n|no|0|false)$/.test(s)) return false;
    return null;
  }
  var KJ_RE = /ketua jabatan|head of department|^kj$/i;
  // Everyone with a role takes turns, except the Head of Department
  function defaultRota(role) { return !!role && !KJ_RE.test(role); }
  function cleanRole(v) { return String(v || "").trim().replace(/\s+/g, " ").slice(0, 40); }
  function cleanProg(v) { return String(v || "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 20); }
  function normContact(c) {
    if (!c || typeof c !== "object") return null;
    var name = String(c.name || "").trim().slice(0, 60);
    var phone = c.phone ? normPhone(c.phone) : "";
    var email = String(c.email || "").trim().slice(0, 120);
    if (phone === "invalid") phone = "";
    if (email && !validEmail(email)) email = "";
    if (!name) return null;   // name-only contacts are allowed (staff list for the rota)
    var role = cleanRole(c.role), prog = cleanProg(c.prog), rota = yesNo(c.rota);
    return { id: typeof c.id === "string" && c.id ? c.id.slice(0, 40) : uid(), name: name, phone: phone, email: email,
      role: role, prog: prog, rota: rota === null ? defaultRota(role) : rota };
  }
  // Same name = same person: filled-in fields from later rows win; "rota" changes only when stated
  function cleanContacts(arr) {
    var out = [], byName = Object.create(null);
    (Array.isArray(arr) ? arr : []).forEach(function (c) {
      var n = normContact(c);
      if (!n) return;
      var k = n.name.toLowerCase(), o = byName[k];
      if (o) {
        if (yesNo(c.rota) !== null || (!o.role && n.role)) o.rota = n.rota;
        ["phone", "email", "role", "prog"].forEach(function (f) { if (n[f]) o[f] = n[f]; });
        return;
      }
      byName[k] = n; out.push(n);
    });
    return out;
  }
  function contactById(id) {
    if (!id) return null;
    for (var i = 0; i < contacts.length; i++) if (contacts[i].id === id) return contacts[i];
    return null;
  }
  function reachable(c) { return !!(c && (c.phone || c.email)); }
  function contactFor(name) {
    var k = String(name || "").trim().toLowerCase();
    if (!k) return null;
    for (var i = 0; i < contacts.length; i++) if (contacts[i].name.toLowerCase() === k) return contacts[i];
    return null;
  }
  function saveContacts() {
    if (!writeJSON(CONTACTS_KEY, contacts)) showToast(T("saveFail"), false);
    renderContactOptions();
  }
  function renderContactOptions() {
    var dl = document.getElementById("contactList");
    if (!dl) return;
    dl.textContent = "";
    contacts.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.name;
      o.label = [c.phone ? "+" + c.phone : "", c.email].filter(Boolean).join(" \u00b7 ") || [c.role, c.prog].filter(Boolean).join(" \u00b7 ");
      dl.appendChild(o);
    });
  }

  function loadAll() {
    contacts = cleanContacts(readJSON(CONTACTS_KEY, []));
    loadRota();
    var seen = Object.create(null);
    tasks = cleanList(readJSON(KEY, []), seen);
    archive = cleanList(readJSON(ARCHIVE_KEY, []), seen);
    var m = readJSON(META_KEY, {});
    meta = m && typeof m === "object" ? m : {};
  }
  function pruneArchive() {
    var cutoff = Date.now() - ARCHIVE_DAYS * DAY;
    archive = archive.filter(function (a) { return (a.archivedAt || a.doneAt || a.created) > cutoff; });
  }
  function save() {
    pruneArchive();
    var ok = writeJSON(KEY, tasks) && writeJSON(ARCHIVE_KEY, archive);
    if (!ok) showToast(T("saveFail"), false);
    return ok;
  }
  function saveMeta() { writeJSON(META_KEY, meta); }
  function commit() { save(); render(); }

  function find(id) {
    for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i];
    return null;
  }

  function todayISO(d) {
    d = d ? new Date(d) : new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function moveTask(t, to, auto) {
    if (!QSET[to] || t.q === to) return;
    t.moves.push({ from: t.q, to: to, at: Date.now(), auto: !!auto });
    if (t.moves.length > 20) t.moves.shift();
    t.q = to;
    if (to !== "do") { t.promoted = false; t.reactive = false; }
    if (t.done) t.doneQ = to;
  }
  function setDone(t, done) {
    t.done = done;
    t.doneAt = done ? Date.now() : null;
    t.doneQ = done ? t.q : null;
  }

  // Scheduled tasks whose date has arrived move to Do on their own
  function promoteDue() {
    var today = todayISO(), n = 0;
    tasks.forEach(function (t) {
      if (t.q === "schedule" && !t.done && t.date && t.date <= today) {
        moveTask(t, "do", true);
        t.promoted = true;
        n++;
      }
    });
    return n;
  }

  /* ================================================================
     Elements and small helpers
     ================================================================ */
  var $ = function (id) { return document.getElementById(id); };
  var matrix = $("matrix"), form = $("composer"), input = $("taskInput");

  function h(tag, props, children) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "text") el.textContent = v;
        else if (k === "html") el.innerHTML = v;           // only ever used with built-in icon strings
        else if (k === "class") el.className = v;
        else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), v);
        else if (k === "checked" || k === "selected" || k === "value") el[k] = v;
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  function announce(msg) {
    var a = $("announcer");
    a.textContent = "";
    setTimeout(function () { a.textContent = msg; }, 30);
  }

  /* ================================================================
     Rendering the matrix
     ================================================================ */
  function render() {
    // Remember keyboard focus so it survives the re-render
    var active = document.activeElement, focusId = null, focusRole = null, focusQ = null;
    if (active && matrix.contains(active)) {
      var li = active.closest(".task");
      if (li) { focusId = li.getAttribute("data-id"); focusRole = active.getAttribute("data-role"); }
      var sec = active.closest(".quad");
      if (sec) focusQ = sec.getAttribute("data-q");
    }

    matrix.querySelectorAll(".quad").forEach(function (n) { n.remove(); });
    taskRefreshers = Object.create(null);
    QIDS.forEach(function (q) { matrix.appendChild(renderQuadrant(q)); });
    renderProgress();

    if (focusId) {
      var target = matrix.querySelector('.task[data-id="' + cssEscape(focusId) + '"] [data-role="' + focusRole + '"]');
      if (target) target.focus();
      else {
        var q = matrix.querySelector('.quad[data-q="' + focusQ + '"]');
        if (q) q.focus();
      }
    }
  }
  var taskRefreshers = Object.create(null);
  function refreshAllShares() { Object.keys(taskRefreshers).forEach(function (k) { taskRefreshers[k](); }); }
  function longDate(iso) {
    var p = iso.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(T("locale"), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function escapeHtml(x) { return String(x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function cssEscape(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&"); }

  function sortItems(q) {
    return function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (q === "schedule") {
        var da = a.date || "9999-99-99", db = b.date || "9999-99-99";
        if (da !== db) return da < db ? -1 : 1;
      }
      return a.created - b.created;
    };
  }

  function renderQuadrant(q) {
    var info = QT(q);
    var items = tasks.filter(function (t) { return t.q === q; }).sort(sortItems(q));
    var body;
    if (items.length) {
      body = h("ul", { class: "task-list" });
      items.forEach(function (t) { body.appendChild(renderTask(t)); });
    } else {
      body = h("div", { class: "empty", text: info.empty });
    }

    var doneHere = items.filter(function (t) { return t.done; }).length;
    var footAction = null;
    if (q === "delete" && items.length) {
      footAction = h("button", { class: "link-btn", type: "button", text: T("deleteAll"), onclick: function () {
        removeWhere(function (t) { return t.q === "delete"; }, T("tasksDeleted", items.length));
      } });
    } else if (doneHere) {
      footAction = h("button", { class: "link-btn", type: "button", text: T("clearN", doneHere), onclick: function () {
        removeWhere(function (t) { return t.q === q && t.done; }, T("tasksCleared", doneHere));
      } });
    }
    if (q === "delegate" && items.some(function (t) { return !t.done && t.who; })) {
      footAction = h("div", { class: "foot-actions" }, [
        h("button", { class: "cal-link send-all", type: "button", "data-role": "sendall",
          html: ICONS.chat + "<span>" + escapeHtml(T("sendByPic")) + "</span>", onclick: function () { openSendAll(); } }),
        footAction
      ]);
    }

    var section = h("section", { class: "quad", "data-q": q, tabindex: "-1", "aria-label": info.title + ", " + info.sub }, [
      h("div", { class: "quad-head" }, [
        h("div", null, [
          h("h2", { class: "quad-title", text: info.title }),
          h("p", { class: "quad-sub", text: info.sub })
        ]),
        h("span", { class: "quad-count", text: String(items.length), title: T("nTasks", items.length) })
      ]),
      body,
      h("div", { class: "quad-foot" }, [h("p", { class: "quad-hint", text: info.hint }), footAction])
    ]);

    section.addEventListener("dragover", function (e) { e.preventDefault(); section.classList.add("drag-over"); });
    section.addEventListener("dragleave", function (e) {
      if (!section.contains(e.relatedTarget)) section.classList.remove("drag-over");
    });
    section.addEventListener("drop", function (e) {
      e.preventDefault();
      section.classList.remove("drag-over");
      var t = find(e.dataTransfer.getData("text/plain"));
      if (t && t.q !== q) { moveTask(t, q); commit(); announce(T("movedTo", QT(q).title)); flash(q); }
    });
    return section;
  }

  function renderTask(t) {
    var q = t.q;
    var li = h("li", { class: "task" + (t.done ? " done" : ""), draggable: "true", "data-id": t.id });
    li.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", t.id);
      e.dataTransfer.effectAllowed = "move";
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", function () { li.classList.remove("dragging"); });

    var check = h("input", {
      type: "checkbox", class: "check", "data-role": "check", checked: t.done, "aria-label": T("markDone", t.text),
      onchange: function () { setDone(t, check.checked); if (t.q === "delegate") t.statusAt = Date.now(); commit(); }
    });

    var text = h("p", { class: "task-text", text: t.text, title: T("dblEdit") });
    text.addEventListener("dblclick", function () { startEdit(t, text); });
    var body = h("div", { class: "task-body" }, [text]);

    var badges = [];
    if (t.promoted && q === "do") badges.push(h("span", { class: "badge badge-schedule", text: T("fromSchedule") }));
    if (t.reactive && q === "do") badges.push(h("span", { class: "badge", text: T("onlyYou") }));

    if (q === "schedule" || q === "delegate") {
      var isDel = q === "delegate";
      var whoIn = isDel ? h("input", {
        class: "chip-input chip-who", "data-role": "who", type: "text", value: t.who, list: "contactList",
        autocomplete: "off", placeholder: T("whoPh"), "aria-label": T("delegatedTo"), maxlength: "60"
      }) : null;
      var dateIn = h("input", {
        class: "chip-input", "data-role": "date", type: "date", value: t.date,
        "aria-label": isDel ? T("dueDate") : T("schedDate"), title: isDel ? T("dueDate") : T("schedDate")
      });
      var overdueTag = h("span", { class: "badge badge-overdue", text: T("overdue") });
      var share = h("span", { class: "share" });
      function refreshMeta() {
        var od = !!t.date && t.date < todayISO() && !t.done;
        dateIn.classList.toggle("overdue", od);
        overdueTag.hidden = !od;
        share.textContent = "";
        if (t.done) return;
        var c = isDel ? contactFor(t.who) : null;
        var calUrl = t.date ? gcalUrl(t, c && c.email) : "";
        if (calUrl) share.appendChild(h("a", { class: "cal-link", "data-role": "gcal", target: "_blank", rel: "noopener",
          href: calUrl, title: T("addToCal", t.text), "aria-label": T("addToCal", t.text),
          html: ICONS.cal + "<span>Google Calendar</span>" }));
        if (!isDel) return;
        if (reachable(c)) {
          var due = t.date ? longDate(t.date) : "";
          var msg = T("msgBody", c.name, t.text, due, calUrl);
          var mark = function () { t.notifiedAt = Date.now(); save(); setTimeout(refreshMeta, 0); };
          if (c.phone) share.appendChild(h("a", { class: "cal-link wa-link", "data-role": "wa", target: "_blank", rel: "noopener",
            href: "https://wa.me/" + c.phone + "?text=" + encodeURIComponent(msg),
            "aria-label": T("waAria", c.name, t.text), title: T("waAria", c.name, t.text),
            html: ICONS.chat + "<span>WhatsApp</span>", onclick: mark }));
          if (c.email) share.appendChild(h("a", { class: "cal-link mail-link", "data-role": "mail",
            href: "mailto:" + encodeURIComponent(c.email) + "?subject=" + encodeURIComponent(T("msgSubject", t.text)) + "&body=" + encodeURIComponent(msg.replace(/\*/g, "")),
            "aria-label": T("mailAria", c.name, t.text), title: T("mailAria", c.name, t.text),
            html: ICONS.mail + "<span>" + escapeHtml(T("cEmail")) + "</span>", onclick: mark }));
        } else if (t.who) {
          share.appendChild(contactFixButton(c, t.who, null, { "data-role": "addc" }));
        }
        if (t.notifiedAt) share.appendChild(h("span", { class: "badge badge-ok", text: "\u2713 " + T("notified") }));
      }
      refreshMeta();
      // Save without re-rendering, so typing a date by keyboard is not interrupted
      dateIn.addEventListener("change", function () {
        t.date = ISO_DATE.test(dateIn.value) ? dateIn.value : "";
        save(); refreshMeta();
      });
      if (whoIn) whoIn.addEventListener("change", function () {
        var v = whoIn.value.trim().slice(0, 60), c = contactFor(v);
        t.who = c ? c.name : v;
        if (c) whoIn.value = c.name;
        save(); refreshMeta();
      });
      if (whoIn) badges.push(whoIn);
      if (isDel) badges.push(statusSelect(t, true));
      badges.push(dateIn, overdueTag, share);
      taskRefreshers[t.id] = refreshMeta;
    }
    if (badges.length) body.appendChild(h("div", { class: "task-meta" }, badges));

    var move = h("select", { class: "move-select", "data-role": "move", "aria-label": T("moveTo") },
      QIDS.map(function (o) {
        return h("option", { value: o, text: o === q ? T("moveLabel") : QT(o).title, selected: o === q });
      })
    );
    move.addEventListener("change", function () {
      var to = move.value;
      moveTask(t, to);
      commit();
      announce(T("movedTo", QT(to).title));
      flash(to);
    });

    var actions = h("div", { class: "task-actions" }, [
      move,
      h("button", { class: "tiny-btn", type: "button", "data-role": "edit", "aria-label": T("editTask"), html: ICONS.edit,
        onclick: function () { startEdit(t, text); } }),
      h("button", { class: "tiny-btn", type: "button", "data-role": "del", "aria-label": T("deleteTask"), html: ICONS.trash,
        onclick: function () { removeWhere(function (x) { return x.id === t.id; }, T("taskDeleted")); } })
    ]);

    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(actions);
    return li;
  }

  // Inline edit that does not rebuild the page (so clicks elsewhere still work)
  function startEdit(t, textEl) {
    if (!textEl.isConnected) return;
    var field = h("input", { class: "task-edit", type: "text", value: t.text, maxlength: "200", "aria-label": T("editTask") });
    var finished = false;
    function finish(keep) {
      if (finished) return;
      finished = true;
      var v = field.value.trim();
      if (keep && v && v !== t.text) {
        t.text = v;
        textEl.textContent = v;
        save();
      }
      if (field.isConnected) field.replaceWith(textEl);
      var cb = textEl.parentNode && textEl.parentNode.parentNode && textEl.parentNode.parentNode.querySelector(".check");
      if (cb) cb.setAttribute("aria-label", T("markDone", t.text));
    }
    field.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); finish(true); focusRole(t.id, "edit"); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); focusRole(t.id, "edit"); }
    });
    field.addEventListener("blur", function () { finish(true); });
    textEl.replaceWith(field);
    field.focus();
    field.select();
  }
  function focusRole(id, role) {
    var el = matrix.querySelector('.task[data-id="' + cssEscape(id) + '"] [data-role="' + role + '"]');
    if (el) el.focus();
  }

  function renderProgress() {
    var counted = tasks.filter(function (t) { return t.q !== "delete"; });
    var done = counted.filter(function (t) { return t.done; }).length;
    var total = counted.length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    $("progressText").innerHTML = T("progressText", done, total);
    $("barFill").style.width = pct + "%";
    $("bar").setAttribute("aria-valuenow", pct);
    $("clearDone").disabled = !tasks.some(function (t) { return t.done; });
    $("progress").hidden = tasks.length === 0;
    $("starter").hidden = tasks.length > 0 || archive.length > 0;
    renderReviewBanner();
    if (typeof renderRemindBanner === "function") renderRemindBanner();
    renderLmoBanner();
    renderKjBanner();
  }

  function flash(q) {
    var sec = matrix.querySelector('.quad[data-q="' + q + '"]');
    if (!sec) return;
    sec.classList.remove("flash");
    void sec.offsetWidth;
    sec.classList.add("flash");
  }

  /* ================================================================
     Composer: guided triage
     ================================================================ */
  var autoUrgent = false;   // true when urgency was set by keyword detection, not by the user

  function radioVal(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }
  function setRadio(name, val) {
    form.querySelectorAll('input[name="' + name + '"]').forEach(function (r) { r.checked = val !== null && r.value === val; });
  }
  function needsOther() { return radioVal("urgent") === "1" && radioVal("important") === "0"; }

  // Returns the quadrant, or null if questions are unanswered
  function currentQuadrant() {
    var u = radioVal("urgent"), i = radioVal("important");
    if (u === null || i === null) return null;
    if (u === "1" && i === "1") return "do";
    if (i === "1") return "schedule";
    if (u === "1") {
      var o = radioVal("other");
      if (o === null) return null;
      return o === "1" ? "delegate" : "do";
    }
    return "delete";
  }

  function renderDestination() {
    $("qOther").hidden = !needsOther();
    if (!needsOther()) setRadio("other", null);
    var q = currentQuadrant();
    var dest = $("destination");
    dest.textContent = "";
    if (!q) {
      dest.appendChild(h("span", { class: "dest-hint", text: T("answerFirst") }));
      return;
    }
    dest.appendChild(document.createTextNode(T("goesTo")));
    var pill = h("span", { class: "pill", text: QT(q).title });
    pill.style.setProperty("--q", "var(--" + q + "-text)");
    pill.style.setProperty("--q-tint", "var(--" + q + "-tint)");
    dest.appendChild(pill);
    ["qUrgent", "qImportant", "qOther"].forEach(function (id) { $(id).classList.remove("missing"); });
  }

  function keywordRegex() {
    var words = I18N.en.kw.concat(I18N.ms.kw).map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    words.sort(function (a, b) { return b.length - a.length; });
    return new RegExp("(^|[^\\p{L}])(" + words.join("|") + ")(?=$|[^\\p{L}])", "iu");
  }
  var KW = keywordRegex();

  function detectKeywords() {
    var m = input.value.match(KW);
    var det = $("detect");
    if (m && (radioVal("urgent") === null || autoUrgent)) {
      setRadio("urgent", "1");
      autoUrgent = true;
      det.textContent = T("detected", m[2]);
      det.hidden = false;
      renderDestination();
    } else if (!m && autoUrgent) {
      setRadio("urgent", null);
      autoUrgent = false;
      det.hidden = true;
      renderDestination();
    }
  }

  function resetComposer() {
    input.value = "";
    setRadio("urgent", null); setRadio("important", null); setRadio("other", null);
    autoUrgent = false;
    $("detect").hidden = true;
    renderDestination();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    var q = currentQuadrant();
    if (!q) {
      var missing = [];
      if (radioVal("urgent") === null) missing.push("qUrgent");
      if (radioVal("important") === null) missing.push("qImportant");
      if (needsOther() && radioVal("other") === null) missing.push("qOther");
      missing.forEach(function (id) { $(id).classList.add("missing"); });
      announce(T("needAnswers"));
      var first = $(missing[0]).querySelector("input");
      if (first) first.focus();
      return;
    }
    var t = normalize({ id: uid(), text: text, q: q, done: false, created: Date.now(), origin: q,
      reactive: q === "do" && radioVal("urgent") === "1" && radioVal("important") === "0" });
    tasks.push(t);
    resetComposer();
    commit();
    flash(q);
    announce(T("addedTo", QT(q).title));
    if (q === "schedule") focusRole(t.id, "date");
    else if (q === "delegate") focusRole(t.id, "who");
    else input.focus();
  });

  form.addEventListener("change", function (e) {
    if (e.target.name === "urgent") { autoUrgent = false; $("detect").hidden = true; }
    renderDestination();
  });
  input.addEventListener("input", detectKeywords);

  /* ================================================================
     Removing, undo, toast
     ================================================================ */
  var lastRemoved = null, toastTimer = null;

  function removeWhere(predicate, message) {
    var removed = [], archivedIds = [];
    tasks = tasks.filter(function (t) {
      if (!predicate(t)) return true;
      removed.push(t);
      // Finished tasks and tasks let go from the Delete box are kept for the weekly Insight
      if (t.done || t.q === "delete") {
        var copy = normalize(t);
        copy.archivedAt = Date.now();
        if (!t.done) copy.dropped = true;
        archive.push(copy);
        archivedIds.push(copy.id);
      }
      return false;
    });
    if (!removed.length) return;
    lastRemoved = { tasks: removed, archivedIds: archivedIds };
    commit();
    showToast(message, true);
  }

  function showToast(message, undoable) {
    $("toastText").textContent = message;
    $("toastUndo").hidden = !undoable;
    if (!undoable) lastRemoved = null;
    $("toast").hidden = false;
    startToastTimer();
  }
  function startToastTimer() {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $("toast").hidden = true; lastRemoved = null; }, 8000);
  }
  ["mouseenter", "focusin"].forEach(function (ev) { $("toast").addEventListener(ev, function () { clearTimeout(toastTimer); }); });
  ["mouseleave", "focusout"].forEach(function (ev) { $("toast").addEventListener(ev, startToastTimer); });

  $("toastUndo").addEventListener("click", function () {
    if (lastRemoved) {
      var ids = Object.create(null);
      lastRemoved.archivedIds.forEach(function (id) { ids[id] = true; });
      archive = archive.filter(function (a) { return !ids[a.id]; });
      tasks = tasks.concat(lastRemoved.tasks);
      lastRemoved = null;
      commit();
    }
    $("toast").hidden = true;
  });

  $("clearDone").addEventListener("click", function () {
    var n = tasks.filter(function (t) { return t.done; }).length;
    removeWhere(function (t) { return t.done; }, T("tasksCleared", n));
  });

  /* ================================================================
     Insight: "Where did my time go?"
     ================================================================ */
  function insightData() {
    var now = Date.now();
    var all = tasks.concat(archive);
    var done = all.filter(function (x) { return x.done && x.doneAt; });
    var cur = done.filter(function (x) { return x.doneAt > now - 7 * DAY; });
    var prev = done.filter(function (x) { return x.doneAt <= now - 7 * DAY && x.doneAt > now - 14 * DAY; });
    function count(list) {
      var c = { "do": 0, schedule: 0, delegate: 0, "delete": 0 };
      list.forEach(function (x) { c[x.doneQ || x.q]++; });
      return c;
    }
    var c = count(cur), pc = count(prev);
    var total = cur.length;
    var planned = total ? Math.round((c.schedule / total) * 100) : 0;
    var reactive = total ? Math.round(((c["do"] + c.delegate) / total) * 100) : 0;
    var prevPlanned = prev.length ? Math.round((pc.schedule / prev.length) * 100) : null;

    var promoted = all.filter(function (x) {
      return x.moves.some(function (m) { return m.auto && m.at > now - 7 * DAY; });
    }).length;
    var dropped = archive.filter(function (x) { return x.dropped && x.archivedAt > now - 7 * DAY; }).length;
    var onlyYou = cur.filter(function (x) { return x.reactive; }).length;
    var noDate = tasks.filter(function (x) { return x.q === "schedule" && !x.done && !x.date; }).length;

    // Per-day breakdown, oldest first
    var days = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now - i * DAY), key = todayISO(d);
      var list = cur.filter(function (x) { return todayISO(x.doneAt) === key; });
      days.push({ label: T("days")[d.getDay()], counts: count(list), total: list.length, today: i === 0 });
    }
    return { total: total, counts: c, planned: planned, reactive: reactive, prevPlanned: prevPlanned,
      promoted: promoted, dropped: dropped, onlyYou: onlyYou, noDate: noDate, days: days };
  }

  function renderInsight() {
    var d = insightData();
    var root = $("insightBody");
    root.textContent = "";

    function tile(value, label, help, cls) {
      return h("div", { class: "tile " + (cls || "") }, [
        h("p", { class: "tile-value", text: value }),
        h("p", { class: "tile-label", text: label }),
        h("p", { class: "tile-help", text: help })
      ]);
    }
    root.appendChild(h("div", { class: "tiles" }, [
      tile(String(d.total), INS("finished"), T("last7")),
      tile(d.planned + "%", INS("planned"), INS("plannedHelp"), "t-schedule"),
      tile(d.reactive + "%", INS("reactive"), INS("reactiveHelp"), "t-do"),
      tile(String(d.dropped), INS("letGo"), INS("letGoHelp"), "t-delete")
    ]));

    if (!d.total) {
      root.appendChild(h("p", { class: "ins-empty", text: INS("noData") }));
      return;
    }

    // Balance score
    var delta = d.prevPlanned === null ? null : d.planned - d.prevPlanned;
    var bal = h("div", { class: "balance" }, [
      h("div", null, [
        h("p", { class: "ins-h", text: INS("balance") }),
        h("p", { class: "ins-small", text: INS("balanceHelp") })
      ]),
      h("div", { class: "balance-score" }, [
        h("span", { class: "big", text: String(d.planned) }),
        delta === null ? null : h("span", { class: "delta " + (delta > 0 ? "up" : delta < 0 ? "down" : ""), text: (delta > 0 ? "\u25B2 " : delta < 0 ? "\u25BC " : "") + INS("vsLast", delta) })
      ])
    ]);
    root.appendChild(bal);

    // Stacked mix bar
    var stack = h("div", { class: "stack", role: "img", "aria-label": QIDS.map(function (q) { return QT(q).title + " " + d.counts[q]; }).join(", ") });
    var legend = h("ul", { class: "legend" });
    QIDS.forEach(function (q) {
      var n = d.counts[q];
      if (n) {
        var seg = h("span", { class: "seg-" + q, title: QT(q).title + ": " + n });
        seg.style.flexGrow = n;
        stack.appendChild(seg);
      }
      legend.appendChild(h("li", null, [h("i", { class: "seg-" + q }), document.createTextNode(QT(q).title + " " + n)]));
    });
    root.appendChild(h("p", { class: "ins-h", text: INS("mix") }));
    root.appendChild(stack);
    root.appendChild(legend);

    // Per-day columns
    var max = Math.max.apply(null, d.days.map(function (x) { return x.total; }).concat([1]));
    var cols = h("div", { class: "days", role: "img", "aria-label": d.days.map(function (x) { return x.label + " " + x.total; }).join(", ") });
    d.days.forEach(function (day) {
      var bar = h("div", { class: "day-bar" });
      bar.style.height = Math.round((day.total / max) * 100) + "%";
      QIDS.forEach(function (q) {
        if (day.counts[q]) {
          var s = h("span", { class: "seg-" + q });
          s.style.flexGrow = day.counts[q];
          bar.appendChild(s);
        }
      });
      cols.appendChild(h("div", { class: "day" + (day.today ? " is-today" : "") }, [
        h("span", { class: "day-n", text: day.total ? String(day.total) : "" }),
        h("div", { class: "day-track" }, [bar]),
        h("span", { class: "day-l", text: day.label })
      ]));
    });
    root.appendChild(h("p", { class: "ins-h", text: INS("perDay") }));
    root.appendChild(cols);

    // Coaching sentences
    var notes = [];
    if (d.reactive >= 60) notes.push(INS("reactiveHigh", d.reactive));
    else if (d.planned >= 40) notes.push(INS("plannedGood", d.planned));
    else notes.push(INS("reactiveMid", d.reactive));
    if (d.promoted) notes.push(INS("promotedN", d.promoted));
    if (d.onlyYou) notes.push(INS("onlyYouN", d.onlyYou));
    if (d.dropped) notes.push(INS("droppedN", d.dropped));
    if (d.noDate) notes.push(INS("noDateN", d.noDate));
    root.appendChild(h("p", { class: "ins-h", text: INS("whatItMeans") }));
    var ul = h("ul", { class: "notes" });
    notes.forEach(function (n) { ul.appendChild(h("li", { text: n })); });
    root.appendChild(ul);

    root.appendChild(h("button", { class: "primary-btn", type: "button", text: INS("plan"), onclick: function () {
      closeInsight();
      setRadio("important", "1"); setRadio("urgent", "0"); renderDestination();
      input.focus();
    } }));
  }

  var lastFocus = null;
  function openInsight() {
    lastFocus = document.activeElement;
    renderInsight();
    var dlg = $("insight");
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    meta.lastReview = Date.now();
    saveMeta();
    renderReviewBanner();
  }
  function closeInsight() {
    var dlg = $("insight");
    if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
  }
  $("insightBtn").addEventListener("click", openInsight);
  $("insightClose").addEventListener("click", closeInsight);
  $("insight").addEventListener("close", function () { if (lastFocus && lastFocus.focus) lastFocus.focus(); });
  $("insight").addEventListener("click", function (e) { if (e.target === e.currentTarget) closeInsight(); });

  function renderReviewBanner() {
    var now = Date.now();
    var recentDone = tasks.concat(archive).filter(function (x) { return x.done && x.doneAt > now - 7 * DAY; }).length;
    var due = recentDone >= 3 && (!meta.lastReview || meta.lastReview < now - 7 * DAY);
    $("reviewBanner").hidden = !due;
  }
  $("reviewOpen").addEventListener("click", openInsight);
  $("reviewDismiss").addEventListener("click", function () {
    meta.lastReview = Date.now(); saveMeta(); renderReviewBanner();
  });

  /* ================================================================
     Sample week (for first-time users and live demos)
     ================================================================ */
  function sampleData() {
    var now = Date.now(), today = todayISO();
    function at(daysAgo, hour) { var d = new Date(now - daysAgo * DAY); d.setHours(hour, 0, 0, 0); return Math.min(d.getTime(), now - 60000); }
    function dateIn(days) { return todayISO(now + days * DAY); }
    var bm = lang === "ms";
    var L = function (ms, en) { return bm ? ms : en; };

    var cur = [
      { text: L("Siapkan minit Mesyuarat Jabatan Bil. 3/2026", "Finish the minutes of Department Meeting 3/2026"), q: "do", created: at(1, 9) },
      { text: L("Edarkan memo mesyuarat tergempar kepada semua staf", "Circulate the emergency meeting memo to all staff"), q: "do", created: at(0, 8), reactive: true },
      { text: L("Sediakan agenda Mesyuarat Jabatan akan datang", "Prepare the agenda for the next department meeting"), q: "schedule", date: dateIn(2), created: at(2, 10) },
      { text: L("Kemas kini fail meja (MQS)", "Update the desk file (MQS)"), q: "schedule", date: "", created: at(1, 15) },
      { text: L("Semak rekod Last Man Out minggu ini", "Check this week's Last Man Out records"), q: "schedule", date: dateIn(1), created: at(0, 7) },
      { text: L("Kemas kini senarai kehadiran mesyuarat", "Update the meeting attendance list"), q: "delegate", who: "Aiman", date: dateIn(1), status: "doing", statusAt: at(1, 16), statusNote: L("Separuh siap", "Half done"), notifiedAt: at(1, 12), created: at(1, 11) },
      { text: L("Tempah bilik mesyuarat untuk Mesyuarat Jabatan", "Book the meeting room for the department meeting"), q: "delegate", who: "Siti", date: dateIn(-1), notifiedAt: at(6, 10), created: at(6, 9) },
      { text: L("Hadiri setiap webinar vendor yang dijemput", "Join every vendor webinar you are invited to"), q: "delete", created: at(0, 21) }
    ];
    // One scheduled task that is already due, to show automatic promotion
    cur.push({ text: L("Draf edaran jabatan untuk semester baharu", "Draft the department circular for the new semester"), q: "schedule", date: todayISO(now - DAY), created: at(5, 9) });

    function doneItem(ms, en, q, daysAgo, hour, extra) {
      var o = { text: L(ms, en), q: q, done: true, doneQ: q, created: at(daysAgo + 1, 8), doneAt: at(daysAgo, hour), archivedAt: at(daysAgo, hour + 1) };
      Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
      return o;
    }
    var arch = [
      // This week
      doneItem("Isi borang tuntutan perjalanan", "Fill in the travel claim form", "do", 6, 10),
      doneItem("Jawab emel pertanyaan pensyarah", "Answer lecturers' email queries", "do", 6, 15),
      doneItem("Betulkan draf minit sebelum diedarkan", "Correct the draft minutes before circulating", "do", 5, 11, { moves: [{ from: "schedule", to: "do", at: at(5, 0), auto: true }], promoted: true, origin: "schedule" }),
      doneItem("Susun fail meja mengikut format MQS", "Organise the desk file in MQS format", "schedule", 5, 20),
      doneItem("Cetak & edarkan memo jabatan", "Print & circulate the department memo", "delegate", 4, 9, { who: "Siti" }),
      doneItem("Mesyuarat tergempar jabatan", "Emergency department meeting", "do", 4, 14, { reactive: true }),
      doneItem("Rancang takwim mesyuarat semester", "Plan the semester meeting calendar", "schedule", 3, 21),
      doneItem("Hantar laporan bulanan jabatan", "Submit the monthly department report", "do", 3, 16),
      doneItem("Sediakan jadual Last Man Out bulan depan", "Prepare next month's Last Man Out roster", "schedule", 2, 7),
      doneItem("Tempah bilik mesyuarat untuk bengkel", "Book a meeting room for the workshop", "delegate", 2, 10, { who: "Hafiz" }),
      doneItem("Kemas kini senarai semak dokumen MQS", "Update the MQS document checklist", "schedule", 1, 22),
      doneItem("Balas panggilan segera dari pejabat Pengarah", "Return an urgent call from the Director's office", "do", 1, 12, { reactive: true }),
      doneItem("Failkan minit mesyuarat yang telah disahkan", "File the confirmed meeting minutes", "schedule", 0, 8),
      // Let go on purpose this week
      { text: L("Format semula semua templat surat lama", "Reformat every old letter template"), q: "delete", created: at(4, 9), archivedAt: at(3, 9), dropped: true },
      { text: L("Baca semua emel promosi", "Read every promotional email"), q: "delete", created: at(3, 9), archivedAt: at(2, 9), dropped: true },
      // The week before (more reactive, so the score shows improvement)
      doneItem("Siapkan laporan segera", "Finish an urgent report", "do", 8, 10),
      doneItem("Isi borang last minute", "Fill in a last-minute form", "do", 9, 11),
      doneItem("Jawab emel bertimbun", "Clear the email backlog", "do", 10, 15),
      doneItem("Urus aduan kerosakan bilik kuliah", "Handle a lecture room damage complaint", "delegate", 11, 9),
      doneItem("Semak draf takwim jabatan", "Review the department calendar draft", "schedule", 12, 20)
    ];
    return { tasks: cur, archive: arch };
  }

  function loadSample(skipConfirm) {
    if (tasks.length && !skipConfirm && !window.confirm(T("confirmSample"))) return;
    if (tasks.length || archive.length) writeJSON(KEY + ":before-sample", { tasks: tasks, archive: archive, at: Date.now() });
    var s = sampleData(), seen = Object.create(null);
    tasks = cleanList(s.tasks, seen);
    archive = cleanList(s.archive, seen);
    meta.lastReview = 0; saveMeta();
    var n = promoteDue();
    commit();
    showToast(T("sampleLoaded"), false);
    if (n) setTimeout(function () { flash("do"); }, 300);
  }
  $("sampleBtn").addEventListener("click", function () { loadSample(true); });
  $("sampleMenuBtn").addEventListener("click", function () { closeMenu(); loadSample(false); });

  /* ================================================================
     Task pack: Last Man Out (MARA Ecosystem Quality Standard, MQS)
     Weekly duty rota + checklist as audit evidence for energy saving and
     office safety. Added on top of existing tasks (never replaces them).
     Fixed ids, so adding the pack twice does not create duplicates.
     ================================================================ */
  function packLmoData() {
    var now = Date.now();
    function dateIn(days) { return todayISO(now + days * DAY); }
    var bm = lang === "ms";
    var L = function (ms, en) { return bm ? ms : en; };
    return [
      { id: "mqs-lmo-01", q: "do",
        text: L("Senaraikan pegawai untuk giliran mingguan Last Man Out (MQS)", "List the officers for the weekly Last Man Out rota (MQS)") },
      { id: "mqs-lmo-02", q: "schedule", date: dateIn(1),
        text: L("Sediakan Jadual Bertugas Mingguan Last Man Out: tarikh/minggu bertugas dan nama pegawai", "Prepare the weekly Last Man Out duty roster: duty date/week and officer name") },
      { id: "mqs-lmo-03", q: "schedule", date: dateIn(2),
        text: L("Sediakan borang senarai semak Last Man Out: lampu ditutup, penyaman udara dimatikan, suis utama/palam dicabut, pintu utama dikunci", "Prepare the Last Man Out checklist: lights off, air-conditioning off, main switch/plugs off, main door locked") },
      { id: "mqs-lmo-04", q: "schedule", date: dateIn(2),
        text: L("Tambah ruangan tandatangan & masa keluar pada borang Last Man Out (rekod harian)", "Add signature & time-out columns to the Last Man Out form (daily record)") },
      { id: "mqs-lmo-05", q: "schedule", date: dateIn(7),
        text: L("Semakan rekod Last Man Out minggu pertama oleh Jawatankuasa MQS pusat", "First weekly check of Last Man Out records by the centre's MQS committee") },
      { id: "mqs-lmo-06", q: "schedule",
        text: L("Failkan jadual & borang Last Man Out sebagai bukti audit MQS (penjimatan tenaga & keselamatan pejabat)", "File the Last Man Out roster & forms as MQS audit evidence (energy saving & office safety)") },
      { id: "mqs-lmo-07", q: "delegate", who: "", date: dateIn(3),
        text: L("Cetak & tampal jadual Last Man Out di pintu keluar utama / papan kenyataan zon", "Print & post the Last Man Out roster at the main exit / zone notice board") },
      { id: "mqs-lmo-08", q: "delegate", who: "", date: dateIn(3),
        text: L("Maklumkan giliran Last Man Out kepada semua pegawai bertugas", "Tell every officer on the rota about the Last Man Out schedule") },
      { id: "mqs-lmo-09", q: "delegate", who: "", date: dateIn(4),
        text: L("Pegawai bertugas lengkapkan senarai semak, tandatangan & masa keluar setiap hari sebelum pulang", "Duty officer completes the checklist, signature & time out every day before leaving") },
      { id: "mqs-lmo-10", q: "delete",
        text: L("Bergantung kepada seorang sahaja untuk menutup pejabat setiap hari", "Relying on one person to close the office every day") }
    ];
  }

  function addPackLmo() {
    var have = Object.create(null);
    tasks.concat(archive).forEach(function (t) { have[t.id] = true; });
    var created = Date.now();
    var fresh = packLmoData().filter(function (t) { return !have[t.id]; })
      .map(function (t) { t.created = created; return t; });
    if (!fresh.length) { showToast(T("packExists"), false); return; }
    var seen = Object.create(null);
    tasks.concat(archive).forEach(function (t) { seen[t.id] = true; });
    tasks = tasks.concat(cleanList(fresh, seen));
    var n = promoteDue();
    commit();
    showToast(T("packAdded", fresh.length), false);
    setTimeout(function () { flash(n ? "do" : "schedule"); }, 300);
  }
  $("packLmoBtn").addEventListener("click", function () { closeMenu(); addPackLmo(); });

  /* ================================================================
     Menu, export / import, install
     ================================================================ */
  var menu = $("menu"), menuBtn = $("menuBtn");
  function openMenu() { menu.hidden = false; menuBtn.setAttribute("aria-expanded", "true"); var b = menu.querySelector("button:not([hidden])"); if (b) b.focus(); }
  function closeMenu(refocus) { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); if (refocus) menuBtn.focus(); }
  menuBtn.addEventListener("click", function () { if (menu.hidden) openMenu(); else closeMenu(); });
  document.addEventListener("click", function (e) { if (!menu.hidden && !e.target.closest(".menu-wrap")) closeMenu(); });
  menu.addEventListener("keydown", function (e) {
    var items = Array.prototype.filter.call(menu.querySelectorAll("button"), function (b) { return !b.hidden; });
    var i = items.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });

  $("exportBtn").addEventListener("click", function () {
    closeMenu();
    var data = { app: "eisenhower-planner", version: 3, exportedAt: new Date().toISOString(), tasks: tasks, archive: archive, contacts: contacts, rota: rota };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = h("a", { href: URL.createObjectURL(blob), download: "jppp-smart-planner-" + todayISO() + ".json" });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  });

  $("importBtn").addEventListener("click", function () { closeMenu(); $("importFile").click(); });
  $("importFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var inTasks = Array.isArray(data) ? data : (data && Array.isArray(data.tasks) ? data.tasks : null);
        if (!inTasks) throw new Error("bad file");
        var inArchive = data && Array.isArray(data.archive) ? data.archive : [];
        var seen = Object.create(null);
        tasks.concat(archive).forEach(function (t) { seen[t.id] = true; });
        var existing = Object.create(null);
        tasks.concat(archive).forEach(function (t) { existing[t.id] = true; });
        // Skip exact duplicates (same id), give new ids to clashing ones
        var newTasks = cleanList(inTasks.filter(function (t) { return !(t && existing[t.id]); }), seen);
        var newArch = cleanList(inArchive.filter(function (t) { return !(t && existing[t.id]); }), seen);
        tasks = tasks.concat(newTasks);
        archive = archive.concat(newArch);
        if (data && Array.isArray(data.contacts)) { contacts = cleanContacts(contacts.concat(data.contacts)); saveContacts(); }
        if (data && data.rota && typeof data.rota === "object") mergeRota(data.rota);
        promoteDue();
        commit();
        if ($("rotaDlg").open) renderRota();
        showToast(T("imported", newTasks.length), false);
      } catch (err) {
        showToast(T("badFile"), false);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  var installEvt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installEvt = e;
    $("installBtn").hidden = false;
  });
  $("installBtn").addEventListener("click", function () {
    closeMenu();
    if (!installEvt) return;
    installEvt.prompt();
    installEvt = null;
    $("installBtn").hidden = true;
  });


  /* ================================================================
     Contacts manager
     ================================================================ */
  var editingId = null;
  // "Save contact" for a PIC not in contacts; "Complete contact" for one saved without WhatsApp no. or email
  function contactFixButton(c, name, before, extra) {
    var label = T(c ? "completeContact" : "saveContact");
    var props = { class: "cal-link add-contact", type: "button", "aria-label": label + ": " + name,
      html: ICONS.user + "<span>" + escapeHtml(label) + "</span>",
      onclick: function () { if (before) before(); openContacts(c ? { id: c.id } : { name: name }); } };
    Object.keys(extra || {}).forEach(function (k) { props[k] = extra[k]; });
    return h("button", props);
  }
  function fillContactForm(c) {
    var f = $("contactForm");
    editingId = c.id;
    f.elements.name.value = c.name; f.elements.phone.value = c.phone ? "+" + c.phone : ""; f.elements.email.value = c.email;
    f.elements.role.value = c.role || ""; f.elements.prog.value = c.prog || "";
    setContactMode();
  }
  // prefill: { name } adds a new contact with that name; { id, focus } edits an existing one
  function openContacts(prefill) {
    var fromMenu = menu.contains(document.activeElement);
    closeMenu();
    lastFocus = fromMenu ? menuBtn : document.activeElement;
    editingId = null;
    var f = $("contactForm");
    f.reset();
    $("contactMsg").textContent = "";
    var c = prefill && prefill.id ? contactById(prefill.id) : null;
    if (c) fillContactForm(c);
    else if (prefill && prefill.name) f.elements.name.value = prefill.name;
    if (!c && prefill && prefill.role) f.elements.role.value = prefill.role;   // e.g. adding the Head of Department
    renderContacts();
    var dlg = $("contactsDlg");
    if (!dlg.open) { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }
    var target = c ? (f.elements[prefill.focus] || (!c.phone ? f.elements.phone : f.elements.email)) : prefill && prefill.name ? f.elements.phone : f.elements.name;
    target.focus();
  }
  function closeContacts() {
    var dlg = $("contactsDlg");
    if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
    refreshAllShares();
  }
  function setContactMode() {
    $("contactSave").textContent = editingId ? T("cUpdate") : T("cSave");
    $("contactCancel").hidden = !editingId;
  }
  function renderContacts() {
    setContactMode();
    var list = $("contactListView"), q = $("contactSearch").value.trim().toLowerCase();
    list.textContent = "";
    $("contactCount").textContent = T("cCount", contacts.length);
    $("contactSearch").hidden = contacts.length < 6;
    if (!contacts.length) { list.appendChild(h("li", { class: "c-empty", text: T("cEmpty") })); return; }
    contacts.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
      .filter(function (c) { return !q || (c.name + " " + c.phone + " " + c.email + " " + c.role + " " + c.prog).toLowerCase().indexOf(q) >= 0; })
      .forEach(function (c) {
        var sub = [c.role, c.prog].filter(Boolean).join(" · ");
        var reach = [c.phone ? "+" + c.phone : "", c.email].filter(Boolean).join("  ·  ");
        list.appendChild(h("li", { class: "c-row" }, [
          h("div", { class: "c-info" }, [
            h("p", { class: "c-name", text: c.name }),
            sub ? h("p", { class: "c-detail", text: sub }) : null,
            h("p", { class: "c-detail" + (reach ? "" : " c-noreach"), text: reach || T("cNoReach") })
          ]),
          h("button", { class: "tiny-btn", type: "button", "aria-label": T("cEdit") + ": " + c.name, html: ICONS.edit, onclick: function () {
            fillContactForm(c); $("contactForm").elements.name.focus();
          } }),
          h("button", { class: "tiny-btn", type: "button", "aria-label": T("cDel") + ": " + c.name, html: ICONS.trash, onclick: function () {
            if (!window.confirm(T("cDelete", c.name))) return;
            contacts = contacts.filter(function (x) { return x.id !== c.id; });
            if (editingId === c.id) { editingId = null; $("contactForm").reset(); }
            saveContacts(); renderContacts();
          } })
        ]));
      });
  }
  $("contactSearch").addEventListener("input", renderContacts);
  $("contactForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, msg = $("contactMsg");
    var name = f.elements.name.value.trim().slice(0, 60), phoneRaw = f.elements.phone.value.trim(), email = f.elements.email.value.trim();
    var role = cleanRole(f.elements.role.value), prog = cleanProg(f.elements.prog.value);
    if (!name) { msg.textContent = T("cNeed"); f.elements.name.focus(); return; }
    var phone = phoneRaw ? normPhone(phoneRaw) : "";
    if (phoneRaw && (phone === "invalid" || !phone)) { msg.textContent = T("cBadPhone"); f.elements.phone.focus(); return; }
    if (email && !validEmail(email)) { msg.textContent = T("cBadEmail"); f.elements.email.focus(); return; }
    var existing = editingId ? contactById(editingId) : contactFor(name);
    if (existing) {
      var oldName = existing.name, oldRole = existing.role;
      if (!editingId) {   // same name typed again: keep what is already known
        phone = phone || existing.phone; email = email || existing.email; role = role || existing.role; prog = prog || existing.prog;
      }
      existing.name = name; existing.phone = phone; existing.email = email; existing.role = role; existing.prog = prog;
      if (role !== oldRole && (!oldRole || KJ_RE.test(role))) existing.rota = defaultRota(role);
      // Keep tasks and rota turns linked when a contact is renamed
      if (oldName !== name) {
        tasks.forEach(function (t) { if (t.who.toLowerCase() === oldName.toLowerCase()) t.who = name; });
        rota.entries.forEach(function (e) { if (e.cid === existing.id) e.name = name; });
        saveRota(true);
      }
      save();
    } else {
      contacts.push({ id: uid(), name: name, phone: phone, email: email, role: role, prog: prog, rota: defaultRota(role) });
    }
    editingId = null;
    f.reset();
    msg.textContent = phone || email ? T("cSaved", name) : T("cSavedNoReach", name);
    saveContacts();
    renderContacts();
    render();
    f.elements.name.focus();
  });
  $("contactCancel").addEventListener("click", function () { editingId = null; $("contactForm").reset(); $("contactMsg").textContent = ""; setContactMode(); });
  $("contactsClose").addEventListener("click", closeContacts);
  $("contactsDlg").addEventListener("close", function () {
    render();
    // Opened from the rota dialog: refresh it and go back to the button that opened contacts
    if ($("rotaDlg").open) { refreshRota(lastFocus); return; }
    if (lastFocus && lastFocus.focus && lastFocus.isConnected) { lastFocus.focus(); return; }
    // The opener was re-drawn (e.g. a button in the Selesai banner): go back to its replacement
    var k = lastFocus && lastFocus.getAttribute && lastFocus.getAttribute("data-k");
    var el = k ? document.querySelector('.app [data-k="' + cssEscape(k) + '"]') : null;
    if (!el && k && k.indexOf("kj-") === 0) el = $("kjActions").querySelector("a, button");   // e.g. KJ contact just added
    if (el && el.offsetParent !== null) el.focus();
  });
  $("contactsDlg").addEventListener("click", function (e) { if (e.target === e.currentTarget) closeContacts(); });
  $("contactsBtn").addEventListener("click", function () { openContacts(); });

  // CSV: works with files saved from Excel or Google Sheets (comma, semicolon or tab separated)
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    var first = text.split(/\r?\n/)[0] || "";
    var sep = [",", ";", "\t"].sort(function (a, b) { return first.split(b).length - first.split(a).length; })[0];
    var rows = [], row = [], cell = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === sep) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
  }
  // Which column holds what, from a header row (BM or EN). n = how many columns were recognised.
  function headerCols(row) {
    var col = { name: -1, phone: -1, email: -1, rota: -1, role: -1, prog: -1, n: 0 };
    row.forEach(function (x, i) {
      x = String(x).trim().toLowerCase();
      if (!x) return;
      if (col.email < 0 && /e-?mel|e-?mail/.test(x)) col.email = i;
      else if (col.phone < 0 && /whats|wasap|wa\b|phone|telefon|tel|no\.?\s*hp|h\/p|mobile|bimbit/.test(x)) col.phone = i;
      else if (col.rota < 0 && /giliran|rota|lmo|last man/.test(x)) col.rota = i;
      else if (col.role < 0 && /jawatan|role|peranan/.test(x)) col.role = i;
      else if (col.prog < 0 && /program/.test(x)) col.prog = i;
      else if (col.name < 0 && /nama|name/.test(x)) col.name = i;
      else return;
      col.n++;
    });
    return col;
  }
  function contactsFromRows(rows) {
    if (!rows.length) return [];
    // The header may sit below a title row or two (look in the first 5 rows)
    var hi = -1, col = null;
    for (var i = 0; i < Math.min(5, rows.length) && hi < 0; i++) {
      var c = headerCols(rows[i]);
      if (c.n >= 2) { hi = i; col = c; }
    }
    if (hi < 0) { col = headerCols(rows[0]); if (col.n) hi = 0; }
    if (hi < 0) col = { name: 0, phone: 1, email: 2, role: 3, prog: 4, rota: 5 };   // no header: by position
    if (col.name < 0) col.name = 0;
    function cell(r, k) { return col[k] >= 0 ? r[col[k]] || "" : ""; }
    return rows.slice(hi + 1).map(function (r) {
      return { name: cell(r, "name"), phone: cell(r, "phone"), email: cell(r, "email"), role: cell(r, "role"), prog: cell(r, "prog"), rota: cell(r, "rota") };
    });
  }
  $("contactImportBtn").addEventListener("click", function () { $("contactImportFile").click(); });
  $("contactImportFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var before = contacts.length;
      var rows = contactsFromRows(parseCSV(String(reader.result)));
      var incoming = cleanContacts(rows);
      if (!incoming.length) { $("contactMsg").textContent = T("cBadCsv"); e.target.value = ""; return; }
      // Merge the raw rows, so a blank "Giliran LMO" cell keeps each person's current rota choice
      contacts = cleanContacts(contacts.concat(rows));
      saveContacts(); renderContacts(); render();
      if ($("rotaDlg").open) renderRota();
      $("contactMsg").textContent = T("cImported", incoming.length) + (contacts.length - before < incoming.length ? " (" + (incoming.length - (contacts.length - before)) + " updated)" : "");
      e.target.value = "";
    };
    reader.readAsText(file);
  });
  function downloadText(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function csvCell(v) { v = String(v || ""); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function contactCsvHead() { return [T("cName"), T("cPhone"), T("cEmail"), T("cRole"), T("cProg"), T("cRotaCol")].join(","); }
  $("contactTemplateBtn").addEventListener("click", function () {
    downloadText("contacts-template.csv", "﻿" + contactCsvHead() + "\n" + T("cSample") + "\n", "text/csv");
  });
  $("contactExportBtn").addEventListener("click", function () {
    var lines = [contactCsvHead()].concat(contacts.map(function (c) {
      return [c.name, c.phone ? "+" + c.phone : "", c.email, c.role, c.prog, c.rota ? T("cYes") : T("cNo")].map(csvCell).join(",");
    }));
    downloadText("contacts-" + todayISO() + ".csv", "﻿" + lines.join("\n") + "\n", "text/csv");
  });


  /* ================================================================
     Send all open Delegate tasks, grouped by PIC (one message each)
     ================================================================ */
  function picGroups(onlyNew) {
    var groups = [], byKey = Object.create(null);
    tasks.filter(function (t) { return t.q === "delegate" && !t.done && t.who && (!onlyNew || !t.notifiedAt); })
      .sort(sortItems("schedule"))
      .forEach(function (t) {
        var c = contactFor(t.who), k = (c ? c.name : t.who).toLowerCase();
        if (!byKey[k]) { byKey[k] = { name: c ? c.name : t.who, contact: c, tasks: [] }; groups.push(byKey[k]); }
        byKey[k].tasks.push(t);
      });
    return groups.sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function groupMessage(g, from) {
    var lines = g.tasks.map(function (t, i) {
      return (i + 1) + ". *" + t.text + "*" + (t.date ? "\n   " + T("dueShort") + ": " + longDate(t.date) : "");
    }).join("\n");
    return T("groupBody", g.name, from, lines);
  }
  function renderSendAll() {
    var root = $("sendList"), onlyNew = $("sendOnlyNew").checked, from = $("sendFrom").value.trim();
    root.textContent = "";
    var groups = picGroups(onlyNew);
    if (!groups.length) { root.appendChild(h("li", { class: "c-empty", text: T("noPics") })); return; }
    groups.forEach(function (g) {
      var msg = groupMessage(g, from), c = g.contact, btns = [];
      function mark() {
        g.tasks.forEach(function (t) { t.notifiedAt = Date.now(); });
        save();
        setTimeout(function () { render(); renderSendAll(); announce(T("sentAll", g.tasks.length)); }, 0);
      }
      if (c && c.phone) btns.push(h("a", { class: "cal-link wa-link", target: "_blank", rel: "noopener",
        href: "https://wa.me/" + c.phone + "?text=" + encodeURIComponent(msg),
        "aria-label": T("waAria", g.name, T("nOpen", g.tasks.length)), html: ICONS.chat + "<span>WhatsApp</span>", onclick: mark }));
      if (c && c.email) btns.push(h("a", { class: "cal-link mail-link",
        href: "mailto:" + encodeURIComponent(c.email) + "?subject=" + encodeURIComponent(T("groupSubject", from, g.tasks.length)) + "&body=" + encodeURIComponent(msg.replace(/\*/g, "")),
        "aria-label": T("mailAria", g.name, T("nOpen", g.tasks.length)), html: ICONS.mail + "<span>" + escapeHtml(T("cEmail")) + "</span>", onclick: mark }));
      if (!reachable(c)) btns.push(contactFixButton(c, g.name, closeSendAll));
      var allNotified = g.tasks.every(function (t) { return t.notifiedAt; });
      root.appendChild(h("li", { class: "send-row" }, [
        h("div", { class: "send-head" }, [
          h("div", { class: "c-info" }, [
            h("p", { class: "c-name", text: g.name }),
            h("p", { class: "c-detail", text: c ? T("nOpen", g.tasks.length) : T("nOpen", g.tasks.length) + " · " + T("notSaved") })
          ]),
          allNotified ? h("span", { class: "badge badge-ok", text: "✓ " + T("notified") }) : null
        ]),
        h("ol", { class: "send-tasks" }, g.tasks.map(function (t) {
          return h("li", null, [document.createTextNode(t.text), t.date ? h("span", { class: "send-due", text: " · " + longDate(t.date) }) : null]);
        })),
        h("div", { class: "send-btns" }, btns)
      ]));
    });
  }
  function openSendAll() {
    lastFocus = document.activeElement;
    $("sendFrom").value = meta.lastFrom || "";
    renderSendAll();
    var dlg = $("sendDlg");
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    $("sendFrom").focus();
  }
  function closeSendAll() {
    var dlg = $("sendDlg");
    if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
  }
  $("sendFrom").addEventListener("input", function () { meta.lastFrom = $("sendFrom").value.trim().slice(0, 80); saveMeta(); renderSendAll(); });
  $("sendOnlyNew").addEventListener("change", renderSendAll);
  $("sendClose").addEventListener("click", closeSendAll);
  $("sendDlg").addEventListener("close", function () { if (lastFocus && lastFocus.focus && lastFocus.isConnected) lastFocus.focus(); });
  $("sendDlg").addEventListener("click", function (e) { if (e.target === e.currentTarget) closeSendAll(); });


  /* ================================================================
     Status tracking and Project monitor (for delegated tasks)
     ================================================================ */
  var STATUS = ["", "doing", "blocked", "done"];
  function statusKey(t) { return t.done ? "done" : t.status; }
  function statusText(k) { return T({ "": "stNone", doing: "stDoing", blocked: "stBlocked", done: "stDone" }[k]); }
  function setStatus(t, k) {
    if (k === "done") { if (!t.done) setDone(t, true); }
    else { if (t.done) setDone(t, false); t.status = k; }
    t.statusAt = Date.now();
  }
  function statusSelect(t, rerenderAll) {
    var sel = h("select", { class: "status-select st-" + (statusKey(t) || "none"), "data-role": "status", "aria-label": T("statusLabel") + ": " + t.text },
      STATUS.map(function (k) { return h("option", { value: k, text: statusText(k), selected: statusKey(t) === k }); }));
    sel.addEventListener("change", function () {
      setStatus(t, sel.value);
      save();
      if (rerenderAll) render();
      if ($("monitorDlg").open) renderMonitor();
      renderRemindBanner();
    });
    return sel;
  }
  function daysUntil(iso) {
    var p = iso.split("-").map(Number), d = new Date(p[0], p[1] - 1, p[2]), n = new Date();
    n.setHours(0, 0, 0, 0);
    return Math.round((d - n) / DAY);
  }
  function ago(ts) {
    var d = new Date(ts); d.setHours(0, 0, 0, 0);
    var n = new Date(); n.setHours(0, 0, 0, 0);
    var k = Math.round((n - d) / DAY);
    return k <= 0 ? T("todayW") : k === 1 ? T("yesterdayW") : T("daysAgo", k);
  }
  function isToday(ts) { return !!ts && todayISO(ts) === todayISO(); }
  function lastActivity(t) { return Math.max(t.statusAt || 0, t.notifiedAt || 0, t.created || 0); }
  function delegated() { return tasks.filter(function (t) { return t.q === "delegate" && t.who; }); }
  function needsReminder(t) { return !t.done && t.date && daysUntil(t.date) <= 1; }
  function isStale(t) { return !t.done && t.notifiedAt && Date.now() - lastActivity(t) > 5 * DAY; }

  function waLink(phone, msg, label, aria, onclick) {
    return h("a", { class: "cal-link wa-link", target: "_blank", rel: "noopener", href: "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg),
      "aria-label": aria, title: aria, html: ICONS.chat + "<span>" + escapeHtml(label) + "</span>", onclick: onclick });
  }
  function mailLink(email, subject, msg, label, aria, onclick) {
    return h("a", { class: "cal-link mail-link", href: "mailto:" + encodeURIComponent(email) + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(msg.replace(/\*/g, "")),
      "aria-label": aria, title: aria, html: ICONS.mail + "<span>" + escapeHtml(label) + "</span>", onclick: onclick });
  }
  function afterSend() { save(); setTimeout(function () { render(); renderMonitor(); renderRemindBanner(); }, 0); }

  function renderRemindBanner() {
    var n = delegated().filter(function (t) { return needsReminder(t) && !isToday(t.remindedAt); }).length;
    var b = $("remindBanner");
    b.hidden = !n;
    if (n) $("remindText").textContent = T("remindBanner", n);
  }

  function renderMonitor() {
    var root = $("monitorBody");
    root.textContent = "";
    var all = delegated();
    var monthAgo = Date.now() - 30 * DAY;
    var archDone = archive.filter(function (a) { return a.q === "delegate" && a.who && a.done && (a.doneAt || 0) > monthAgo; });
    var open = all.filter(function (t) { return !t.done; });
    if (!all.length && !archDone.length) { root.appendChild(h("p", { class: "ins-empty", text: T("noDelegated") })); return; }

    var doneCount = all.filter(function (t) { return t.done; }).length + archDone.length;
    var total = all.length + archDone.length;
    var overdue = open.filter(function (t) { return t.date && daysUntil(t.date) < 0; }).length;
    var soon = open.filter(function (t) { return t.date && daysUntil(t.date) >= 0 && daysUntil(t.date) <= 1; }).length;
    var stale = open.filter(isStale).length;
    function tile(v, label, help, cls) {
      return h("div", { class: "tile " + (cls || "") }, [h("p", { class: "tile-value", text: v }), h("p", { class: "tile-label", text: label }), h("p", { class: "tile-help", text: help })]);
    }
    root.appendChild(h("div", { class: "tiles tiles-5" }, [
      tile(String(open.length), T("mActive"), T("mActiveHelp")),
      tile((total ? Math.round(doneCount / total * 100) : 0) + "%", T("mDoneRate"), T("progressOf", doneCount, total), "t-ok"),
      tile(String(overdue), T("mOverdue"), "", overdue ? "t-do" : ""),
      tile(String(soon), T("mSoon"), "", soon ? "t-delegate" : ""),
      tile(String(stale), T("mStale"), T("mStaleHelp"), stale ? "t-delete" : "")
    ]));

    // 1. Needs a reminder
    root.appendChild(h("p", { class: "ins-h", text: T("needRemind") }));
    var due = open.filter(needsReminder).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (!due.length) root.appendChild(h("p", { class: "m-clear", text: T("nothingDue") }));
    else {
      var ul = h("ul", { class: "m-list" });
      due.forEach(function (t) {
        var c = contactFor(t.who), n = daysUntil(t.date), btns = [];
        var msg = T("remindMsg", c ? c.name : t.who, t.text, n, longDate(t.date));
        var mark = function () { t.remindedAt = Date.now(); afterSend(); };
        if (c && c.phone) btns.push(waLink(c.phone, msg, T("remind"), T("waAria", c.name, t.text), mark));
        if (c && c.email) btns.push(mailLink(c.email, T("remindSubject", t.text), msg, T("cEmail"), T("mailAria", c.name, t.text), mark));
        if (!reachable(c)) btns.push(contactFixButton(c, t.who, closeMonitor));
        if (isToday(t.remindedAt)) btns.push(h("span", { class: "badge badge-ok", text: "✓ " + T("remindedToday") }));
        ul.appendChild(h("li", { class: "m-row" + (n < 0 ? " is-late" : "") }, [
          h("div", { class: "m-main" }, [
            h("p", { class: "m-task", text: t.text }),
            h("p", { class: "m-sub" }, [
              h("span", { class: "m-due " + (n < 0 ? "late" : "soon"), text: T("dueWhen", n) }),
              document.createTextNode(" · " + (c ? c.name : t.who) + " · " + statusText(statusKey(t)))
            ])
          ]),
          h("div", { class: "send-btns" }, btns)
        ]));
      });
      root.appendChild(ul);
    }

    // 2. By PIC
    root.appendChild(h("p", { class: "ins-h", text: T("byPic") }));
    var groups = [], byKey = Object.create(null);
    all.concat(archDone).forEach(function (t) {
      var c = contactFor(t.who), k = (c ? c.name : t.who).toLowerCase();
      if (!byKey[k]) { byKey[k] = { name: c ? c.name : t.who, c: c, items: [] }; groups.push(byKey[k]); }
      byKey[k].items.push(t);
    });
    groups.forEach(function (g) {
      g.open = g.items.filter(function (t) { return !t.done; });
      g.late = g.open.filter(function (t) { return t.date && daysUntil(t.date) < 0; }).length;
      g.blocked = g.open.filter(function (t) { return t.status === "blocked"; }).length;
    });
    groups.sort(function (a, b) { return (b.late + b.blocked) - (a.late + a.blocked) || b.open.length - a.open.length || a.name.localeCompare(b.name); });

    groups.forEach(function (g) {
      var done = g.items.length - g.open.length, pct = Math.round(done / g.items.length * 100);
      var last = Math.max.apply(null, g.items.map(lastActivity));
      var btns = [];
      if (g.open.length && reachable(g.c)) {
        var lines = g.open.slice().sort(sortItems("schedule")).map(function (t, i) {
          return (i + 1) + ". *" + t.text + "*" + (t.date ? " (" + T("dueShort").toLowerCase() + ": " + longDate(t.date) + ")" : "");
        }).join("\n");
        var msg = T("askMsg", g.c.name, lines);
        var mark = function () { g.open.forEach(function (t) { t.askedAt = Date.now(); }); afterSend(); };
        if (g.c.phone) btns.push(waLink(g.c.phone, msg, T("askStatus"), T("waAria", g.c.name, T("askStatus")), mark));
        if (g.c.email) btns.push(mailLink(g.c.email, T("askSubject"), msg, T("cEmail"), T("mailAria", g.c.name, T("askStatus")), mark));
      } else if (g.open.length) {
        btns.push(contactFixButton(g.c, g.name, closeMonitor));
      }
      var asked = Math.max.apply(null, g.open.map(function (t) { return t.askedAt || 0; }).concat([0]));
      var flags = [];
      if (g.late) flags.push(h("span", { class: "badge badge-overdue", text: T("mOverdue") + " " + g.late }));
      if (g.blocked) flags.push(h("span", { class: "badge badge-overdue", text: T("stBlocked") + " " + g.blocked }));

      var card = h("section", { class: "pic-card" }, [
        h("div", { class: "pic-head" }, [
          h("div", { class: "c-info" }, [
            h("p", { class: "c-name", text: g.name }),
            h("p", { class: "c-detail", text: T("progressOf", done, g.items.length) + " · " + T("updatedAgo", ago(last)) + (asked ? " · " + T("askedOn", ago(asked)) : "") })
          ]),
          h("div", { class: "pic-flags" }, flags)
        ]),
        h("div", { class: "pic-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct), "aria-label": g.name + ": " + T("progressOf", done, g.items.length) }, [
          (function () { var f = h("span"); f.style.width = pct + "%"; return f; })()
        ])
      ]);
      var tl = h("ul", { class: "pic-tasks" });
      g.items.slice().sort(sortItems("schedule")).forEach(function (t) {
        var isArch = archive.indexOf(t) >= 0;
        var n = t.date ? daysUntil(t.date) : null;
        var note = isArch ? null : h("input", { class: "chip-input note-input", type: "text", value: t.statusNote, maxlength: "140",
          placeholder: T("notePh"), "aria-label": T("noteLabel") + ": " + t.text });
        if (note) note.addEventListener("change", function () { t.statusNote = note.value.trim().slice(0, 140); t.statusAt = Date.now(); save(); });
        tl.appendChild(h("li", { class: "pic-task" + (t.done ? " done" : "") }, [
          h("div", { class: "m-main" }, [
            h("p", { class: "m-task", text: t.text }),
            h("p", { class: "m-sub" }, [
              t.date && !t.done ? h("span", { class: "m-due " + (n < 0 ? "late" : n <= 1 ? "soon" : ""), text: T("dueWhen", n) }) : null,
              t.date && !t.done ? document.createTextNode(" · ") : null,
              document.createTextNode(t.done && t.doneAt ? T("stDone") + " " + ago(t.doneAt) : t.statusAt ? T("updatedAgo", ago(t.statusAt)) : T("never"))
            ]),
            note
          ]),
          isArch ? h("span", { class: "badge badge-ok", text: "✓ " + T("stDone") }) : statusSelect(t, true)
        ]));
      });
      card.appendChild(tl);
      if (btns.length) card.appendChild(h("div", { class: "send-btns pic-actions" }, btns));
      root.appendChild(card);
    });
  }
  function openMonitor() {
    lastFocus = document.activeElement;
    renderMonitor();
    var dlg = $("monitorDlg");
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function closeMonitor() {
    var dlg = $("monitorDlg");
    if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
  }
  $("monitorBtn").addEventListener("click", openMonitor);
  $("remindOpen").addEventListener("click", openMonitor);
  $("monitorClose").addEventListener("click", closeMonitor);
  $("monitorDlg").addEventListener("close", function () { render(); if (lastFocus && lastFocus.focus && lastFocus.isConnected) lastFocus.focus(); });
  $("monitorDlg").addEventListener("click", function (e) { if (e.target === e.currentTarget) closeMonitor(); });

  /* ================================================================
     Last Man Out rota (MQS): who closes the office each week (or day),
     and which reminders are due: email + calendar 2 days before the
     duty starts, WhatsApp on the day. Stored on this device only.
     ================================================================ */
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  var CHS = ["email", "cal", "wa"];
  // Shared contracts with automation/LastManOut.gs (see ADDENDUM "Selesai"): personal link {webUrl}?t={ID}&k={code}
  var WEBAPP_RE = /^https:\/\/script\.google\.com\/(macros|a\/macros\/[a-z0-9.-]+)\/s\/[A-Za-z0-9_-]+\/exec$/;
  var CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;
  var DEADLINE_MIN = "17:15";
  var GUIDE_URL = "https://github.com/hafizi-ui/planner/blob/main/automation/PANDUAN.md";
  // Shared contract with automation/LastManOut.gs (Google Sheet tab "Giliran"): keep these exact
  var ROTA_CSV_HEAD = ["ID", "Mula", "Tamat", "Masa mula", "Masa tamat", "Nama", "Emel", "No WhatsApp", "Jawatan", "Program", "Cuti",
    "Emel dihantar", "Kalendar dihantar", "WhatsApp dihantar", "Had pengesahan", "Kod pengesahan", "Emel KJ", "Hari tiada tugas"];

  function sortEntries(list) { list.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; }); }
  // Secret part of the personal "Selesai" link: 16 random bytes, base64url (22 characters)
  function newCode() {
    var b = new Uint8Array(16), s = "", c = window.crypto || window.msCrypto;
    if (c && c.getRandomValues) c.getRandomValues(b);
    else for (var j = 0; j < 16; j++) b[j] = Math.floor(Math.random() * 256);
    for (var i = 0; i < 16; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function maxTime(a, b) { return a > b ? a : b; }
  function addMinutes(hhmm, n) {
    var m = Math.min(23 * 60 + 59, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + n);
    return pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
  }
  // The deadline to press "Selesai" is never before the end of the duty, nor before 17:15
  function minDeadline(timeTo) { return maxTime(timeTo, DEADLINE_MIN); }
  // Per-day record: { ok: ts (SU ticked Selesai), kj: ts (Head of Department told), off: true (no duty that day) }
  function normDays(days, e) {
    var out = {};
    if (!days || typeof days !== "object") return out;
    Object.keys(days).forEach(function (d) {
      var v = days[d];
      if (!ISO_DATE.test(d) || d < e.start || d > e.end || !v || typeof v !== "object") return;
      var x = {};
      if (num(v.ok)) x.ok = v.ok;
      if (num(v.kj)) x.kj = v.kj;
      if (v.off === true) x.off = true;
      if (Object.keys(x).length) out[d] = x;
    });
    return out;
  }
  var rotaCodesFilled = false;
  function normRota(r) {
    r = r && typeof r === "object" ? r : {};
    var hasOld = Array.isArray(r.entries) && r.entries.length > 0;
    var timeFrom = TIME_RE.test(r.timeFrom) ? r.timeFrom : "18:00", timeTo = TIME_RE.test(r.timeTo) ? r.timeTo : "18:15";
    // Version 1 used 16:45-17:15 as the default duty time; the duty is now at 18:00
    if (r.v !== 2 && timeFrom === "16:45" && timeTo === "17:15") { timeFrom = "18:00"; timeTo = "18:15"; }
    var low = minDeadline(timeTo);
    var out = { v: 2, mode: r.mode === "day" ? "day" : "week", order: r.order === "az" ? "az" : "prog",
      start: typeof r.start === "string" && ISO_DATE.test(r.start) ? r.start : "",
      timeFrom: timeFrom, timeTo: timeTo,
      deadline: TIME_RE.test(r.deadline) && r.deadline >= low ? r.deadline : maxTime("18:30", low),
      webUrl: typeof r.webUrl === "string" && WEBAPP_RE.test(r.webUrl.trim()) ? r.webUrl.trim() : "",
      // Days before this date are never reported to the Head of Department (set when an older rota is upgraded)
      confirmFrom: typeof r.confirmFrom === "string" && ISO_DATE.test(r.confirmFrom) ? r.confirmFrom : (r.v !== 2 && hasOld ? todayISO() : ""),
      gas: r.gas === true, changedAt: num(r.changedAt), exportedAt: num(r.exportedAt), entries: [] };
    var seen = Object.create(null), filled = false;
    (Array.isArray(r.entries) ? r.entries : []).forEach(function (e) {
      if (!e || typeof e.start !== "string" || !ISO_DATE.test(e.start)) return;
      var id = "lmo-" + e.start;   // periods never overlap, so the start date is a stable id
      if (seen[id]) return;
      seen[id] = true;
      var s = e.sent && typeof e.sent === "object" ? e.sent : {};
      var x = { id: id, start: e.start,
        end: typeof e.end === "string" && ISO_DATE.test(e.end) && e.end >= e.start ? e.end : e.start,
        cid: typeof e.cid === "string" ? e.cid.slice(0, 40) : "",
        name: typeof e.name === "string" ? e.name.trim().slice(0, 60) : "",
        off: e.off === true, sent: { email: num(s.email), cal: num(s.cal), wa: num(s.wa) },
        code: typeof e.code === "string" && CODE_RE.test(e.code) ? e.code : "" };
      if (!x.code) { x.code = newCode(); filled = true; }
      x.days = normDays(e.days, x);
      out.entries.push(x);
    });
    if (filled) out.changedAt = Date.now();   // the Sheet needs the new codes: show "export again"
    rotaCodesFilled = filled;
    sortEntries(out.entries);
    return out;
  }
  function loadRota() {
    var raw = readJSON(ROTA_KEY, null);
    rota = normRota(raw);
    // Keep codes (and the upgrade) stable across reloads: save at once when anything was filled in
    if (raw && (rotaCodesFilled || raw.v !== 2)) writeJSON(ROTA_KEY, rota);
    return rota;
  }
  function saveRota(changed) {
    if (changed) rota.changedAt = Date.now();
    sortEntries(rota.entries);
    if (!writeJSON(ROTA_KEY, rota)) showToast(T("saveFail"), false);
  }
  // Backup import: take the incoming rota if this device has none; otherwise this device wins,
  // except that a notice sent on either device counts as sent
  function mergeRota(incoming) {
    var inc = normRota(incoming);
    if (!rota.entries.length) { rota = inc; saveRota(); return; }
    var byId = Object.create(null), added = 0;
    rota.entries.forEach(function (e) { byId[e.id] = e; });
    inc.entries.forEach(function (x) {
      var e = byId[x.id];
      if (e) {   // this device's person and code win; sent times and per-day marks are combined
        CHS.forEach(function (ch) { e.sent[ch] = Math.max(e.sent[ch], x.sent[ch]); });
        Object.keys(x.days).forEach(function (d) {
          var a = e.days[d] || {}, b = x.days[d], m = {};
          if (Math.max(num(a.ok), num(b.ok))) m.ok = Math.max(num(a.ok), num(b.ok));
          if (Math.max(num(a.kj), num(b.kj))) m.kj = Math.max(num(a.kj), num(b.kj));
          if (a.off || b.off) m.off = true;
          e.days[d] = m;
        });
        return;
      }
      if (!rota.entries.some(function (y) { return overlaps(x, y); })) { rota.entries.push(x); added++; }
    });
    saveRota(added > 0);
  }

  /* ---------- Dates (local, ISO "YYYY-MM-DD"; working days Mon-Fri) ---------- */
  function parseISO(iso) { var p = iso.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2], 12); }
  function addDays(iso, n) { var d = parseISO(iso); d.setDate(d.getDate() + n); return todayISO(d.getTime()); }
  function dow(iso) { return parseISO(iso).getDay(); }
  function isWorkday(iso) { var d = dow(iso); return d >= 1 && d <= 5; }
  function nextWorkday(iso) { while (!isWorkday(iso)) iso = addDays(iso, 1); return iso; }
  function workdays(from, to) { var n = 0; for (var d = from; d <= to; d = addDays(d, 1)) if (isWorkday(d)) n++; return n; }
  function overlaps(a, b) { return a.start <= b.end && b.start <= a.end; }
  function shortDate(iso, opts) { return parseISO(iso).toLocaleDateString(T("locale"), opts); }
  function defaultStart() { var d = addDays(todayISO(), 1); while (dow(d) !== 1) d = addDays(d, 1); return d; }   // next Monday
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dm(ts) { var d = new Date(ts); return d.getDate() + "/" + (d.getMonth() + 1); }
  function stampText(ts) { if (!ts) return ""; var d = new Date(ts); return todayISO(ts) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }

  // count periods from a date: weekly = to that week's Friday, then Mon-Fri; daily = one working day each
  function makePeriods(from, count, mode) {
    var out = [], d = nextWorkday(from);
    while (out.length < count) {
      if (mode === "day") { out.push({ start: d, end: d }); d = nextWorkday(addDays(d, 1)); }
      else { var fri = addDays(d, 5 - dow(d)); out.push({ start: d, end: fri }); d = addDays(fri, 3); }
    }
    return out;
  }

  /* ---------- Who and when ---------- */
  function entryContact(e) { return contactById(e.cid) || contactFor(e.name); }
  function personName(e) { var c = entryContact(e); return c ? c.name : e.name; }
  function anySent(e) { return CHS.some(function (ch) { return e.sent[ch] > 0; }); }
  function resetSent(e) { e.sent = { email: 0, cal: 0, wa: 0 }; }
  // Locked turns (already notified, or starting within 2 days) never move when the rota is rebuilt or shifted
  function isLocked(e, today) { return anySent(e) || e.start <= addDays(today || todayISO(), 2); }
  // Set the person on a turn. A different person gets a new code, so a link sent to the old person stops working.
  function assignPerson(e, cid, name) {
    if (e.code && e.cid === cid && e.name === name) return;
    e.cid = cid; e.name = name; e.code = newCode();
  }
  function newEntry(p, c) {
    var e = { id: "lmo-" + p.start, start: p.start, end: p.end, cid: "", name: "", off: false, sent: { email: 0, cal: 0, wa: 0 }, code: "", days: {} };
    assignPerson(e, c ? c.id : "", c ? c.name : "");
    return e;
  }
  function kjContact() {
    for (var i = 0; i < contacts.length; i++) if (KJ_RE.test(contacts[i].role || "")) return contacts[i];
    return null;
  }
  function lmoLink(e) { return rota.webUrl ? rota.webUrl + "?t=" + e.id + "&k=" + e.code : ""; }
  function lmoConfirm(e) { return T("lmoConfirmLine", lmoLink(e), rota.deadline); }
  function entryOn(iso) {
    for (var i = 0; i < rota.entries.length; i++) { var e = rota.entries[i]; if (e.start <= iso && iso <= e.end) return e; }
    return null;
  }
  function currentEntry(today) { var e = entryOn(today); return e && !e.off ? e : null; }
  function nextEntry(today) {
    for (var i = 0; i < rota.entries.length; i++) { var e = rota.entries[i]; if (e.start > today && !e.off && (e.cid || e.name)) return e; }
    return null;
  }
  // Members in turn order: "prog" = no programme first, then programme A-Z, then list (org chart) order
  function rotaMembers() {
    var list = contacts.filter(function (c) { return c.rota; });
    if (rota.order === "az") return list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return list.map(function (c, i) { return { c: c, i: i }; }).sort(function (a, b) {
      var pa = a.c.prog, pb = b.c.prog;
      if (!pa !== !pb) return pa ? 1 : -1;
      if (pa !== pb) return pa < pb ? -1 : 1;
      return a.i - b.i;
    }).map(function (x) { return x.c; });
  }

  // One round (everyone once) from a start date. Locked turns stay; nobody is given two turns in the round.
  function generateRota(start) {
    var members = rotaMembers();
    if (!members.length) return -1;
    var today = todayISO(), before = [], keptAfter = [];
    rota.entries = rota.entries.filter(function (e) {
      if (e.start < start) { before.push(e); return true; }
      if (isLocked(e, today)) { keptAfter.push(e); return true; }
      return false;
    });
    var startIdx = 0;
    for (var i = before.length - 1; i >= 0; i--) {
      if (before[i].off || !(before[i].cid || before[i].name)) continue;
      var lc = entryContact(before[i]), at = lc ? members.indexOf(lc) : -1;
      if (at >= 0) startIdx = at + 1;
      break;
    }
    var hasTurn = Object.create(null);
    keptAfter.forEach(function (e) { var c = !e.off && entryContact(e); if (c) hasTurn[c.id] = true; });
    var queue = [];
    for (var k = 0; k < members.length; k++) {
      var m = members[(startIdx + k) % members.length];
      if (!hasTurn[m.id]) queue.push(m);
    }
    var kept = rota.entries.slice(), d = start, added = 0;
    while (queue.length) {
      var p = makePeriods(d, 1, rota.mode)[0];
      d = addDays(p.end, 1);
      if (kept.some(function (e) { return overlaps(p, e); })) continue;
      rota.entries.push(newEntry(p, queue.shift()));
      added++;
    }
    saveRota(true);
    return added;
  }
  function extendRota() {
    var n = rota.entries.length;
    return generateRota(n ? addDays(rota.entries[n - 1].end, 1) : rota.start || defaultStart());
  }
  // Give turn e to someone else: they swap with their nearest upcoming turn, so both keep one turn each
  function swapTurn(e, cid) {
    var c = contactById(cid);
    if (!c) return null;
    var today = todayISO(), oldC = entryContact(e), oldName = personName(e), f = null;
    if (oldC === c) return null;
    if (e.end >= today && (oldC || oldName)) {
      var t0 = parseISO(e.start).getTime();
      rota.entries.forEach(function (x) {
        if (x === e || x.off || x.end < today || entryContact(x) !== c) return;
        if (!f || Math.abs(parseISO(x.start) - t0) < Math.abs(parseISO(f.start) - t0)) f = x;
      });
    }
    var told = [];
    if (f) {
      if (!window.confirm(T("rSwapConfirm", c.name, lmoRange(e), oldName, lmoRange(f)))) return null;
      if (anySent(f)) told.push(c.name);
      assignPerson(f, oldC ? oldC.id : "", oldName); resetSent(f);
    }
    if (anySent(e) && oldName) told.unshift(oldName);
    assignPerson(e, c.id, c.name); resetSent(e);
    saveRota(true);
    return { swapped: !!f, told: told };
  }
  // Public holiday / no duty: everyone from this turn on moves one turn later and a turn is added at the end.
  // Unticking moves them back and removes that last turn. Returns names to tell (they were already notified).
  function setOff(e, on) {
    var today = todayISO();
    if (!!e.off === !!on) return [];
    var later = rota.entries.filter(function (x) { return x.start > e.start && !x.off && !isLocked(x, today); });
    var told = [];
    if (on) {
      if (anySent(e) && personName(e)) told.push(personName(e));
      var carry = { cid: e.cid, name: e.name };
      e.off = true; assignPerson(e, "", "");
      if (carry.cid || carry.name) {
        later.forEach(function (x) { var t = { cid: x.cid, name: x.name }; assignPerson(x, carry.cid, carry.name); carry = t; });
        var last = rota.entries[rota.entries.length - 1];
        var ne = newEntry(makePeriods(addDays(last.end, 1), 1, rota.mode)[0], null);
        assignPerson(ne, carry.cid, carry.name);
        rota.entries.push(ne);
      }
    } else {
      e.off = false;
      var chain = [e].concat(later);
      if (chain.length > 1) {
        for (var i = 0; i < chain.length - 1; i++) assignPerson(chain[i], chain[i + 1].cid, chain[i + 1].name);
        var gone = chain[chain.length - 1];
        rota.entries = rota.entries.filter(function (x) { return x !== gone; });
      }
    }
    saveRota(true);
    return told;
  }

  /* ---------- Reminders that are due ---------- */
  // Email & calendar from 2 days before the start (Saturday for a Monday duty); WhatsApp on the first day.
  // Late once that day has passed; nothing is shown after the duty ends.
  function lmoDue(today) {
    today = today || todayISO();
    var out = [];
    rota.entries.forEach(function (e) {
      if (e.off || !(e.cid || e.name) || today > e.end) return;
      var chs = [], early = addDays(e.start, -2);
      if (!rota.gas) ["email", "cal"].forEach(function (ch) { if (today >= early && !e.sent[ch]) chs.push({ ch: ch, late: today > early }); });
      if (today >= e.start && !e.sent.wa) chs.push({ ch: "wa", late: today > e.start });
      if (chs.length) out.push({ e: e, c: entryContact(e), chs: chs });
    });
    return out;
  }
  // "Selesai" not confirmed: a working day in the last 7 days of a turn with a person, not ticked Selesai,
  // Head of Department not yet told, not a no-duty day, and either before today or today after the deadline.
  // Only used when there is no web app (the Apps Script alerts the Head of Department itself when there is).
  function kjDue(now) {
    if (!rota || rota.webUrl) return [];
    now = now || Date.now();
    var today = todayISO(now), t = new Date(now), hhmm = pad2(t.getHours()) + ":" + pad2(t.getMinutes());
    var from = maxTime(addDays(today, -7), rota.confirmFrom || ""), out = [];
    rota.entries.forEach(function (e) {
      if (e.off || !(e.cid || e.name) || e.end < from || e.start > today) return;
      for (var d = maxTime(e.start, from); d <= e.end && d <= today; d = addDays(d, 1)) {
        var st = e.days[d] || {};
        if (!isWorkday(d) || st.ok || st.kj || st.off || (d === today && hhmm < rota.deadline)) continue;
        out.push({ e: e, d: d });
      }
    });
    return out.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  }
  function setDay(e, d, field, val) {
    var st = e.days[d] || {};
    if (val) st[field] = val; else delete st[field];
    if (Object.keys(st).length) e.days[d] = st; else delete e.days[d];
  }
  function dayLabel(d) { var p = parseISO(d); return T("days")[p.getDay()] + " " + p.getDate() + "/" + (p.getMonth() + 1); }
  function dayLong(d) { return shortDate(d, { weekday: "long", day: "numeric", month: "long" }); }
  function dmy(d) { var p = parseISO(d); return p.getDate() + "/" + (p.getMonth() + 1) + "/" + p.getFullYear(); }
  // Working days of turn e from 7 days ago up to today (for the per-day status controls)
  function recentDays(e, today) {
    var out = [], from = addDays(today, -7);
    for (var d = maxTime(e.start, from); d <= e.end && d <= today; d = addDays(d, 1)) if (isWorkday(d)) out.push(d);
    return out;
  }
  function chName(ch, lower) {
    if (ch === "wa") return T("chWa");
    var s = T(ch === "email" ? "chEmail" : "chCal");
    return lower ? s.toLowerCase() : s;
  }

  /* ---------- Message text ---------- */
  function lmoPeriodText(e) { return e.start === e.end ? longDate(e.start) : longDate(e.start) + T("rTo") + longDate(e.end); }
  function lmoRange(e) {
    var y = { day: "numeric", month: "short", year: "numeric" };
    if (e.start === e.end) return shortDate(e.start, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    if (e.start.slice(0, 7) === e.end.slice(0, 7)) return parseISO(e.start).getDate() + "–" + shortDate(e.end, y);
    return shortDate(e.start, { day: "numeric", month: "short" }) + " – " + shortDate(e.end, y);
  }
  function lmoWaMsg(e, c) {
    return T("lmoWaMsg", c ? c.name : e.name, e.start === e.end, lmoPeriodText(e), rota.timeFrom, T("lmoList"), T("lmoSignoff"), lmoConfirm(e));
  }
  function lmoMail(e, c) {
    var period = lmoPeriodText(e);
    return { subject: T("lmoMailSubject", period),
      body: T("lmoMailBody", c ? c.name : e.name, period, rota.timeFrom, rota.timeTo, T("lmoList"), T("lmoSignoff"), lmoConfirm(e)) };
  }

  /* ---------- CSV for the Google Sheet (Apps Script) ---------- */
  function rotaCsv() {
    var lines = [ROTA_CSV_HEAD.join(",")], kj = kjContact(), kjEmail = kj && kj.email ? kj.email : "";
    rota.entries.forEach(function (e) {
      var c = e.off ? null : entryContact(e), who = e.off ? "" : personName(e);
      var noDuty = Object.keys(e.days).filter(function (d) { return e.days[d].off; }).sort().join(";");
      lines.push([e.id, e.start, e.end, rota.timeFrom, rota.timeTo, who,
        c ? c.email : "", c ? c.phone : "", c ? c.role : "", c ? c.prog : "", e.off ? "Ya" : "",
        stampText(e.sent.email), stampText(e.sent.cal), stampText(e.sent.wa),
        rota.deadline, who ? e.code : "", kjEmail, noDuty].map(csvCell).join(","));
    });
    return "﻿" + lines.join("\n") + "\n";
  }
  function exportRotaCsv() {
    if (!rota.entries.length) return;
    downloadText("giliran-lmo-" + todayISO() + ".csv", rotaCsv(), "text/csv");
    rota.exportedAt = Date.now();
    saveRota();
    renderRota();
    announce(T("rExported", rota.entries.length));
  }

  /* ---------- Banner ---------- */
  function renderLmoBanner() {
    var b = $("lmoBanner");
    if (!b || !rota) return;
    var due = lmoDue();
    b.hidden = !due.length;
    if (!due.length) return;
    var parts = due.slice(0, 3).map(function (d) {
      return personName(d.e) + " (" + d.chs.map(function (x) { return chName(x.ch, true); }).join(", ") + ")";
    }).join(", ");
    $("lmoText").textContent = T("lmoBanner", parts + (due.length > 3 ? " " + T("lmoMore", due.length - 3) : ""));
  }
  // Buttons for one unconfirmed day: tick Selesai, or tell the Head of Department by WhatsApp / email
  function kjButtons(p, done) {
    var e = p.e, d = p.d, pic = personName(e), kj = kjContact(), key = "kj-" + e.id + "-" + d, btns = [];
    btns.push(h("button", { type: "button", class: "cal-link kj-ok", "data-k": key + "-ok", "aria-label": T("kjMarkAria", pic, dayLong(d)),
      html: ICONS.check + "<span>" + escapeHtml(T("kjMark")) + "</span>", onclick: function () {
        setDay(e, d, "ok", Date.now());
        saveRota();
        done(T("kjMarked", pic, dayLong(d)));
      } }));
    if (!kj) {
      btns.push(h("button", { class: "cal-link add-contact", type: "button", "data-k": key + "-kjadd",
        html: ICONS.user + "<span>" + escapeHtml(T("kjAdd")) + "</span>", onclick: function () { openContacts({ role: T("cRoles")[0] }); } }));
      return btns;
    }
    var subject = T("lmoKjSubject", pic, dmy(d)), msg = T("lmoKjMsg", kj.name, pic, longDate(d), rota.deadline, T("lmoSignoff"));
    function told() { setDay(e, d, "kj", Date.now()); saveRota(); setTimeout(function () { done(T("kjTold", pic, dayLong(d))); }, 0); }
    var wa = kj.phone ? waLink(kj.phone, msg, T("kjWa"), T("waAria", kj.name, subject), told) : contactFieldButton(kj, kj.name, "phone");
    var em = kj.email ? mailLink(kj.email, subject, msg, T("kjEmail"), T("mailAria", kj.name, subject), told) : contactFieldButton(kj, kj.name, "email");
    wa.setAttribute("data-k", key + "-wa"); em.setAttribute("data-k", key + "-email");
    return btns.concat([wa, em]);
  }
  var kjSig = "";
  function renderKjBanner() {
    var b = $("kjBanner");
    if (!b || !rota) return false;
    var due = kjDue(), box = $("kjActions"), a = document.activeElement;
    var keepK = a && b.contains(a) ? a.getAttribute("data-k") : null;
    var sig = due.map(function (p) { return p.e.id + p.d; }).join();
    var changed = sig !== kjSig;
    kjSig = sig;
    b.hidden = !due.length;
    box.textContent = "";
    if (!due.length) return changed;
    var first = due[0];
    $("kjText").textContent = T("lmoKjBanner", personName(first.e), dayLong(first.d), rota.deadline) + (due.length > 1 ? " " + T("lmoMore", due.length - 1) : "");
    kjButtons(first, afterKjBanner).forEach(function (x) { box.appendChild(x); });
    if (keepK) { var el = box.querySelector('[data-k="' + cssEscape(keepK) + '"]'); if (el) el.focus(); }
    return changed;
  }
  function afterKjBanner(msg) {
    renderKjBanner();
    if ($("rotaDlg").open) renderRota();
    var next = [$("kjActions").querySelector("button, a"), $("lmoOpen"), input].filter(function (x) { return x && x.offsetParent !== null; })[0];
    if (next && document.activeElement === document.body) next.focus();
    announce(msg);
  }

  /* ---------- Rota dialog ---------- */
  var rotaShowPast = false, rotaLastFocus = null, rotaOpen = { settings: null, members: false };
  function afterRotaChange(msg) { renderRota(); renderLmoBanner(); if (msg) announce(msg); }

  // Button for one due notice. Tapping records the time; the button stays, so it can be sent again.
  function channelButton(e, c, ch, name) {
    function sent(ev) {
      var el = ev.currentTarget;
      e.sent[ch] = Date.now();
      saveRota();
      setTimeout(function () {
        el.classList.add("is-sent");
        var span = el.querySelector("span");
        if (span && span.textContent.charAt(0) !== "✓") span.textContent = "✓ " + span.textContent;
        renderLmoBanner();
        announce(T("rSentMark", chName(ch), name));
      }, 0);
    }
    var el, what = T("rTitle");
    if (ch === "wa") el = c && c.phone ? waLink(c.phone, lmoWaMsg(e, c), T("chWa"), T("waAria", name, what), sent) : contactFieldButton(c, name, "phone");
    else if (ch === "email") {
      var m = lmoMail(e, c);
      el = c && c.email ? mailLink(c.email, m.subject, m.body, T("chEmail"), T("mailAria", name, what), sent) : contactFieldButton(c, name, "email");
    } else {
      var aria = T("addToCal", T("lmoCalText", name));
      el = h("a", { class: "cal-link", target: "_blank", rel: "noopener", href: lmoCalUrl(e, c), "aria-label": aria, title: aria,
        html: ICONS.cal + "<span>Google Calendar</span>", onclick: sent });
    }
    el.setAttribute("data-k", "due-" + ch + "-" + e.id);
    return el;
  }
  // In place of a channel button when that detail is missing: opens the contact on top of this dialog
  function contactFieldButton(c, name, field) {
    if (!c) return contactFixButton(null, name);
    var label = T(field === "phone" ? "addPhone" : "addEmail");
    return h("button", { class: "cal-link add-contact", type: "button", "aria-label": label + ": " + name,
      html: ICONS.user + "<span>" + escapeHtml(label) + "</span>", onclick: function () { openContacts({ id: c.id, focus: field }); } });
  }
  function dueRow(d) {
    var e = d.e, name = personName(e), late = d.chs.some(function (x) { return x.late; });
    return h("li", { class: "m-row" + (late ? " is-late" : "") }, [
      h("div", { class: "m-main" }, [
        h("p", { class: "m-task", text: name }),
        h("p", { class: "m-sub" }, [
          late ? h("span", { class: "badge badge-overdue", text: T("rLate") }) : null,
          document.createTextNode((late ? " " : "") + lmoRange(e) + " · " + d.chs.map(function (x) { return chName(x.ch); }).join(", "))
        ])
      ]),
      h("div", { class: "send-btns" }, d.chs.map(function (x) { return channelButton(e, d.c, x.ch, name); }))
    ]);
  }
  function rotaField(label, control) { return h("label", { class: "r-field" }, [h("span", { text: label }), control]); }

  function rotaSettings(members) {
    var has = rota.entries.length > 0;
    if (rotaOpen.settings === null) rotaOpen.settings = !has;   // open when there is no rota yet; then stays as the SU left it
    var det = h("details", { class: "r-box", open: rotaOpen.settings });
    det.addEventListener("toggle", function () { rotaOpen.settings = det.open; });
    det.appendChild(h("summary", { "data-k": "settings", text: T("rSettings") }));
    if (!members.length) det.appendChild(h("div", { class: "r-warn" }, [
      h("p", { text: T("rNoMembers") }),
      h("button", { type: "button", class: "ghost-btn", "data-k": "contacts", text: T("rOpenContacts"), onclick: function () { openContacts(); } })
    ]));

    var modes = h("fieldset", { class: "r-field r-mode" }, [h("legend", { text: T("rMode") })].concat(["week", "day"].map(function (m) {
      var r = h("input", { type: "radio", name: "rotaMode", value: m, checked: rota.mode === m, "data-k": "mode-" + m });
      r.addEventListener("change", function () { rota.mode = m; saveRota(); });
      return h("label", { class: "r-radio" }, [r, h("span", { text: T(m === "week" ? "rWeek" : "rDay") })]);
    })));
    var order = h("select", { "data-k": "order" }, [
      h("option", { value: "prog", text: T("rOrderProg"), selected: rota.order === "prog" }),
      h("option", { value: "az", text: T("rOrderAz"), selected: rota.order === "az" })
    ]);
    order.addEventListener("change", function () { rota.order = order.value === "az" ? "az" : "prog"; saveRota(); });
    var startIn = h("input", { type: "date", value: rota.start || defaultStart(), "data-k": "start" });
    startIn.addEventListener("change", function () { if (ISO_DATE.test(startIn.value)) { rota.start = startIn.value; saveRota(); } });
    function tell(msg) { announce(msg); showToast(msg, false); }
    function timeInput(key) {
      var t = h("input", { type: "time", value: rota[key], "data-k": key });
      t.addEventListener("change", function () {
        var v = t.value, ok = TIME_RE.test(v);
        if (key === "deadline") ok = ok && v >= minDeadline(rota.timeTo);
        else ok = ok && (key === "timeFrom" ? v < rota.timeTo : v > rota.timeFrom);
        if (!ok) {
          t.value = rota[key];
          if (TIME_RE.test(v)) tell(key === "deadline" ? T("rBadDeadline", minDeadline(rota.timeTo)) : T("rBadTime"));
          return;
        }
        rota[key] = v;
        // A later end of duty pushes the deadline along (15 minutes after the end)
        var moved = key === "timeTo" && rota.deadline < minDeadline(v);
        if (moved) rota.deadline = maxTime(addMinutes(v, 15), DEADLINE_MIN);
        saveRota(true);
        if (moved) { afterRotaChange(); tell(T("rDeadlineMoved", rota.deadline)); }
        else renderLmoBanner(), renderKjBanner();
      });
      return t;
    }
    var urlIn = h("input", { type: "url", value: rota.webUrl, "data-k": "webUrl", inputmode: "url", autocomplete: "off", spellcheck: "false",
      placeholder: "https://script.google.com/macros/s/\u2026/exec", "aria-describedby": "rWebUrlHint" });
    urlIn.addEventListener("change", function () {
      var v = urlIn.value.trim();
      if (v && !WEBAPP_RE.test(v)) { urlIn.value = rota.webUrl; tell(T("rBadUrl")); return; }
      if (v === rota.webUrl) return;
      rota.webUrl = v;
      saveRota(true);   // messages now carry the personal link: export the CSV (with the codes) to the Sheet again
      afterRotaChange();
      renderKjBanner();
    });
    det.appendChild(h("div", { class: "r-grid" }, [modes, rotaField(T("rOrder"), order), rotaField(T("rStart"), startIn),
      rotaField(T("rTimeFrom"), timeInput("timeFrom")), rotaField(T("rTimeTo"), timeInput("timeTo")),
      rotaField(T("rDeadline"), timeInput("deadline"))]));
    det.appendChild(h("label", { class: "r-field r-url" }, [h("span", { text: T("rWebUrl") }), urlIn,
      h("small", { class: "r-hint", id: "rWebUrlHint", text: T("rWebUrlHint") })]));

    // Members, grouped by programme (no programme first)
    function countText() { return T("rMembers", contacts.filter(function (c) { return c.rota; }).length, contacts.length); }
    var mdet = h("details", { class: "r-members", open: rotaOpen.members });
    mdet.addEventListener("toggle", function () { rotaOpen.members = mdet.open; });
    var msum = h("summary", { "data-k": "members", text: countText() });
    mdet.appendChild(msum);
    mdet.appendChild(h("p", { class: "c-note", text: T("rMembersHint") }));
    var groups = [], byProg = Object.create(null);
    contacts.forEach(function (c) {
      var k = c.prog || "";
      if (!byProg[k]) { byProg[k] = { prog: k, list: [] }; groups.push(byProg[k]); }
      byProg[k].list.push(c);
    });
    groups.sort(function (a, b) { return !a.prog !== !b.prog ? (a.prog ? 1 : -1) : a.prog < b.prog ? -1 : a.prog > b.prog ? 1 : 0; });
    groups.forEach(function (g) {
      mdet.appendChild(h("fieldset", { class: "r-group" }, [
        h("legend", { text: g.prog || T("rNoProg") }),
        h("div", { class: "r-checks" }, g.list.map(function (c) {
          var cb = h("input", { type: "checkbox", checked: c.rota, "data-k": "m-" + c.id });
          cb.addEventListener("change", function () { c.rota = cb.checked; saveContacts(); msum.textContent = countText(); });
          return h("label", { class: "r-check" }, [cb, h("span", null, [document.createTextNode(c.name), c.role ? h("small", { text: " · " + c.role }) : null])]);
        }))
      ]));
    });
    if (contacts.length) det.appendChild(mdet);

    var gas = h("input", { type: "checkbox", checked: rota.gas, "data-k": "gas" });
    gas.addEventListener("change", function () { rota.gas = gas.checked; saveRota(); afterRotaChange(); });
    det.appendChild(h("label", { class: "send-check r-gas" }, [gas, h("span", { text: T("rGas") })]));

    det.appendChild(h("div", { class: "r-actions" }, [
      h("button", { type: "button", class: "primary-btn", "data-k": "gen", text: T(has ? "rRegen" : "rGenerate"), onclick: function () {
        var start = ISO_DATE.test(startIn.value) ? startIn.value : rota.start || defaultStart();
        if (!rotaMembers().length) { showToast(T("rNoMembers"), false); return; }
        if (rota.entries.length && !window.confirm(T("rRegenConfirm", longDate(start)))) return;
        rota.start = start;
        var n = generateRota(start);
        afterRotaChange(T("rGenerated", n));
        showToast(T("rGenerated", n), false);
      } }),
      has ? h("button", { type: "button", class: "ghost-btn", "data-k": "ext", text: T("rExtend"), onclick: function () {
        if (!rotaMembers().length) { showToast(T("rNoMembers"), false); return; }
        var n = extendRota();
        afterRotaChange(T("rExtended", n));
        showToast(T("rExtended", n), false);
      } }) : null
    ]));
    return det;
  }

  function entryRow(e, today, members) {
    var isPast = e.end < today, isNow = e.start <= today && today <= e.end && !e.off;
    var c = entryContact(e), range = lmoRange(e), who = personName(e);
    var sel = h("select", { class: "r-person", "data-k": "p-" + e.id, "aria-label": T("rPerson", range), disabled: isPast || e.off });
    if (e.off) sel.appendChild(h("option", { value: "", text: T("pHoliday"), selected: true }));
    else {
      if (!c) sel.appendChild(h("option", { value: "", text: e.name || T("rNoPerson"), selected: true }));
      (c && members.indexOf(c) < 0 ? [c].concat(members) : members).forEach(function (m) {
        sel.appendChild(h("option", { value: m.id, text: m.name, selected: m === c }));
      });
    }
    sel.addEventListener("change", function () {
      var res = sel.value ? swapTurn(e, sel.value) : null;
      if (!res) { renderRota(); return; }
      if (res.told.length) showToast(T("rTellOld", res.told.join(", ")), false);
      afterRotaChange(T(res.swapped ? "rSwapped" : "rReplaced"));
    });
    var chips = CHS.map(function (ch) {
      var at = e.sent[ch], label = chName(ch) + (at ? " " + dm(at) : "");
      return h("button", { type: "button", class: "r-chip", "aria-pressed": at ? "true" : "false", "data-k": ch + "-" + e.id,
        "aria-label": T("rChipAria", label, who || range), disabled: e.off && !at, text: (at ? "✓ " : "") + label,
        onclick: function () {
          e.sent[ch] = at ? 0 : Date.now();
          saveRota();
          afterRotaChange(T(at ? "rUnmark" : "rSentMark", chName(ch), who));
        } });
    });
    var off = h("input", { type: "checkbox", checked: e.off, disabled: isPast, "data-k": "off-" + e.id, "aria-describedby": "rw-" + e.id });
    off.addEventListener("change", function () {
      var told = setOff(e, off.checked);
      if (told.length) showToast(T("rTellOld", told.join(", ")), false);
      afterRotaChange(T(off.checked ? "rOffOn" : "rOffOff"));
    });
    return h("li", { class: "r-row" + (isNow ? " is-now" : "") + (e.off ? " is-off" : "") + (isPast ? " is-past" : "") }, [
      h("div", { class: "r-when" }, [
        h("p", { class: "r-range", id: "rw-" + e.id, text: range }),
        isNow ? h("span", { class: "badge badge-schedule", text: T(e.start === e.end ? "rToday" : "rThisWeek") }) : null
      ]),
      sel,
      h("div", { class: "r-chips" }, chips),
      h("label", { class: "r-off" }, [off, h("span", { text: T("rOff") })]),
      dayControls(e, today)
    ]);
  }
  // One control per working day of the last 7 days: Belum / Selesai / Tiada tugas (planner only),
  // or just "Tiada tugas" when the Google Sheet records the confirmations
  function dayControls(e, today) {
    var days = e.off || !(e.cid || e.name) ? [] : recentDays(e, today);
    if (!days.length) return null;
    var who = personName(e), now = new Date(), hhmm = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
    var box = h("div", { class: "r-days " + (rota.webUrl ? "r-days-tick" : "r-days-sel") }, days.map(function (d) {
      var st = e.days[d] || {}, lab = dayLabel(d), key = "d-" + e.id + "-" + d;
      if (rota.webUrl) {
        var cb = h("input", { type: "checkbox", checked: !!st.off, "data-k": key });
        cb.addEventListener("change", function () {
          setDay(e, d, "off", cb.checked);
          saveRota(true);   // "Hari tiada tugas" goes to the Sheet
          afterRotaChange(T("rDaySet", lab, cb.checked ? T("rDayOff") : T("rDayNone")));
          renderKjBanner();
        });
        return h("label", { class: "r-day" + (st.off ? " is-off" : "") }, [cb, h("span", { text: lab + ": " + T("rDayOff") })]);
      }
      var cur = st.off ? "off" : st.ok ? "ok" : "";
      var pending = !cur && (d < today || hhmm >= rota.deadline);
      var sel = h("select", { "data-k": key, "aria-label": T("rDayAria", lab) }, [
        h("option", { value: "", text: T("rDayNone"), selected: cur === "" }),
        h("option", { value: "ok", text: T("rDayOk"), selected: cur === "ok" }),
        h("option", { value: "off", text: T("rDayOffOpt"), selected: cur === "off" })
      ]);
      sel.addEventListener("change", function () {
        var wasOff = !!(e.days[d] && e.days[d].off), v = sel.value;
        setDay(e, d, "ok", v === "ok" ? Date.now() : 0);
        setDay(e, d, "off", v === "off");
        saveRota(wasOff !== (v === "off"));
        afterRotaChange(T("rDaySet", lab, sel.options[sel.selectedIndex].text));
        renderKjBanner();
      });
      return h("label", { class: "r-day" + (cur === "ok" ? " is-ok" : cur === "off" ? " is-off" : pending ? " is-pending" : "") }, [
        h("span", { text: lab }), sel, st.kj ? h("small", { class: "r-day-kj", text: T("rDayKj") }) : null]);
    }));
    if (rota.webUrl) box.appendChild(h("p", { class: "r-days-note", text: T("rConfInSheet") }));
    return box;
  }

  function renderRota() {
    var root = $("rotaBody"), today = todayISO();
    var a = document.activeElement, keepK = a && root.contains(a) ? a.getAttribute("data-k") : null;
    // Keep the open/closed state of the settings as shown now ("toggle" events arrive a moment later)
    var box = root.querySelector(".r-box"), mbox = root.querySelector(".r-members");
    if (box && rotaOpen.settings !== null) rotaOpen.settings = box.open;   // null = just opened: decide afresh
    if (mbox) rotaOpen.members = mbox.open;
    root.textContent = "";
    var cur = currentEntry(today), nxt = cur ? null : nextEntry(today);
    $("rotaNow").textContent = cur ? T("rNow", personName(cur)) : nxt ? T("rNext", personName(nxt), lmoRange(nxt)) : T("rNoneYet");
    var members = rotaMembers(), has = rota.entries.length > 0;

    // 1. Notices due now
    root.appendChild(h("h3", { class: "ins-h", text: T("rDue") }));
    if (rota.gas) root.appendChild(h("p", { class: "c-note", text: T("rGasOn") }));
    var due = lmoDue(today), pend = kjDue();
    if (!due.length && !pend.length) root.appendChild(h("p", { class: "m-clear", text: T("rNothingDue") }));
    else root.appendChild(h("ul", { class: "m-list" }, due.map(function (d) { return dueRow(d); }).concat(pend.map(function (p) {
      return h("li", { class: "m-row is-late" }, [
        h("div", { class: "m-main" }, [
          h("p", { class: "m-task", text: personName(p.e) }),
          h("p", { class: "m-sub" }, [h("span", { class: "badge badge-overdue", text: T("rLate") }),
            document.createTextNode(" " + T("rKjPending", dayLong(p.d), rota.deadline))])
        ]),
        h("div", { class: "send-btns" }, kjButtons(p, function (msg) { afterRotaChange(msg); renderKjBanner(); }))
      ]);
    }))));

    // 2. Settings
    root.appendChild(rotaSettings(members));

    // 3. Print and export
    root.appendChild(h("h3", { class: "ins-h", text: T("rTools") }));
    if ((rota.gas || rota.webUrl) && has && rota.changedAt > rota.exportedAt) root.appendChild(h("p", { class: "r-warn", text: T("rReexport") }));
    root.appendChild(h("div", { class: "r-actions r-tools" }, [
      h("button", { type: "button", class: "ghost-btn", "data-k": "csv", text: T("rExportCsv"), disabled: !has, onclick: exportRotaCsv }),
      h("button", { type: "button", class: "ghost-btn", "data-k": "print", text: T("rPrintRoster"), disabled: !has, onclick: function () { printRota("roster"); } }),
      h("button", { type: "button", class: "ghost-btn", "data-k": "check", text: T("rPrintCheck"), disabled: !has, onclick: function () { printRota("check"); } }),
      h("a", { class: "ghost-btn", href: GUIDE_URL, target: "_blank", rel: "noopener", "data-k": "guide", text: T("rGuide") })
    ]));

    // 4. Turns: upcoming first; past ones on request
    if (has) {
      root.appendChild(h("h3", { class: "ins-h", text: T("rList") }));
      // Turns that ended in the last 7 days stay visible, for their per-day status controls
      var recent = addDays(today, -7);
      var past = rota.entries.filter(function (e) { return e.end < recent; });
      var up = rota.entries.filter(function (e) { return e.end >= recent; });
      if (past.length) root.appendChild(h("button", { type: "button", class: "link-btn r-past", "data-k": "past", "aria-expanded": String(rotaShowPast),
        text: rotaShowPast ? T("rHidePast") : T("rShowPast", past.length), onclick: function () { rotaShowPast = !rotaShowPast; renderRota(); } }));
      root.appendChild(h("ol", { class: "r-list" }, (rotaShowPast ? past.concat(up) : up).map(function (e) { return entryRow(e, today, members); })));
    }

    if (keepK) {
      var el = root.querySelector('[data-k="' + cssEscape(keepK) + '"]');
      (el && !el.disabled && el.offsetParent !== null ? el : $("rotaClose")).focus();
    }
  }
  function refreshRota(prev) {
    var k = prev && prev.getAttribute ? prev.getAttribute("data-k") : null;
    renderRota();
    var el = k ? $("rotaBody").querySelector('[data-k="' + cssEscape(k) + '"]') : null;
    (el && el.offsetParent !== null ? el : $("rotaClose")).focus();
  }
  function openRota(focusDue) {
    var a = document.activeElement;
    rotaLastFocus = menu.contains(a) ? menuBtn : a;
    closeMenu();
    rotaOpen.settings = null;
    renderRota();
    var dlg = $("rotaDlg");
    if (!dlg.open) { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }
    var first = focusDue ? $("rotaBody").querySelector(".m-list a, .m-list button") : null;
    if (first) first.focus();
  }
  function closeRota() {
    var dlg = $("rotaDlg");
    if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
  }
  $("rotaBtn").addEventListener("click", function () { openRota(false); });
  $("lmoOpen").addEventListener("click", function () { openRota(true); });
  $("rotaClose").addEventListener("click", closeRota);
  $("rotaDlg").addEventListener("close", function () {
    render();
    var f = rotaLastFocus;
    if (f && f.focus && f.isConnected && f.offsetParent !== null) f.focus(); else menuBtn.focus();
  });
  $("rotaDlg").addEventListener("click", function (e) { if (e.target === e.currentTarget) closeRota(); });

  /* ---------- Print: roster and daily checklist (MQS audit evidence) ---------- */
  function printRota(kind) {
    var today = todayISO(), area = $("printArea");
    var list = rota.entries.filter(function (e) { return rotaShowPast || e.end >= today; });
    if (!list.length) { showToast(T("rNothingToPrint"), false); return; }
    area.textContent = "";
    function table(cols, rows, cls) {
      return h("table", { class: "p-table " + cls }, [
        h("thead", null, [h("tr", null, cols.map(function (x) { return h("th", { scope: "col", text: x }); }))]),
        h("tbody", null, rows.map(function (r) { return h("tr", { class: r.cls }, r.cells.map(function (x) { return h("td", { text: x }); })); }))
      ]);
    }
    var roster = kind === "roster";
    area.appendChild(h("h1", { class: "p-title", text: roster ? T(rota.mode === "day" ? "pRosterTitleDay" : "pRosterTitle") : T("pCheckTitle") }));
    area.appendChild(h("p", { class: "p-sub", text: T("pDept") }));
    var days = [], d = nextWorkday(today);
    while (days.length < 20) { days.push(d); d = nextWorkday(addDays(d, 1)); }   // checklist: 4 weeks of working days
    area.appendChild(h("p", { class: "p-meta", text: (roster ? "" : lmoRange({ start: days[0], end: days[19] }) + " · ") +
      T("pDutyTime", rota.timeFrom, rota.timeTo) + " · " + T("pMqs") }));
    if (roster) {
      area.appendChild(table([T("pBil"), T("pWeek"), T("pName"), T("pRole"), T("pSign"), T("pNote")], list.map(function (e, i) {
        var c = e.off ? null : entryContact(e);
        return e.off ? { cls: "p-off", cells: [String(i + 1), lmoRange(e), T("pHoliday"), "", "", ""] }
          : { cells: [String(i + 1), lmoRange(e), personName(e), c ? [c.role, c.prog].filter(Boolean).join(" / ") : "", "", ""] };
      }), "p-roster"));
    } else {
      var rows = days.map(function (day) {
        var e = entryOn(day);
        return { cls: e && e.off ? "p-off" : null, cells: [shortDate(day, { weekday: "short", day: "numeric", month: "short" }),
          e ? (e.off ? T("pHoliday") : personName(e)) : "", "☐", "☐", "☐", "☐", "", ""] };
      });
      area.appendChild(table([T("pDate"), T("pOfficer"), T("pLights"), T("pAc"), T("pSwitch"), T("pDoor"), T("pTimeOut"), T("pSign")], rows, "p-check"));
      area.appendChild(h("p", { class: "p-checked", text: T("pCheckedBy") }));
    }
    area.appendChild(h("p", { class: "p-foot", text: T("pPrinted", longDate(today)) }));
    document.body.classList.add("print-rota");
    var cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      window.removeEventListener("afterprint", cleanup);
      document.body.classList.remove("print-rota");
      area.textContent = "";
    }
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  /* ================================================================
     Theme and language
     ================================================================ */
  function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
    $("themeBtn").setAttribute("aria-pressed", String(document.documentElement.getAttribute("data-theme") === "dark"));
  }
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (savedTheme === "dark" || savedTheme === "light") applyTheme(savedTheme);
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) applyTheme("dark");
  else applyTheme(null);

  $("themeBtn").addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });

  function applyLang(l) {
    lang = I18N[l] ? l : "ms";
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = T(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) { el.placeholder = T(el.getAttribute("data-i18n-placeholder")); });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", T(el.getAttribute("data-i18n-aria"))); });
    document.querySelectorAll(".lang [data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang)); });
    renderToday();
    renderDestination();
    if ($("detect").hidden === false) detectKeywords();
    render();
    if ($("insight").open) renderInsight();
    if ($("contactsDlg").open) renderContacts();
    if ($("sendDlg").open) renderSendAll();
    if ($("monitorDlg").open) renderMonitor();
    if ($("rotaDlg").open) renderRota();
    renderRoleOptions();
  }
  document.querySelectorAll(".lang [data-lang]").forEach(function (b) {
    b.addEventListener("click", function () {
      var l = b.getAttribute("data-lang");
      try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
      applyLang(l);
    });
  });

  // Role suggestions in the contact form follow the language
  function renderRoleOptions() {
    var dl = $("roleList");
    if (!dl) return;
    dl.textContent = "";
    T("cRoles").forEach(function (r) { dl.appendChild(h("option", { value: r })); });
  }
  function renderToday() {
    $("today").textContent = new Date().toLocaleDateString(T("locale"), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  /* ================================================================
     Keyboard shortcut, multi-tab sync, day change
     ================================================================ */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    var a = document.activeElement;
    var typing = a && (a.isContentEditable || a.tagName === "TEXTAREA" || a.tagName === "SELECT" ||
      (a.tagName === "INPUT" && !/^(checkbox|radio|button|submit|file)$/.test(a.type)));
    if (!typing && !$("insight").open) { e.preventDefault(); input.focus(); }
  });

  window.addEventListener("storage", function (e) {
    if (e.key !== KEY && e.key !== ARCHIVE_KEY && e.key !== ROTA_KEY && e.key !== CONTACTS_KEY) return;
    if (document.activeElement && document.activeElement.classList.contains("task-edit")) return;
    loadAll();
    renderContactOptions();
    render();
    if ($("rotaDlg").open) renderRota();
  });

  var lastDay = todayISO();
  setInterval(function () {
    // Every minute: Last Man Out notices, and the "Selesai not confirmed" banner once the deadline passes
    renderLmoBanner();
    if (renderKjBanner() && $("rotaDlg").open) renderRota();
    var now = todayISO();
    if (now === lastDay) return;
    lastDay = now;
    renderToday();
    var n = promoteDue();
    commit();
    if ($("rotaDlg").open) renderRota();
    if (n) showToast(T("promoted", n), false);
  }, 60000);

  /* ================================================================
     Start
     ================================================================ */
  var savedLang = null;
  try { savedLang = localStorage.getItem(LANG_KEY); } catch (e) {}
  lang = savedLang && I18N[savedLang] ? savedLang : "ms";

  loadAll();
  renderContactOptions();
  var promotedOnLoad = promoteDue();
  if (promotedOnLoad) save();
  applyLang(lang);
  if (promotedOnLoad) showToast(T("promoted", promotedOnLoad), false);

  // ?demo=1 loads the sample week (only when the planner is empty, so real data is never replaced)
  if (/[?&]demo=1\b/.test(location.search)) {
    if (!tasks.length) loadSample(true);
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
  }
  // ?pakej=lmo adds the Last Man Out (MQS) task pack on top of existing tasks
  if (/[?&]pakej=lmo\b/.test(location.search)) {
    addPackLmo();
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
  }
})();
