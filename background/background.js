// === Storage ===
const STORAGE_KEY = "clipboard_items";
const MAX_ITEMS = 50;

async function getItems() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function saveItem(item) {
  const items = await getItems();
  const newItem = {
    id: Date.now().toString(),
    type: item.type,
    content: item.content,
    source: item.source || "",
    timestamp: new Date().toISOString(),
    pinned: false,
  };

  if (items.some((i) => i.type === newItem.type && i.content === newItem.content)) {
    return items;
  }

  items.unshift(newItem);
  if (items.length > MAX_ITEMS) items.pop();

  await chrome.storage.local.set({ [STORAGE_KEY]: items });
  return items;
}

// === Offscreen document management ===
let offscreenCreated = false;

async function ensureOffscreen() {
  if (offscreenCreated) return;
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: "offscreen/offscreen.html",
        reasons: ["CLIPBOARD"],
        justification: "Read clipboard images when user copies an image",
      });
    }
    offscreenCreated = true;
  } catch (e) {
    // Already exists or error
  }
}

async function readClipboardImage(source) {
  await ensureOffscreen();
  try {
    const result = await chrome.runtime.sendMessage({ action: "read_clipboard" });
    if (result && result.type === "image") {
      await saveItem({
        type: "image",
        content: result.content,
        source: source || "Copied image",
      });
      return true;
    }
  } catch (e) {
    // Offscreen doc may not be ready
  }
  return false;
}

// === Context menus ===
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "paste-from-clipclip",
    title: "Paste from Clip Clip",
    contexts: ["editable"],
  });

  chrome.contextMenus.create({
    id: "save-image-to-clipclip",
    title: "Save Image to Clip Clip",
    contexts: ["image"],
  });

  // Inject content script into existing tabs
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://")) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content/content.js"],
        }).catch(() => {});
      }
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "paste-from-clipclip") {
    chrome.tabs.sendMessage(tab.id, { action: "open_paste_menu" });
  }

  if (info.menuItemId === "save-image-to-clipclip" && info.srcUrl) {
    const pageUrl = info.pageUrl || "";
    let hostname = "";
    try { hostname = new URL(pageUrl).hostname; } catch {}
    const source = (tab?.title || hostname || "Unknown page") + " - " + hostname;

    try {
      const response = await fetch(info.srcUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        saveItem({ type: "image", content: reader.result, source });
      };
      reader.readAsDataURL(blob);
    } catch {
      saveItem({ type: "image", content: info.srcUrl, source });
    }
  }
});

// === Message handling ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Request from content script: user right-clicked an image then copied
  if (message.action === "image_likely_copied") {
    const source = message.source || "Copied image";
    // Wait for clipboard to be populated, then read it
    setTimeout(() => {
      readClipboardImage(source).then((saved) => sendResponse({ saved }));
    }, 300);
    return true;
  }

  // Request from popup: check clipboard for new images
  if (message.action === "check_clipboard") {
    readClipboardImage("Copied to clipboard").then((saved) => sendResponse({ saved }));
    return true;
  }

  if (message.action === "copy_to_clipboard") {
    chrome.tabs.sendMessage(sender.tab?.id || message.tabId, {
      action: "write_to_clipboard",
      item: message.item,
    });
    sendResponse({ success: true });
    return true;
  }
});

// Create offscreen document on startup
ensureOffscreen();
