// Background Service Worker — handles alarms and cross-context messaging

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    console.log("[LinkedIn AI] Extension installed. Opening onboarding...");
    chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/index.html#onboarding") });
  }
});

// ─── Daily reminder alarm ─────────────────────────────────────────────────────
chrome.alarms.create("daily-content-reminder", {
  periodInMinutes: 24 * 60,
  delayInMinutes: 60,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "daily-content-reminder") {
    chrome.storage.local.get("settings", (result) => {
      const settings = result.settings;
      if (settings?.onboardingComplete) {
        chrome.notifications?.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "LinkedIn AI Assistant",
          message: "Ready to draft today's LinkedIn post?",
        });
      }
    });
  }
});

// ─── Message relay (popup ↔ dashboard) ───────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/index.html") });
    sendResponse({ ok: true });
  }
  return true; // keep channel open for async
});
