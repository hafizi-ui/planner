/* Eisenhower Planner: a decision coach, not just a list.
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
    cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>'
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

  /* ================================================================
     Text in two languages (BM / EN)
     ================================================================ */
  var I18N = {
    en: {
      skip: "Skip to task box",
      insight: "Insight", more: "More options", export: "Export backup", import: "Import backup",
      loadSample: "Load sample week", install: "Install app", language: "Language", theme: "Switch light or dark theme",
      h1: "What deserves your time today?",
      lede: "Write a task and answer two quick questions. The planner puts it in the right box and shows you where your week really went.",
      placeholder: "Add a task, e.g. Submit report tomorrow", newTask: "New task", add: "Add task",
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
      calDetails: "Planned in the Schedule box of Eisenhower Planner (https://hafizi-ui.github.io/planner/).",
      calDetailsDel: "Task assigned via Eisenhower Planner (https://hafizi-ui.github.io/planner/).",
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
      cCsvHelp: "CSV columns: name, WhatsApp no., email. Save from Excel or Google Sheets as .csv.",
      cEmpty: "No contacts yet. Add them one by one, or import a CSV from Excel / Google Sheets.",
      cImported: function (n) { return n + " contacts imported"; }, cBadCsv: "No contacts found in that file",
      cNeed: "Enter a name and at least a WhatsApp number or an email.",
      cBadPhone: "That WhatsApp number doesn't look right. Example: 012-345 6789",
      cBadEmail: "That email doesn't look right.",
      cDelete: function (n) { return "Delete " + n + " from contacts?"; },
      cSaved: function (n) { return n + " saved"; }, cEdit: "Edit", cDel: "Delete",
      cCount: function (n) { return n + (n === 1 ? " contact" : " contacts"); },
      sendByPic: "Send to each PIC", sendTitle: "Send tasks by PIC",
      sendNote: "One message per person with all their open tasks. Good for meeting minutes.",
      meetingLabel: "From (optional)", meetingPh: "e.g. Department Meeting 3/2026",
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
      h1: "Apa yang layak dapat masa anda hari ini?",
      lede: "Tulis tugasan dan jawab dua soalan ringkas. Planner akan letakkan dalam kotak yang betul dan tunjukkan ke mana masa anda pergi sepanjang minggu.",
      placeholder: "Tambah tugasan, cth. Hantar laporan esok", newTask: "Tugasan baharu", add: "Tambah",
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
      calDetails: "Dirancang dalam kotak Jadualkan, Eisenhower Planner (https://hafizi-ui.github.io/planner/).",
      calDetailsDel: "Tugasan diagihkan melalui Eisenhower Planner (https://hafizi-ui.github.io/planner/).",
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
      cCsvHelp: "Lajur CSV: nama, no. WhatsApp, emel. Simpan dari Excel atau Google Sheets sebagai .csv.",
      cEmpty: "Belum ada kenalan. Tambah satu persatu, atau import CSV dari Excel / Google Sheets.",
      cImported: function (n) { return n + " kenalan diimport"; }, cBadCsv: "Tiada kenalan dijumpai dalam fail itu",
      cNeed: "Isi nama dan sekurang-kurangnya no. WhatsApp atau emel.",
      cBadPhone: "No. WhatsApp itu nampak tidak betul. Contoh: 012-345 6789",
      cBadEmail: "Emel itu nampak tidak betul.",
      cDelete: function (n) { return "Padam " + n + " daripada kenalan?"; },
      cSaved: function (n) { return n + " disimpan"; }, cEdit: "Sunting", cDel: "Padam",
      cCount: function (n) { return n + " kenalan"; },
      sendByPic: "Hantar ikut PIC", sendTitle: "Hantar tugasan ikut PIC",
      sendNote: "Satu mesej untuk setiap orang, mengandungi semua tugasan mereka yang belum selesai. Sesuai untuk minit mesyuarat.",
      meetingLabel: "Daripada (pilihan)", meetingPh: "cth. Mesyuarat Jabatan Bil. 3/2026",
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

  var tasks = [], archive = [], meta = {}, contacts = [];
  var CONTACTS_KEY = "eisenhower-planner:contacts";

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
  function normContact(c) {
    if (!c || typeof c !== "object") return null;
    var name = String(c.name || "").trim().slice(0, 60);
    var phone = c.phone ? normPhone(c.phone) : "";
    var email = String(c.email || "").trim().slice(0, 120);
    if (phone === "invalid") phone = "";
    if (email && !validEmail(email)) email = "";
    if (!name || (!phone && !email)) return null;
    return { id: typeof c.id === "string" && c.id ? c.id.slice(0, 40) : uid(), name: name, phone: phone, email: email };
  }
  function cleanContacts(arr) {
    var out = [], byName = Object.create(null);
    (Array.isArray(arr) ? arr : []).forEach(function (c) {
      var n = normContact(c);
      if (!n) return;
      var k = n.name.toLowerCase();
      if (byName[k]) { Object.assign(byName[k], { phone: n.phone || byName[k].phone, email: n.email || byName[k].email }); return; }
      byName[k] = n; out.push(n);
    });
    return out;
  }
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
      o.label = [c.phone ? "+" + c.phone : "", c.email].filter(Boolean).join(" \u00b7 ");
      dl.appendChild(o);
    });
  }

  function loadAll() {
    contacts = cleanContacts(readJSON(CONTACTS_KEY, []));
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
        if (c) {
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
          share.appendChild(h("button", { class: "cal-link add-contact", type: "button", "data-role": "addc",
            html: ICONS.user + "<span>" + escapeHtml(T("saveContact")) + "</span>",
            onclick: function () { openContacts({ name: t.who }); } }));
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
      { text: L("Hantar laporan PSM kepada penyelia", "Submit final-year project report to supervisor"), q: "do", created: at(1, 9) },
      { text: L("Semak markah kuiz kelas petang", "Mark the afternoon class quiz"), q: "do", created: at(0, 8), reactive: true },
      { text: L("Ulangkaji Bab 4 untuk peperiksaan akhir", "Revise Chapter 4 for the final exam"), q: "schedule", date: dateIn(2), created: at(2, 10) },
      { text: L("Sediakan slaid kuliah minggu depan", "Prepare next week's lecture slides"), q: "schedule", date: "", created: at(1, 15) },
      { text: L("Sesi senaman 30 minit", "30-minute workout"), q: "schedule", date: dateIn(1), created: at(0, 7) },
      { text: L("Kemas kini borang kehadiran kelab", "Update the club attendance form"), q: "delegate", who: "Aiman", date: dateIn(1), status: "doing", statusAt: at(1, 16), statusNote: L("Separuh siap", "Half done"), notifiedAt: at(1, 12), created: at(1, 11) },
      { text: L("Balas mesej kumpulan WhatsApp kelab", "Reply to the club WhatsApp group"), q: "delegate", who: "Siti", date: dateIn(-1), notifiedAt: at(6, 10), created: at(6, 9) },
      { text: L("Tonton video ulasan telefon baharu", "Watch new phone review videos"), q: "delete", created: at(0, 21) }
    ];
    // One scheduled task that is already due, to show automatic promotion
    cur.push({ text: L("Draf proposal geran penyelidikan", "Draft the research grant proposal"), q: "schedule", date: todayISO(now - DAY), created: at(5, 9) });

    function doneItem(ms, en, q, daysAgo, hour, extra) {
      var o = { text: L(ms, en), q: q, done: true, doneQ: q, created: at(daysAgo + 1, 8), doneAt: at(daysAgo, hour), archivedAt: at(daysAgo, hour + 1) };
      Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
      return o;
    }
    var arch = [
      // This week
      doneItem("Isi borang tuntutan perjalanan", "Fill in the travel claim form", "do", 6, 10),
      doneItem("Jawab emel pelajar tentang tugasan", "Answer student emails about the assignment", "do", 6, 15),
      doneItem("Baiki slaid pembentangan kolokium", "Fix the colloquium presentation slides", "do", 5, 11, { moves: [{ from: "schedule", to: "do", at: at(5, 0), auto: true }], promoted: true, origin: "schedule" }),
      doneItem("Baca dua artikel jurnal untuk Bab 2", "Read two journal articles for Chapter 2", "schedule", 5, 20),
      doneItem("Cetak nota untuk kelas", "Print notes for class", "delegate", 4, 9, { who: "Siti" }),
      doneItem("Mesyuarat jabatan", "Department meeting", "do", 4, 14, { reactive: true }),
      doneItem("Rancang jadual ulangkaji", "Plan the revision timetable", "schedule", 3, 21),
      doneItem("Hantar markah kerja kursus", "Submit coursework marks", "do", 3, 16),
      doneItem("Senaman pagi", "Morning workout", "schedule", 2, 7),
      doneItem("Tempah bilik untuk bengkel", "Book a room for the workshop", "delegate", 2, 10, { who: "Hafiz" }),
      doneItem("Tulis 500 patah perkataan tesis", "Write 500 words of the thesis", "schedule", 1, 22),
      doneItem("Balas panggilan ibu bapa pelajar", "Return a parent's phone call", "do", 1, 12, { reactive: true }),
      doneItem("Kemas meja kerja", "Tidy up the desk", "schedule", 0, 8),
      // Let go on purpose this week
      { text: L("Susun semula folder gambar lama", "Reorganise old photo folders"), q: "delete", created: at(4, 9), archivedAt: at(3, 9), dropped: true },
      { text: L("Baca semua emel promosi", "Read every promotional email"), q: "delete", created: at(3, 9), archivedAt: at(2, 9), dropped: true },
      // The week before (more reactive, so the score shows improvement)
      doneItem("Siapkan laporan segera", "Finish an urgent report", "do", 8, 10),
      doneItem("Isi borang last minute", "Fill in a last-minute form", "do", 9, 11),
      doneItem("Jawab emel bertimbun", "Clear the email backlog", "do", 10, 15),
      doneItem("Urus aduan pelajar", "Handle a student complaint", "delegate", 11, 9),
      doneItem("Ulangkaji ringkas", "Short revision session", "schedule", 12, 20)
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
    var data = { app: "eisenhower-planner", version: 2, exportedAt: new Date().toISOString(), tasks: tasks, archive: archive, contacts: contacts };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = h("a", { href: URL.createObjectURL(blob), download: "eisenhower-tasks-" + todayISO() + ".json" });
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
        promoteDue();
        commit();
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
  function openContacts(prefill) {
    closeMenu();
    lastFocus = document.activeElement;
    editingId = null;
    var f = $("contactForm");
    f.reset();
    $("contactMsg").textContent = "";
    if (prefill && prefill.name) f.elements.name.value = prefill.name;
    renderContacts();
    var dlg = $("contactsDlg");
    if (!dlg.open) { if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", ""); }
    (prefill && prefill.name ? f.elements.phone : f.elements.name).focus();
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
      .filter(function (c) { return !q || (c.name + " " + c.phone + " " + c.email).toLowerCase().indexOf(q) >= 0; })
      .forEach(function (c) {
        list.appendChild(h("li", { class: "c-row" }, [
          h("div", { class: "c-info" }, [
            h("p", { class: "c-name", text: c.name }),
            h("p", { class: "c-detail", text: [c.phone ? "+" + c.phone : "", c.email].filter(Boolean).join("  ·  ") })
          ]),
          h("button", { class: "tiny-btn", type: "button", "aria-label": T("cEdit") + ": " + c.name, html: ICONS.edit, onclick: function () {
            editingId = c.id;
            var f = $("contactForm");
            f.elements.name.value = c.name; f.elements.phone.value = c.phone ? "+" + c.phone : ""; f.elements.email.value = c.email;
            setContactMode(); f.elements.name.focus();
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
    var name = f.elements.name.value.trim(), phoneRaw = f.elements.phone.value.trim(), email = f.elements.email.value.trim();
    if (!name || (!phoneRaw && !email)) { msg.textContent = T("cNeed"); return; }
    var phone = phoneRaw ? normPhone(phoneRaw) : "";
    if (phoneRaw && (phone === "invalid" || !phone)) { msg.textContent = T("cBadPhone"); f.elements.phone.focus(); return; }
    if (email && !validEmail(email)) { msg.textContent = T("cBadEmail"); f.elements.email.focus(); return; }
    var existing = editingId ? contacts.filter(function (c) { return c.id === editingId; })[0] : contactFor(name);
    if (existing) {
      var oldName = existing.name;
      existing.name = name; existing.phone = phone; existing.email = email;
      // Keep tasks linked when a contact is renamed
      if (oldName !== name) tasks.forEach(function (t) { if (t.who.toLowerCase() === oldName.toLowerCase()) t.who = name; });
      save();
    } else {
      contacts.push({ id: uid(), name: name.slice(0, 60), phone: phone, email: email });
    }
    editingId = null;
    f.reset();
    msg.textContent = T("cSaved", name);
    saveContacts();
    renderContacts();
    render();
    f.elements.name.focus();
  });
  $("contactCancel").addEventListener("click", function () { editingId = null; $("contactForm").reset(); $("contactMsg").textContent = ""; setContactMode(); });
  $("contactsClose").addEventListener("click", closeContacts);
  $("contactsDlg").addEventListener("close", function () { render(); if (lastFocus && lastFocus.focus && lastFocus.isConnected) lastFocus.focus(); });
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
  function contactsFromRows(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(function (x) { return x.trim().toLowerCase(); });
    var col = { name: -1, phone: -1, email: -1 };
    head.forEach(function (x, i) {
      if (col.email < 0 && /e-?mel|e-?mail/.test(x)) col.email = i;
      else if (col.phone < 0 && /whats|wasap|wa\b|phone|telefon|tel|no\.?\s*hp|h\/p|mobile|bimbit/.test(x)) col.phone = i;
      else if (col.name < 0 && /nama|name/.test(x)) col.name = i;
    });
    var hasHeader = col.name >= 0 || col.phone >= 0 || col.email >= 0;
    if (!hasHeader) col = { name: 0, phone: 1, email: 2 };
    if (col.name < 0) col.name = 0;
    return (hasHeader ? rows.slice(1) : rows).map(function (r) {
      return { name: r[col.name] || "", phone: col.phone >= 0 ? r[col.phone] || "" : "", email: col.email >= 0 ? r[col.email] || "" : "" };
    });
  }
  $("contactImportBtn").addEventListener("click", function () { $("contactImportFile").click(); });
  $("contactImportFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var before = contacts.length;
      var incoming = cleanContacts(contactsFromRows(parseCSV(String(reader.result))));
      if (!incoming.length) { $("contactMsg").textContent = T("cBadCsv"); e.target.value = ""; return; }
      contacts = cleanContacts(contacts.concat(incoming));
      saveContacts(); renderContacts(); render();
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
  $("contactTemplateBtn").addEventListener("click", function () {
    downloadText("contacts-template.csv", "﻿" + [T("cName"), T("cPhone"), T("cEmail")].join(",") + "\n" + "Nama Contoh,012-345 6789,nama@kptm.edu.my\n", "text/csv");
  });
  $("contactExportBtn").addEventListener("click", function () {
    var lines = [[T("cName"), T("cPhone"), T("cEmail")].join(",")].concat(contacts.map(function (c) {
      return [c.name, c.phone ? "+" + c.phone : "", c.email].map(csvCell).join(",");
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
      if (!c) btns.push(h("button", { class: "cal-link add-contact", type: "button",
        html: ICONS.user + "<span>" + escapeHtml(T("saveContact")) + "</span>",
        onclick: function () { closeSendAll(); openContacts({ name: g.name }); } }));
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
        if (!c) btns.push(h("button", { class: "cal-link add-contact", type: "button", html: ICONS.user + "<span>" + escapeHtml(T("saveContact")) + "</span>",
          onclick: function () { closeMonitor(); openContacts({ name: t.who }); } }));
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
      if (g.open.length && g.c) {
        var lines = g.open.slice().sort(sortItems("schedule")).map(function (t, i) {
          return (i + 1) + ". *" + t.text + "*" + (t.date ? " (" + T("dueShort").toLowerCase() + ": " + longDate(t.date) + ")" : "");
        }).join("\n");
        var msg = T("askMsg", g.c.name, lines);
        var mark = function () { g.open.forEach(function (t) { t.askedAt = Date.now(); }); afterSend(); };
        if (g.c.phone) btns.push(waLink(g.c.phone, msg, T("askStatus"), T("waAria", g.c.name, T("askStatus")), mark));
        if (g.c.email) btns.push(mailLink(g.c.email, T("askSubject"), msg, T("cEmail"), T("mailAria", g.c.name, T("askStatus")), mark));
      } else if (g.open.length) {
        btns.push(h("button", { class: "cal-link add-contact", type: "button", html: ICONS.user + "<span>" + escapeHtml(T("saveContact")) + "</span>",
          onclick: function () { closeMonitor(); openContacts({ name: g.name }); } }));
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
  }
  document.querySelectorAll(".lang [data-lang]").forEach(function (b) {
    b.addEventListener("click", function () {
      var l = b.getAttribute("data-lang");
      try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
      applyLang(l);
    });
  });

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
    if (e.key !== KEY && e.key !== ARCHIVE_KEY) return;
    if (document.activeElement && document.activeElement.classList.contains("task-edit")) return;
    loadAll();
    render();
  });

  var lastDay = todayISO();
  setInterval(function () {
    var now = todayISO();
    if (now === lastDay) return;
    lastDay = now;
    renderToday();
    var n = promoteDue();
    commit();
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
})();
