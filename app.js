/* Eisenhower Planner - vanilla JavaScript, no dependencies */
(function () {
  "use strict";

  var STORAGE_KEY = "eisenhower-planner:v1";
  var THEME_KEY = "eisenhower-planner:theme";

  var QUADRANTS = [
    { id: "do",       title: "Do",       sub: "Urgent and important",         hint: "Finish these first.",              empty: "Nothing urgent and important. Well done." },
    { id: "schedule", title: "Schedule", sub: "Important, not urgent",        hint: "Give each one a date.",            empty: "Add what moves you forward: study, health, planning." },
    { id: "delegate", title: "Delegate", sub: "Urgent, not important",        hint: "Write who will handle it.",        empty: "Nothing to hand over yet." },
    { id: "delete",   title: "Delete",   sub: "Neither urgent nor important", hint: "Let these go on purpose.",         empty: "Nothing to drop." }
  ];
  var BY_ID = {};
  QUADRANTS.forEach(function (q) { BY_ID[q.id] = q; });

  var ICONS = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>'
  };

  /* ---------- State ---------- */
  var tasks = load();
  var lastRemoved = null;
  var toastTimer = null;

  function load() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(data) ? data.filter(isValidTask) : [];
    } catch (e) {
      return [];
    }
  }
  function isValidTask(t) {
    return t && typeof t.id === "string" && typeof t.text === "string" && BY_ID[t.q];
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (e) { /* storage full or blocked */ }
  }
  function commit() { save(); render(); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function find(id) { return tasks.find(function (t) { return t.id === id; }); }
  function quadrantFor(urgent, important) {
    if (urgent && important) return "do";
    if (important) return "schedule";
    if (urgent) return "delegate";
    return "delete";
  }
  function todayISO() {
    var d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  /* ---------- Elements ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var matrix = $("matrix");
  var form = $("composer");
  var input = $("taskInput");

  /* ---------- Small DOM helper ---------- */
  function h(tag, props, children) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "text") el.textContent = v;
        else if (k === "html") el.innerHTML = v;
        else if (k === "class") el.className = v;
        else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), v);
        else if (k in el && typeof v !== "string") el[k] = v;
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  /* ---------- Rendering ---------- */
  function render() {
    matrix.querySelectorAll(".quad").forEach(function (n) { n.remove(); });
    QUADRANTS.forEach(function (q) { matrix.appendChild(renderQuadrant(q)); });
    renderProgress();
  }

  function renderQuadrant(q) {
    var items = tasks.filter(function (t) { return t.q === q.id; });
    items.sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (q.id === "schedule") return (a.date || "9999") < (b.date || "9999") ? -1 : 1;
      return a.created - b.created;
    });

    var list = h("ul", { class: "task-list" });
    items.forEach(function (t) { list.appendChild(renderTask(t, q)); });

    var body = items.length ? list : h("div", { class: "empty", text: q.empty });

    var doneHere = items.filter(function (t) { return t.done; }).length;
    var footAction = null;
    if (q.id === "delete" && items.length) {
      footAction = h("button", { class: "link-btn", type: "button", text: "Delete all", onclick: function () {
        removeWhere(function (t) { return t.q === "delete"; }, items.length + " tasks deleted");
      }});
    } else if (doneHere) {
      footAction = h("button", { class: "link-btn", type: "button", text: "Clear " + doneHere + " done", onclick: function () {
        removeWhere(function (t) { return t.q === q.id && t.done; }, doneHere + " tasks cleared");
      }});
    }

    var section = h("section", { class: "quad", "data-q": q.id, "aria-label": q.title + ", " + q.sub }, [
      h("div", { class: "quad-head" }, [
        h("div", null, [
          h("h2", { class: "quad-title", text: q.title }),
          h("p", { class: "quad-sub", text: q.sub })
        ]),
        h("span", { class: "quad-count", text: String(items.length), "aria-label": items.length + " tasks" })
      ]),
      body,
      h("div", { class: "quad-foot" }, [ h("p", { class: "quad-hint", text: q.hint }), footAction ])
    ]);

    section.addEventListener("dragover", function (e) { e.preventDefault(); section.classList.add("drag-over"); });
    section.addEventListener("dragleave", function (e) {
      if (!section.contains(e.relatedTarget)) section.classList.remove("drag-over");
    });
    section.addEventListener("drop", function (e) {
      e.preventDefault();
      section.classList.remove("drag-over");
      var t = find(e.dataTransfer.getData("text/plain"));
      if (t && t.q !== q.id) { t.q = q.id; commit(); }
    });
    return section;
  }

  function renderTask(t, q) {
    var li = h("li", { class: "task" + (t.done ? " done" : ""), draggable: "true", "data-id": t.id });
    li.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", t.id);
      e.dataTransfer.effectAllowed = "move";
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", function () { li.classList.remove("dragging"); });

    var check = h("input", {
      type: "checkbox", class: "check", checked: !!t.done, "aria-label": "Mark as done: " + t.text,
      onchange: function () { t.done = check.checked; commit(); }
    });

    var text = h("p", { class: "task-text", text: t.text, title: "Double-click to edit" });
    text.addEventListener("dblclick", function () { startEdit(t, text); });

    var body = h("div", { class: "task-body" }, [text]);

    if (q.id === "schedule" || q.id === "delegate") {
      var isDate = q.id === "schedule";
      var val = isDate ? (t.date || "") : (t.who || "");
      var chip = h("input", {
        class: "chip-input" + (isDate && val && val < todayISO() && !t.done ? " overdue" : ""),
        type: isDate ? "date" : "text",
        value: val,
        placeholder: isDate ? "" : "Who handles it?",
        "aria-label": isDate ? "Scheduled date" : "Delegated to",
        maxlength: "60"
      });
      chip.addEventListener("change", function () {
        if (isDate) t.date = chip.value; else t.who = chip.value.trim();
        save();
        if (isDate) render();
      });
      body.appendChild(h("div", { class: "task-meta" }, [chip]));
    }

    var move = h("select", { class: "move-select", "aria-label": "Move to" },
      QUADRANTS.map(function (o) {
        return h("option", { value: o.id, text: o.id === q.id ? "Move\u2026" : o.title, selected: o.id === q.id });
      })
    );
    move.addEventListener("change", function () { t.q = move.value; commit(); });

    var actions = h("div", { class: "task-actions" }, [
      move,
      h("button", { class: "tiny-btn", type: "button", "aria-label": "Edit task", html: ICONS.edit,
        onclick: function () { startEdit(t, text); } }),
      h("button", { class: "tiny-btn", type: "button", "aria-label": "Delete task", html: ICONS.trash,
        onclick: function () { removeWhere(function (x) { return x.id === t.id; }, "Task deleted"); } })
    ]);

    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(actions);
    return li;
  }

  function startEdit(t, textEl) {
    var field = h("input", { class: "task-edit", type: "text", value: t.text, maxlength: "200", "aria-label": "Edit task" });
    var finished = false;
    function finish(keep) {
      if (finished) return;
      finished = true;
      var v = field.value.trim();
      if (keep && v) t.text = v;
      commit();
    }
    field.addEventListener("keydown", function (e) {
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    field.addEventListener("blur", function () { finish(true); });
    textEl.replaceWith(field);
    field.focus();
    field.select();
  }

  function renderProgress() {
    var total = tasks.length;
    var done = tasks.filter(function (t) { return t.done; }).length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    $("doneCount").textContent = done;
    $("totalCount").textContent = total;
    $("barFill").style.width = pct + "%";
    $("bar").setAttribute("aria-valuenow", pct);
    $("clearDone").disabled = done === 0;
  }

  function renderDestination() {
    var q = BY_ID[currentQuadrant()];
    var dest = $("destination");
    dest.textContent = "";
    dest.appendChild(document.createTextNode("Goes to"));
    var pill = h("span", { class: "pill", text: q.title });
    pill.style.setProperty("--q", "var(--" + q.id + ")");
    pill.style.setProperty("--q-tint", "var(--" + q.id + "-tint)");
    dest.appendChild(pill);
  }

  function currentQuadrant() {
    var urgent = form.querySelector('input[name="urgent"]:checked').value === "1";
    var important = form.querySelector('input[name="important"]:checked').value === "1";
    return quadrantFor(urgent, important);
  }

  /* ---------- Actions ---------- */
  function removeWhere(predicate, message) {
    var removed = [];
    tasks = tasks.filter(function (t) {
      if (predicate(t)) { removed.push(t); return false; }
      return true;
    });
    if (!removed.length) return;
    lastRemoved = removed;
    commit();
    showToast(message);
  }

  function showToast(message) {
    $("toastText").textContent = message;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $("toast").hidden = true; lastRemoved = null; }, 5000);
  }

  $("toastUndo").addEventListener("click", function () {
    if (lastRemoved) {
      tasks = tasks.concat(lastRemoved);
      lastRemoved = null;
      commit();
    }
    $("toast").hidden = true;
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    tasks.push({ id: uid(), text: text, q: currentQuadrant(), done: false, created: Date.now() });
    input.value = "";
    commit();
    input.focus();
  });
  form.addEventListener("change", renderDestination);

  $("clearDone").addEventListener("click", function () {
    removeWhere(function (t) { return t.done; }, "Completed tasks cleared");
  });

  /* Export / import */
  $("exportBtn").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
    var a = h("a", { href: URL.createObjectURL(blob), download: "eisenhower-tasks-" + todayISO() + ".json" });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  });

  $("importFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error("bad file");
        var clean = data.filter(isValidTask);
        var existing = {};
        tasks.forEach(function (t) { existing[t.id] = true; });
        clean.forEach(function (t) { if (!existing[t.id]) tasks.push(t); });
        commit();
        showToast(clean.length + " tasks imported");
        lastRemoved = null;
      } catch (err) {
        showToast("That file is not a planner export");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  /* Theme */
  function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
  if (savedTheme) applyTheme(savedTheme);
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) applyTheme("dark");

  $("themeBtn").addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });

  /* Keyboard shortcut: press "/" to jump to the task box */
  document.addEventListener("keydown", function (e) {
    var tag = (document.activeElement && document.activeElement.tagName) || "";
    if (e.key === "/" && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") {
      e.preventDefault();
      input.focus();
    }
  });

  /* Date line */
  $("today").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  renderDestination();
  render();
})();
