const STORAGE_KEY = "clipboard_items";
const itemsList = document.getElementById("items-list");
const emptyState = document.getElementById("empty-state");
const clearBtn = document.getElementById("clear-btn");
const searchInput = document.getElementById("search-input");
const tabs = document.querySelectorAll(".tab");

// Lucide SVG icons (MIT license)
const ICONS = {
  text: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
  image: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>',
  pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
};

let currentFilter = "all";
let allItems = [];

document.addEventListener("DOMContentLoaded", loadItems);

clearBtn.addEventListener("click", async () => {
  if (confirm("Clear all unpinned items?")) {
    allItems = allItems.filter((i) => i.pinned);
    await chrome.storage.local.set({ [STORAGE_KEY]: allItems });
    renderItems();
  }
});

searchInput.addEventListener("input", renderItems);

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.dataset.filter;
    renderItems();
  });
});

async function loadItems() {
  try {
    await chrome.runtime.sendMessage({ action: "check_clipboard" });
  } catch {
    // Background may not be ready
  }

  const result = await chrome.storage.local.get(STORAGE_KEY);
  allItems = result[STORAGE_KEY] || [];
  renderItems();
}

function renderItems() {
  const query = searchInput.value.toLowerCase().trim();

  let filtered = allItems.filter((item) => {
    if (currentFilter === "text" && item.type !== "text") return false;
    if (currentFilter === "image" && item.type !== "image") return false;
    if (currentFilter === "pinned" && !item.pinned) return false;
    if (query && item.type === "text" && !item.content.toLowerCase().includes(query)) return false;
    if (query && item.type === "image") return false;
    return true;
  });

  itemsList.innerHTML = "";

  if (filtered.length === 0) {
    itemsList.hidden = true;
    emptyState.hidden = false;
    return;
  }

  itemsList.hidden = false;
  emptyState.hidden = true;

  filtered.forEach((item) => {
    const row = document.createElement("div");
    row.className = "clip-item";
    row.addEventListener("click", () => copyItem(item));

    const icon = document.createElement("div");
    icon.className = `clip-icon ${item.type === "image" ? "image" : ""}`;
    icon.innerHTML = item.type === "text" ? ICONS.text : ICONS.image;

    const body = document.createElement("div");
    body.className = "clip-body";

    const content = document.createElement("div");
    content.className = "clip-content";
    if (item.type === "text") {
      content.textContent = item.content.substring(0, 120);
    } else {
      const img = document.createElement("img");
      img.src = item.content;
      content.appendChild(img);
    }

    const meta = document.createElement("div");
    meta.className = "clip-meta";
    const timeText = formatTime(item.timestamp);
    const sourceText = item.source ? " \u00B7 " + item.source : "";
    meta.textContent = timeText + sourceText;
    meta.title = item.source || "";

    body.appendChild(content);
    body.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "clip-actions";

    const pinBtn = document.createElement("button");
    pinBtn.className = `pin-btn ${item.pinned ? "pinned" : ""}`;
    pinBtn.innerHTML = ICONS.pin;
    pinBtn.title = item.pinned ? "Unpin" : "Pin";
    pinBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      item.pinned = !item.pinned;
      await chrome.storage.local.set({ [STORAGE_KEY]: allItems });
      renderItems();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.innerHTML = ICONS.trash;
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      allItems = allItems.filter((i) => i.id !== item.id);
      await chrome.storage.local.set({ [STORAGE_KEY]: allItems });
      renderItems();
    });

    actions.appendChild(pinBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(icon);
    row.appendChild(body);
    row.appendChild(actions);
    itemsList.appendChild(row);
  });
}

function copyItem(item) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "write_to_clipboard",
        item: item,
      });
      showCopiedFeedback();
    }
  });
}

function showCopiedFeedback() {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = "Copied!";
  document.body.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = "1"));
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 1200);
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
