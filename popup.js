// ChatGPT Pin Extension - Popup Script
class PopupManager {
  constructor() {
    this.pinnedChats = [];
    this.chatTitles = {};
    this.debugMode = true; // Enable debug mode to see title loading
    this.init();
  }

  async init() {
    console.log("🚀 Popup initializing...");
    
    // Show loading overlay
    this.showLoading();
    
    try {
      // Debug: Check what's actually in storage
      await this.debugStorage();
      
      // Load pinned chats (now includes titles!)
      await this.loadPinnedChats();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Setup content script communication
      this.setupContentScriptListener();
      
      // Render the UI
      this.updateUI();
      
      console.log("✅ Popup initialization complete");
    } catch (error) {
      console.error("❌ Popup initialization failed:", error);
    } finally {
      // Always hide loading overlay
      this.hideLoading();
    }
  }

  async testContentScriptCommunication() {
    try {
      console.log("🧪 Testing content script communication...");
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Communication timeout')), 3000)
      );
      
      const response = await Promise.race([
        this.sendMessageToContentScript("getPinnedChats"),
        timeoutPromise
      ]);
      
      console.log("✅ Content script communication working:", response);
      return true;
    } catch (error) {
      console.error("❌ Content script communication failed:", error);
      console.log("ℹ️ This might be normal if ChatGPT tab is not open");
      return false;
    }
  }

  // Debug function to manually inspect storage
  async debugStorage() {
    console.log("🔍 === STORAGE DEBUG ===");
    try {
      const allData = await chrome.storage.local.get(null);
      console.log("📦 All storage data:", allData);
      
      if (allData.pinnedChats) {
        console.log("📌 Pinned chats found:", allData.pinnedChats.length, allData.pinnedChats);
      } else {
        console.log("❌ No pinned chats in storage");
      }
      
      if (allData.chatTitles) {
        console.log("📝 Chat titles found:", Object.keys(allData.chatTitles).length, allData.chatTitles);
      } else {
        console.log("❌ No chat titles in storage");
      }
    } catch (error) {
      console.error("❌ Storage debug failed:", error);
    }
    console.log("🔍 === END STORAGE DEBUG ===");
  }

  setupEventListeners() {
    // Open ChatGPT button
    document
      .getElementById("open-chatgpt-btn")
      .addEventListener("click", () => {
        this.openChatGPT();
      });

    // Clear all button
    document.getElementById("clear-all-btn").addEventListener("click", () => {
      this.clearAllPins();
    });

    document.getElementById("open-chatgpt-btn").addEventListener("click", () => {
      chrome.tabs.create({ url: "https://chatgpt.com" });
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
      console.log("📦 Loading pinned chats from storage...");
      const result = await chrome.storage.local.get(["pinnedChats"]);
      
      console.log("🔍 Storage result:", result);
      
      const loadedChats = result.pinnedChats || [];
      this.pinnedChats = [];
      this.chatTitles = {};

      // Handle both old format (array of IDs) and new format (array of objects)
      loadedChats.forEach(item => {
        if (typeof item === 'string') {
          // Old format: just chat ID
          this.pinnedChats.push(item);
          this.chatTitles[item] = `Chat ${item.substring(0, 8)}`;
        } else if (item && item.id) {
          // New format: object with id and title
          this.pinnedChats.push(item.id);
          this.chatTitles[item.id] = item.title || `Chat ${item.id.substring(0, 8)}`;
        }
      });
      
      console.log("✅ Loaded pinned chats:", this.pinnedChats.length, "chats:", this.pinnedChats);
      console.log("✅ Loaded chat titles:", Object.keys(this.chatTitles).length, "titles:", this.chatTitles);
      
      // If we have pinned chats, update UI immediately
      if (this.pinnedChats.length > 0) {
        console.log("🎯 Found pinned chats in storage, updating UI...");
        this.updateUI();
      }
      
    } catch (error) {
      console.error("❌ Error loading pinned chats:", error);
      this.showError("Failed to load pinned chats");
    }
  }

  async savePinnedChats() {
    try {
      // Save in new format with titles
      const pinnedChatsArray = this.pinnedChats.map(chatId => ({
        id: chatId,
        title: this.chatTitles[chatId] || `Chat ${chatId.substring(0, 8)}`
      }));

      await chrome.storage.local.set({ pinnedChats: pinnedChatsArray });
      console.log("💾 Saved pinned chats:", pinnedChatsArray);
    } catch (error) {
      console.error("Error saving pinned chats:", error);
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
      console.log("📋 Current cached titles:", Object.keys(this.chatTitles).length);
      console.log("📌 Pinned chats to get titles for:", this.pinnedChats);

      // Get all chat titles from content script
      const response = await this.sendMessageToContentScript("getAllChatTitles");

      console.log("📨 Content script response:", response);

      if (response && response.titles) {
        // Merge new titles with cached ones
        this.chatTitles = { ...this.chatTitles, ...response.titles };
        console.log("✅ Successfully loaded chat titles:", Object.keys(this.chatTitles).length, "total titles");
        console.log("📝 All chat titles:", this.chatTitles);

        // Save titles to storage for offline access
        await this.saveChatTitles();
      } else {
        console.warn("⚠️ No titles received from content script - using cached titles");
        
        // Force individual title loading for all pinned chats
        console.log("🔄 Forcing individual title requests for all pinned chats...");
        await this.loadIndividualTitles();
      }

      // Force refresh titles for any that are still showing as "Chat ..."
      const needRefresh = this.pinnedChats.filter(chatId => 
        !this.chatTitles[chatId] || this.chatTitles[chatId].startsWith('Chat ')
      );
      
      if (needRefresh.length > 0) {
        console.log("🔄 Force refreshing titles for chats:", needRefresh);
        for (const chatId of needRefresh) {
          await this.loadTitleForChat(chatId);
        }
      }

    } catch (error) {
      console.error("❌ Error loading chat titles:", error);
      console.log("📱 Trying individual title loading as fallback...");
      await this.loadIndividualTitles();
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

  async sendMessageToContentScript(action, data = {}) {
    return new Promise((resolve, reject) => {
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        reject(new Error(`Message timeout: ${action}`));
      }, 5000);

      chrome.tabs.query({ url: "https://chatgpt.com/*" }, (tabs) => {
        if (tabs.length === 0) {
          clearTimeout(timeout);
          reject(new Error("No ChatGPT tabs found"));
          return;
        }

        chrome.tabs.sendMessage(
          tabs[0].id,
          { action, ...data },
          (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          }
        );
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
    
    console.log("🔄 Updating extension status...");

    // Check if we're on ChatGPT
    chrome.tabs.query({ url: "https://chatgpt.com/*" }, (tabs) => {
      console.log(`🔍 Found ${tabs.length} ChatGPT tabs`);
      
      if (tabs && tabs.length > 0) {
        statusElement.textContent = "Active";
        statusElement.className = "status-value status-active";
        console.log("✅ Extension status: Active");
      } else {
        statusElement.textContent = "No ChatGPT Tab";
        statusElement.className = "status-value status-inactive";
        console.log("⚠️ Extension status: No ChatGPT Tab");
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
    // Get stored chat title (now directly available!)
    const chatTitle = this.chatTitles[chatId] || `Chat ${chatId.substring(0, 8)}`;
    const shortId = chatId.substring(0, 8);

    console.log(`🎨 Creating element for chat ${chatId}: "${chatTitle}"`);

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

  async loadTitleForChat(chatId) {
    try {
      const response = await this.sendMessageToContentScript("getChatTitle", {
        chatId: chatId
      });
      
      if (response && response.title && response.title !== `Chat ${chatId.substring(0, 8)}`) {
        this.chatTitles[chatId] = response.title;
        await this.saveChatTitles();
        // Re-render the specific item with the new title
        this.updatePinnedChatTitle(chatId, response.title);
        console.log(`✅ Updated title for ${chatId}: ${response.title}`);
      }
    } catch (error) {
      console.error(`❌ Error loading title for ${chatId}:`, error);
    }
  }

  updatePinnedChatTitle(chatId, newTitle) {
    const pinnedItem = document.querySelector(`[data-chat-id="${chatId}"] .pinned-item-title`);
    if (pinnedItem) {
      pinnedItem.textContent = newTitle;
      pinnedItem.title = newTitle;
    }
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
