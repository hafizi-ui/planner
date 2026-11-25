/* JPPP Smart Planner: after a meeting, record each action, tell the PIC in one tap and see who knows;
   and run the Last Man Out (MQS) rota. Plain JavaScript, no dependencies.
   Data stays in this browser (localStorage). */
(function () {
  "use strict";

  /* ================================================================
     Constants
     ================================================================ */
  var KEY = "eisenhower-planner:v1";          // tasks (key name kept from the first version of the app)
  var ARCHIVE_KEY = "eisenhower-planner:archive"; // finished / deleted tasks, kept for 120 days
  var META_KEY = "eisenhower-planner:meta";
  var THEME_KEY = "eisenhower-planner:theme";
  var LANG_KEY = "eisenhower-planner:lang";
  var DAY = 86400000;
  var ARCHIVE_DAYS = 120;
  var DONE_DAYS = 30;                          // "Siap" shows the last 30 days; older done tasks go to the archive
  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  // Box names of the old four-box planner. Still written (field "q") so an older cached copy can read the data.
  var QSET = Object.create(null);
  ["do", "schedule", "delegate", "delete"].forEach(function (q) { QSET[q] = true; });
  var ACK_VIA = { su: true, link: true, "old-status": true };   // how "PIC knows" was recorded ("link" = phase 2)
  var SENT_VIA = { wa: true, email: true };

  var ICONS = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.4 18.6z"/><path d="M9 10c.4 2 2 3.6 4 4"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0M19 4v4M17 6h4"/></svg>',
    person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17M12 13.5v4M10 15.5h4"/></svg>',
    calS: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16.5h.01"/><path d="M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true" class="row-chev"><path d="M9 6l6 6-6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    door: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M14 12h.01" stroke-width="3"/></svg>',
    print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3.5h10V9M7 17H4.5V10a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v7H17"/><rect x="7" y="14" width="10" height="6.5" rx="1"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M4.5 4.5l1.8 1.8M17.7 17.7l1.8 1.8M2.5 12H5M19 12h2.5M4.5 19.5l1.8-1.8M17.7 6.3l1.8-1.8"/></svg>'
  };

  // Link that opens Google Calendar with an all-day event already filled in (no login or server needed here)
  function gcalUrl(t, guestEmail) {
    var p = t.date.split("-").map(Number);
    var next = new Date(p[0], p[1] - 1, p[2] + 1, 12);
    var start = t.date.replace(/-/g, ""), end = todayISO(next.getTime()).replace(/-/g, "");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(t.text) +
      "&dates=" + start + "/" + end +
      "&details=" + encodeURIComponent(T("calDetailsDel")) +
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
     Text in two languages (BM / EN). Every key exists in both.
     ================================================================ */
  var I18N = {
    en: {
      skip: "Skip to content", navLabel: "Main navigation",
      tabMeetings: "Meetings", tabLmo: "Last Man Out", tabMore: "More", tabDot: "Needs action today",
      meetingsTitle: "Meeting tasks", newTask: "New task",
      close: "Close", cancel: "Cancel", undo: "Undo", save: "Save", del: "Delete", optional: "(optional)",
      fWhat: "What is the task?", fWhatPh: "e.g. Prepare the MQS audit report",
      fWho: "Who is the PIC?", fWhoSearch: "Search contacts", fRecent: "Recent PICs",
      fUseName: function (n) { return "Use “" + n + "”"; }, fUseNameSub: "New name",
      fNotContact: "Not in contacts", fSaveContact: "Save as contact", fChange: "Change",
      fContactSaved: function (n) { return n + " saved to contacts. Add a WhatsApp no. later so messages can be sent."; },
      fWhen: "When is it due?", dToday: "Today", dTomorrow: "Tomorrow", dFri: "This Friday", dNextWeek: "Next week",
      dPick: "Pick a date", dNone: "No date", dPickAria: "Pick the due date",
      dateKw: { today: ["today"], tomorrow: ["tomorrow"], nextweek: ["next week"] },
      errWhat: "Write what the task is.", errWho: "Choose a PIC.",
      saveMore: "Save & add another",
      savedUnsent: function (n) { return "Saved. " + n + " doesn't know yet."; }, savedNext: "Saved. Add the next task.", sendNow: "Send now",
      gNoPic: "No PIC", gNoPicHelp: "Tasks from the earlier version of the planner. Choose a PIC for each one, or delete it.",
      gUnsent: "Not told yet", gUnsentHelp: "The PIC doesn't know about these tasks yet.",
      gWaiting: "Waiting for PIC", gWaitingHelp: "Message sent. Tap “Knows” when the PIC replies.",
      gKnows: "PIC knows", gKnowsHelp: "Keep an eye on the due dates.",
      gDone: "Done", gDoneHelp: "Last 30 days.",
      nTasks: function (n) { return n + (n === 1 ? " task" : " tasks"); },
      hlUnsent: function (n) { return n === 1 ? "1 PIC doesn't know their task yet" : n + " PICs don't know their tasks yet"; },
      hlAllSent: "Everyone has been told", hlAllKnow: "Every PIC knows their tasks", hlEmpty: "No meeting tasks yet",
      hlWaiting: function (n) { return n + " waiting for confirmation"; }, hlLate: function (n) { return n + " overdue"; },
      hlNoLate: "Nothing overdue", hlNoPic: function (n) { return n + (n === 1 ? " task without a PIC" : " tasks without a PIC"); },
      sendToN: function (n) { return "Send to " + n + (n === 1 ? " PIC" : " PICs"); },
      knows: "Knows", knowsLong: "PIC knows",
      knowsAria: function (n, x) { return "Knows: " + n + ", " + x; },
      knowsHint: "Tap when the PIC replies to your message (e.g. “OK, noted”).",
      knowsDone: function (n) { return "Marked: " + n + " knows."; },
      allKnow: function (n) { return "Mark all as known (" + n + ")"; },
      allKnowDone: function (n, who) { return n + (n === 1 ? " task" : " tasks") + " marked: " + who + " knows."; },
      ackBySu: "Marked by you", ackByLink: "The PIC confirmed by link", ackByOld: "From the old status",
      statusH: "Status", stepRecorded: "Recorded", stepTell: "Tell the PIC", stepTold: "Told", stepAck: "PIC confirmed", stepDone: "Done",
      stepPick: "Choose the PIC", stepDoneSr: "(done)",
      tellHint: function (n) { return "Choose how to tell " + n + "."; },
      notConfirmed: function (x) { return "Not confirmed. Sent " + x + "."; },
      noReply: function (n) { return "No reply after " + n + (n === 1 ? " working day." : " working days."); }, remindLead: "Send a reminder:",
      lateN: function (n) { return n + (n === 1 ? " day overdue" : " days overdue"); },
      lateBanner: function (n, d) { return n + (n === 1 ? " day overdue" : " days overdue") + ". Due " + d + "."; },
      dueOn: function (d) { return "Due " + d; }, dueToday: "Due today", dueTomorrow: "Due tomorrow", dueLabel: "Due date",
      pillToday: "Today", pillTomorrow: "Tomorrow",
      sentAgo: function (x) { return "Sent " + x; }, doneOn: function (d) { return "Done " + d; },
      viaWa: "WhatsApp", viaEmail: "Email", viaOther: "Message",
      clock: function (h, m) { return (h % 12 || 12) + ":" + m + (h < 12 ? " am" : " pm"); },
      btnWa: "WhatsApp", btnEmail: "Email", remindWa: "WhatsApp reminder", remindEmail: "Email reminder",
      resend: "Send again", seeMsg: "See message", inviteCal: "Invite in Google Calendar", askOrRemind: "Ask for status / reminder", remindLate: "Send a reminder",
      markDone: "Mark done", reopen: "Reopen", doneToast: "Task marked done.", reopened: "Task reopened.",
      needHelp: "Needs help", needHelpSub: "The PIC asked for help or is blocked",
      noPic: "No PIC", noPhone: "No WhatsApp no.", noEmail: "No email",
      pickPic: "Choose PIC", pickPicTitle: "Choose the PIC", picSet: function (n) { return "PIC: " + n; },
      delTask: "Delete task", delConfirmTitle: "Delete this task?",
      delConfirm: function (x) { return "“" + x + "” will be deleted. It can't be brought back (except from a backup)."; },
      taskDeleted: "Task deleted",
      editText: "Edit the task text", editSave: "Save text", textSaved: "Task text saved.",
      taskEyebrow: "Meeting task",
      sendSheetEyebrow: "One message per person", sendTitle: "Send to PICs",
      msgTitle: "Message title", msgTitlePh: "e.g. Department Meeting 4/2026",
      sentProgress: function (a, b) { return a + " of " + b + (b === 1 ? " person sent" : " people sent"); }, progressAria: "Sending progress",
      sentCard: function (c, t) { return "Sent by " + c + ", " + t; }, sentPill: "Sent", notYet: "Not yet", finish: "Done",
      sentMarked: function (c, n, k) { return c + " opened for " + n + ". " + k + (k === 1 ? " task" : " tasks") + " marked as told."; },
      sentOne: function (c, n) { return c + " opened for " + n + ". Marked as told."; },
      noneToSend: "No new tasks to send. Every PIC has been told.",
      tasksOpen: function (n) { return n + (n === 1 ? " open task" : " open tasks"); },
      waitingN: function (n) { return n + " waiting to confirm"; },
      askStatusHint: function (n) { return "One message listing " + n + "'s open tasks. They reply with a letter: A = Not started, B = In progress, C = Done, D = Need help."; },
      askSent: function (n) { return "Status request opened for " + n + "."; },
      contactEyebrow: "Contact",
      lmoNoticeTitle: function (n) { return "Last Man Out this week: " + n; }, lmoNoticeWa: "Send the WhatsApp reminder today.",
      lmoSeeAll: "Open Last Man Out",
      lmoTabSub: "Office closing rota (MQS)",
      lmoThisWeek: function (p) { return "This week · " + p; }, lmoNextTurn: function (p) { return "Next turn · " + p; },
      lmoDutyTime: function (a, b) { return "on duty " + a + "–" + b; },
      lmoEmailCal: "Email & calendar invitation",
      lmoAutoOn: function (d) { return "Sent automatically by Google Apps Script on " + d; },
      lmoSentOn: function (d) { return "Sent " + d; }, lmoToSendNow: "To send now", lmoToSendOn: function (d) { return "To send on " + d; },
      lmoWaLine: "WhatsApp reminder", lmoWaToday: "To send today",
      lmoConfirmTitle: "Done confirmation",
      lmoConfirmAuto: function (had) { return "The officer presses Done after the duty each evening (deadline " + had + "). If not, the Head of Department is told automatically."; },
      lmoConfirmManual: function (had) { return "The officer tells you SELESAI after the duty each evening (deadline " + had + "). If not, the planner asks you to tell the Head of Department."; },
      lmoDaysAria: "Duty days", dayStToday: "Today", dayStOk: "Done", dayStOff: "No duty", dayStPending: "Not confirmed", dayStKj: "HoD told",
      lmoUpcoming: "Coming up", lmoEmailAuto: function (d) { return "Automatic email " + d; }, lmoEmailOn: function (d) { return "Email " + d; },
      lmoManage: "Manage rota", lmoNeedAct: "Needs action",
      lmoAutoNote: "Automatic via Google Apps Script: email, calendar invitation, Done button and alerts to the Head of Department.",
      lmoManualNote: "Without the Google Apps Script, send the email, calendar invitation and WhatsApp yourself from this page. The Guide explains how to make it automatic.",
      lmoEmpty: "No rota yet. Import the staff list in Team contacts, then create the rota in Manage rota.",
      lmoNoMore: "No later turns yet. Add a round in Manage rota.",
      moreTitle: "More", moreSub: "Settings and tools", mPeople: "People", mBackup: "Backup",
      mBackupSave: "Save a backup", mBackupSaveSub: "Download all tasks, contacts and the rota",
      mBackupLoad: "Restore a backup", mBackupLoadSub: "From another phone or an old backup",
      mDisplay: "Display", mLang: "Language", mTheme: "Theme", themeLight: "Light", themeDark: "Dark", themeAuto: "Auto",
      mApp: "App", install: "Install app", mInstallSub: "Open it from your home screen",
      mGuide: "Guide", mGuideSub: "Last Man Out automation, in Bahasa Melayu",
      foot: "Everything stays on this device. Nothing is sent anywhere. Use Save a backup to keep a copy.",
      backupSaved: "Backup file downloaded. Keep it in Google Drive or email it to yourself.",
      emptyTasks: "No tasks yet. After a meeting, tap “New task”.", trySample: "Try with an example",
      addToCal: function (x) { return "Add to Google Calendar: " + x; },
      calDetailsDel: "Task assigned via JPPP Smart Planner (https://hafizi-ui.github.io/planner/).",
      saveContact: "Save contact",
      waAria: function (n, x) { return "Send on WhatsApp to " + n + ": " + x; },
      mailAria: function (n, x) { return "Send email to " + n + ": " + x; },
      msgSubject: function (x) { return "Task for your action: " + x; },
      msgBody: function (name, text, due, cal) {
        return "Hi " + name + ",\n\nA task for your action:\n*" + text + "*" +
          (due ? "\nDue: " + due : "") + (cal ? "\n\nAdd it to Google Calendar:\n" + cal : "") + "\n\nThank you.";
      },
      contacts: "Team contacts",
      contactsNote: "Saved on this device only. Never uploaded anywhere. Included in Save a backup.",
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
      groupBody: function (name, from, lines) {
        return "Hi " + name + ",\n\n" + (from ? "Action items from " + from + ":" : "Tasks for your action:") + "\n\n" + lines + "\n\nThank you.";
      },
      groupSubject: function (from, n) { return (from ? from + ": " : "") + n + (n === 1 ? " task" : " tasks") + " for your action"; },
      nOpen: function (n) { return n + (n === 1 ? " open task" : " open tasks"); },
      dueShort: "Due",
      todayW: "today", yesterdayW: "yesterday", daysAgo: function (n) { return n + " days ago"; },
      remindMsg: function (name, text, n, date) {
        var when = n < 0 ? "was due on " + date + " (" + (-n) + (n === -1 ? " day" : " days") + " ago)" : n === 0 ? "is due today (" + date + ")" : n === 1 ? "is due tomorrow (" + date + ")" : "is due on " + date;
        return "Hi " + name + ",\n\nA friendly reminder: *" + text + "* " + when + ".\n\nCould you share the latest status? Thank you.";
      },
      askMsg: function (name, lines) {
        return "Hi " + name + ",\n\nCould you share the status of these tasks?\n\n" + lines +
          "\n\nReply with the task number and a letter:\nA = Not started, B = In progress, C = Done, D = Need help\nExample: 1C, 2B\n\nThank you.";
      },
      remindSubject: function (x) { return "Reminder: " + x; }, askSubject: "Task status update", askStatus: "Ask for status",
      imported: function (n) { return n + " tasks imported"; }, badFile: "That file is not a planner backup",
      saveFail: "Could not save. Save a backup now (More).",
      confirmSample: "Replace your current tasks with the example? A copy of your tasks is kept, and Save a backup still works.",
      sampleLoaded: "Example loaded, with example contacts. Delete them when you no longer need them.",
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
      days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      locale: "en-MY"
    },
    ms: {
      skip: "Langkau ke kandungan", navLabel: "Navigasi utama",
      tabMeetings: "Mesyuarat", tabLmo: "Last Man Out", tabMore: "Lagi", tabDot: "Perlu tindakan hari ini",
      meetingsTitle: "Tugasan mesyuarat", newTask: "Tugasan baharu",
      close: "Tutup", cancel: "Batal", undo: "Batal", save: "Simpan", del: "Padam", optional: "(pilihan)",
      fWhat: "Apa tugasannya?", fWhatPh: "cth. Sediakan laporan audit MQS",
      fWho: "Siapa PIC?", fWhoSearch: "Cari nama dalam kenalan", fRecent: "PIC terkini",
      fUseName: function (n) { return "Guna “" + n + "”"; }, fUseNameSub: "Nama baharu",
      fNotContact: "Bukan dalam kenalan", fSaveContact: "Simpan sebagai kenalan", fChange: "Tukar",
      fContactSaved: function (n) { return n + " disimpan dalam kenalan. Tambah no. WhatsApp kemudian supaya mesej boleh dihantar."; },
      fWhen: "Bila perlu siap?", dToday: "Hari ini", dTomorrow: "Esok", dFri: "Jumaat ini", dNextWeek: "Minggu depan",
      dPick: "Pilih tarikh", dNone: "Tiada tarikh", dPickAria: "Pilih tarikh siap",
      dateKw: { today: ["hari ini", "harini"], tomorrow: ["esok"], nextweek: ["minggu depan"] },
      errWhat: "Tulis apa tugasannya.", errWho: "Pilih PIC.",
      saveMore: "Simpan & tambah lagi",
      savedUnsent: function (n) { return "Disimpan. " + n + " belum tahu."; }, savedNext: "Disimpan. Tambah tugasan seterusnya.", sendNow: "Hantar sekarang",
      gNoPic: "Tiada PIC", gNoPicHelp: "Tugasan daripada versi planner yang lama. Pilih PIC untuk setiap satu, atau padam.",
      gUnsent: "Belum dimaklumkan", gUnsentHelp: "PIC belum tahu tugasan ini.",
      gWaiting: "Menunggu PIC sahkan", gWaitingHelp: "Mesej sudah dihantar. Tekan “Sudah tahu” bila PIC balas.",
      gKnows: "PIC sudah tahu", gKnowsHelp: "Pantau tarikh siap.",
      gDone: "Siap", gDoneHelp: "30 hari lepas.",
      nTasks: function (n) { return n + " tugasan"; },
      hlUnsent: function (n) { return n + " PIC belum tahu tugasan mereka"; },
      hlAllSent: "Semua sudah dimaklumkan", hlAllKnow: "Semua PIC sudah tahu tugasan mereka", hlEmpty: "Belum ada tugasan mesyuarat",
      hlWaiting: function (n) { return n + " menunggu pengesahan"; }, hlLate: function (n) { return n + " lewat"; },
      hlNoLate: "Tiada yang lewat", hlNoPic: function (n) { return n + " tugasan tiada PIC"; },
      sendToN: function (n) { return "Hantar kepada " + n + " PIC"; },
      knows: "Sudah tahu", knowsLong: "PIC sudah tahu",
      knowsAria: function (n, x) { return "Sudah tahu: " + n + ", " + x; },
      knowsHint: "Tekan bila PIC balas mesej anda (cth. “Baik, noted”).",
      knowsDone: function (n) { return "Ditanda: " + n + " sudah tahu."; },
      allKnow: function (n) { return "Tanda semua sudah tahu (" + n + ")"; },
      allKnowDone: function (n, who) { return n + " tugasan ditanda: " + who + " sudah tahu."; },
      ackBySu: "Ditanda oleh anda", ackByLink: "PIC sahkan melalui pautan", ackByOld: "Daripada status lama",
      statusH: "Status", stepRecorded: "Direkod", stepTell: "Maklumkan PIC", stepTold: "Dimaklumkan", stepAck: "PIC sahkan terima", stepDone: "Siap",
      stepPick: "Pilih PIC", stepDoneSr: "(selesai)",
      tellHint: function (n) { return "Pilih cara untuk beritahu " + n + "."; },
      notConfirmed: function (x) { return "Belum disahkan. Dihantar " + x + "."; },
      noReply: function (n) { return "Belum ada jawapan selepas " + n + " hari bekerja."; }, remindLead: "Hantar peringatan:",
      lateN: function (n) { return "Lewat " + n + " hari"; },
      lateBanner: function (n, d) { return "Lewat " + n + " hari. Tarikh siap " + d + "."; },
      dueOn: function (d) { return "Siap " + d; }, dueToday: "Siap hari ini", dueTomorrow: "Siap esok", dueLabel: "Tarikh siap",
      pillToday: "Hari ini", pillTomorrow: "Esok",
      sentAgo: function (x) { return "Dihantar " + x; }, doneOn: function (d) { return "Siap " + d; },
      viaWa: "WhatsApp", viaEmail: "Emel", viaOther: "Mesej",
      clock: function (h, m) { return (h % 12 || 12) + ":" + m + (h < 12 ? " pagi" : h < 19 ? " petang" : " malam"); },
      btnWa: "WhatsApp", btnEmail: "Emel", remindWa: "Peringatan WhatsApp", remindEmail: "Peringatan emel",
      resend: "Hantar semula", seeMsg: "Lihat mesej", inviteCal: "Jemput ke Google Calendar", askOrRemind: "Minta status / peringatan", remindLate: "Hantar peringatan",
      markDone: "Tanda siap", reopen: "Buka semula", doneToast: "Tugasan ditanda siap.", reopened: "Tugasan dibuka semula.",
      needHelp: "Perlu bantuan", needHelpSub: "PIC minta bantuan atau ada halangan",
      noPic: "Tiada PIC", noPhone: "Tiada no. WhatsApp", noEmail: "Tiada emel",
      pickPic: "Pilih PIC", pickPicTitle: "Pilih PIC", picSet: function (n) { return "PIC: " + n; },
      delTask: "Padam tugasan", delConfirmTitle: "Padam tugasan ini?",
      delConfirm: function (x) { return "“" + x + "” akan dipadam. Ia tidak boleh dikembalikan selepas ini (kecuali dari sandaran)."; },
      taskDeleted: "Tugasan dipadam",
      editText: "Sunting teks tugasan", editSave: "Simpan teks", textSaved: "Teks tugasan disimpan.",
      taskEyebrow: "Tugasan mesyuarat",
      sendSheetEyebrow: "Satu mesej untuk setiap orang", sendTitle: "Hantar kepada PIC",
      msgTitle: "Tajuk mesej", msgTitlePh: "cth. Mesyuarat Jabatan Bil. 4/2026",
      sentProgress: function (a, b) { return a + " daripada " + b + " orang dihantar"; }, progressAria: "Kemajuan hantar",
      sentCard: function (c, t) { return "Dihantar melalui " + c + ", " + t; }, sentPill: "Dihantar", notYet: "Belum", finish: "Selesai",
      sentMarked: function (c, n, k) { return c + " dibuka untuk " + n + ". " + k + " tugasan ditanda dimaklumkan."; },
      sentOne: function (c, n) { return c + " dibuka untuk " + n + ". Ditanda dimaklumkan."; },
      noneToSend: "Tiada tugasan baharu untuk dihantar. Semua PIC sudah dimaklumkan.",
      tasksOpen: function (n) { return n + " tugasan belum siap"; },
      waitingN: function (n) { return n + " menunggu sahkan"; },
      askStatusHint: function (n) { return "Satu mesej dengan semua tugasan " + n + " yang belum siap. PIC balas dengan huruf: A = Belum mula, B = Sedang buat, C = Siap, D = Perlu bantuan."; },
      askSent: function (n) { return "Permintaan status dibuka untuk " + n + "."; },
      contactEyebrow: "Kenalan",
      lmoNoticeTitle: function (n) { return "Last Man Out minggu ini: " + n; }, lmoNoticeWa: "Hantar peringatan WhatsApp hari ini.",
      lmoSeeAll: "Buka Last Man Out",
      lmoTabSub: "Giliran tutup pejabat (MQS)",
      lmoThisWeek: function (p) { return "Minggu ini · " + p; }, lmoNextTurn: function (p) { return "Giliran seterusnya · " + p; },
      lmoDutyTime: function (a, b) { return "bertugas " + a + "–" + b; },
      lmoEmailCal: "Emel & jemputan kalendar",
      lmoAutoOn: function (d) { return "Dihantar automatik oleh Google Apps Script pada " + d; },
      lmoSentOn: function (d) { return "Dihantar " + d; }, lmoToSendNow: "Perlu dihantar sekarang", lmoToSendOn: function (d) { return "Dihantar pada " + d; },
      lmoWaLine: "Peringatan WhatsApp", lmoWaToday: "Perlu dihantar hari ini",
      lmoConfirmTitle: "Pengesahan Selesai",
      lmoConfirmAuto: function (had) { return "Pegawai tekan Selesai selepas tugas setiap petang (had " + had + "). Jika tiada, Ketua Jabatan dimaklumkan secara automatik."; },
      lmoConfirmManual: function (had) { return "Pegawai maklumkan SELESAI kepada anda selepas tugas setiap petang (had " + had + "). Jika tiada, planner akan minta anda maklumkan Ketua Jabatan."; },
      lmoDaysAria: "Hari bertugas", dayStToday: "Hari ini", dayStOk: "Selesai", dayStOff: "Tiada tugas", dayStPending: "Belum sahkan", dayStKj: "KJ dimaklumkan",
      lmoUpcoming: "Akan datang", lmoEmailAuto: function (d) { return "Emel automatik " + d; }, lmoEmailOn: function (d) { return "Emel " + d; },
      lmoManage: "Urus giliran", lmoNeedAct: "Perlu tindakan",
      lmoAutoNote: "Automatik melalui Google Apps Script: emel, jemputan kalendar, butang Selesai dan amaran kepada Ketua Jabatan.",
      lmoManualNote: "Tanpa Google Apps Script, hantar emel, jemputan kalendar dan WhatsApp sendiri dari halaman ini. Panduan menerangkan cara menjadikannya automatik.",
      lmoEmpty: "Belum ada jadual giliran. Import senarai staf di Kenalan jabatan, kemudian jana jadual di Urus giliran.",
      lmoNoMore: "Belum ada giliran seterusnya. Sambung satu pusingan di Urus giliran.",
      moreTitle: "Lagi", moreSub: "Tetapan dan alat", mPeople: "Orang", mBackup: "Sandaran data",
      mBackupSave: "Simpan sandaran", mBackupSaveSub: "Muat turun semua tugasan, kenalan dan giliran",
      mBackupLoad: "Pulihkan sandaran", mBackupLoadSub: "Dari telefon lain atau sandaran lama",
      mDisplay: "Paparan", mLang: "Bahasa", mTheme: "Tema", themeLight: "Cerah", themeDark: "Gelap", themeAuto: "Auto",
      mApp: "Aplikasi", install: "Pasang aplikasi", mInstallSub: "Buka terus dari skrin utama",
      mGuide: "Panduan", mGuideSub: "Automasi Last Man Out, dalam Bahasa Melayu",
      foot: "Semua data kekal dalam peranti ini. Tiada apa-apa dihantar keluar. Guna Simpan sandaran untuk menyimpan salinan.",
      backupSaved: "Fail sandaran dimuat turun. Simpan di Google Drive atau emel kepada diri sendiri.",
      emptyTasks: "Belum ada tugasan. Selepas mesyuarat, tekan “Tugasan baharu”.", trySample: "Cuba dengan contoh",
      addToCal: function (x) { return "Tambah ke Google Calendar: " + x; },
      calDetailsDel: "Tugasan diagihkan melalui JPPP Smart Planner (https://hafizi-ui.github.io/planner/).",
      saveContact: "Simpan kenalan",
      waAria: function (n, x) { return "Hantar WhatsApp kepada " + n + ": " + x; },
      mailAria: function (n, x) { return "Hantar emel kepada " + n + ": " + x; },
      msgSubject: function (x) { return "Tugasan untuk tindakan: " + x; },
      msgBody: function (name, text, due, cal) {
        return "Salam " + name + ",\n\nTugasan untuk tindakan tuan/puan:\n*" + text + "*" +
          (due ? "\nTarikh akhir: " + due : "") + (cal ? "\n\nTambah ke Google Calendar:\n" + cal : "") + "\n\nTerima kasih.";
      },
      contacts: "Kenalan jabatan",
      contactsNote: "Disimpan dalam peranti ini sahaja. Tidak dimuat naik ke mana-mana. Termasuk dalam Simpan sandaran.",
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
      groupBody: function (name, from, lines) {
        return "Salam " + name + ",\n\n" + (from ? "Tindakan daripada " + from + ":" : "Tugasan untuk tindakan tuan/puan:") + "\n\n" + lines + "\n\nTerima kasih.";
      },
      groupSubject: function (from, n) { return (from ? from + ": " : "") + n + " tugasan untuk tindakan"; },
      nOpen: function (n) { return n + " tugasan belum selesai"; },
      dueShort: "Tarikh akhir",
      todayW: "hari ini", yesterdayW: "semalam", daysAgo: function (n) { return n + " hari lepas"; },
      remindMsg: function (name, text, n, date) {
        var when = n < 0 ? "sepatutnya siap pada " + date + " (lewat " + (-n) + " hari)" : n === 0 ? "perlu disiapkan hari ini (" + date + ")" : n === 1 ? "perlu disiapkan esok (" + date + ")" : "perlu disiapkan pada " + date;
        return "Salam " + name + ",\n\nPeringatan mesra: tugasan *" + text + "* " + when + ".\n\nBoleh kongsi status terkini? Terima kasih.";
      },
      askMsg: function (name, lines) {
        return "Salam " + name + ",\n\nBoleh kongsi status tugasan berikut?\n\n" + lines +
          "\n\nBalas dengan nombor tugasan dan huruf:\nA = Belum mula, B = Sedang buat, C = Siap, D = Perlukan bantuan\nContoh: 1C, 2B\n\nTerima kasih.";
      },
      remindSubject: function (x) { return "Peringatan: " + x; }, askSubject: "Kemas kini status tugasan", askStatus: "Minta status",
      imported: function (n) { return n + " tugasan diimport"; }, badFile: "Fail itu bukan sandaran planner",
      saveFail: "Tidak dapat simpan. Simpan sandaran sekarang (Lagi).",
      confirmSample: "Ganti tugasan semasa dengan contoh? Salinan tugasan anda tetap disimpan, dan Simpan sandaran masih boleh digunakan.",
      sampleLoaded: "Contoh dimuatkan, bersama kenalan contoh. Padam bila tidak diperlukan lagi.",
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
      days: ["Ahd", "Isn", "Sel", "Rab", "Kha", "Jum", "Sab"],
      locale: "ms-MY"
    }
  };

  var lang = "ms";
  function T(key) {
    var dict = I18N[lang], v = dict[key] !== undefined ? dict[key] : I18N.en[key];
    if (typeof v === "function") return v.apply(null, Array.prototype.slice.call(arguments, 1));
    return v === undefined ? key : v;
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


  // Turn anything (old saves, imports) into a clean task object. Old fields are kept, so nothing is lost.
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
      who: typeof t.who === "string" ? t.who.trim().slice(0, 60) : "",
      origin: QSET[t.origin] ? t.origin : t.q,
      doneAt: num(t.doneAt) || null,
      doneQ: QSET[t.doneQ] ? t.doneQ : null,
      promoted: t.promoted === true,
      notifiedAt: num(t.notifiedAt) || null,
      sentVia: SENT_VIA[t.sentVia] ? t.sentVia : "",
      ackAt: num(t.ackAt) || null,
      ackVia: ACK_VIA[t.ackVia] ? t.ackVia : "",
      status: t.status === "doing" || t.status === "blocked" ? t.status : "",
      statusNote: typeof t.statusNote === "string" ? t.statusNote.slice(0, 140) : "",
      statusAt: num(t.statusAt) || null,
      remindedAt: num(t.remindedAt) || null,
      askedAt: num(t.askedAt) || null,
      src: typeof t.src === "string" ? t.src.trim().slice(0, 80) : "",
      reactive: t.reactive === true,
      moves: Array.isArray(t.moves) ? t.moves.filter(function (m) {
        return m && QSET[m.from] && QSET[m.to] && num(m.at);
      }).slice(-20).map(function (m) { return { from: m.from, to: m.to, at: m.at, auto: m.auto === true }; }) : []
    };
    if (!n.ackAt) n.ackVia = "";
    if (n.ackAt && !n.ackVia) n.ackVia = "su";
    // Phase 2 seam ("Saya terima" link): kept when present, never created in this release
    if (typeof t.ackRef === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(t.ackRef)) n.ackRef = t.ackRef;
    if (typeof t.ackCode === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(t.ackCode)) n.ackCode = t.ackCode;
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


  /* ---------- Status model: one source of truth for every screen ---------- */
  // "nopic" (old task without a PIC) | "unsent" | "waiting" (message sent) | "knows" (PIC knows) | "done"
  function stage(t) {
    if (t.done) return "done";
    if (!t.who) return "nopic";
    if (t.ackAt) return "knows";
    if (t.notifiedAt) return "waiting";
    return "unsent";
  }
  function isLate(t) { return !t.done && !!t.date && t.date < todayISO(); }
  function lateDays(t) { return -daysUntil(t.date); }
  function needsHelp(t) { return t.status === "blocked"; }
  // Late first, then by due date (no date last), then oldest first
  function sortOpen(a, b) {
    var la = isLate(a) ? 0 : 1, lb = isLate(b) ? 0 : 1;
    if (la !== lb) return la - lb;
    var da = a.date || "9999-99-99", db = b.date || "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    return a.created - b.created;
  }
  // Order used inside messages (same as the earlier version, so message texts do not change)
  function sortByDue(a, b) {
    if (a.done !== b.done) return a.done ? 1 : -1;
    var da = a.date || "9999-99-99", db = b.date || "9999-99-99";
    if (da !== db) return da < db ? -1 : 1;
    return a.created - b.created;
  }
  // Box name for older copies of the app: tasks with a PIC were "Delegate"
  function legacyQ(t) { return t.who ? "delegate" : (t.q === "do" || t.q === "schedule" ? t.q : "delegate"); }
  // Working days (Mon-Fri) after the day a message was sent, up to today
  function workdaysSince(ts) {
    var from = todayISO(ts), today = todayISO(), n = 0;
    for (var d = addDays(from, 1); d <= today; d = addDays(d, 1)) if (isWorkday(d)) n++;
    return n;
  }

  /* ---------- Migration from the four-box planner (runs once; nothing is lost) ---------- */
  // Per task: an open "Delete" task goes to the archive as let go; an old "In progress / Needs help" status means the PIC knew.
  function mapLegacy(t, now) {
    if (t.q === "delete" && !t.done) { t.dropped = true; if (!t.archivedAt) t.archivedAt = now; return "archive"; }
    if (t.q === "delegate" && t.who && !t.ackAt && (t.status === "doing" || t.status === "blocked")) {
      t.ackAt = t.statusAt || t.notifiedAt || t.created; t.ackVia = "old-status";
    }
    return "keep";
  }
  function migrateV2() {
    if (meta.model === 2) return false;
    writeJSON(KEY + ":before-v2", { tasks: tasks, archive: archive, at: Date.now() });   // one-time safety copy
    var now = Date.now(), keep = [];
    tasks.forEach(function (t) { if (mapLegacy(t, now) === "archive") archive.push(t); else keep.push(t); });
    tasks = keep;
    meta.model = 2;
    saveMeta();
    save();
    return true;
  }
  // Done more than 30 days ago: off the list, into the archive (still in backups for 120 days)
  function autoArchiveDone() {
    var cutoff = Date.now() - DONE_DAYS * DAY, moved = 0;
    tasks = tasks.filter(function (t) {
      if (!t.done || (t.doneAt || 0) > cutoff) return true;
      t.archivedAt = Date.now(); archive.push(t); moved++;
      return false;
    });
    if (moved) save();
    return moved;
  }

  function loadAll() {
    contacts = cleanContacts(readJSON(CONTACTS_KEY, []));
    loadRota();
    var seen = Object.create(null);
    tasks = cleanList(readJSON(KEY, []), seen);
    archive = cleanList(readJSON(ARCHIVE_KEY, []), seen);
    var m = readJSON(META_KEY, {});
    meta = m && typeof m === "object" ? m : {};
    migrateV2();
    autoArchiveDone();
  }
  function pruneArchive() {
    var cutoff = Date.now() - ARCHIVE_DAYS * DAY;
    archive = archive.filter(function (a) { return (a.archivedAt || a.doneAt || a.created) > cutoff; });
  }
  function save() {
    pruneArchive();
    tasks.forEach(function (t) { t.q = legacyQ(t); if (t.done) t.doneQ = t.q; });
    var ok = writeJSON(KEY, tasks) && writeJSON(ARCHIVE_KEY, archive);
    if (!ok) showToast(T("saveFail"), false);
    return ok;
  }
  function saveMeta() { writeJSON(META_KEY, meta); }
  function find(id) {
    for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i];
    return null;
  }
  function todayISO(d) {
    d = d ? new Date(d) : new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function setDone(t, done) {
    t.done = done;
    t.doneAt = done ? Date.now() : null;
    t.doneQ = done ? t.q : null;
  }

  /* ================================================================
     Elements and small helpers
     ================================================================ */
  var $ = function (id) { return document.getElementById(id); };

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

  function longDate(iso) {
    var p = iso.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(T("locale"), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function escapeHtml(x) { return String(x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function cssEscape(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&"); }
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
  function shortDay(iso) { return parseISO(iso).toLocaleDateString(T("locale"), { weekday: "short", day: "numeric", month: "short" }); }
  function clockText(ts) { var d = new Date(ts); return T("clock", d.getHours(), pad2(d.getMinutes())); }
  // "hari ini, 8:15 pagi" / "semalam, 4:06 petang" / "Jum, 27 Nov, 4:06 petang"
  function whenText(ts) {
    var k = -daysUntil(todayISO(ts));
    return (k === 0 ? T("todayW") : k === 1 ? T("yesterdayW") : shortDay(todayISO(ts))) + ", " + clockText(ts);
  }
  function dueText(iso) { var n = daysUntil(iso); return n === 0 ? T("dueToday") : n === 1 ? T("dueTomorrow") : T("dueOn", shortDay(iso)); }
  function firstName(n) { return String(n || "").replace(/\s*\((contoh|example)\)$/i, ""); }
  function viaText(v) { return v === "wa" ? T("viaWa") : v === "email" ? T("viaEmail") : T("viaOther"); }
  function pill(cls, text, icon) { return h("span", { class: "pill pill-" + cls, html: (icon || "") + escapeHtml(text) }); }
  function svgBtn(cls, icon, text, props) {
    var p = { type: "button", class: "btn " + cls, html: (icon || "") + "<span>" + escapeHtml(text) + "</span>" };
    Object.keys(props || {}).forEach(function (k) { p[k] = props[k]; });
    return h("button", p);
  }

  /* ---------- Toast (one action button: Batal / Hantar sekarang) ---------- */
  var toastTimer = null, toastAct = null;
  function toast(message, actLabel, act) {
    $("toastText").textContent = message;
    var b = $("toastUndo");
    b.hidden = !actLabel; b.textContent = actLabel || "";
    toastAct = act || null;
    $("toast").hidden = false;
    startToastTimer(actLabel ? 8000 : 4500);
  }
  function showToast(message) { toast(message); }
  function startToastTimer(ms) {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $("toast").hidden = true; toastAct = null; }, ms || 6000);
  }
  ["mouseenter", "focusin"].forEach(function (ev) { $("toast").addEventListener(ev, function () { clearTimeout(toastTimer); }); });
  ["mouseleave", "focusout"].forEach(function (ev) { $("toast").addEventListener(ev, function () { startToastTimer(); }); });
  $("toastUndo").addEventListener("click", function () {
    var act = toastAct;
    $("toast").hidden = true; toastAct = null;
    if (act) act();
  });

  /* ---------- Sheets (native <dialog>): focus goes back to whatever opened them ---------- */
  var SHEETS = ["dlgAdd", "dlgPick", "dlgTask", "sendDlg", "dlgPic", "dlgConfirm"];
  function openSheet(id, opener, focusEl) {
    var dlg = $(id);
    if (!dlg.open) {
      dlg._ret = opener || document.activeElement;
      dlg._handoff = false;
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    }
    var f = focusEl || dlg.querySelector("h2[tabindex]");
    if (f) f.focus();
  }
  function closeSheet(id, handoff) {
    var dlg = $(id);
    if (!dlg.open) return null;
    dlg._handoff = !!handoff;
    var ret = dlg._ret;
    if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
    return ret;
  }
  // Put focus back on the opener, or on its replacement after a re-render (same data-k), or on the view heading
  function restoreFocus(el) {
    if (el && el.isConnected && el.offsetParent !== null && !el.disabled) { el.focus(); return; }
    var k = el && el.getAttribute && el.getAttribute("data-k");
    var alt = k ? document.querySelector('[data-k="' + cssEscape(k) + '"]') : null;
    if (!alt && k && k.indexOf("ack-") === 0) alt = document.querySelector('[data-k="row-' + cssEscape(k.slice(4)) + '"]');
    if (alt && alt.offsetParent !== null) { alt.focus(); return; }
    var hd = document.querySelector("main section:not([hidden]) h1");
    if (hd) { hd.setAttribute("tabindex", "-1"); hd.focus(); }
  }
  SHEETS.forEach(function (id) {
    var dlg = $(id);
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg || e.target.closest("[data-close]")) closeSheet(id);
    });
    dlg.addEventListener("close", function () {
      if (id === "sendDlg") renderAll();
      if (dlg._handoff) return;
      if (!document.querySelector("dialog[open]")) restoreFocus(dlg._ret);
    });
  });
  function topSheet() {
    for (var i = SHEETS.length - 1; i >= 0; i--) if ($(SHEETS[i]).open) return SHEETS[i];
    return null;
  }

  /* ================================================================
     Views: Mesyuarat | Last Man Out | Lagi
     ================================================================ */
  var view = "mesyuarat";
  function showView(v, focus) {
    view = v === "lmo" || v === "lagi" ? v : "mesyuarat";
    ["mesyuarat", "lmo", "lagi"].forEach(function (k) { $("view-" + k).hidden = k !== view; });
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      if (b.getAttribute("data-view") === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $("fabWrap").hidden = view !== "mesyuarat";
    if (view === "lmo") renderLmoTab();
    if (view === "lagi") renderMore();
    if (focus) { $("main").focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }
  document.querySelectorAll(".nav-btn").forEach(function (b) {
    b.addEventListener("click", function () { showView(b.getAttribute("data-view"), true); });
  });
  function renderAll() {
    renderHome();
    renderLmoBanner();
    renderKjBanner();
    if (view === "lmo") renderLmoTab();
    if (view === "lagi") renderMore();
  }
  function render() { renderAll(); }   // name used by the contacts and rota code

  /* ================================================================
     Mesyuarat (home): one list grouped by status
     ================================================================ */
  var GROUPS = [
    { key: "nopic", title: "gNoPic", help: "gNoPicHelp", dot: "amber" },
    { key: "unsent", title: "gUnsent", help: "gUnsentHelp", dot: "grey" },
    { key: "waiting", title: "gWaiting", help: "gWaitingHelp", dot: "amber" },
    { key: "knows", title: "gKnows", help: "gKnowsHelp", dot: "green" },
    { key: "done", title: "gDone", help: "gDoneHelp", dot: "green" }
  ];
  function byStage() {
    var by = { nopic: [], unsent: [], waiting: [], knows: [], done: [] }, cutoff = Date.now() - DONE_DAYS * DAY;
    tasks.forEach(function (t) { by[stage(t)].push(t); });
    archive.forEach(function (t) { if (t.done && !t.dropped && (t.doneAt || 0) > cutoff) by.done.push(t); });
    ["nopic", "unsent", "waiting", "knows"].forEach(function (k) { by[k].sort(sortOpen); });
    by.done.sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); });
    return by;
  }
  function picsOf(list) {
    var seen = Object.create(null), n = 0;
    list.forEach(function (t) { var k = t.who.toLowerCase(); if (!seen[k]) { seen[k] = true; n++; } });
    return n;
  }
  function renderHeadline(by) {
    var hl = $("headline"), late = tasks.filter(isLate).length, pics = picsOf(by.unsent);
    var open = by.nopic.length + by.unsent.length + by.waiting.length + by.knows.length;
    hl.textContent = "";
    hl.hidden = !open && !by.done.length;
    var cls, icon, big, sub = [];
    if (pics) { cls = "ico-grey"; icon = ICONS.person; big = T("hlUnsent", pics); }
    else if (by.waiting.length) { cls = "ico-amber"; icon = ICONS.send; big = T("hlAllSent"); }
    else { cls = "ico-green"; icon = ICONS.check; big = T("hlAllKnow"); }
    if (by.waiting.length) sub.push(T("hlWaiting", by.waiting.length));
    if (late) sub.push(T("hlLate", late));
    if (by.nopic.length) sub.push(T("hlNoPic", by.nopic.length));
    if (!sub.length) sub.push(T("hlNoLate"));
    hl.appendChild(h("span", { class: "headline-ico " + cls, html: icon }));
    hl.appendChild(h("div", null, [h("p", { class: "big", text: big }), sub.length ? h("p", { class: "sub", text: sub.join(" · ") }) : null]));
  }
  function rowEl(t, inPic) {
    var st = stage(t), late = isLate(t), meta = [], pills = [];
    if (!inPic) meta.push(h("span", { class: "who", text: t.who || T("noPic") }));
    if (t.date && st !== "done") meta.push(h("span", { class: "mi", html: ICONS.calS + escapeHtml(dueText(t.date)) }));
    if (st === "waiting") meta.push(h("span", { class: "mi", html: ICONS.send + escapeHtml(T("sentAgo", ago(t.notifiedAt))) }));
    if (st === "done") meta.push(h("span", { class: "mi", html: ICONS.check + escapeHtml(T("doneOn", shortDay(todayISO(t.doneAt)))) }));
    if (late) pills.push(pill("red", T("lateN", lateDays(t)), ICONS.alert));
    else if (t.date && st !== "done" && daysUntil(t.date) <= 1) pills.push(pill("amber", daysUntil(t.date) === 0 ? T("pillToday") : T("pillTomorrow")));
    if (needsHelp(t) && st !== "done") pills.push(pill("amber", T("needHelp"), ICONS.help));
    if (st === "knows" && t.ackVia === "link") pills.push(pill("green", T("ackByLink"), ICONS.check));
    if (inPic) pills.push(st === "unsent" ? pill("grey", T("gUnsent")) : st === "waiting" ? pill("amber", T("gWaiting")) :
      st === "knows" ? pill("green", T("knows"), ICONS.check) : pill("green", T("gDone"), ICONS.check));
    var label = t.text + ", " + (t.who || T("noPic")) + (late ? ", " + T("lateN", lateDays(t)).toLowerCase() : "") + (st === "done" ? ", " + T("gDone").toLowerCase() : "");
    var isArch = archive.indexOf(t) >= 0;   // done long ago in the earlier version: shown, not opened
    var inner = [h("span", { class: "row-title", text: t.text }), h("span", { class: "row-meta" }, meta.concat(pills))];
    var main = isArch ? h("div", { class: "row-main" }, inner)
      : h("button", { class: "row-main", type: "button", "data-k": (inPic ? "prow-" : "row-") + t.id, "aria-label": label,
        onclick: function (e) { if (inPic) { var ret = closeSheet("dlgPic", true); openTask(t.id, ret); } else openTask(t.id, e.currentTarget); } }, inner);
    var extra = [];
    if (!inPic && st === "waiting") extra.push(svgBtn("btn-ok btn-sm", ICONS.check, T("knows"), { "data-k": "ack-" + t.id, "aria-label": T("knowsAria", t.who, t.text),
      onclick: function () { markKnows(t, "su"); } }));
    if (!inPic && st === "nopic") {
      extra.push(svgBtn("btn-sm", ICONS.person, T("pickPic"), { "data-k": "pick-" + t.id, "aria-label": T("pickPic") + ": " + t.text, onclick: function (e) { openPick(t, e.currentTarget); } }));
      extra.push(svgBtn("btn-sm btn-danger-quiet", ICONS.trash, T("del"), { "data-k": "del-" + t.id, "aria-label": T("delTask") + ": " + t.text, onclick: function (e) { askDelete(t, e.currentTarget); } }));
    }
    var li = h("li", { class: "row" + (late ? " late" : "") + (st === "done" ? " done" : "") + (extra.length ? " has-act" : "") }, [main]);
    if (extra.length) li.appendChild(h("div", { class: "row-acts" }, extra));
    else if (!isArch) li.appendChild(h("span", { html: ICONS.chev }));
    return li;
  }
  function renderHome() {
    var root = $("groups"), a = document.activeElement;
    var keepK = a && $("view-mesyuarat").contains(a) ? a.getAttribute("data-k") : null;
    var by = byStage();
    renderHeadline(by);
    root.textContent = "";
    var any = tasks.length || by.done.length;
    if (!any) {
      root.appendChild(h("div", { class: "empty-note" }, [
        h("p", { text: T("emptyTasks") }),
        h("button", { class: "btn btn-quiet", type: "button", "data-k": "sample", text: T("trySample"), onclick: function () { loadSample(true); } })
      ]));
    }
    GROUPS.forEach(function (g) {
      var list = by[g.key];
      if (!list.length) return;   // an empty group adds nothing: the headline already says so
      var hid = "g-" + g.key;
      var title = h("h2", { class: "group-title", id: hid }, [
        h("span", { class: "dot dot-" + g.dot, "aria-hidden": "true" }), document.createTextNode(T(g.title) + " "),
        h("span", { class: "count", text: String(list.length), "aria-label": T("nTasks", list.length) })
      ]);
      var ul = h("ul", { class: "list" }, list.map(function (t) { return rowEl(t, false); }));
      if (g.key === "done") {
        var det = h("details", { class: "group", open: !!meta.doneOpen }, [
          h("summary", { class: "group-head", "data-k": "done-sum" }, [title, h("span", { class: "chev", html: ICONS.chev })]),
          h("p", { class: "group-help", text: T(g.help) }), ul
        ]);
        det.addEventListener("toggle", function () { meta.doneOpen = det.open; saveMeta(); });
        root.appendChild(det);
        return;
      }
      var sec = h("section", { class: "group", "aria-labelledby": hid }, [h("div", { class: "group-head" }, [title]), h("p", { class: "group-help", text: T(g.help) })]);
      if (g.key === "unsent") sec.appendChild(h("div", { class: "group-action" }, [
        svgBtn("btn-primary", ICONS.send, T("sendToN", picsOf(list)), { "data-k": "sendall", onclick: function (e) { openSendAll(e.currentTarget); } })
      ]));
      sec.appendChild(ul);
      root.appendChild(sec);
    });
    if (keepK) {
      var el = root.querySelector('[data-k="' + cssEscape(keepK) + '"]');
      if (!el && keepK.indexOf("ack-") === 0) el = root.querySelector('[data-k="row-' + cssEscape(keepK.slice(4)) + '"]');
      if (el) el.focus();
    }
  }

  /* ---------- "PIC knows" (option A: the SU ticks it; phase 2 adds via = "link") ---------- */
  function markKnows(t, via) {
    var before = { ackAt: t.ackAt, ackVia: t.ackVia };
    t.ackAt = Date.now(); t.ackVia = via || "su";
    save();
    renderAll(); refreshOpenSheets();
    announce(T("knowsDone", firstName(t.who)));
    toast(T("knowsDone", firstName(t.who)), T("undo"), function () {
      t.ackAt = before.ackAt; t.ackVia = before.ackVia; save(); renderAll(); refreshOpenSheets();
    });
  }
  function markSent(list, via, src) {
    var now = Date.now();
    list.forEach(function (t) {
      if (!t.notifiedAt) { t.notifiedAt = now; t.sentVia = via; }
      if (src && !t.src) t.src = src;
    });
    save();
  }
  function refreshOpenSheets() {
    if ($("dlgTask").open && curTask) renderTask(curTask);
    if ($("dlgPic").open && curPic) renderPic(curPic);
  }

  /* ================================================================
     PIC picker (used by "Tugasan baharu" and "Pilih PIC")
     ================================================================ */
  function recentPics() {
    var seen = Object.create(null), out = [];
    tasks.concat(archive).filter(function (t) { return t.who; }).sort(function (a, b) { return b.created - a.created; }).forEach(function (t) {
      var c = contactFor(t.who), n = c ? c.name : t.who, k = n.toLowerCase();
      if (!seen[k] && out.length < 3) { seen[k] = true; out.push(n); }
    });
    return out;
  }
  function makePicker(root, onPick) {
    var state = { who: "" }, search;
    function pick(name) { state.who = name; draw(); if (onPick) onPick(name); }
    function draw() {
      var a = document.activeElement, keepK = a && root.contains(a) ? a.getAttribute("data-k") : null;
      root.textContent = "";
      if (state.who) {
        var c = contactFor(state.who), pills = [];
        if (!c) pills.push(pill("amber", T("fNotContact")));
        else if (!c.phone) pills.push(pill("amber", T("noPhone")));
        root.appendChild(h("div", { class: "picked" }, [
          h("span", { class: "headline-ico ico-grey small", html: ICONS.person }),
          h("strong", { text: c ? c.name : state.who }),
          h("span", { class: "picked-pills" }, pills),
          !c ? h("button", { class: "btn btn-quiet btn-sm", type: "button", "data-k": "pk-save", text: T("fSaveContact"), onclick: function () {
            contacts = cleanContacts(contacts.concat([{ name: state.who }]));
            saveContacts();
            toast(T("fContactSaved", state.who));
            draw();
          } }) : null,
          h("button", { class: "btn btn-quiet btn-sm", type: "button", "data-k": "pk-change", text: T("fChange"), "aria-label": T("fChange") + ": " + state.who,
            onclick: function () { state.who = ""; draw(); if (onPick) onPick(""); search.focus(); } })
        ]));
      } else {
        var recent = recentPics();
        if (recent.length) root.appendChild(h("div", { class: "chips", role: "group", "aria-label": T("fRecent") }, recent.map(function (n) {
          return h("button", { class: "chip", type: "button", "data-k": "pk-r-" + n, text: n, onclick: function () { pick(n); } });
        })));
        search = h("input", { class: "input", type: "search", autocomplete: "off", "data-k": "pk-search", placeholder: T("fWhoSearch"), "aria-label": T("fWhoSearch") });
        var results = h("ul", { class: "results", hidden: true });
        function drawResults() {
          var q = search.value.trim(), ql = q.toLowerCase();
          results.textContent = "";
          results.hidden = !q;
          if (!q) return;
          var hits = contacts.filter(function (c) { return c.name.toLowerCase().indexOf(ql) >= 0; })
            .sort(function (a, b) { return a.name.localeCompare(b.name); }).slice(0, 6);
          hits.forEach(function (c) {
            results.appendChild(h("li", null, [h("button", { type: "button", onclick: function () { pick(c.name); } }, [
              h("span", { text: c.name }), h("small", { text: [c.role, c.prog].filter(Boolean).join(" · ") || (c.phone ? "" : T("noPhone")) })
            ])]));
          });
          if (!hits.some(function (c) { return c.name.toLowerCase() === ql; })) {
            results.appendChild(h("li", null, [h("button", { type: "button", onclick: function () { pick(q.slice(0, 60)); } }, [
              h("span", { text: T("fUseName", q.slice(0, 60)) }), h("small", { text: T("fUseNameSub") })
            ])]));
          }
        }
        search.addEventListener("input", drawResults);
        search.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); var b = results.querySelector("button"); if (b) b.click(); }
        });
        root.appendChild(search);
        root.appendChild(results);
      }
      if (keepK) { var el = root.querySelector('[data-k="' + cssEscape(keepK) + '"]'); if (el) el.focus(); }
    }
    draw();
    return {
      get: function () { return state.who; },
      set: function (n) { state.who = n || ""; draw(); },
      focus: function () { var el = root.querySelector("input, button"); if (el) el.focus(); },
      redraw: draw
    };
  }

  /* ================================================================
     Tugasan baharu: Apa · Siapa PIC · Bila
     ================================================================ */
  var WHEN = ["today", "tomorrow", "fri", "nextweek", "pick", "none"];
  var WHEN_KEY = { today: "dToday", tomorrow: "dTomorrow", fri: "dFri", nextweek: "dNextWeek", pick: "dPick", none: "dNone" };
  var addState = { when: "fri", touched: false }, addPicker = null;
  function whenDate(k) {
    var today = todayISO(), d = dow(today);
    if (k === "today") return today;
    if (k === "tomorrow") return addDays(today, 1);
    if (k === "fri") return addDays(today, (5 - d + 7) % 7);      // this week's Friday (today if Friday)
    if (k === "nextweek") return addDays(today, ((8 - d) % 7 || 7) + 4);   // next week's Friday
    if (k === "pick") return ISO_DATE.test($("fDate").value) ? $("fDate").value : "";
    return "";
  }
  function renderWhen() {
    var box = $("whenChips");
    box.textContent = "";
    WHEN.forEach(function (k) {
      var d = k !== "pick" && k !== "none" ? whenDate(k) : "";
      var b = h("button", { class: "chip", type: "button", "aria-pressed": String(addState.when === k), "data-when": k }, [
        document.createTextNode(T(WHEN_KEY[k])), d ? h("span", { class: "chip-date", text: shortDate(d, { day: "numeric", month: "short" }) }) : null
      ]);
      b.addEventListener("click", function () {
        addState.when = k; addState.touched = true; renderWhen();
        if (k === "pick") $("fDate").focus(); else box.querySelector('[data-when="' + k + '"]').focus();
      });
      box.appendChild(b);
    });
    $("fDate").hidden = addState.when !== "pick";
  }
  // Date words in the text ("esok", "hari ini", "minggu depan") pick the date chip, unless she chose one herself
  function detectDateWords() {
    if (addState.touched) return;
    var v = " " + $("fWhat").value.toLowerCase() + " ", found = null;
    ["nextweek", "tomorrow", "today"].forEach(function (k) {
      if (found) return;
      I18N.ms.dateKw[k].concat(I18N.en.dateKw[k]).forEach(function (w) {
        if (!found && new RegExp("(^|[^\\p{L}])" + w + "(?=$|[^\\p{L}])", "u").test(v)) found = k;
      });
    });
    var want = found || "fri";
    if (want !== addState.when) { addState.when = want; renderWhen(); }
  }
  $("fWhat").addEventListener("input", function () { $("errWhat").hidden = true; $("fWhat").removeAttribute("aria-invalid"); detectDateWords(); });
  function openAdd(opener) {
    if (view !== "mesyuarat") showView("mesyuarat");
    addState = { when: "fri", touched: false };
    $("fWhat").value = ""; $("fDate").value = "";
    $("errWhat").hidden = true; $("errWho").hidden = true; $("fWhat").removeAttribute("aria-invalid");
    addPicker = makePicker($("addPicker"), function () { $("errWho").hidden = true; });
    renderWhen();
    openSheet("dlgAdd", opener, $("fWhat"));
  }
  function saveAdd(more) {
    var text = $("fWhat").value.trim().slice(0, 200), who = addPicker.get(), ok = true;
    $("errWhat").hidden = !!text; $("errWho").hidden = !!who;
    if (!text) { $("fWhat").setAttribute("aria-invalid", "true"); ok = false; }
    if (!ok || !who) {
      if (!text) $("fWhat").focus(); else addPicker.focus();
      announce(!text ? T("errWhat") : T("errWho"));
      return;
    }
    var c = contactFor(who);
    var t = normalize({ id: uid(), text: text, q: "delegate", who: c ? c.name : who, date: whenDate(addState.when), created: Date.now() });
    tasks.push(t);
    save();
    renderAll();
    if (more) {
      var keep = addState.when, keepDate = $("fDate").value;
      $("fWhat").value = "";
      addPicker.set("");
      addState = { when: keep, touched: true };
      $("fDate").value = keepDate;
      renderWhen();
      $("fWhat").focus();
      toast(T("savedNext"));
      announce(T("savedNext"));
    } else {
      var ret = closeSheet("dlgAdd", true);
      restoreFocus(ret);
      toast(T("savedUnsent", firstName(t.who)), T("sendNow"), function () { openTask(t.id, ret); });
      announce(T("savedUnsent", firstName(t.who)));
    }
  }
  $("saveAdd").addEventListener("click", function () { saveAdd(false); });
  $("saveMore").addEventListener("click", function () { saveAdd(true); });
  $("addForm").addEventListener("submit", function (e) { e.preventDefault(); saveAdd(false); });
  document.querySelectorAll("[data-add]").forEach(function (b) { b.addEventListener("click", function () { openAdd(b); }); });

  /* ---------- Pilih PIC for a task without one ---------- */
  var pickTask = null, pickPicker = null;
  function openPick(t, opener) {
    pickTask = t;
    $("pickTask").textContent = t.text;
    $("errPick").hidden = true;
    pickPicker = makePicker($("pickPicker"), function () { $("errPick").hidden = true; });
    openSheet("dlgPick", opener);
  }
  $("pickSave").addEventListener("click", function () {
    var who = pickPicker.get();
    if (!who) { $("errPick").hidden = false; pickPicker.focus(); announce(T("errWho")); return; }
    var c = contactFor(who);
    pickTask.who = c ? c.name : who;
    save();
    var t = pickTask, ret = closeSheet("dlgPick", true);
    renderAll(); refreshOpenSheets();
    toast(T("picSet", t.who));
    if ($("dlgTask").open) $("taskTitle").focus(); else openTask(t.id, ret);
  });

  /* ================================================================
     Task detail: 4 steps; the current step holds the one next action
     ================================================================ */
  var curTask = null;
  function taskMsg(t, c) {
    var calUrl = t.date ? gcalUrl(t, c && c.email) : "";
    return T("msgBody", c ? c.name : t.who, t.text, t.date ? longDate(t.date) : "", calUrl);
  }
  // WhatsApp / email buttons for one task. kind: "send" (first message or again) | "remind"
  function taskButtons(t, kind, key) {
    var c = contactFor(t.who), out = [], name = c ? c.name : t.who;
    var msg = kind === "remind" ? T("remindMsg", name, t.text, t.date ? daysUntil(t.date) : 0, t.date ? longDate(t.date) : "") : taskMsg(t, c);
    var subject = kind === "remind" ? T("remindSubject", t.text) : T("msgSubject", t.text);
    function after(via) {
      return function () {
        if (kind === "remind") { t.remindedAt = Date.now(); save(); }
        else markSent([t], via);
        setTimeout(function () { renderAll(); renderTask(t); announce(T("sentOne", viaText(via), firstName(name))); }, 0);
      };
    }
    var waLabel = kind === "remind" ? T("remindWa") : T("btnWa"), mailLabel = kind === "remind" ? T("remindEmail") : T("btnEmail");
    var wa = c && c.phone ? waLink(c.phone, msg, waLabel, T("waAria", name, t.text), after("wa")) : contactFixButton(c, name, null, null, "phone");
    var em = c && c.email ? mailLink(c.email, subject, msg, mailLabel, T("mailAria", name, t.text), after("email")) : null;
    wa.setAttribute("data-k", key + "-wa");
    out.push(wa);
    if (em) { em.setAttribute("data-k", key + "-email"); out.push(em); }
    return h("div", { class: "btn-row" }, out);
  }
  function peek(summary, content, open) {
    return h("details", { class: "peek", open: !!open }, [h("summary", { text: summary })].concat(content));
  }
  function renderTask(t) {
    curTask = t;
    var st = stage(t), late = isLate(t), body = $("taskBody"), c = contactFor(t.who);
    var a = document.activeElement, keepK = a && body.contains(a) ? a.getAttribute("data-k") : null;
    $("taskSrc").textContent = t.src || T("taskEyebrow");
    $("taskTitle").textContent = t.text;
    body.textContent = "";
    if (late) body.appendChild(h("div", { class: "alert alert-red", html: ICONS.alert + "<span>" + escapeHtml(T("lateBanner", lateDays(t), longDate(t.date))) + "</span>" }));
    if (needsHelp(t) && st !== "done") body.appendChild(h("div", { class: "alert alert-amber", html: ICONS.help + "<span>" + escapeHtml(T("needHelp") + (t.statusNote ? ": " + t.statusNote : "")) + "</span>" }));

    // Facts: PIC and due date
    var due = h("input", { class: "input input-date", id: "dDue", type: "date", value: t.date, "data-k": "t-due" });
    due.addEventListener("change", function () {
      t.date = ISO_DATE.test(due.value) ? due.value : "";
      save(); renderAll(); renderTask(t);
    });
    var picCell = t.who
      ? [h("button", { class: "linkish", type: "button", "data-k": "t-pic", text: t.who, onclick: function () { var ret = closeSheet("dlgTask", true); openPic(t.who, ret); } }),
        c ? (c.phone ? null : pill("amber", T("noPhone"))) : pill("amber", T("fNotContact"))]
      : [pill("amber", T("noPic")), svgBtn("btn-sm", ICONS.person, T("pickPic"), { "data-k": "t-pick", onclick: function (e) { openPick(t, e.currentTarget); } })];
    body.appendChild(h("dl", { class: "facts" }, [
      h("dt", { text: "PIC" }), h("dd", null, picCell),
      h("dt", null, [h("label", { for: "dDue", text: T("dueLabel") })]), h("dd", null, [due])
    ]));

    // Stepper
    var steps = [{ done: true, title: T("stepRecorded"), sub: whenText(t.created) }];
    var who = firstName(t.who);
    if (!t.who) {
      steps.push({ now: !t.done, title: T("stepPick"), act: !t.done ? [svgBtn("btn-primary", ICONS.person, T("pickPic"), { "data-k": "t-pick2", onclick: function (e) { openPick(t, e.currentTarget); } })] : null });
    } else {
      if (st === "unsent") {
        var tell = [taskButtons(t, "send", "t-send")];
        if (t.date) tell.push(h("a", { class: "btn", href: gcalUrl(t, c && c.email), target: "_blank", rel: "noopener", "data-k": "t-cal",
          "aria-label": T("addToCal", t.text), html: ICONS.cal + "<span>" + escapeHtml(T("inviteCal")) + "</span>" }));
        tell.push(peek(T("seeMsg"), [h("div", { class: "msg", text: taskMsg(t, c) })]));
        steps.push({ now: true, title: T("stepTell"), sub: T("tellHint", who), act: tell });
      } else if (t.notifiedAt) steps.push({ done: true, title: T("stepTold"), sub: viaText(t.sentVia) + " · " + whenText(t.notifiedAt) });
      else steps.push({ done: true, title: T("stepTold") });   // marked "knows" without a message (old data)

      if (st === "unsent") steps.push({ title: T("stepAck") });
      else if (st === "waiting") {
        var n = workdaysSince(t.notifiedAt), stale = n >= 2 || late;
        var act = [svgBtn("btn-ok", ICONS.check, T("knowsLong"), { "data-k": "t-knows", onclick: function () { markKnows(t, "su"); } }),
          h("p", { class: "hint", text: T("knowsHint") })];
        if (stale) {
          act.push(h("p", { class: "step-sub stale" }, [h("strong", { text: T("noReply", Math.max(n, 1)) }), document.createTextNode(" " + T("remindLead"))]));
          act.push(taskButtons(t, "remind", "t-rem"));
        } else act.push(peek(T("resend"), [taskButtons(t, "send", "t-again")]));
        steps.push({ now: true, title: T("stepAck"), sub: T("notConfirmed", ago(t.notifiedAt)), act: act });
      } else {
        var by = t.ackVia === "link" ? T("ackByLink") : t.ackVia === "old-status" ? T("ackByOld") : T("ackBySu");
        steps.push({ done: true, title: T("stepAck"), sub: by + (t.ackAt ? " · " + whenText(t.ackAt) : "") });
      }
    }
    if (st === "done") steps.push({ done: true, title: T("stepDone"), sub: whenText(t.doneAt),
      act: [h("button", { class: "btn btn-quiet btn-sm", type: "button", "data-k": "t-reopen", text: T("reopen"), onclick: function () {
        setDone(t, false); save(); renderAll(); renderTask(t); announce(T("reopened")); $("taskTitle").focus();
      } })] });
    else if (st === "knows" || st === "nopic") steps.push({ now: st === "knows", title: T("stepDone"), sub: t.date ? T("dueOn", shortDay(t.date)) : "",
      act: [svgBtn("btn-primary", ICONS.check, T("markDone"), { "data-k": "t-done", onclick: function () { doneTask(t); } })]
        .concat(st === "knows" ? [peek(late ? T("remindLate") : T("askOrRemind"), [taskButtons(t, "remind", "t-rem2")], late)] : []) });
    else steps.push({ title: T("stepDone") });

    body.appendChild(h("h3", { class: "section-title", text: T("statusH") }));
    body.appendChild(h("ol", { class: "steps" }, steps.map(function (s, i) {
      var li = h("li", { class: "step" + (s.done ? " is-done" : "") + (s.now ? " is-now" : "") }, [
        h("span", { class: "mark", "aria-hidden": "true", html: s.done ? ICONS.check : String(i + 1) }),
        h("div", { class: "step-body" }, [
          h("p", { class: "step-title" }, [document.createTextNode(s.title), s.done ? h("span", { class: "sr-only", text: " " + T("stepDoneSr") }) : null]),
          s.sub ? h("p", { class: "step-sub", text: s.sub }) : null,
          s.act ? h("div", { class: "step-act" }, s.act) : null
        ])
      ]);
      if (s.now) li.setAttribute("aria-current", "step");
      return li;
    })));

    // Needs help switch, edit text, delete
    if (t.who && st !== "done") {
      var sw = h("input", { class: "switch", type: "checkbox", id: "dHelp", role: "switch", checked: needsHelp(t), "data-k": "t-help" });
      sw.addEventListener("change", function () {
        t.status = sw.checked ? "blocked" : (t.status === "blocked" ? "" : t.status); t.statusAt = Date.now();
        save(); renderAll(); renderTask(t);
      });
      body.appendChild(h("div", { class: "switch-row" }, [
        h("label", { for: "dHelp" }, [h("strong", { text: T("needHelp") }), h("br"), h("span", { class: "hint", text: T("needHelpSub") })]), sw
      ]));
    }
    var ta = h("textarea", { class: "input", maxlength: "200", "aria-label": T("editText"), "data-k": "t-text" });
    ta.value = t.text;
    body.appendChild(h("div", { class: "switch-row stack" }, [
      peek(T("editText"), [ta, h("button", { class: "btn btn-sm", type: "button", "data-k": "t-textsave", text: T("editSave"), onclick: function () {
        var v = ta.value.trim().slice(0, 200);
        if (!v) { ta.focus(); return; }
        t.text = v; save(); renderAll(); renderTask(t); announce(T("textSaved")); $("taskTitle").focus();
      } })]),
      h("button", { class: "btn btn-quiet btn-sm danger-text", type: "button", "data-k": "t-del", text: T("delTask"), onclick: function (e) { askDelete(t, e.currentTarget); } })
    ]));
    if (keepK) { var el = body.querySelector('[data-k="' + cssEscape(keepK) + '"]'); if (el && el.offsetParent !== null) el.focus(); else $("taskTitle").focus(); }
  }
  function openTask(id, opener) {
    var t = find(id);
    if (!t) return;
    renderTask(t);
    openSheet("dlgTask", opener);
  }
  function doneTask(t) {
    setDone(t, true);
    save(); renderAll(); renderTask(t);
    $("taskTitle").focus();
    announce(T("doneToast"));
    toast(T("doneToast"), T("undo"), function () { setDone(t, false); save(); renderAll(); refreshOpenSheets(); });
  }

  /* ---------- Delete (asks first) ---------- */
  var delTask = null, lastRemoved = null;
  function askDelete(t, opener) {
    delTask = t;
    $("confText").textContent = T("delConfirm", t.text);
    openSheet("dlgConfirm", opener);
  }
  $("confYes").addEventListener("click", function () {
    var t = delTask;
    closeSheet("dlgConfirm", true);
    var ret = closeSheet("dlgTask", true);
    tasks = tasks.filter(function (x) { return x !== t; });
    lastRemoved = t;
    save(); renderAll();
    restoreFocus(ret || $("dlgConfirm")._ret);
    announce(T("taskDeleted"));
    toast(T("taskDeleted"), T("undo"), function () {
      if (lastRemoved === t && !find(t.id)) { tasks.push(t); save(); renderAll(); }
    });
  });

  /* ================================================================
     One PIC: their tasks, "Minta status", "Tanda semua sudah tahu"
     ================================================================ */
  var curPic = null;
  function renderPic(name) {
    curPic = name;
    var c = contactFor(name), body = $("picBody"), k = name.toLowerCase();
    var a = document.activeElement, keepK = a && body.contains(a) ? a.getAttribute("data-k") : null;
    var mine = tasks.filter(function (t) { return t.who.toLowerCase() === k; });
    var open = mine.filter(function (t) { return !t.done; }).sort(sortOpen), done = mine.filter(function (t) { return t.done; });
    var waiting = open.filter(function (t) { return stage(t) === "waiting"; });
    $("picRole").textContent = c ? [c.role, c.prog].filter(Boolean).join(" · ") || T("contactEyebrow") : T("fNotContact");
    $("picTitle").textContent = c ? c.name : name;
    body.textContent = "";
    body.appendChild(h("p", { class: "muted pic-reach" }, [
      document.createTextNode(c && c.phone ? "+" + c.phone : T("noPhone")), h("br"), document.createTextNode(c && c.email ? c.email : T("noEmail"))
    ]));
    if (!reachable(c)) body.appendChild(h("div", { class: "btn-row mb" }, [contactFixButton(c, name, null, { "data-k": "p-fix" })]));
    body.appendChild(h("p", { class: "pic-count", text: T("tasksOpen", open.length) + (waiting.length ? " · " + T("waitingN", waiting.length) : "") }));
    if (mine.length) body.appendChild(h("ul", { class: "list mb" }, open.concat(done).map(function (t) { return rowEl(t, true); })));
    if (open.length && reachable(c)) {
      var lines = open.slice().sort(sortByDue).map(function (t, i) {
        return (i + 1) + ". *" + t.text + "*" + (t.date ? " (" + T("dueShort").toLowerCase() + ": " + longDate(t.date) + ")" : "");
      }).join("\n");
      var msg = T("askMsg", c.name, lines);
      var mark = function () { open.forEach(function (t) { t.askedAt = Date.now(); }); save(); setTimeout(function () { announce(T("askSent", firstName(c.name))); }, 0); };
      var btns = [];
      if (c.phone) btns.push(waLink(c.phone, msg, T("askStatus"), T("waAria", c.name, T("askStatus")), mark));
      if (c.email) btns.push(mailLink(c.email, T("askSubject"), msg, T("btnEmail"), T("mailAria", c.name, T("askStatus")), mark));
      btns.forEach(function (b, i) { b.setAttribute("data-k", "p-ask-" + i); });
      body.appendChild(h("h3", { class: "section-title", text: T("askStatus") }));
      body.appendChild(h("p", { class: "hint mb-s", text: T("askStatusHint", firstName(c.name)) }));
      body.appendChild(h("div", { class: "btn-row" }, btns));
    }
    if (waiting.length) body.appendChild(h("div", { class: "mt" }, [svgBtn("btn-ok", ICONS.check, T("allKnow", waiting.length), { "data-k": "p-all", onclick: function () {
      var now = Date.now();
      waiting.forEach(function (t) { t.ackAt = now; t.ackVia = "su"; });
      save(); renderAll(); renderPic(name);
      $("picTitle").focus();
      announce(T("allKnowDone", waiting.length, firstName(name)));
      toast(T("allKnowDone", waiting.length, firstName(name)), T("undo"), function () {
        waiting.forEach(function (t) { if (t.ackAt === now) { t.ackAt = null; t.ackVia = ""; } });
        save(); renderAll(); refreshOpenSheets();
      });
    } })]));
    if (keepK) { var el = body.querySelector('[data-k="' + cssEscape(keepK) + '"]'); if (el) el.focus(); }
  }
  function openPic(name, opener) { renderPic(name); openSheet("dlgPic", opener); }

  /* ================================================================
     Hantar kepada PIC: one message per person (a snapshot, so sent cards stay visible)
     ================================================================ */
  var sendSnap = [];
  function picGroups() {
    var groups = [], byKey = Object.create(null);
    tasks.filter(function (t) { return stage(t) === "unsent"; }).sort(sortByDue).forEach(function (t) {
      var c = contactFor(t.who), k = (c ? c.name : t.who).toLowerCase();
      if (!byKey[k]) { byKey[k] = { name: c ? c.name : t.who, tasks: [], sent: null }; groups.push(byKey[k]); }
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
    var root = $("sendList"), from = $("sendFrom").value.trim();
    var a = document.activeElement, keepK = a && root.contains(a) ? a.getAttribute("data-k") : null;
    var sent = sendSnap.filter(function (g) { return g.sent; }).length, total = sendSnap.length;
    var prog = $("sendProgress");
    prog.textContent = "";
    if (total) {
      var bar = h("span", { class: "bar", role: "progressbar", "aria-label": T("progressAria"), "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(sent) }, [h("span")]);
      bar.firstChild.style.width = (sent / total * 100) + "%";
      prog.appendChild(h("span", { text: T("sentProgress", sent, total) }));
      prog.appendChild(bar);
    }
    root.textContent = "";
    if (!total) { root.appendChild(h("p", { class: "empty-note", text: T("noneToSend") })); return; }
    sendSnap.forEach(function (g, gi) {
      var c = contactFor(g.name), msg = groupMessage(g, from), btns = [];
      function mark(via) {
        return function () {
          g.sent = { via: via, at: Date.now() };
          markSent(g.tasks, via, from);
          setTimeout(function () {
            renderSendAll();
            renderAll();
            announce(T("sentMarked", viaText(via), firstName(g.name), g.tasks.length));
            var next = $("sendList").querySelector(".pic-card:not(.sent) .btn-wa, .pic-card:not(.sent) .btn-mail, .pic-card:not(.sent) .add-contact");
            if (next) next.focus();
          }, 0);
        };
      }
      var wa = c && c.phone ? waLink(c.phone, msg, g.sent ? T("resend") : T("btnWa"), T("waAria", g.name, T("nOpen", g.tasks.length)), mark("wa")) : null;
      var em = c && c.email ? mailLink(c.email, T("groupSubject", from, g.tasks.length), msg, T("btnEmail"), T("mailAria", g.name, T("nOpen", g.tasks.length)), mark("email")) : null;
      if (wa) { wa.setAttribute("data-k", "s-wa-" + gi); btns.push(wa); }
      if (em) { em.setAttribute("data-k", "s-em-" + gi); btns.push(em); }
      if (!c || !c.phone) btns.push(contactFixButton(c, g.name, null, { "data-k": "s-fix-" + gi }, "phone"));
      root.appendChild(h("section", { class: "pic-card" + (g.sent ? " sent" : ""), "aria-label": g.name }, [
        h("div", { class: "pic-top" }, [
          h("div", null, [h("p", { class: "pic-name", text: g.name }),
            h("p", { class: "pic-sub", text: T("nTasks", g.tasks.length) + (c && c.phone ? "" : " · " + T("noPhone").toLowerCase()) })]),
          g.sent ? pill("green", T("sentPill"), ICONS.check) : pill("grey", T("notYet"))
        ]),
        h("ol", { class: "pic-tasks" }, g.tasks.map(function (t) {
          return h("li", null, [document.createTextNode(t.text), t.date ? h("small", { text: dueText(t.date) }) : null]);
        })),
        g.sent ? h("p", { class: "sent-line", html: ICONS.check + escapeHtml(T("sentCard", viaText(g.sent.via), clockText(g.sent.at))) })
          : peek(T("seeMsg"), [h("div", { class: "msg", text: msg })]),
        h("div", { class: "btn-row" }, btns)
      ]));
    });
    if (keepK) { var el = root.querySelector('[data-k="' + cssEscape(keepK) + '"]'); if (el) el.focus(); }
  }
  function openSendAll(opener) {
    sendSnap = picGroups();
    $("sendFrom").value = meta.lastFrom || "";
    renderSendAll();
    openSheet("sendDlg", opener);
  }
  $("sendFrom").addEventListener("input", function () { meta.lastFrom = $("sendFrom").value.trim().slice(0, 80); saveMeta(); renderSendAll(); });

  /* ================================================================
     Contacts manager
     ================================================================ */
  var editingId = null, lastFocus = null;
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
    lastFocus = document.activeElement;
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
    // Opened from a sheet (task, PIC, send, new task): redraw it with the new phone/email
    if (topSheet()) {
      refreshOpenSheets();
      if ($("sendDlg").open) renderSendAll();
      if ($("dlgAdd").open && addPicker) addPicker.redraw();
      if ($("dlgPick").open && pickPicker) pickPicker.redraw();
    }
    if (lastFocus && lastFocus.focus && lastFocus.isConnected && lastFocus.offsetParent !== null) { lastFocus.focus(); return; }
    // The opener was re-drawn (e.g. a button in the Selesai banner): go back to its replacement
    var k = lastFocus && lastFocus.getAttribute && lastFocus.getAttribute("data-k");
    var el = k ? document.querySelector('[data-k="' + cssEscape(k) + '"]') : null;
    if (!el && k && k.indexOf("kj-") === 0) el = $("kjActions").querySelector("a, button");   // e.g. KJ contact just added
    if (el && el.offsetParent !== null) el.focus(); else restoreFocus(null);
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
  // Home notice: only on days the SU must act. One-tap buttons for the first notice; the tab has the rest.
  function renderLmoBanner() {
    var b = $("lmoBanner");
    if (!b || !rota) return;
    var due = lmoDue(), box = $("lmoActions"), a = document.activeElement;
    var keepK = a && b.contains(a) ? a.getAttribute("data-k") : null;
    $("lmoBadge").hidden = !(due.length || kjDue().length);
    b.hidden = !due.length;
    box.textContent = "";
    if (due.length) {
      var first = due[0], onlyWa = due.length === 1 && first.chs.length === 1 && first.chs[0].ch === "wa" && currentEntry(todayISO()) === first.e;
      var parts = due.slice(0, 3).map(function (d) {
        return personName(d.e) + " (" + d.chs.map(function (x) { return chName(x.ch, true); }).join(", ") + ")";
      }).join(", ");
      // Only the WhatsApp of this week's officer: short title + one line (as designed); otherwise the full sentence
      $("lmoTitle").textContent = onlyWa ? T("lmoNoticeTitle", personName(first.e)) : T("lmoBanner", parts + (due.length > 3 ? " " + T("lmoMore", due.length - 3) : ""));
      $("lmoText").textContent = onlyWa ? T("lmoNoticeWa") : "";
      $("lmoText").hidden = !onlyWa;
      first.chs.forEach(function (x) {
        var el = channelButton(first.e, first.c, x.ch, personName(first.e));
        el.setAttribute("data-k", "home-" + x.ch + "-" + first.e.id);
        box.appendChild(el);
      });
      if (due.length > 1) box.appendChild(h("button", { class: "btn btn-quiet btn-sm", type: "button", id: "lmoOpen", "data-k": "home-lmo", text: T("lmoSeeAll"),
        onclick: function () { showView("lmo", true); } }));
      if (keepK) { var el = box.querySelector('[data-k="' + cssEscape(keepK) + '"]'); if (el) el.focus(); }
    }
    if (keepK && (b.hidden || !b.contains(document.activeElement))) restoreFocus(null);
    if (view === "lmo") renderLmoTab();
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
    var next = [$("kjActions").querySelector("button, a"), $("lmoOpen")].filter(function (x) { return x && x.offsetParent !== null; })[0];
    if (document.activeElement === document.body) { if (next) next.focus(); else restoreFocus(null); }
    renderLmoBanner();
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
  // One unconfirmed Selesai day (rota dialog and Last Man Out tab)
  function kjRow(p, done) {
    return h("li", { class: "m-row is-late" }, [
      h("div", { class: "m-main" }, [
        h("p", { class: "m-task", text: personName(p.e) }),
        h("p", { class: "m-sub" }, [h("span", { class: "badge badge-overdue", text: T("rLate") }),
          document.createTextNode(" " + T("rKjPending", dayLong(p.d), rota.deadline))])
      ]),
      h("div", { class: "send-btns" }, kjButtons(p, done))
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
      return kjRow(p, function (msg) { afterRotaChange(msg); renderKjBanner(); });
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
  function openRota(focusDue, opener) {
    rotaLastFocus = opener || document.activeElement;
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
  $("rotaClose").addEventListener("click", closeRota);
  $("rotaDlg").addEventListener("close", function () {
    render();
    var f = rotaLastFocus;
    if (f && f.focus && f.isConnected && f.offsetParent !== null) f.focus(); else restoreFocus(f);
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
     Last Man Out tab: this week's officer, what was sent, Selesai, coming up.
     The rota tools themselves ("Urus giliran") are the rota dialog below, unchanged.
     ================================================================ */
  function dmyShort(iso) { return shortDay(iso); }
  function lmoCheck(state, title, sub, act) {
    var icon = state === "ok" ? ICONS.check : state === "todo" ? ICONS.alert : ICONS.clock;
    return h("li", null, [h("span", { class: "chk chk-" + state, html: icon }), h("div", { class: "txt" }, [
      h("strong", { text: title }), sub ? h("span", { class: "muted d-block", text: sub }) : null, act ? h("div", { class: "btn-row mt-s" }, act) : null
    ])]);
  }
  function dayState(e, d, today, hhmm) {
    var st = e.days[d] || {};
    if (st.off) return ["off", T("dayStOff")];
    if (st.ok) return ["ok", T("dayStOk")];
    if (st.kj) return ["kj", T("dayStKj")];
    if (!rota.webUrl && (d < today || (d === today && hhmm >= rota.deadline)) && (!rota.confirmFrom || d >= rota.confirmFrom)) return ["pending", T("dayStPending")];
    if (d === today) return ["today", T("dayStToday")];
    return ["none", "–"];
  }
  function renderLmoTab() {
    var root = $("lmoBody"), today = todayISO(), now = new Date(), hhmm = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
    var a = document.activeElement, keepK = a && root.contains(a) ? a.getAttribute("data-k") : null;
    root.textContent = "";
    var manage = svgBtn("", ICONS.gear, T("lmoManage"), { "data-k": "lmo-manage", onclick: function (ev) { openRota(false, ev.currentTarget); } });
    if (!rota.entries.length) {
      root.appendChild(h("div", { class: "card" }, [h("p", { text: T("lmoEmpty") }), h("div", { class: "btn-row mt" }, [manage])]));
      return;
    }
    // 1. What needs doing now (same rows as in the rota tools); the shown turn's notices are in its own card below
    var shown = currentEntry(today) || nextEntry(today);
    var due = lmoDue(today).filter(function (d) { return d.e !== shown; }), pend = kjDue();
    if (due.length || pend.length) {
      root.appendChild(h("section", { class: "card card-act", "aria-labelledby": "lmoNeed" }, [
        h("h2", { class: "section-title", id: "lmoNeed", text: T("lmoNeedAct") }),
        h("ul", { class: "m-list" }, due.map(function (d) { return dueRow(d); }).concat(pend.map(function (p) { return kjRow(p, function (msg) { renderAll(); if (msg) announce(msg); }); })))
      ]));
    }
    // 2. This week (or the next turn)
    var e = currentEntry(today), isNow = !!e;
    if (!e) e = nextEntry(today);
    if (e) {
      var c = entryContact(e), early = addDays(e.start, -2), checks = [];
      var mail = e.sent.email && e.sent.cal;
      if (mail) checks.push(lmoCheck("ok", T("lmoEmailCal"), T("lmoSentOn", shortDay(todayISO(Math.max(e.sent.email, e.sent.cal))))));
      else if (rota.gas) checks.push(lmoCheck(today >= early ? "ok" : "wait", T("lmoEmailCal"), T("lmoAutoOn", shortDay(early))));
      else if (today >= early) checks.push(lmoCheck("todo", T("lmoEmailCal"), T("lmoToSendNow"),
        [e.sent.email ? null : channelButton(e, c, "email", personName(e)), e.sent.cal ? null : channelButton(e, c, "cal", personName(e))].filter(Boolean)));
      else checks.push(lmoCheck("wait", T("lmoEmailCal"), T("lmoToSendOn", shortDay(early))));
      if (e.sent.wa) checks.push(lmoCheck("ok", T("lmoWaLine"), T("lmoSentOn", whenText(e.sent.wa))));
      else if (today >= e.start) checks.push(lmoCheck("todo", T("lmoWaLine"), T("lmoWaToday"), [channelButton(e, c, "wa", personName(e))]));
      else checks.push(lmoCheck("wait", T("lmoWaLine"), T("lmoToSendOn", shortDay(e.start))));
      checks.push(lmoCheck("wait", T("lmoConfirmTitle"), rota.webUrl ? T("lmoConfirmAuto", rota.deadline) : T("lmoConfirmManual", rota.deadline)));
      var days = [];
      for (var d = e.start; d <= e.end; d = addDays(d, 1)) {
        if (!isWorkday(d)) continue;
        var ds = dayState(e, d, today, hhmm), p = parseISO(d);
        days.push(h("li", { class: "day day-" + ds[0] + (d === today ? " today" : "") }, [
          h("b", { text: T("days")[p.getDay()] }), document.createTextNode(String(p.getDate())), h("span", { class: "day-st", text: ds[1] })
        ]));
      }
      var who = [c ? c.role : "", c ? c.prog : "", T("lmoDutyTime", rota.timeFrom, rota.timeTo)].filter(Boolean).join(" · ");
      root.appendChild(h("section", { class: "card", "aria-labelledby": "lmoThis" }, [
        h("p", { class: "eyebrow", id: "lmoThis", text: isNow ? T("lmoThisWeek", lmoRange(e)) : T("lmoNextTurn", lmoRange(e)) }),
        h("p", { class: "duty-name", text: personName(e) }),
        h("p", { class: "muted", text: who }),
        h("ul", { class: "checks" }, checks),
        h("ul", { class: "days", "aria-label": T("lmoDaysAria") }, days)
      ]));
    }
    // 3. Coming up
    var later = rota.entries.filter(function (x) { return x.start > (e ? e.end : today); }).slice(0, 3);
    root.appendChild(h("section", { class: "card", "aria-labelledby": "lmoNext" }, [
      h("h2", { class: "section-title", id: "lmoNext", text: T("lmoUpcoming") }),
      later.length ? h("ul", { class: "upnext" }, later.map(function (x) {
        var right = x.off ? T("pHoliday") : rota.gas ? T("lmoEmailAuto", shortDay(addDays(x.start, -2))) : T("lmoEmailOn", shortDay(addDays(x.start, -2)));
        return h("li", null, [h("span", null, [h("strong", { text: x.off ? T("pHoliday") : personName(x) || T("rNoPerson") }), h("br"), h("span", { class: "muted", text: lmoRange(x) })]),
          h("span", { class: "muted ta-r", text: x.off ? "" : right })]);
      })) : h("p", { class: "muted", text: T("lmoNoMore") })
    ]));
    root.appendChild(h("div", { class: "btn-row mt" }, [manage,
      svgBtn("", ICONS.print, T("rPrintRoster"), { "data-k": "lmo-print", onclick: function () { printRota("roster"); } }),
      svgBtn("", ICONS.print, T("rPrintCheck"), { "data-k": "lmo-check", onclick: function () { printRota("check"); } })]));
    root.appendChild(h("p", { class: "foot-note", text: rota.gas ? T("lmoAutoNote") : T("lmoManualNote") }));
    // Keys unique to this tab, so they never clash with the same buttons in the home notice or the rota dialog
    root.querySelectorAll("[data-k]").forEach(function (b) { var k = b.getAttribute("data-k"); if (k.indexOf("lmo-") !== 0) b.setAttribute("data-k", "tab-" + k); });
    if (keepK) { var el = root.querySelector('[data-k="' + cssEscape(keepK) + '"]'); if (el && el.offsetParent !== null) el.focus(); }
  }

  /* ================================================================
     Lagi (More): contacts, backup, language, theme, install, guide
     ================================================================ */
  function renderMore() {
    $("moreContactCount").textContent = T("cCount", contacts.length);
    document.querySelectorAll("[data-theme-set]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-theme-set") === savedThemeValue())); });
    document.querySelectorAll(".lang [data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang)); });
  }

  $("exportBtn").addEventListener("click", function () {
    save();
    var data = { app: "eisenhower-planner", version: 4, exportedAt: new Date().toISOString(), tasks: tasks, archive: archive, contacts: contacts, rota: rota };
    downloadText("jppp-smart-planner-" + todayISO() + ".json", JSON.stringify(data, null, 2), "application/json");
    toast(T("backupSaved"));
  });
  $("importBtn").addEventListener("click", function () { $("importFile").click(); });
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
        var seen = Object.create(null), existing = Object.create(null);
        tasks.concat(archive).forEach(function (t) { seen[t.id] = true; existing[t.id] = true; });
        // Skip exact duplicates (same id), give new ids to clashing ones; map old four-box tasks the same way as the migration
        var newTasks = cleanList(inTasks.filter(function (t) { return !(t && existing[t.id]); }), seen);
        var newArch = cleanList(inArchive.filter(function (t) { return !(t && existing[t.id]); }), seen);
        var now = Date.now(), kept = [];
        newTasks.forEach(function (t) { if (mapLegacy(t, now) === "archive") newArch.push(t); else kept.push(t); });
        tasks = tasks.concat(kept);
        archive = archive.concat(newArch);
        if (data && Array.isArray(data.contacts)) { contacts = cleanContacts(contacts.concat(data.contacts)); saveContacts(); }
        if (data && data.rota && typeof data.rota === "object") mergeRota(data.rota);
        save();
        autoArchiveDone();
        renderAll();
        if ($("rotaDlg").open) renderRota();
        toast(T("imported", kept.length));
      } catch (err) {
        toast(T("badFile"));
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  var installEvt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installEvt = e;
    $("installItem").hidden = false;
  });
  $("installBtn").addEventListener("click", function () {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt = null;
    $("installItem").hidden = true;
  });

  /* ================================================================
     Example data (empty state and ?demo=1). Fake names only.
     ================================================================ */
  function sampleData() {
    var now = Date.now();
    function at(daysAgo, hour, min) { var d = new Date(now - daysAgo * DAY); d.setHours(hour, min || 0, 0, 0); return Math.min(d.getTime(), now - 60000); }
    function dateIn(days) { return addDays(todayISO(), days); }
    var bm = lang === "ms", L = function (ms, en) { return bm ? ms : en; };
    var MEET = L("Mesyuarat Jabatan Bil. 4/2026", "Department Meeting 4/2026");
    var people = [
      { name: "Pensyarah A", role: "Pensyarah", prog: "AA101", phone: "60120000001", email: "pensyarah.a@example.com", rota: false },
      { name: "Pensyarah B", role: "Pensyarah", prog: "AB101", phone: "60120000002", email: "pensyarah.b@example.com", rota: false },
      { name: "Pensyarah C", role: "Ketua Program", prog: "AB107", phone: "60120000003", email: "pensyarah.c@example.com", rota: false },
      { name: "Pensyarah D", role: "Pensyarah", prog: "AB107", phone: "60120000006", email: "pensyarah.d@example.com", rota: false },
      { name: "Puan Siti (contoh)", role: "Pensyarah", prog: "AA101", phone: "60120000004", email: "siti@example.com", rota: false },
      { name: "Encik Hafiz (contoh)", role: "Pensyarah", prog: "AB101", phone: "60120000005", email: "", rota: false },
      { name: "Dr. Aminah (contoh)", role: "Ketua Program", prog: "AA101", phone: "", email: "aminah@example.com", rota: false }
    ];
    var list = [
      { text: L("Sediakan kertas cadangan lawatan industri AA101", "Prepare the AA101 industry visit proposal"), who: "Pensyarah A", date: dateIn(11), created: at(3, 16, 5), src: MEET },
      { text: L("Kemas kini fail kursus AB107 untuk audit MQS", "Update the AB107 course file for the MQS audit"), who: "Pensyarah A", date: dateIn(4), created: at(3, 16, 6), src: MEET },
      { text: L("Hantar senarai pelajar latihan industri kepada Unit LI", "Send the industrial training student list to the LI Unit"), who: "Encik Hafiz (contoh)", date: dateIn(2), created: at(3, 16, 8), src: MEET },
      { text: L("Kumpul borang penilaian pensyarah semester ini", "Collect this semester's lecturer evaluation forms"), who: "Pensyarah C", date: dateIn(-3), created: at(11, 10), notifiedAt: at(10, 9, 30), sentVia: "wa" },
      { text: L("Tempah dewan untuk Hari Kerjaya", "Book the hall for Career Day"), who: "Puan Siti (contoh)", date: dateIn(7), created: at(3, 16, 2), notifiedAt: at(3, 17, 10), sentVia: "wa", src: MEET },
      { text: L("Semak draf takwim peperiksaan akhir", "Check the final exam calendar draft"), who: "Pensyarah B", date: dateIn(3), created: at(3, 16, 3), notifiedAt: at(3, 17, 12), sentVia: "wa", src: MEET },
      { text: L("Sediakan slaid taklimat semester baharu", "Prepare the new semester briefing slides"), who: "Dr. Aminah (contoh)", date: dateIn(9), created: at(3, 16, 4), notifiedAt: at(3, 17, 15), sentVia: "email", ackAt: at(2, 9, 12), ackVia: "su", src: MEET },
      { text: L("Kemas kini papan kenyataan jabatan", "Update the department notice board"), who: "Pensyarah B", date: dateIn(1), created: at(6, 11), notifiedAt: at(6, 11, 5), sentVia: "wa", ackAt: at(6, 11, 40), ackVia: "su" },
      { text: L("Kemas kini senarai semak dokumen MQS", "Update the MQS document checklist"), who: "Encik Hafiz (contoh)", date: dateIn(4), created: at(7, 10), notifiedAt: at(7, 10, 10), sentVia: "wa", ackAt: at(7, 12), ackVia: "su",
        status: "blocked", statusAt: at(2, 15), statusNote: L("Perlu templat terkini daripada Unit Kualiti", "Needs the latest template from the Quality Unit") },
      { text: L("Tempah bilik mesyuarat untuk bengkel OBE", "Book a meeting room for the OBE workshop"), who: "Pensyarah D", date: dateIn(-4), created: at(12, 9), notifiedAt: at(12, 9, 10), sentVia: "wa", ackAt: at(12, 9, 40), ackVia: "su", done: true, doneAt: at(5, 15) },
      { text: L("Kemas kini senarai kehadiran mesyuarat", "Update the meeting attendance list"), who: "Pensyarah A", date: dateIn(-5), created: at(10, 11), notifiedAt: at(10, 11, 5), sentVia: "wa", ackAt: at(10, 11, 30), ackVia: "su", done: true, doneAt: at(6, 16, 20) }
    ];
    list.forEach(function (t) { t.q = "delegate"; });
    return { tasks: list, contacts: people };
  }
  function loadSample(skipConfirm) {
    if (tasks.length && !skipConfirm && !window.confirm(T("confirmSample"))) return;
    if (tasks.length || archive.length) writeJSON(KEY + ":before-sample", { tasks: tasks, archive: archive, at: Date.now() });
    var s = sampleData();
    tasks = cleanList(s.tasks, Object.create(null));
    contacts = cleanContacts(contacts.concat(s.contacts.filter(function (c) { return !contactFor(c.name); })));
    saveContacts();
    save();
    renderAll();
    toast(T("sampleLoaded"));
    var hd = $("h-mesyuarat"); hd.setAttribute("tabindex", "-1"); hd.focus();
  }

  /* ================================================================
     Theme and language
     ================================================================ */
  function savedThemeValue() { var v = null; try { v = localStorage.getItem(THEME_KEY); } catch (e) {} return v === "dark" || v === "light" ? v : ""; }
  // "light" | "dark" = the SU's choice; "" = Auto (follow the phone's setting)
  function setTheme(v) {
    if (v) document.documentElement.setAttribute("data-theme", v); else document.documentElement.removeAttribute("data-theme");
    try { if (v) localStorage.setItem(THEME_KEY, v); else localStorage.removeItem(THEME_KEY); } catch (e) {}
    renderMore();
  }
  document.querySelectorAll("[data-theme-set]").forEach(function (b) { b.addEventListener("click", function () { setTheme(b.getAttribute("data-theme-set")); }); });
  if (savedThemeValue()) document.documentElement.setAttribute("data-theme", savedThemeValue());

  function applyLang(l) {
    lang = I18N[l] ? l : "ms";
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = T(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) { el.placeholder = T(el.getAttribute("data-i18n-placeholder")); });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", T(el.getAttribute("data-i18n-aria"))); });
    renderToday();
    renderRoleOptions();
    renderAll();
    renderMore();
    if ($("contactsDlg").open) renderContacts();
    if ($("rotaDlg").open) renderRota();
    if ($("sendDlg").open) renderSendAll();
    if ($("dlgAdd").open) { renderWhen(); if (addPicker) addPicker.redraw(); }
    if ($("dlgPick").open && pickPicker) pickPicker.redraw();
    refreshOpenSheets();
  }
  document.querySelectorAll(".lang [data-lang]").forEach(function (b) {
    b.addEventListener("click", function () {
      var l = b.getAttribute("data-lang");
      try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
      applyLang(l);
      b.focus();
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
    if ((e.key !== "/" && e.key !== "n") || e.ctrlKey || e.metaKey || e.altKey) return;
    var a = document.activeElement;
    var typing = a && (a.isContentEditable || a.tagName === "TEXTAREA" || a.tagName === "SELECT" ||
      (a.tagName === "INPUT" && !/^(checkbox|radio|button|submit|file)$/.test(a.type)));
    if (typing || document.querySelector("dialog[open]")) return;
    e.preventDefault();
    openAdd(a);
  });

  window.addEventListener("storage", function (e) {
    if (e.key !== KEY && e.key !== ARCHIVE_KEY && e.key !== ROTA_KEY && e.key !== CONTACTS_KEY) return;
    if (document.querySelector("dialog[open]:not(#rotaDlg)")) return;   // do not pull the data out from under an open form
    loadAll();
    renderContactOptions();
    renderAll();
    if ($("rotaDlg").open) renderRota();
  });

  var lastDay = todayISO();
  setInterval(function () {
    // Every minute: Last Man Out notices, and the "Selesai not confirmed" banner once the deadline passes
    renderLmoBanner();
    if (renderKjBanner()) { if ($("rotaDlg").open) renderRota(); if (view === "lmo") renderLmoTab(); }
    var now = todayISO();
    if (now === lastDay) return;
    lastDay = now;
    renderToday();
    autoArchiveDone();
    renderAll();
    if ($("rotaDlg").open) renderRota();
  }, 60000);

  /* ================================================================
     Start
     ================================================================ */
  var savedLang = null;
  try { savedLang = localStorage.getItem(LANG_KEY); } catch (e) {}
  lang = savedLang && I18N[savedLang] ? savedLang : "ms";

  loadAll();
  renderContactOptions();
  applyLang(lang);
  showView("mesyuarat");

  // ?demo=1 loads the example (only when there are no tasks, so real data is never replaced).
  // ?pakej=lmo (the old Last Man Out task pack) is no longer used and is ignored.
  if (/[?&](demo=1|pakej=lmo)\b/.test(location.search)) {
    if (/[?&]demo=1\b/.test(location.search) && !tasks.length) loadSample(true);
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
  }
})();
