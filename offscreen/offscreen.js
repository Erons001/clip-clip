// Offscreen document: reads the clipboard using execCommand('paste')
// This works with the clipboardRead permission without a user gesture.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "read_clipboard") {
    readClipboard().then(sendResponse);
    return true;
  }
});

function readClipboard() {
  return new Promise((resolve) => {
    const target = document.getElementById("paste-target");
    target.innerHTML = "";
    target.focus();

    const handler = (e) => {
      target.removeEventListener("paste", handler);
      e.preventDefault();

      const items = e.clipboardData?.items;
      if (!items || items.length === 0) {
        resolve(null);
        return;
      }

      let hasImage = false;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          hasImage = true;
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve({ type: "image", content: reader.result });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          } else {
            resolve(null);
          }
          return;
        }
      }

      if (!hasImage) {
        // Text is already captured by the content script, skip here
        resolve(null);
      }
    };

    target.addEventListener("paste", handler);

    const success = document.execCommand("paste");
    if (!success) {
      target.removeEventListener("paste", handler);
      resolve(null);
    }
  });
}
