// ログインページで資格情報を自動入力し、送信まで行うコンテンツスクリプト。
// ユーザーが保存した学籍番号・パスワードをchrome.storage.localから読み出す。

class AutoLoginRunner {
  constructor(doc, storage, session, loc) {
    this.doc = doc;
    this.storage = storage;
    this.session = session;
    this.loc = loc;

    this.storageKey = "beefplusAutoLoginCredentials";
    this.startHost = "beefplus.center.kobe-u.ac.jp";
    this.startPath = "/login";
    this.attemptKey = "beefplusAutoLoginAttemptCount";
    this.maxAttempts = 3;

    this.retryIntervalMs = 250;
    this.waitTimeoutMs = 8000;
    this.selectors = {
      signInLink: 'a.login-btn.btn-color.btn-txt[href="/saml/login?disco=true"]',
      username: "#username",
      password: "#password",
      submit: "#kc-login",
    };
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async loadCredentials() {
    try {
      const stored = await this.storage.get(this.storageKey);
      const credentials = stored[this.storageKey];
      if (!credentials || !credentials.username || !credentials.password) {
        return null;
      }
      return credentials;
    } catch (error) {
      console.error("資格情報の読み込みに失敗しました", error);
      return null;
    }
  }

  async waitForElement(selector, timeoutMs = this.waitTimeoutMs) {
    const start = Date.now();
    let element = this.doc.querySelector(selector);
    while (!element && Date.now() - start < timeoutMs) {
      await this.sleep(this.retryIntervalMs);
      element = this.doc.querySelector(selector);
    }
    return element;
  }

  async clickSignInLink() {
    const link = await this.waitForElement(this.selectors.signInLink, 4000);
    if (!link) {
      return false;
    }
    if (link.dataset.beefplusAutoLoginClicked === "true") {
      return true;
    }
    link.dataset.beefplusAutoLoginClicked = "true";
    link.click();
    return true;
  }

  async fillAndSubmitLogin(credentials) {
    const usernameField = await this.waitForElement(this.selectors.username);
    const passwordField = await this.waitForElement(this.selectors.password);
    const submitButton = await this.waitForElement(this.selectors.submit);

    if (!usernameField || !passwordField || !submitButton) {
      return false;
    }

    if (usernameField.value !== credentials.username) {
      usernameField.focus();
      usernameField.value = credentials.username;
      usernameField.dispatchEvent(new Event("input", { bubbles: true }));
    }

    if (passwordField.value !== credentials.password) {
      passwordField.focus();
      passwordField.value = credentials.password;
      passwordField.dispatchEvent(new Event("input", { bubbles: true }));
    }

    submitButton.click();
    return true;
  }

  canAttempt() {
    const attemptCount = Number(this.session.getItem(this.attemptKey) || "0");
    return attemptCount < this.maxAttempts;
  }

  incrementAttempt() {
    const attemptCount = Number(this.session.getItem(this.attemptKey) || "0");
    this.session.setItem(this.attemptKey, String(attemptCount + 1));
  }

  isTargetPage() {
    const onStartPage =
      this.loc.hostname === this.startHost && this.loc.pathname.startsWith(this.startPath);
    const hasLoginForm =
      this.doc.querySelector(this.selectors.username) ||
      this.doc.querySelector(this.selectors.password) ||
      this.doc.querySelector(this.selectors.submit);

    return { onStartPage, hasLoginForm };
  }

  async run() {
    if (!this.canAttempt()) {
      console.info(
        "BeefPlusAutoLogin: サインイン試行が上限に達したため自動送信しません。"
      );
      return;
    }

    const credentials = await this.loadCredentials();
    if (!credentials) {
      console.info("BeefPlusAutoLogin: 保存された資格情報がないため何も実行しません。");
      return;
    }

    const { onStartPage, hasLoginForm } = this.isTargetPage();
    if (!onStartPage && !hasLoginForm) {
      return;
    }

    if (onStartPage) {
      await this.clickSignInLink();
    }

    const submitted = await this.fillAndSubmitLogin(credentials);
    if (submitted) {
      this.incrementAttempt();
    }
  }
}

(() => {
  const runner = new AutoLoginRunner(document, chrome.storage.local, sessionStorage, location);
  runner
    .run()
    .catch((error) =>
      console.error("BeefPlusAutoLogin: 実行中にエラーが発生しました", error)
    );
})();
