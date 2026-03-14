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
    timestamp: new Date().toISOString(),
    pinned: false,
  };

  const duplicate = items.find(
    (i) => i.type === newItem.type && i.content === newItem.content
  );
  if (duplicate) return items;

  items.unshift(newItem);
  if (items.length > MAX_ITEMS) {
    const unpinned = items.filter((i) => !i.pinned);
    if (unpinned.length > 0) {
      const removeTarget = unpinned[unpinned.length - 1];
      items.splice(items.indexOf(removeTarget), 1);
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: items });
  return items;
}

async function deleteItem(id) {
  const items = await getItems();
  const filtered = items.filter((i) => i.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
  return filtered;
}

async function togglePin(id) {
  const items = await getItems();
  const item = items.find((i) => i.id === id);
  if (item) item.pinned = !item.pinned;
  await chrome.storage.local.set({ [STORAGE_KEY]: items });
  return items;
}

async function clearAll() {
  const items = await getItems();
  const pinned = items.filter((i) => i.pinned);
  await chrome.storage.local.set({ [STORAGE_KEY]: pinned });
  return pinned;
}
