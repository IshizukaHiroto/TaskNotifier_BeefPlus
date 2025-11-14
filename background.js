// === background.js ===
// 保存された課題を監視して期限前に通知

// 通知を作成（残り時間を可変で表示できるよう拡張）
function createNotification(task, remainingHours = null) {
  // [BEEF+] 変更: 残り時間を受け取り通知タイトルに反映
  const title = remainingHours === null
    ? `締切間近：${task.title}`
    : `${task.title}の締切まであと${remainingHours}時間です!!`;

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title,
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

  // [BEEF+] 追加: すでに締切を過ぎた課題は通知対象から除外
  if (dueTime <= now) {
    console.log(`[BEEF+] 締切済みのため通知スキップ: ${task.title}`);
    return;
  }

  // [BEEF+] 追加: 締切が間近（1分以内）の場合は即通知
  const immediateThresholdMs = 60 * 1000;
  if (dueTime - now <= immediateThresholdMs) {
    console.log(`[BEEF+] 即時通知: ${task.title}`);
    createNotification(task, 0);
    return;
  }

  let scheduled = false;
  for (const { hours, label } of offsets) {
    const when = dueTime - hours * 60 * 60 * 1000;
    if (when > now) {
      const alarmName = `notify-${btoa(task.url)}-${hours}`;
      chrome.alarms.create(alarmName, { when });
      console.log(`[BEEF+] 通知予約: ${task.title} (${label})`);
      scheduled = true;
    }
  }

  // [BEEF+] 追加: 過去のオフセットしか無い場合のログ
  if (!scheduled) {
    console.log(`[BEEF+] 通知予約対象外（残り時間が1時間未満）: ${task.title}`);
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
      // [BEEF+] 変更: アラーム設定時の残り時間を通知生成に渡す
      createNotification(task, Number(hours));
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
