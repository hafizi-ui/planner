# Eisenhower Planner

A simple task planner based on the Eisenhower Matrix. Every task goes into one of four boxes:

| | Urgent | Not urgent |
|---|---|---|
| **Important** | **Do** – finish first | **Schedule** – give it a date |
| **Not important** | **Delegate** – name who handles it | **Delete** – let it go |

Built with plain HTML, CSS and vanilla JavaScript. No frameworks, no build step.

## Features
- Add a task and answer two questions (urgent? important?) to place it
- Drag tasks between boxes, or use the "Move" menu (works on phones)
- Dates for scheduled tasks (overdue dates turn red), names for delegated tasks
- Double-click a task to edit it; undo after deleting
- Progress bar, light/dark theme, export/import tasks as JSON
- Press `/` to jump to the task box
- Tasks are saved in the browser (localStorage)

## Files
```
index.html
css/style.css
js/app.js
```

## Publish on GitHub Pages
1. Create a new public repository on GitHub, for example `eisenhower-planner`.
2. Upload all files, keeping the `css` and `js` folders (Add file → Upload files, then drag the whole folder contents in).
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main** and folder to **/ (root)**, then Save.
5. After a minute your site is live at `https://YOUR-USERNAME.github.io/eisenhower-planner/`.

## Run locally
Just open `index.html` in your browser.
