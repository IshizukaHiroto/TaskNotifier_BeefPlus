// === popup.js ===

class PopupTabs {
  constructor(doc) {
    this.doc = doc;
  }

  init() {
    const tabButtons = this.doc.querySelectorAll(".tab-btn");
    const tabContents = this.doc.querySelectorAll(".tab-content");

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetTab = btn.dataset.tab;

        tabButtons.forEach((b) => b.classList.remove("active"));
        tabContents.forEach((c) => c.classList.remove("active"));

        btn.classList.add("active");
        this.doc.getElementById(`tab-${targetTab}`).classList.add("active");
      });
    });
  }
}

class TaskListController {
  constructor(storage, doc) {
    this.storage = storage;
    this.doc = doc;
  }

  init() {
    this.load();
  }

  formatRemainingTime(dueISO) {
    const now = new Date();
    const due = new Date(dueISO);
    const diffMs = due - now;

    if (diffMs <= 0) return "締切済み";

    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    const remainingMinutes = diffMinutes % 60;

    if (diffDays >= 2) {
      return `あと${diffDays}日`;
    }

    if (diffDays === 1) {
      if (remainingHours > 0) {
        return `あと1日と${remainingHours}時間`;
      }
      return "あと1日";
    }

    if (diffHours >= 1) {
      if (remainingMinutes > 0 && diffHours < 12) {
        return `あと${diffHours}時間${remainingMinutes}分`;
      }
      return `あと${diffHours}時間`;
    }

    const minutesToShow = Math.max(1, diffMinutes);
    return `あと${minutesToShow}分`;
  }

  getUrgencyClass(dueISO) {
    const now = new Date();
    const due = new Date(dueISO);
    const diffMs = due - now;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffMs <= 0) return "expired";
    if (diffHours <= 3) return "urgent";
    if (diffHours <= 24) return "warning";
    if (diffHours <= 48) return "soon";
    return "normal";
  }

  renderNoPending(container, message) {
    container.innerHTML = `
        <div class="empty-state">
          <p>${message}</p>
          <p class="empty-hint">Everything is up to date.</p>
        </div>
      `;
  }

  renderEmpty(container) {
    container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📂</span>
          <p>No tasks found</p>
          <p class="empty-hint">Open BEEF+ to sync assignments.</p>
        </div>
      `;
  }

  renderTasks(container, tasks) {
    container.innerHTML = "";
    for (const task of tasks) {
      const card = this.doc.createElement("div");
      const urgency = this.getUrgencyClass(task.due);
      card.className = `task-card ${urgency}`;
      card.innerHTML = `
          <div class="task-header">
            <div class="task-title">${task.title}</div>
            <span class="remaining ${urgency}">${this.formatRemainingTime(task.due)}</span>
          </div>
          <div class="task-meta">
            <span class="course-tag">${task.course}</span>
            <span class="content-tag">${task.contentType}</span>
          </div>
          <div class="task-due">
            <span class="due-label">Due: ${new Date(task.due).toLocaleString("ja-JP", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}</span>
          </div>
        `;
      card.addEventListener("click", () => chrome.tabs.create({ url: task.url }));
      container.appendChild(card);
    }
  }

  renderUpdated(updatedEl, lastUpdated) {
    if (lastUpdated) {
      const date = new Date(lastUpdated);
      updatedEl.textContent = `Last sync: ${date.toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else {
      updatedEl.textContent = "Last sync: no data";
    }
  }

  wireBeefLink() {
    const beefLink = this.doc.querySelector(".beef-link-btn");
    if (!beefLink) return;
    beefLink.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.tabs.create({ url: beefLink.href });
    });
  }

  load() {
    this.storage.get(["tasks", "lastUpdated", "noPending", "noPendingMessage"], (data) => {
      const container = this.doc.getElementById("taskList");
      const updated = this.doc.getElementById("lastUpdated");
      const tasks = (data.tasks || []).sort(
        (a, b) => new Date(a.due) - new Date(b.due)
      );
      const noPending = Boolean(data.noPending);
      const noPendingMessage = data.noPendingMessage || "No pending tasks.";

      if (tasks.length === 0 && noPending) {
        this.renderNoPending(container, noPendingMessage);
      } else if (tasks.length === 0) {
        this.renderEmpty(container);
      } else {
        this.renderTasks(container, tasks);
      }

      this.renderUpdated(updated, data.lastUpdated);
      this.wireBeefLink();
    });
  }
}

class AutoLoginController {
  constructor(storage, doc) {
    this.storage = storage;
    this.doc = doc;
    this.storageKey = "beefplusAutoLoginCredentials";
    this.storedCredentials = null;

    this.form = null;
    this.usernameInput = null;
    this.passwordInput = null;
    this.actionButton = null;
    this.clearButton = null;
    this.statusArea = null;
  }

  init() {
    this.form = this.doc.getElementById("credentials-form");
    this.usernameInput = this.doc.getElementById("username");
    this.passwordInput = this.doc.getElementById("password");
    this.actionButton = this.doc.getElementById("action-btn");
    this.clearButton = this.doc.getElementById("clear-btn");
    this.statusArea = this.doc.getElementById("status");

    this.form.addEventListener("submit", (event) => this.saveOrUpdateCredentials(event));
    this.usernameInput.addEventListener("input", () => this.updateActionState());
    this.passwordInput.addEventListener("input", () => this.updateActionState());
    this.clearButton.addEventListener("click", () => this.clearCredentials());

    this.loadCredentials();
  }

  showStatus(message, type = "info") {
    this.statusArea.textContent = message;
    this.statusArea.className = type;
  }

  async persistCredentials(username, password) {
    await this.storage.set({
      [this.storageKey]: { username, password },
    });
  }

  async loadCredentials() {
    try {
      const stored = await this.storage.get(this.storageKey);
      const credentials = stored[this.storageKey];
      if (credentials) {
        this.storedCredentials = credentials;
        this.usernameInput.value = credentials.username || "";
        this.passwordInput.value = credentials.password || "";
        this.showStatus("✓ Saved credentials loaded", "success");
      } else {
        this.showStatus("No saved credentials", "info");
      }
      this.updateActionState();
    } catch (error) {
      this.showStatus("Failed to load credentials", "error");
    }
  }

  updateActionState() {
    const username = this.usernameInput.value.trim();
    const password = this.passwordInput.value;
    const hasInput = Boolean(username && password);
    const hasStored = Boolean(this.storedCredentials);
    const matchesStored =
      hasStored &&
      this.storedCredentials.username === username &&
      this.storedCredentials.password === password;

    if (!hasStored) {
      this.actionButton.textContent = "Save";
      this.actionButton.disabled = !hasInput;
      return;
    }

    if (matchesStored) {
      this.actionButton.textContent = "Saved";
      this.actionButton.disabled = true;
      return;
    }

    this.actionButton.textContent = "Update";
    this.actionButton.disabled = !hasInput;
  }

  async saveOrUpdateCredentials(event) {
    event.preventDefault();

    const username = this.usernameInput.value.trim();
    const password = this.passwordInput.value;
    const hasInput = Boolean(username && password);

    if (!hasInput) {
      this.showStatus("Enter student ID and password", "error");
      return;
    }

    try {
      await this.persistCredentials(username, password);
      this.storedCredentials = { username, password };
      const message =
        this.actionButton.textContent === "Update"
          ? "✓ Credentials updated"
          : "✓ Credentials saved";
      this.showStatus(message, "success");
      this.updateActionState();
    } catch (error) {
      this.showStatus("Failed to save credentials", "error");
    }
  }

  async clearCredentials() {
    try {
      await this.storage.remove(this.storageKey);
      this.usernameInput.value = "";
      this.passwordInput.value = "";
      this.storedCredentials = null;
      this.showStatus("Credentials removed", "info");
      this.updateActionState();
    } catch (error) {
      this.showStatus("Failed to remove credentials", "error");
    }
  }
}

class PopupApp {
  constructor(doc, storage) {
    this.doc = doc;
    this.storage = storage;
    this.tabs = new PopupTabs(doc);
    this.taskList = new TaskListController(storage, doc);
    this.autoLogin = new AutoLoginController(storage, doc);
  }

  init() {
    this.tabs.init();
    this.taskList.init();
    this.autoLogin.init();
  }
}

this.document.addEventListener("DOMContentLoaded", () => {
  const app = new PopupApp(document, chrome.storage.local);
  app.init();
});
