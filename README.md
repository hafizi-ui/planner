# JPPP Smart Planner

*Planner berasaskan Matriks Eisenhower (sebelum ini dikenali sebagai Eisenhower Planner).*

**Bukan sekadar senarai, tetapi jurulatih keputusan.**
*Not just a list, a decision coach.*

**Live app:** https://hafizi-ui.github.io/planner/
**Demo with a sample week:** https://hafizi-ui.github.io/planner/?demo=1

![Desktop view](docs/screenshot-desktop.png)

## The problem

Students and lecturers spend their week firefighting: assignments due tomorrow, last-minute forms, meetings called at short notice. Work that really matters, like the final-year project, research and lesson preparation, keeps getting pushed back until it becomes a crisis. Ordinary to-do lists record tasks but never question them.

## The idea

The Eisenhower Matrix sorts every task by two questions:

| | Urgent | Not urgent |
|---|---|---|
| **Important** | **Do / Buat**: finish first | **Schedule / Jadualkan**: give it a date |
| **Not important** | **Delegate / Agihkan**: name who handles it | **Delete / Buang**: let it go |

Many apps let you drag tasks into four boxes. This planner goes further. It **helps you decide which box**, then **shows you where your time actually went**.

## What makes it different

1. **Guided triage.** The urgent/important questions start unanswered, so nothing lands in the red box by default. Each question has a short definition (urgent = due within 48 hours or someone is waiting; important = moves a real goal forward). For urgent but unimportant tasks a third question asks *"Can someone else do it?"*.
2. **Deadline words are picked up automatically.** Typing *esok*, *hari ini*, *tomorrow* or *deadline* marks the task urgent and says why.
3. **Tasks move on their own.** When a scheduled task's date arrives, it moves to Do with a "From Schedule" label. This makes the cost of leaving things too late visible.
4. **Weekly Insight: "Ke mana masa saya pergi?"** For the last 7 days it shows what you finished by box, a day-by-day chart, a **Balance score** (share of finished work that was planned) compared with the week before, and plain-language coaching.
5. **Bahasa Melayu and English.** One tap switches every label, hint and insight.
6. **Private and offline.** No account and no server. Data stays on the device. It installs to a phone's home screen and works in flight mode.

![Weekly insight](docs/screenshot-insight.png)

![Project monitor](docs/screenshot-monitor.png)

## Meetings: assign a task to a PIC in one tap

After a meeting, put each action item in **Delegate**, pick the person in charge (PIC) and set a due date. The task then shows:

- **WhatsApp**: opens WhatsApp with a ready message to the PIC (task, due date and a Google Calendar link)
- **Email**: opens your email app with the subject and message filled in
- **Google Calendar**: creates the event and adds the PIC's email as a guest, so they get an invitation

A "Notified" label shows which PICs have been told.

**Send to each PIC** (button at the bottom of the Delegate box) groups every open task by person and builds **one message per PIC**, numbered and sorted by due date, with an optional heading such as *"Mesyuarat Jabatan Bil. 3/2026"*. Tick *"Only tasks not yet notified"* to send just the new items after a follow-up meeting.

**Team contacts** (⋯ menu) stores each member's name, WhatsApp number and email, so you never retype them. Add them one by one or import a CSV from Excel / Google Sheets (columns: name, WhatsApp no., email; optionally role, programme and Last Man Out rota, see below). Numbers like `012-345 6789` are converted to WhatsApp format automatically. Contacts stay on your device only and are never part of the public website.

## Task pack: Last Man Out (MQS)

A ready-made set of tasks for running a weekly **Last Man Out** duty rota under the **MARA Ecosystem Quality Standard (MQS)**. The rota and its daily checklist are evidence for MQS auditors that the office has an active system for **energy saving** (lights, fans and air-conditioning off after hours) and **office safety** (main switch off, doors and windows locked), with clear accountability for each week.

Add it from the ⋯ menu (**Tambah pakej: Last Man Out (MQS)**) or open https://hafizi-ui.github.io/planner/?pakej=lmo. The tasks are added on top of your existing ones (nothing is replaced), and adding the pack twice does not create duplicates.

| Box | Tasks |
|---|---|
| **Do** | List the officers for the weekly rota |
| **Schedule** | Prepare the weekly duty roster (date/week + officer name) · Prepare the checklist (lights off, air-conditioning off, main switch/plugs off, main door locked) · Add signature & time-out columns (daily record) · First weekly check by the centre MQS committee · File the roster & forms as MQS audit evidence |
| **Delegate** | Print & post the roster at the main exit / zone notice board · Tell every officer on the rota · Duty officer completes the checklist every day before leaving (fill in the PIC) |
| **Delete** | Relying on one person to close the office every day |

Scheduled dates are set from the day you add the pack (tomorrow, in 2 days, in a week), so the tasks move to Do on their own when the day arrives. Edit any date to match your audit timeline.

## Giliran Last Man Out (rota) & reminders

The task pack above helps you set the duty up. **Giliran Last Man Out** (first item in the ⋯ menu) then runs it week after week: it builds the rota, reminds each officer on time, and prints the MQS evidence.

**1. Import the department's members once.** In **Team contacts**, import a CSV with these columns (BM header; the English header `Name,WhatsApp no.,Email,Role,Programme,LMO rota` also works):

```
Nama,No. WhatsApp,Emel,Jawatan,Program,Giliran LMO
```

- **Jawatan** (role): `Ketua Jabatan`, `Setiausaha`, `Ketua Program` or `Pensyarah`
- **Program**: e.g. `AA101`, `AB101`, `AB107`, or blank
- **Giliran LMO** (in the rota?): `Ya` or `Tidak`. If blank, everyone with a role is in the rota except the Ketua Jabatan.
- WhatsApp number and email may be left blank at first. The planner shows **Lengkapkan kenalan** (complete contact) wherever one is missing.

Keep this file on your own computer. It must never be uploaded to this repository (see [Privacy note for staff data](#privacy-note-for-staff-data)).

**2. Build the rota.** Choose weekly (Monday to Friday, the default) or daily turns, the order (by programme, or A to Z), the start date and the duty time (default 4:45 to 5:15 pm), tick who is in the rota, and press **Jana jadual**. **Sambung satu pusingan** adds one more full cycle.

**3. Change it without anyone losing a turn.**

- **Swap:** pick another person for a turn; they swap with that person's next turn.
- **Cuti umum / tiada tugas** (public holiday, no duty): everyone after that week moves one slot later, and one turn is added at the end.
- Turns that have already been notified, or start within 2 days, are never changed by regenerating.

**4. Reminders, on time.**

| When | What | To whom |
|---|---|---|
| 2 days before the turn (a Monday turn is notified on Saturday) | Email + Google Calendar invitation (duty time every working day of the turn) | Duty officer |
| First day of the turn | WhatsApp reminder with the checklist | Duty officer |

The planner has no server, so a banner (*"Last Man Out: notis untuk ... perlu dihantar"*) tells you when a notice is due, with one-tap Email / Calendar / WhatsApp buttons. It remembers what was sent and flags late notices. To send the email and calendar invitation fully automatically, use the Google Apps Script below.

**5. Print the MQS evidence.** **Cetak jadual** prints the duty roster (week/date, officer, role/programme, signature, remarks). **Cetak senarai semak** prints a 4-week daily checklist (lights, air-conditioning, main switch/plugs, doors and windows locked, time out, signature) with a "checked by" line for the MQS committee.

## Automation with Google Apps Script

An optional script in [`automation/`](automation/) runs every morning (about 7 am Malaysia time, weekends included) inside the secretary's own KPTM Google account:

- **2 days before each turn**, it emails the duty officer and sends a Google Calendar invitation (a daily series for a weekly turn, at the duty time, with a 30-minute pop-up reminder on the secretary's copy).
- **On the first day of the turn**, it emails the secretary a one-tap `wa.me` link with the WhatsApp reminder already written. WhatsApp cannot be sent automatically without the paid WhatsApp Business Platform, so she only taps **Send**.
- It never sends the same notice twice, catches up after a missed morning (until the turn starts), skips holiday weeks, cancels the old invitation when a turn is swapped, and stops before the daily email quota runs out. Anything that needs her attention (missing email, errors) is listed in her daily summary email.

Setup: export **Eksport CSV untuk Google Sheet** from the planner, import it into a private Google Sheet tab named `Giliran`, paste [`LastManOut.gs`](automation/LastManOut.gs) into **Extensions › Apps Script**, then choose **Last Man Out › Pasang (sekali sahaja)**. Step-by-step guide in Bahasa Melayu: **[automation/PANDUAN.md](automation/PANDUAN.md)**. Afterwards, tick **Emel & kalendar dihantar automatik oleh Google Apps Script** in the planner so the banner only asks for WhatsApp.

Rota CSV columns (planner export → Sheet):

```
ID,Mula,Tamat,Masa mula,Masa tamat,Nama,Emel,No WhatsApp,Jawatan,Program,Cuti,Emel dihantar,Kalendar dihantar,WhatsApp dihantar
```

The script finds columns by name (any order) and may add `ID acara` and `Catatan skrip` on the right. Tests (Node 18+, no install): `node --test automation/test`.

## Project monitor (Pantauan projek)

For whoever follows up on delegated work, such as a head of department or project lead:

- **Status on every delegated task:** Not started / In progress / Needs help / Done, plus a short status note and "last updated" date
- **Reminder banner:** when you open the planner, it tells you how many delegated tasks are due tomorrow or overdue
- **Needs a reminder:** each such task has a one-tap **WhatsApp reminder** (or email) with a polite, ready-written message. A "Reminded today" label prevents double reminders
- **By PIC:** a card per person with a progress bar, overdue and "needs help" flags, and an **Ask for status** button. It sends one message listing that person's open tasks, with reply codes (A = Not started, B = In progress, C = Done, D = Need help), so you can update the status in seconds
- **Summary tiles:** open tasks, % done, overdue, due today/tomorrow, and tasks with no news for 5+ days

The planner has no server, so it cannot send WhatsApp messages on its own. It does the remembering for you and prepares every message, and you tap Send. Google Calendar invitations give PICs their own reminders, based on their calendar notification settings.

## How it works with Google Calendar

Google Calendar answers *when* you are busy. This planner answers *whether that busyness is worth it*. They work together: decide priorities here, then send dated Schedule tasks to Google Calendar with one tap to get reminders and sync across devices. No login or server is needed in the planner for this.

## Who it is for

Diploma and degree students juggling coursework, co-curricular work and part-time jobs, and lecturers balancing teaching, research and administration, starting at KPTM.

It is also set up for the **department secretary (Setiausaha Jabatan, SU) of JPPP** (Jabatan Pengurusan Perniagaan & Perakaunan), KPTM Kuantan: sorting department work, delegating meeting actions to PICs and following them up, and running the weekly Last Man Out (MQS) rota with its reminders.

## Features

- Add a task and answer two quick questions; the "Goes to" preview shows the box before you add it
- Move tasks by dragging, or with the Move menu (works with a keyboard and on phones)
- Dates for Schedule tasks and due dates for Delegate tasks (overdue dates are flagged)
- **Google Calendar button** on dated Schedule and Delegate tasks: opens Google Calendar with the event already filled in, so the planner decides *what* matters and Calendar handles *when* and reminders
- Double-click or use the pencil to edit; undo after deleting
- Finished and let-go tasks are kept for the weekly Insight (up to 120 days)
- Progress bar (the Delete box is not counted)
- Light and dark theme, BM/EN switch
- Export and import backups (JSON)
- Load a sample week from the ⋯ menu, or open the app with `?demo=1`
- Last Man Out duty rota with timed reminders and a printable roster and checklist (see above)
- Press `/` to jump to the task box

## Accessibility

- Every action works with a keyboard; focus stays in place after changes
- Moves and additions are announced to screen readers
- Colour contrast meets WCAG 2.2 AA in light and dark themes (checked with axe-core: 0 violations)
- Respects "reduce motion" settings

## Privacy

Everything, including team contacts and the rota, is stored in the browser's `localStorage` on your own device. The planner sends nothing to any server and there is no tracking. Use **Export backup** to move tasks to another device. The optional Apps Script runs in your own Google account, not on this website.

## Privacy note for staff data

This repository and website are **public**. Staff names, phone numbers and emails must never be committed here.

- The members CSV and the rota CSV are kept only on the secretary's device and in her own private Google Sheet. `.gitignore` blocks the usual file names (`*ahli*.csv`, `giliran-lmo-*.csv`, `contacts-*.csv`), but always check before uploading files to GitHub.
- Examples and tests in this repository use made-up names (`Pensyarah Ujian 1`), `example.com` emails and `6012000000x` numbers only.
- Under the PDPA, it is good practice to tell staff that their work email and WhatsApp number are used for duty reminders, and to share the Sheet with no one who does not need it.

## Tech

Plain HTML, CSS and JavaScript. No frameworks, no build step, no external requests.

```
index.html             page structure
style.css              design and layout
app.js                 all app logic
sw.js                  offline support
manifest.json          install as an app
icon*.svg, icon*.png   app icons
fonts/                 self-hosted fonts (SIL Open Font License)
docs/                  screenshots
og.png                 preview image for social media links
automation/            optional Google Apps Script for Last Man Out reminders
  LastManOut.gs        the script (paste into Extensions › Apps Script)
  appsscript.json      script settings (time zone Asia/Kuala_Lumpur, V8)
  PANDUAN.md           setup guide in Bahasa Melayu
  test/                Node tests with Apps Script mocks
.gitignore             keeps staff CSV files out of the repository
```

## Publish on GitHub Pages

1. Upload **all** the files and folders above to the repository (Add file → Upload files, drag the whole folder).
2. Go to **Settings → Pages**. Set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, and Save.
3. After a minute the site is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
4. When you upload new versions later, change `CACHE` in `sw.js` (for example `planner-v3`) so installed phones pick up the update.

## Run locally

Open `index.html` in a browser. Offline/install features need a web server, for example `python -m http.server`, then open `http://localhost:8000`.

Test the Apps Script without a Google account: `node --test automation/test`.

## Roadmap

- Focus mode: one Do task at a time with a 25-minute timer
- Class view for lecturers: an anonymous summary of how a class spends its week
- Reminders for Schedule dates

## Credits

Built by Ahmad Hafizi Bin Ahmad Giran, Kolej Poly-Tech MARA Kuantan.

## License

MIT. See [LICENSE](LICENSE). Fonts: Bricolage Grotesque and Plus Jakarta Sans, SIL Open Font License.
