const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { URL } = require("url");

const port = process.env.PORT || 3000;
const appName = process.env.APP_NAME || "Sample Node App";
const appMessage = process.env.APP_MESSAGE || "Running on private AKS";
const dataPath = process.env.STORAGE_PATH || "/app/data";
const visitsFile = path.join(dataPath, "visits.txt");
const notesFile = path.join(dataPath, "notes.json");

let storageStatus = "Storage initializing";

function setStorageWarning(error) {
  storageStatus = `Storage warning: ${error.message}`;
  return storageStatus;
}

function markStorageReady() {
  storageStatus = "Storage ready";
  return storageStatus;
}

function ensureStorage() {
  try {
    fs.mkdirSync(dataPath, { recursive: true });

    if (!fs.existsSync(visitsFile)) {
      fs.writeFileSync(visitsFile, "0");
    }

    if (!fs.existsSync(notesFile)) {
      fs.writeFileSync(notesFile, "[]");
    }

    return markStorageReady();
  } catch (error) {
    return setStorageWarning(error);
  }
}

function readVisitCount() {
  try {
    const raw = fs.readFileSync(visitsFile, "utf8").trim();
    markStorageReady();
    return Number(raw) || 0;
  } catch (error) {
    setStorageWarning(error);
    return null;
  }
}

function writeVisitCount(count) {
  try {
    fs.writeFileSync(visitsFile, String(count));
    markStorageReady();
    return true;
  } catch (error) {
    setStorageWarning(error);
    return false;
  }
}

function recordPageVisit() {
  const current = readVisitCount();

  if (current === null) {
    return "unavailable";
  }

  const next = current + 1;
  return writeVisitCount(next) ? next : "unavailable";
}

function incrementVisitCount() {
  const current = readVisitCount();

  if (current === null) {
    return "unavailable";
  }

  const next = current + 1;
  return writeVisitCount(next) ? next : "unavailable";
}

function resetVisitCount() {
  return writeVisitCount(0) ? 0 : "unavailable";
}

function readNotes() {
  try {
    const raw = fs.readFileSync(notesFile, "utf8").trim();
    const parsed = JSON.parse(raw || "[]");

    if (!Array.isArray(parsed)) {
      throw new Error("notes storage is not an array");
    }

    markStorageReady();
    return parsed;
  } catch (error) {
    setStorageWarning(error);
    return [];
  }
}

function writeNotes(notes) {
  try {
    fs.writeFileSync(notesFile, JSON.stringify(notes, null, 2));
    markStorageReady();
    return true;
  } catch (error) {
    setStorageWarning(error);
    return false;
  }
}

function addNote(message) {
  const trimmed = message.trim();

  if (!trimmed) {
    return { error: "Message cannot be empty." };
  }

  if (trimmed.length > 160) {
    return { error: "Message should be 160 characters or less." };
  }

  const note = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    message: trimmed,
    hostname: os.hostname(),
    createdAt: new Date().toISOString()
  };

  const notes = readNotes();
  const nextNotes = [note, ...notes].slice(0, 8);

  if (!writeNotes(nextNotes)) {
    return { error: "Failed to save note." };
  }

  return { note };
}

function getVisitCountDisplay() {
  const visitCount = readVisitCount();
  return visitCount === null ? "unavailable" : visitCount;
}

function buildDashboardData(visitCountOverride) {
  const notes = readNotes();

  return {
    appName,
    appMessage,
    environment: "Private AKS",
    hostname: os.hostname(),
    visitCount:
      visitCountOverride !== undefined ? visitCountOverride : getVisitCountDisplay(),
    storageStatus,
    storagePath: dataPath,
    healthPath: "/health",
    healthStatus: "Healthy",
    noteCount: notes.length,
    notes,
    updatedAt: new Date().toISOString()
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, html) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(html);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function renderNotesMarkup(notes) {
  if (!notes.length) {
    return '<li class="empty-state">No notes yet. Add one to test persistent storage.</li>';
  }

  return notes
    .map(
      (note) => `
        <li class="note-item">
          <div class="note-copy">${escapeHtml(note.message)}</div>
          <div class="note-meta">
            <span>${escapeHtml(note.hostname)}</span>
            <span>${escapeHtml(note.createdAt)}</span>
          </div>
        </li>
      `
    )
    .join("");
}

function renderPage(initialData) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(initialData.appName)}</title>
        <style>
          :root {
            color-scheme: light;
            --surface: rgba(255, 252, 247, 0.86);
            --border: rgba(12, 77, 81, 0.12);
            --ink: #1f2933;
            --muted: #5f6c76;
            --teal: #0f766e;
            --teal-deep: #0c4d51;
            --rose: #b4534f;
            --shadow: 0 22px 50px rgba(20, 35, 47, 0.12);
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            font-family: "Aptos", "Segoe UI", sans-serif;
            color: var(--ink);
            background:
              radial-gradient(circle at top left, rgba(255, 214, 179, 0.72), transparent 28%),
              radial-gradient(circle at 85% 10%, rgba(15, 118, 110, 0.18), transparent 25%),
              linear-gradient(180deg, #f8f4ed 0%, #eef5f4 100%);
          }

          .shell {
            width: min(1180px, calc(100% - 32px));
            margin: 0 auto;
            padding: 36px 0 52px;
          }

          .hero,
          .card {
            backdrop-filter: blur(16px);
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 28px;
            box-shadow: var(--shadow);
          }

          .hero {
            padding: 32px;
            display: grid;
            grid-template-columns: 1.8fr 1fr;
            gap: 20px;
            align-items: center;
          }

          .eyebrow {
            margin: 0 0 12px;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            font-size: 0.78rem;
            color: var(--teal-deep);
            font-weight: 700;
          }

          h1 {
            margin: 0;
            font-family: Georgia, "Times New Roman", serif;
            font-size: clamp(2.5rem, 5vw, 4.4rem);
            line-height: 0.95;
            color: var(--teal-deep);
          }

          .hero-copy p {
            margin: 18px 0 0;
            max-width: 60ch;
            font-size: 1.05rem;
            color: var(--muted);
          }

          .hero-panel {
            padding: 22px;
            border-radius: 24px;
            background: linear-gradient(135deg, rgba(15, 118, 110, 0.12), rgba(255, 255, 255, 0.8));
            border: 1px solid rgba(15, 118, 110, 0.12);
          }

          .status-row,
          .hero-highlights,
          .action-row,
          .section-title {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            align-items: center;
          }

          .status-row {
            margin-bottom: 18px;
          }

          .pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 9px 14px;
            border-radius: 999px;
            font-size: 0.92rem;
            font-weight: 700;
            border: 1px solid transparent;
          }

          .pill.ok {
            background: rgba(15, 118, 110, 0.14);
            color: var(--teal-deep);
            border-color: rgba(15, 118, 110, 0.18);
          }

          .pill.warn {
            background: rgba(183, 121, 31, 0.14);
            color: #8c5a11;
          }

          .pill.info {
            background: rgba(12, 77, 81, 0.09);
            color: var(--teal-deep);
            border-color: rgba(12, 77, 81, 0.15);
          }

          .metrics-grid,
          .content-grid {
            display: grid;
            gap: 20px;
            margin-top: 22px;
          }

          .metrics-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .content-grid {
            grid-template-columns: 1.15fr 0.85fr;
          }

          .card {
            padding: 24px;
          }

          .metric {
            overflow: hidden;
            position: relative;
          }

          .metric::after {
            content: "";
            position: absolute;
            inset: auto -24px -24px auto;
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(15, 118, 110, 0.14), transparent 70%);
          }

          .metric-label {
            color: var(--muted);
            font-size: 0.92rem;
            display: block;
          }

          .metric-value {
            display: block;
            margin-top: 12px;
            font-size: clamp(1.9rem, 4vw, 2.7rem);
            line-height: 1;
            color: var(--teal-deep);
          }

          .metric-note {
            margin-top: 10px;
            color: var(--muted);
            font-size: 0.92rem;
          }

          button,
          textarea {
            font: inherit;
          }

          .action-row {
            margin-top: 18px;
          }

          .button {
            border: 0;
            border-radius: 16px;
            padding: 12px 18px;
            font-weight: 700;
            cursor: pointer;
          }

          .button.primary {
            background: linear-gradient(135deg, var(--teal-deep), var(--teal));
            color: #fff;
          }

          .button.secondary {
            background: #fff;
            color: var(--teal-deep);
            border: 1px solid rgba(12, 77, 81, 0.14);
          }

          .button.ghost {
            background: rgba(180, 83, 79, 0.1);
            color: var(--rose);
          }

          .section-title {
            justify-content: space-between;
            margin-bottom: 18px;
          }

          .section-title h2,
          .section-title h3 {
            margin: 0;
            font-size: 1.25rem;
            color: var(--teal-deep);
          }

          .section-title p {
            margin: 6px 0 0;
            color: var(--muted);
          }

          .detail-list {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
          }

          .detail-item {
            padding: 16px;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.72);
            border: 1px solid rgba(12, 77, 81, 0.08);
          }

          .detail-item span {
            display: block;
            color: var(--muted);
            font-size: 0.85rem;
            margin-bottom: 8px;
          }

          .detail-item strong,
          .detail-item code {
            color: var(--ink);
            word-break: break-word;
          }

          code {
            padding: 4px 8px;
            border-radius: 12px;
            background: rgba(12, 77, 81, 0.08);
          }

          .feedback {
            min-height: 24px;
            margin-top: 14px;
            color: var(--muted);
            font-size: 0.92rem;
          }

          .feedback.error {
            color: var(--rose);
          }

          .feedback.success {
            color: var(--teal);
          }

          .toggle {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--muted);
            font-size: 0.92rem;
          }

          .toggle input {
            accent-color: var(--teal);
          }

          form {
            display: grid;
            gap: 12px;
          }

          textarea {
            width: 100%;
            min-height: 120px;
            padding: 16px;
            resize: vertical;
            border-radius: 20px;
            border: 1px solid rgba(12, 77, 81, 0.14);
            background: rgba(255, 255, 255, 0.86);
            color: var(--ink);
          }

          .notes-list {
            margin: 20px 0 0;
            padding: 0;
            list-style: none;
            display: grid;
            gap: 12px;
          }

          .note-item,
          .empty-state {
            padding: 16px;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.82);
            border: 1px solid rgba(12, 77, 81, 0.08);
          }

          .note-copy {
            font-size: 0.98rem;
            line-height: 1.5;
          }

          .note-meta {
            margin-top: 10px;
            display: flex;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            color: var(--muted);
            font-size: 0.82rem;
          }

          .flash {
            animation: pulse 420ms ease;
          }

          @keyframes pulse {
            0% { transform: scale(1); }
            45% { transform: scale(1.03); }
            100% { transform: scale(1); }
          }

          @media (max-width: 980px) {
            .hero,
            .content-grid,
            .metrics-grid {
              grid-template-columns: 1fr;
            }

            .detail-list {
              grid-template-columns: 1fr;
            }
          }

          @media (max-width: 640px) {
            .shell {
              width: min(100% - 20px, 100%);
              padding-top: 18px;
              padding-bottom: 28px;
            }

            .hero,
            .card {
              border-radius: 22px;
              padding: 20px;
            }

            h1 {
              font-size: 2.3rem;
            }

            .action-row {
              flex-direction: column;
              align-items: stretch;
            }

            .button {
              width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <main class="shell">
          <section class="hero">
            <div class="hero-copy">
              <p class="eyebrow">Private AKS Dashboard</p>
              <h1 id="app-name">${escapeHtml(initialData.appName)}</h1>
              <p id="app-message">${escapeHtml(initialData.appMessage)}</p>
            </div>
            <div class="hero-panel">
              <div class="status-row">
                <span class="pill ok" id="health-pill">Healthy</span>
                <span class="pill info" id="storage-pill">${escapeHtml(
                  initialData.storageStatus
                )}</span>
              </div>
              <div class="hero-highlights">
                <span class="pill info" id="environment-pill">${escapeHtml(
                  initialData.environment
                )}</span>
                <span class="pill info" id="autorefresh-pill">Live refresh on</span>
              </div>
              <div class="feedback" id="feedback">
                Dashboard ready. Use simulate traffic or add a note to test persistence.
              </div>
            </div>
          </section>

          <section class="metrics-grid">
            <article class="card metric">
              <span class="metric-label">Visit Count</span>
              <strong class="metric-value" id="visit-count">${escapeHtml(
                initialData.visitCount
              )}</strong>
              <span class="metric-note">Counts page hits and simulated traffic writes.</span>
            </article>
            <article class="card metric">
              <span class="metric-label">Current Pod</span>
              <strong class="metric-value" id="hostname">${escapeHtml(
                initialData.hostname
              )}</strong>
              <span class="metric-note">Useful for showing which pod served the request.</span>
            </article>
            <article class="card metric">
              <span class="metric-label">Saved Notes</span>
              <strong class="metric-value" id="note-count">${escapeHtml(
                initialData.noteCount
              )}</strong>
              <span class="metric-note">Backed by the mounted persistent volume.</span>
            </article>
            <article class="card metric">
              <span class="metric-label">Last Sync</span>
              <strong class="metric-value" id="last-updated">just now</strong>
              <span class="metric-note">Auto-refresh keeps the dashboard current every 5s.</span>
            </article>
          </section>

          <section class="content-grid">
            <article class="card">
              <div class="section-title">
                <div>
                  <h2>Interactive Controls</h2>
                  <p>Trigger backend actions without a full page reload.</p>
                </div>
                <label class="toggle">
                  <input id="auto-refresh-toggle" type="checkbox" checked />
                  Live refresh
                </label>
              </div>

              <div class="action-row">
                <button class="button primary" id="refresh-button" type="button">Refresh data</button>
                <button class="button secondary" id="simulate-button" type="button">Simulate traffic</button>
                <button class="button ghost" id="reset-button" type="button">Reset counter</button>
              </div>

              <div class="section-title" style="margin-top: 28px;">
                <div>
                  <h3>Platform Details</h3>
                  <p>Quick reference for the current pod and mounted storage.</p>
                </div>
              </div>

              <div class="detail-list">
                <div class="detail-item">
                  <span>App Name</span>
                  <strong id="detail-app-name">${escapeHtml(initialData.appName)}</strong>
                </div>
                <div class="detail-item">
                  <span>Health Endpoint</span>
                  <code id="health-path">${escapeHtml(initialData.healthPath)}</code>
                </div>
                <div class="detail-item">
                  <span>Storage Path</span>
                  <code id="storage-path">${escapeHtml(initialData.storagePath)}</code>
                </div>
                <div class="detail-item">
                  <span>Deployment Type</span>
                  <strong id="environment-copy">${escapeHtml(initialData.environment)}</strong>
                </div>
              </div>
            </article>

            <article class="card">
              <div class="section-title">
                <div>
                  <h2>Persistent Notes</h2>
                  <p>Add a short note and verify it survives refreshes.</p>
                </div>
              </div>

              <form id="note-form">
                <textarea
                  id="note-input"
                  maxlength="160"
                  placeholder="Write a quick message to store on the persistent volume..."
                ></textarea>
                <div class="action-row">
                  <button class="button primary" id="save-note-button" type="submit">Save note</button>
                </div>
              </form>

              <ul class="notes-list" id="notes-list">
                ${renderNotesMarkup(initialData.notes)}
              </ul>
            </article>
          </section>
        </main>

        <script>
          const initialData = ${serializeForScript(initialData)};

          const state = {
            dashboard: initialData,
            autoRefresh: true,
            timer: null
          };

          const appNameEl = document.getElementById("app-name");
          const appMessageEl = document.getElementById("app-message");
          const visitCountEl = document.getElementById("visit-count");
          const hostnameEl = document.getElementById("hostname");
          const noteCountEl = document.getElementById("note-count");
          const lastUpdatedEl = document.getElementById("last-updated");
          const storagePillEl = document.getElementById("storage-pill");
          const healthPillEl = document.getElementById("health-pill");
          const feedbackEl = document.getElementById("feedback");
          const notesListEl = document.getElementById("notes-list");
          const autoRefreshToggleEl = document.getElementById("auto-refresh-toggle");
          const autoRefreshPillEl = document.getElementById("autorefresh-pill");
          const noteInputEl = document.getElementById("note-input");
          const refreshButtonEl = document.getElementById("refresh-button");
          const simulateButtonEl = document.getElementById("simulate-button");
          const resetButtonEl = document.getElementById("reset-button");
          const saveNoteButtonEl = document.getElementById("save-note-button");
          const detailAppNameEl = document.getElementById("detail-app-name");
          const healthPathEl = document.getElementById("health-path");
          const storagePathEl = document.getElementById("storage-path");
          const environmentCopyEl = document.getElementById("environment-copy");

          function setFeedback(message, tone) {
            feedbackEl.textContent = message;
            feedbackEl.className = "feedback" + (tone ? " " + tone : "");
          }

          function formatTimestamp(isoValue) {
            const date = new Date(isoValue);
            return Number.isNaN(date.getTime())
              ? "unknown"
              : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          }

          function applyPulse(element) {
            element.classList.remove("flash");
            window.requestAnimationFrame(() => {
              element.classList.add("flash");
            });
          }

          function setPillState(element, text, tone) {
            element.textContent = text;
            element.className = "pill " + tone;
          }

          function renderNotes(notes) {
            notesListEl.innerHTML = "";

            if (!notes.length) {
              const emptyItem = document.createElement("li");
              emptyItem.className = "empty-state";
              emptyItem.textContent = "No notes yet. Add one to test persistent storage.";
              notesListEl.appendChild(emptyItem);
              return;
            }

            notes.forEach((note) => {
              const item = document.createElement("li");
              item.className = "note-item";

              const copy = document.createElement("div");
              copy.className = "note-copy";
              copy.textContent = note.message;

              const meta = document.createElement("div");
              meta.className = "note-meta";

              const host = document.createElement("span");
              host.textContent = note.hostname;

              const time = document.createElement("span");
              time.textContent = formatTimestamp(note.createdAt);

              meta.appendChild(host);
              meta.appendChild(time);

              item.appendChild(copy);
              item.appendChild(meta);
              notesListEl.appendChild(item);
            });
          }

          function renderDashboard(dashboard) {
            state.dashboard = dashboard;

            appNameEl.textContent = dashboard.appName;
            detailAppNameEl.textContent = dashboard.appName;
            appMessageEl.textContent = dashboard.appMessage;
            visitCountEl.textContent = dashboard.visitCount;
            hostnameEl.textContent = dashboard.hostname;
            noteCountEl.textContent = dashboard.noteCount;
            lastUpdatedEl.textContent = formatTimestamp(dashboard.updatedAt);
            storagePathEl.textContent = dashboard.storagePath;
            healthPathEl.textContent = dashboard.healthPath;
            environmentCopyEl.textContent = dashboard.environment;

            setPillState(
              storagePillEl,
              dashboard.storageStatus,
              dashboard.storageStatus.toLowerCase().includes("ready") ? "ok" : "warn"
            );

            setPillState(
              healthPillEl,
              dashboard.healthStatus,
              dashboard.healthStatus.toLowerCase() === "healthy" ? "ok" : "warn"
            );

            renderNotes(dashboard.notes);
            applyPulse(visitCountEl);
            applyPulse(noteCountEl);
          }

          async function requestJson(url, options) {
            const response = await fetch(url, {
              headers: {
                "Content-Type": "application/json"
              },
              ...options
            });

            const payload = await response.json();

            if (!response.ok) {
              throw new Error(payload.error || "Request failed");
            }

            return payload;
          }

          async function refreshDashboard(silent) {
            try {
              const [stats, health] = await Promise.all([
                requestJson("/api/stats"),
                requestJson("/health")
              ]);

              const nextDashboard = {
                ...stats,
                healthStatus: health.status === "ok" ? "Healthy" : "Degraded"
              };

              renderDashboard(nextDashboard);

              if (!silent) {
                setFeedback("Dashboard updated from the cluster.", "success");
              }
            } catch (error) {
              setPillState(healthPillEl, "Health warning", "warn");
              setFeedback(error.message, "error");
            }
          }

          async function simulateTraffic() {
            simulateButtonEl.disabled = true;
            try {
              const payload = await requestJson("/api/visits/increment", { method: "POST" });
              renderDashboard(payload);
              setFeedback("Traffic simulated and visit counter updated.", "success");
            } catch (error) {
              setFeedback(error.message, "error");
            } finally {
              simulateButtonEl.disabled = false;
            }
          }

          async function resetCounter() {
            resetButtonEl.disabled = true;
            try {
              const payload = await requestJson("/api/visits/reset", { method: "POST" });
              renderDashboard(payload);
              setFeedback("Visit counter reset successfully.", "success");
            } catch (error) {
              setFeedback(error.message, "error");
            } finally {
              resetButtonEl.disabled = false;
            }
          }

          async function saveNote(event) {
            event.preventDefault();
            const message = noteInputEl.value.trim();

            if (!message) {
              setFeedback("Please write a note before saving.", "error");
              return;
            }

            saveNoteButtonEl.disabled = true;
            try {
              const payload = await requestJson("/api/notes", {
                method: "POST",
                body: JSON.stringify({ message })
              });

              renderDashboard(payload);
              noteInputEl.value = "";
              setFeedback("Note saved to persistent storage.", "success");
            } catch (error) {
              setFeedback(error.message, "error");
            } finally {
              saveNoteButtonEl.disabled = false;
            }
          }

          function syncAutoRefreshUi() {
            autoRefreshPillEl.textContent = state.autoRefresh ? "Live refresh on" : "Live refresh paused";
            autoRefreshPillEl.className = "pill " + (state.autoRefresh ? "ok" : "info");
          }

          function startAutoRefresh() {
            stopAutoRefresh();
            if (!state.autoRefresh) {
              return;
            }

            state.timer = window.setInterval(() => {
              refreshDashboard(true);
            }, 5000);
          }

          function stopAutoRefresh() {
            if (state.timer) {
              window.clearInterval(state.timer);
              state.timer = null;
            }
          }

          refreshButtonEl.addEventListener("click", () => refreshDashboard(false));
          simulateButtonEl.addEventListener("click", simulateTraffic);
          resetButtonEl.addEventListener("click", resetCounter);
          document.getElementById("note-form").addEventListener("submit", saveNote);

          autoRefreshToggleEl.addEventListener("change", (event) => {
            state.autoRefresh = event.target.checked;
            syncAutoRefreshUi();
            startAutoRefresh();
            setFeedback(
              state.autoRefresh ? "Live refresh enabled." : "Live refresh paused.",
              "success"
            );
          });

          renderDashboard(initialData);
          syncAutoRefreshUi();
          startAutoRefresh();
        </script>
      </body>
    </html>
  `;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 16 * 1024) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

ensureStorage();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      status: "ok",
      app: appName,
      hostname: os.hostname(),
      storageStatus
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/stats") {
    sendJson(response, 200, buildDashboardData());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/visits/increment") {
    const visitCount = incrementVisitCount();
    sendJson(response, 200, buildDashboardData(visitCount));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/visits/reset") {
    const visitCount = resetVisitCount();
    sendJson(response, 200, buildDashboardData(visitCount));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/notes") {
    try {
      const rawBody = await readRequestBody(request);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      const result = addNote(payload.message || "");

      if (result.error) {
        sendJson(response, 400, { error: result.error });
        return;
      }

      sendJson(response, 201, buildDashboardData());
      return;
    } catch (error) {
      sendJson(response, 400, { error: "Invalid request body." });
      return;
    }
  }

  if (request.method === "GET" && url.pathname === "/") {
    const initialData = buildDashboardData(recordPageVisit());
    sendHtml(response, renderPage(initialData));
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, () => {
  console.log(`${appName} listening on port ${port}`);
});
