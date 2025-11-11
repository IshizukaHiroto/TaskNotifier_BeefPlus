// === background.js ===
// 保存された課題を監視して期限前に通知

// 通知を作成
function createNotification(task) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: `締切間近：${task.title}`,
    message: `${task.course} (${task.contentType})\n締切：${new Date(task.due).toLocaleString()}`,
    priority: 2
  });
}

// 通知スケジュールを登録
function scheduleNotifications(task) {
  const dueTime = new Date(task.due).getTime();
  const now = Date.now();
  const offsets = [
    { hours: 24, label: "24時間前" },
    { hours: 12, label: "12時間前" },
    { hours: 3, label: "3時間前" },
    { hours: 1, label: "1時間前" }
  ];

  // テスト用途（締切が近い場合は即通知）
  if (dueTime - now < 60 * 1000) {
    console.log(`[BEEF+] 即時通知テスト: ${task.title}`);
    createNotification(task);
    return;
  }

  for (const { hours, label } of offsets) {
    const when = dueTime - hours * 60 * 60 * 1000;
    if (when > now) {
      const alarmName = `notify-${btoa(task.url)}-${hours}`;
      chrome.alarms.create(alarmName, { when });
      console.log(`[BEEF+] 通知予約: ${task.title} (${label})`);
    }
  }
}

// アラームが発火したとき
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith("notify-")) return;
  const matches = alarm.name.match(/^notify-(.*)-(\d+)$/);
  if (!matches) return;
  const [_, encodedUrl, hours] = matches;
  const url = atob(encodedUrl);

  chrome.storage.local.get("tasks", (data) => {
    const task = (data.tasks || []).find(t => t.url === url);
    if (task) {
      console.log(`[BEEF+] 通知発火: ${task.title} (${hours}時間前)`);
      createNotification(task);
    }
  });
});

// ストレージ変更時に通知を再スケジュール
chrome.storage.onChanged.addListener((changes) => {
  if (changes.tasks?.newValue) {
    const tasks = changes.tasks.newValue;
    chrome.alarms.clearAll(() => {
      tasks.forEach(scheduleNotifications);
    });
  }
});

// 初回起動時とインストール時にも再スケジュール
["onStartup", "onInstalled"].forEach(evt => {
  chrome.runtime[evt].addListener(() => {
    chrome.storage.local.get("tasks", (data) => {
      (data.tasks || []).forEach(scheduleNotifications);
    });
  });
});

// 🔧 popupやテストコードから直接呼べるように（テスト用）
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "scheduleNow") {
    chrome.storage.local.get("tasks", (data) => {
      (data.tasks || []).forEach(scheduleNotifications);
    });
    console.log("[BEEF+] 手動スケジュールを再設定しました。");
  }
});
