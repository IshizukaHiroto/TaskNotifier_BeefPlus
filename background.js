// === background.js ===
// 保存された課題を監視して期限前に通知

class NotificationScheduler {
  constructor(storageArea, storageEvents, alarms, notifications, runtime) {
    this.storageArea = storageArea;
    this.storageEvents = storageEvents;
    this.alarms = alarms;
    this.notifications = notifications;
    this.runtime = runtime;

    this.offsets = [
      { hours: 24, label: "24時間前" },
      { hours: 12, label: "12時間前" },
      { hours: 3, label: "3時間前" },
      { hours: 1, label: "1時間前" },
    ];
  }

  createNotification(task, remainingHours = null) {
    const title =
      remainingHours === null
        ? `締切間近：${task.title}`
        : `${task.title}の締切まであと${remainingHours}時間です!!`;

    this.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title,
      message: `${task.course} (${task.contentType})\n締切：${new Date(
        task.due
      ).toLocaleString()}`,
      priority: 2,
    });
  }

  scheduleForTask(task) {
    const dueTime = new Date(task.due).getTime();
    const now = Date.now();

    if (dueTime <= now) {
      console.log(`[BEEF+] 締切済みのため通知スキップ: ${task.title}`);
      return;
    }

    const immediateThresholdMs = 60 * 1000;
    if (dueTime - now <= immediateThresholdMs) {
      console.log(`[BEEF+] 即時通知: ${task.title}`);
      this.createNotification(task, 0);
      return;
    }

    let scheduled = false;
    for (const { hours, label } of this.offsets) {
      const when = dueTime - hours * 60 * 60 * 1000;
      if (when > now) {
        const alarmName = `notify-${btoa(task.url)}-${hours}`;
        this.alarms.create(alarmName, { when });
        console.log(`[BEEF+] 通知予約: ${task.title} (${label})`);
        scheduled = true;
      }
    }

    if (!scheduled) {
      console.log(`[BEEF+] 通知予約対象外（残り時間が1時間未満）: ${task.title}`);
    }
  }

  handleAlarm(alarm) {
    if (!alarm.name.startsWith("notify-")) return;
    const matches = alarm.name.match(/^notify-(.*)-(\d+)$/);
    if (!matches) return;
    const [, encodedUrl, hours] = matches;
    const url = atob(encodedUrl);

    this.storageArea.get("tasks", (data) => {
      const task = (data.tasks || []).find((t) => t.url === url);
      if (task) {
        console.log(`[BEEF+] 通知発火: ${task.title} (${hours}時間前)`);
        this.createNotification(task, Number(hours));
      }
    });
  }

  rescheduleFromStorage() {
    this.storageArea.get("tasks", (data) => {
      (data.tasks || []).forEach((task) => this.scheduleForTask(task));
    });
  }

  handleStorageChange(changes) {
    if (!changes.tasks?.newValue) return;
    const tasks = changes.tasks.newValue;
    this.alarms.clearAll(() => {
      tasks.forEach((task) => this.scheduleForTask(task));
    });
  }

  registerListeners() {
    this.alarms.onAlarm.addListener((alarm) => this.handleAlarm(alarm));
    this.storageEvents.onChanged.addListener((changes) => this.handleStorageChange(changes));

    ["onStartup", "onInstalled"].forEach((evt) => {
      this.runtime[evt].addListener(() => {
        this.rescheduleFromStorage();
      });
    });
  }
}

(() => {
  const scheduler = new NotificationScheduler(
    chrome.storage.local,
    chrome.storage,
    chrome.alarms,
    chrome.notifications,
    chrome.runtime
  );
  scheduler.registerListeners();
})();
