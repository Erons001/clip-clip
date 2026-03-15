if (window.__clipClipInjected) { /* already running */ } else {
window.__clipClipInjected = true;

const STORAGE_KEY = "clipboard_items";
const MAX_ITEMS = 50;

// Save directly to chrome.storage.local (no background middleman)
async function saveClip(item) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const items = result[STORAGE_KEY] || [];

  const newItem = {
    id: Date.now().toString(),
    type: item.type,
    content: item.content,
    source: item.source || "",
    timestamp: new Date().toISOString(),
    pinned: false,
  };

  // Skip duplicates
  if (items.some((i) => i.type === newItem.type && i.content === newItem.content)) {
    return;
  }

  items.unshift(newItem);
  if (items.length > MAX_ITEMS) items.pop();

  await chrome.storage.local.set({ [STORAGE_KEY]: items });
}

// Track right-clicked images for native "Copy Image" detection
let lastRightClickedImg = null;
let rightClickTime = 0;

document.addEventListener("contextmenu", (e) => {
  const img = e.target.closest("img");
  if (img) {
    lastRightClickedImg = {
      src: img.src,
      alt: img.alt || "",
    };
    rightClickTime = Date.now();
  } else {
    lastRightClickedImg = null;
  }
});

// Capture text on copy + detect image copy via right-click
document.addEventListener("copy", () => {
  const text = window.getSelection()?.toString();
  if (text?.trim()) {
    saveClip({
      type: "text",
      content: text,
      source: document.title + " - " + location.hostname,
    });
  }

  // If user right-clicked an image recently (within 5s) and now a copy fired,
  // they likely clicked "Copy Image" — ask background to read clipboard
  if (lastRightClickedImg && Date.now() - rightClickTime < 5000) {
    const source = (lastRightClickedImg.alt || document.title) + " - " + location.hostname;
    chrome.runtime.sendMessage({
      action: "image_likely_copied",
      source: source,
    });
    lastRightClickedImg = null;
  }
});

// Capture text and images on paste
document.addEventListener("paste", (event) => {
  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type === "text/plain") {
      item.getAsString((text) => {
        if (text.trim()) {
          saveClip({
            type: "text",
            content: text,
            source: document.title + " - " + location.hostname,
          });
        }
      });
    } else if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) {
        const reader = new FileReader();
        reader.onloadend = () => {
          saveClip({
            type: "image",
            content: reader.result,
            source: "Pasted on " + document.title + " - " + location.hostname,
          });
        };
        reader.readAsDataURL(blob);
      }
    }
  }
});

// Handle messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "write_to_clipboard") {
    const item = message.item;
    if (item.type === "text") {
      copyTextFallback(item.content);
      pasteAtCursor(item.content);
    } else if (item.type === "image") {
      copyImageFallback(item.content);
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "open_paste_menu") {
    chrome.storage.local.get(STORAGE_KEY).then((result) => {
      const items = result[STORAGE_KEY] || [];
      if (items.length) showPasteMenu(items);
    });
  }
});

// Clipboard write fallbacks — work without document focus using execCommand
function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function copyImageFallback(dataUrl) {
  // For images, write to a contenteditable div and copy
  const div = document.createElement("div");
  div.contentEditable = true;
  div.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
  const img = document.createElement("img");
  img.src = dataUrl;
  div.appendChild(img);
  document.body.appendChild(div);
  const range = document.createRange();
  range.selectNodeContents(div);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("copy");
  sel.removeAllRanges();
  div.remove();
}

function pasteAtCursor(text) {
  const active = document.activeElement;
  if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) {
    const start = active.selectionStart;
    const end = active.selectionEnd;
    active.value =
      active.value.substring(0, start) + text + active.value.substring(end);
    active.selectionStart = active.selectionEnd = start + text.length;
    active.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (active?.isContentEditable) {
    document.execCommand("insertText", false, text);
  }
}

function pasteImageAtCursor(dataUrl) {
  const active = document.activeElement;
  if (active?.isContentEditable) {
    const img = document.createElement("img");
    img.src = dataUrl;
    img.style.maxWidth = "300px";
    document.execCommand("insertHTML", false, img.outerHTML);
  }
}

function showPasteMenu(items) {
  const existing = document.getElementById("cb-manager-menu");
  if (existing) existing.remove();

  const menu = document.createElement("div");
  menu.id = "cb-manager-menu";
  Object.assign(menu.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: "8px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
    zIndex: "2147483647",
    maxHeight: "400px",
    width: "320px",
    overflowY: "auto",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    padding: "10px 14px",
    fontWeight: "600",
    borderBottom: "1px solid #eee",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  });
  header.textContent = "Clip Clip";

  const closeBtn = document.createElement("span");
  closeBtn.textContent = "\u00D7";
  Object.assign(closeBtn.style, {
    cursor: "pointer",
    fontSize: "18px",
    lineHeight: "1",
  });
  closeBtn.addEventListener("click", () => menu.remove());
  header.appendChild(closeBtn);
  menu.appendChild(header);

  items.slice(0, 10).forEach((item) => {
    const row = document.createElement("div");
    Object.assign(row.style, {
      padding: "8px 14px",
      cursor: "pointer",
      borderBottom: "1px solid #f0f0f0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    row.addEventListener("mouseenter", () => (row.style.background = "#f5f5f5"));
    row.addEventListener("mouseleave", () => (row.style.background = "none"));

    if (item.type === "text") {
      row.textContent = item.content.substring(0, 80);
    } else {
      const img = document.createElement("img");
      img.src = item.content;
      img.style.maxHeight = "40px";
      img.style.verticalAlign = "middle";
      row.appendChild(img);
    }

    row.addEventListener("click", () => {
      if (item.type === "text") {
        navigator.clipboard.writeText(item.content).then(() => pasteAtCursor(item.content));
      }
      menu.remove();
    });

    menu.appendChild(row);
  });

  document.body.appendChild(menu);

  document.addEventListener("keydown", function handler(e) {
    if (e.key === "Escape") {
      menu.remove();
      document.removeEventListener("keydown", handler);
    }
  });
}

} // end of __clipClipInjected guard
