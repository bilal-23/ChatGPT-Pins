// ChatGPT Pin Extension - Popup Script
class PopupManager {
  constructor() {
    this.pinnedChats = [];
    this.chatTitles = {};
    this.debugMode = false; // Set to true for detailed logging
    this.init();
  }

  async init() {
    // Show loading overlay
    this.showLoading();

    // Load initial data
    await this.loadPinnedChats();
    await this.loadChatTitles(); // Load actual chat titles

    // Setup event listeners
    this.setupEventListeners();

    // Setup content script communication
    this.setupContentScriptListener();

    // Update UI
    this.updateUI();

    // Hide loading overlay
    this.hideLoading();
  }

  setupEventListeners() {
    // Open ChatGPT button
    document
      .getElementById("open-chatgpt-btn")
      .addEventListener("click", () => {
        this.openChatGPT();
      });

    // Refresh button
    document.getElementById("refresh-btn").addEventListener("click", () => {
      this.refreshData();
    });

    // Export button
    document.getElementById("export-btn").addEventListener("click", () => {
      this.exportPinnedChats();
    });

    // Clear all button
    document.getElementById("clear-all-btn").addEventListener("click", () => {
      this.clearAllPins();
    });

    // Help and settings links
    document.getElementById("help-link").addEventListener("click", (e) => {
      e.preventDefault();
      this.showHelp();
    });

    document.getElementById("settings-link").addEventListener("click", (e) => {
      e.preventDefault();
      this.showSettings();
    });
  }

  setupContentScriptListener() {
    // Listen for messages from content script about changes
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "pinnedChatsUpdated") {
          console.log("📱 Popup received pinned chats update");
          this.pinnedChats = request.pinnedChats || [];
          this.loadChatTitles().then(() => {
            this.updateUI();
          });
          sendResponse({ received: true });
        }
      });
    }
  }

  async loadPinnedChats() {
    try {
      const result = await chrome.storage.local.get([
        "pinnedChats",
        "chatTitles",
      ]);
      this.pinnedChats = result.pinnedChats || [];

      // Load cached titles from storage
      this.chatTitles = result.chatTitles || {};
      console.log("Loaded pinned chats:", this.pinnedChats.length);
      console.log("Loaded cached titles:", Object.keys(this.chatTitles).length);
    } catch (error) {
      console.error("Error loading pinned chats:", error);
      this.showError("Failed to load pinned chats");
    }
  }

  async savePinnedChats() {
    try {
      await chrome.storage.local.set({ pinnedChats: this.pinnedChats });
      console.log("Saved pinned chats:", this.pinnedChats);
    } catch (error) {
      console.error("Error saving pinned chats:", error);
      this.showError("Failed to save changes");
    }
  }

  async saveChatTitles() {
    try {
      await chrome.storage.local.set({ chatTitles: this.chatTitles });
      console.log("💾 Saved chat titles to storage");
    } catch (error) {
      console.error("Error saving chat titles:", error);
    }
  }

  async loadChatTitles() {
    try {
      console.log("🔍 Loading chat titles from content script...");
      console.log(
        "📋 Current cached titles:",
        Object.keys(this.chatTitles).length
      );

      // Get all chat titles from content script
      const response = await this.sendMessageToContentScript(
        "getAllChatTitles"
      );

      console.log("📨 Content script response:", response);

      if (response && response.titles) {
        // Merge new titles with cached ones
        this.chatTitles = { ...this.chatTitles, ...response.titles };
        console.log(
          "✅ Successfully loaded chat titles:",
          Object.keys(this.chatTitles).length,
          "total titles"
        );

        // Save titles to storage for offline access
        await this.saveChatTitles();

        if (this.debugMode) {
          console.log("📝 All chat titles:", this.chatTitles);
        }
      } else {
        console.warn(
          "⚠️ No titles received from content script - using cached titles"
        );

        // If we have no cached titles for pinned chats, try individual requests
        const missingTitles = this.pinnedChats.filter(
          (chatId) => !this.chatTitles[chatId]
        );
        if (missingTitles.length > 0) {
          console.log(
            "🔄 Trying individual title requests for missing chats..."
          );
          await this.loadIndividualTitles();
        }
      }
    } catch (error) {
      console.error("❌ Error loading chat titles:", error);
      console.log("📱 Using cached titles only");

      // If we have no cached titles for pinned chats, try individual requests
      const missingTitles = this.pinnedChats.filter(
        (chatId) => !this.chatTitles[chatId]
      );
      if (missingTitles.length > 0) {
        console.log("🔄 Trying individual title requests as last resort...");
        await this.loadIndividualTitles();
      }
    }
  }

  // Fallback method to load titles individually
  async loadIndividualTitles() {
    console.log(
      "🔄 Loading individual chat titles for",
      this.pinnedChats.length,
      "pinned chats"
    );

    for (const chatId of this.pinnedChats) {
      try {
        const response = await this.sendMessageToContentScript("getChatTitle", {
          chatId,
        });
        if (response && response.title) {
          this.chatTitles[chatId] = response.title;
          console.log(`✅ Got title for ${chatId}: ${response.title}`);
        } else {
          console.warn(`⚠️ No title received for chat ${chatId}`);
          this.chatTitles[chatId] = `Chat ${chatId.substring(0, 8)}`;
        }
      } catch (error) {
        console.error(`❌ Error loading title for ${chatId}:`, error);
        this.chatTitles[chatId] = `Chat ${chatId.substring(0, 8)}`;
      }
    }

    console.log(
      "🏁 Individual title loading complete. Total titles:",
      Object.keys(this.chatTitles).length
    );
  }

  sendMessageToContentScript(action, data = {}) {
    return new Promise((resolve) => {
      chrome.tabs.query({ url: "https://chatgpt.com/*" }, (tabs) => {
        console.log(`📡 Searching for ChatGPT tabs for action: ${action}`);
        console.log(`🔍 Found ${tabs.length} ChatGPT tabs`);

        if (tabs.length > 0) {
          const tab = tabs[0];
          console.log(`📨 Sending message to tab ${tab.id}: ${action}`);

          chrome.tabs.sendMessage(
            tab.id,
            {
              action: action,
              ...data,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                console.warn(
                  "⚠️ Message sending error:",
                  chrome.runtime.lastError.message
                );
                resolve(null);
              } else {
                console.log(`✅ Response received for ${action}:`, response);
                resolve(response);
              }
            }
          );
        } else {
          console.warn("⚠️ No ChatGPT tabs found");
          resolve(null);
        }
      });
    });
  }

  updateUI() {
    this.updatePinnedCount();
    this.updateStatus();
    this.renderPinnedChats();
    this.updateClearButton();
  }

  updatePinnedCount() {
    const countElement = document.getElementById("pinned-count");
    const count = this.pinnedChats.length;

    // Show count with limit (no color coding)
    countElement.textContent = `${count}/10`;
  }

  updateStatus() {
    const statusElement = document.getElementById("extension-status");

    // Check if we're on ChatGPT
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (
        currentTab &&
        currentTab.url &&
        currentTab.url.includes("chatgpt.com")
      ) {
        statusElement.textContent = "Active";
        statusElement.className = "status-value status-active";
      } else {
        statusElement.textContent = "Inactive";
        statusElement.className = "status-value status-inactive";
      }
    });
  }

  renderPinnedChats() {
    const pinnedList = document.getElementById("pinned-list");
    const emptyState = document.getElementById("empty-state");

    if (this.pinnedChats.length === 0) {
      pinnedList.innerHTML = "";
      emptyState.style.display = "block";
      return;
    }

    emptyState.style.display = "none";

    pinnedList.innerHTML = this.pinnedChats
      .map((chatId, index) => {
        return this.createPinnedChatElement(chatId, index);
      })
      .join("");

    // Add event listeners to pinned items
    this.attachPinnedItemListeners();
  }

  createPinnedChatElement(chatId, index) {
    // Get real chat title or fallback
    const chatTitle =
      this.chatTitles[chatId] || `Chat ${chatId.substring(0, 8)}`;
    const shortId = chatId.substring(0, 8);

    return `
      <div class="pinned-item" data-chat-id="${chatId}" data-index="${index}">
        <div class="pinned-item-header">
          <div class="pinned-item-title" title="${chatTitle}">${chatTitle}</div>
          <button class="unpin-btn" data-chat-id="${chatId}" title="Unpin this chat">
            <span>📌</span>
          </button>
        </div>
        <div class="pinned-item-url" title="/c/${chatId}">/c/${shortId}</div>
      </div>
    `;
  }

  getChatTitle(chatId) {
    // Try to get cached title or return fallback
    // In a real implementation, you might cache titles from the content script
    return this.chatTitles[chatId] || `Chat ${chatId.substring(0, 8)}`;
  }

  // Get actual chat titles from the current ChatGPT tab if possible
  async getChatTitleFromTab(chatId) {
    return new Promise((resolve) => {
      chrome.tabs.query({ url: "https://chatgpt.com/*" }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              action: "getChatTitle",
              chatId: chatId,
            },
            (response) => {
              if (response && response.title) {
                resolve(response.title);
              } else {
                resolve(`Chat ${chatId.substring(0, 8)}`);
              }
            }
          );
        } else {
          resolve(`Chat ${chatId.substring(0, 8)}`);
        }
      });
    });
  }

  attachPinnedItemListeners() {
    // Click to open chat (only on non-button areas)
    document.querySelectorAll(".pinned-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        // Don't trigger if clicking unpin button or any button
        if (e.target.closest(".unpin-btn") || e.target.closest("button")) {
          console.log(
            "Click on button detected in popup, preventing navigation"
          );
          return;
        }

        const chatId = item.getAttribute("data-chat-id");
        console.log("Opening chat from popup:", chatId);
        this.openChat(chatId);
      });
    });

    // Unpin buttons
    document.querySelectorAll(".unpin-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        // CRITICAL: Stop all event propagation to prevent chat opening
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();

        const chatId = btn.getAttribute("data-chat-id");
        console.log("Unpinning chat from popup:", chatId);
        this.unpinChat(chatId);
      });

      // Prevent parent click events
      btn.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });

      btn.addEventListener("mouseup", (e) => {
        e.stopPropagation();
      });
    });
  }

  updateClearButton() {
    const clearBtn = document.getElementById("clear-all-btn");
    clearBtn.disabled = this.pinnedChats.length === 0;
  }

  async unpinChat(chatId) {
    const index = this.pinnedChats.indexOf(chatId);
    if (index > -1) {
      this.pinnedChats.splice(index, 1);
      await this.savePinnedChats();
      console.log("✅ Chat unpinned from popup:", chatId);
      this.updateUI();

      // Notify content script if on ChatGPT
      this.notifyContentScript("chatUnpinned", { chatId });

      // Show brief feedback
      this.showBriefFeedback("Chat unpinned");
    }
  }

  async clearAllPins() {
    const confirmed = confirm("Are you sure you want to unpin all chats?");
    if (confirmed) {
      this.pinnedChats = [];
      await this.savePinnedChats();
      this.updateUI();

      // Notify content script
      this.notifyContentScript("allChatsUnpinned");
    }
  }

  openChatGPT() {
    chrome.tabs.create({ url: "https://chatgpt.com" });
    window.close();
  }

  openChat(chatId) {
    console.log("Opening chat:", chatId);

    // Check if we're already on ChatGPT, if so, navigate in same tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      const chatUrl = `https://chatgpt.com/c/${chatId}`;

      if (
        currentTab &&
        currentTab.url &&
        currentTab.url.includes("chatgpt.com")
      ) {
        // Update current ChatGPT tab
        chrome.tabs.update(currentTab.id, { url: chatUrl }, () => {
          console.log("Updated current tab to:", chatUrl);
          window.close();
        });
      } else {
        // Create new tab
        chrome.tabs.create({ url: chatUrl }, (tab) => {
          console.log("Created new tab:", chatUrl);
          window.close();
        });
      }
    });
  }

  async refreshData() {
    this.showLoading();
    await this.loadPinnedChats();
    await this.loadChatTitles(); // Refresh chat titles too
    this.updateUI();

    // Add a small delay for better UX
    setTimeout(() => {
      this.hideLoading();
    }, 500);
  }

  exportPinnedChats() {
    const exportData = {
      extension: "ChatGPT Pin Chats",
      version: "1.0.0",
      exported: new Date().toISOString(),
      pinnedChats: this.pinnedChats.map((chatId) => ({
        id: chatId,
        url: `https://chatgpt.com/c/${chatId}`,
        title: this.getChatTitle(chatId),
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chatgpt-pinned-chats-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  showHelp() {
    const helpText = `
ChatGPT Pin Chats Extension Help:

 🔹 How to Pin Chats:
 • Go to chatgpt.com
 • Click the 📍 icon next to any chat
 • Chat will appear in "Pinned Chats" section

🔹 How to Unpin:
• Click the 📌 icon next to a pinned chat
• Or use the unpin button in this popup

🔹 Features:
• Pinned chats persist across sessions
• Quick access from popup
• Export/backup functionality

Need more help? Check the extension documentation.
    `.trim();

    alert(helpText);
  }

  showSettings() {
    // For now, just show a simple alert
    // In a full implementation, this could open a settings page
    alert(
      "Settings panel coming soon!\n\nCurrent features:\n• Pin/unpin chats\n• Export data\n• Dark mode support"
    );
  }

  notifyContentScript(action, data = {}) {
    chrome.tabs.query({ url: "https://chatgpt.com/*" }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs
          .sendMessage(tab.id, {
            action: action,
            ...data,
          })
          .catch((error) => {
            console.log("Content script not available on tab:", tab.id, error);
          });
      });
    });
  }

  showLoading() {
    const overlay = document.getElementById("loading-overlay");
    overlay.classList.remove("hidden");
  }

  hideLoading() {
    const overlay = document.getElementById("loading-overlay");
    overlay.classList.add("hidden");
  }

  showError(message) {
    // Simple error display - could be enhanced with a toast or modal
    console.error(message);

    // Update status to show error
    const statusElement = document.getElementById("extension-status");
    statusElement.textContent = "Error";
    statusElement.className = "status-value status-inactive";
  }

  showBriefFeedback(message) {
    // Simple feedback mechanism
    const statusElement = document.getElementById("extension-status");
    const originalText = statusElement.textContent;
    const originalClass = statusElement.className;

    statusElement.textContent = message;
    statusElement.className = "status-value status-active";

    setTimeout(() => {
      statusElement.textContent = originalText;
      statusElement.className = originalClass;
    }, 1000);
  }
}

// Initialize popup when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new PopupManager();
});

// Handle storage changes from other parts of the extension
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.pinnedChats) {
    console.log("Pinned chats updated externally, refreshing popup...");
    // Reload popup data if it's still open
    if (document.readyState === "complete") {
      window.location.reload();
    }
  }
});
