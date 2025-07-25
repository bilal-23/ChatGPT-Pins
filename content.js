// ChatGPT Pin Extension - Content Script
//
// DEBUG MODE: To enable detailed console logging, change this.debugMode = true in constructor
// This will show all pin/unpin actions and navigation attempts in console
//
class ChatGPTPinExtension {
  constructor() {
    this.pinnedChats = new Set();
    this.observer = null;
    this.updateTimeout = null;
    this.lastUpdateTime = 0;
    this.debugMode = false; // Set to true for detailed logging
    this.initExtension();
  }

  async initExtension() {
    console.log("ChatGPT Pin Extension initializing...");

    // Load pinned chats from storage
    await this.loadPinnedChats();

    // Wait for sidebar to load
    this.waitForSidebar();

    // Setup mutation observer for dynamic content
    this.setupMutationObserver();

    // Apply highlighting on init (with a delay to ensure DOM is ready)
    setTimeout(() => {
      this.updateChatHighlighting();
    }, 1000);
  }

  async loadPinnedChats() {
    try {
      const result = await chrome.storage.local.get(["pinnedChats"]);
      const loadedChats = result.pinnedChats || [];

      // Enforce 10 pin limit on load (trim excess if needed)
      if (loadedChats.length > 10) {
        console.log(
          `⚠️ Found ${loadedChats.length} pinned chats, trimming to 10 limit`
        );
        // Keep the first 10 pins
        const trimmedChats = loadedChats.slice(0, 10);
        this.pinnedChats = new Set(trimmedChats);

        // Save the trimmed list with error handling
        try {
          await chrome.storage.local.set({
            pinnedChats: Array.from(this.pinnedChats),
          });
          console.log("✅ Trimmed and saved pinned chats to enforce 10 limit");
        } catch (saveError) {
          console.warn(
            "⚠️ Could not save trimmed pins immediately:",
            saveError
          );
          // Will be saved later when user interacts with pins
        }
      } else {
        this.pinnedChats = new Set(loadedChats);
      }

      console.log("Loaded pinned chats:", this.pinnedChats);
    } catch (error) {
      console.error("Error loading pinned chats:", error);
      // Fallback to empty set
      this.pinnedChats = new Set();
    }
  }

  async savePinnedChats() {
    try {
      // Check if chrome.storage is available
      if (!chrome?.storage?.local) {
        throw new Error("Chrome storage API not available");
      }

      await chrome.storage.local.set({
        pinnedChats: Array.from(this.pinnedChats),
      });
      if (this.debugMode) {
        console.log("Saved pinned chats:", this.pinnedChats);
      }
    } catch (error) {
      console.error("Error saving pinned chats:", error);
      // Show user-friendly error
      this.showSaveError();
    }
  }

  waitForSidebar() {
    const checkSidebar = () => {
      const sidebar = document.querySelector(
        '#history aside, [data-testid="history-list"], nav[aria-label="Chat history"]'
      );
      if (sidebar) {
        console.log("Sidebar found, injecting pin functionality");
        this.injectPinFunctionality();
      } else {
        setTimeout(checkSidebar, 500);
      }
    };
    checkSidebar();
  }

  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      // Debounce rapid mutations
      const now = Date.now();
      if (now - this.lastUpdateTime < 500) {
        return; // Skip if last update was less than 500ms ago
      }

      let shouldUpdate = false;
      let shouldCheckDeletions = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          const addedNodes = Array.from(mutation.addedNodes);
          const removedNodes = Array.from(mutation.removedNodes);

          const hasNewChats = addedNodes.some((node) => {
            return (
              node.nodeType === Node.ELEMENT_NODE &&
              (node.matches('a[href*="/c/"]') ||
                node.classList.contains("__menu-item") ||
                (node.querySelector &&
                  (node.querySelector('a[href*="/c/"]') ||
                    node.querySelector(".__menu-item"))))
            );
          });

          const hasRemovedChats = removedNodes.some((node) => {
            return (
              node.nodeType === Node.ELEMENT_NODE &&
              (node.matches('a[href*="/c/"]') ||
                node.classList.contains("__menu-item") ||
                (node.querySelector &&
                  (node.querySelector('a[href*="/c/"]') ||
                    node.querySelector(".__menu-item"))))
            );
          });

          if (hasNewChats) {
            shouldUpdate = true;
          }

          if (hasRemovedChats) {
            shouldCheckDeletions = true;
          }
        }
      });

      if (shouldUpdate || shouldCheckDeletions) {
        // Clear existing timeout to prevent multiple rapid updates
        if (this.updateTimeout) {
          clearTimeout(this.updateTimeout);
        }

        // Debounced update
        this.updateTimeout = setTimeout(() => {
          if (this.debugMode) {
            console.log(
              "🔄 Updating pin buttons and checking for deletions..."
            );
          }
          this.lastUpdateTime = Date.now();

          if (shouldCheckDeletions) {
            this.checkForDeletedChats();
          }

          if (shouldUpdate) {
            this.injectPinFunctionality();
            this.updateChatHighlighting();
          }

          this.updateTimeout = null;
        }, 200);
      }
    });

    // Start observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  injectPinFunctionality() {
    this.createPinnedSection();
    this.addPinButtonsToChats();
    this.updatePinnedChatsDisplay();
  }

  createPinnedSection() {
    const existingSection = document.querySelector("#pinned-chats-section");
    if (existingSection) return;

    const sidebar = document.querySelector("#history aside");
    if (!sidebar) return;

    const pinnedSection = document.createElement("div");
    pinnedSection.id = "pinned-chats-section";
    pinnedSection.className = "pinned-chats-section";
    pinnedSection.innerHTML = `
      <div class="pinned-header">
        <h2 class="__menu-label">📌 Pinned Chats (<span id="pinned-section-count">0</span>)</h2>
      </div>
      <div id="pinned-chats-list" class="pinned-chats-list"></div>
    `;

    // Insert at the beginning of sidebar
    const firstChild = sidebar.firstElementChild;
    if (firstChild) {
      sidebar.insertBefore(pinnedSection, firstChild);
    } else {
      sidebar.appendChild(pinnedSection);
    }
  }

  addPinButtonsToChats() {
    const chatLinks = document.querySelectorAll(
      '#history a[href^="/c/"]:not(.pinned-chat-item)'
    );

    chatLinks.forEach((chatLink) => {
      // Skip if already has pin button
      if (chatLink.querySelector(".pin-button")) return;

      const chatId = this.extractChatId(chatLink.href);
      const isPinned = this.pinnedChats.has(chatId);

      const pinButton = this.createPinButton(chatId, isPinned);
      this.insertPinButton(chatLink, pinButton);
    });
  }

  createPinButton(chatId, isPinned) {
    const pinButton = document.createElement("button");
    pinButton.className = `pin-button ${isPinned ? "pinned" : ""}`;
    pinButton.title = isPinned ? "Unpin this chat" : "Pin this chat";
    pinButton.innerHTML = isPinned ? "📌" : "📍";
    pinButton.setAttribute("data-chat-id", chatId);
    pinButton.setAttribute("type", "button"); // Prevent form submission

    pinButton.addEventListener("click", (e) => {
      // CRITICAL: Stop all event propagation to prevent chat navigation
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();

      if (this.debugMode) {
        console.log(`${isPinned ? "Unpinning" : "Pinning"} chat:`, chatId);
      }
      this.togglePin(chatId, pinButton);
    });

    // Prevent any parent link clicks when interacting with pin button
    pinButton.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    pinButton.addEventListener("mouseup", (e) => {
      e.stopPropagation();
    });

    return pinButton;
  }

  insertPinButton(chatLink, pinButton) {
    // Find the trailing button container
    const trailingContainer = chatLink.querySelector(".trailing");
    if (trailingContainer) {
      trailingContainer.insertBefore(pinButton, trailingContainer.firstChild);
    } else {
      // Fallback: create a trailing container
      const trailing = document.createElement("div");
      trailing.className = "trailing";
      trailing.appendChild(pinButton);
      chatLink.appendChild(trailing);
    }
  }

  async togglePin(chatId, buttonElement) {
    const isPinned = this.pinnedChats.has(chatId);

    if (isPinned) {
      this.pinnedChats.delete(chatId);
      buttonElement.innerHTML = "📍";
      buttonElement.className = "pin-button";
      buttonElement.title = "Pin this chat";
      if (this.debugMode) {
        console.log("✅ Chat unpinned successfully:", chatId);
      }

      // Remove highlighting from main chat history
      const mainChatLink = document.querySelector(
        `nav a[href*="/c/${chatId}"]:not(.pinned-chat-item)`
      );
      if (mainChatLink) {
        mainChatLink.classList.remove("chat-item-pinned");
      }
    } else {
      // Check pin limit before adding new pin
      if (this.pinnedChats.size >= 10) {
        // Show user-friendly error message
        this.showPinLimitError(buttonElement);
        return;
      }

      this.pinnedChats.add(chatId);
      buttonElement.innerHTML = "📌";
      buttonElement.className = "pin-button pinned";
      buttonElement.title = "Unpin this chat";
      if (this.debugMode) {
        console.log("📌 Chat pinned successfully:", chatId);
      }

      // Add highlighting to main chat history
      const mainChatLink = document.querySelector(
        `nav a[href*="/c/${chatId}"]:not(.pinned-chat-item)`
      );
      if (mainChatLink) {
        mainChatLink.classList.add("chat-item-pinned");
      }
    }

    await this.savePinnedChats();
    this.updatePinnedChatsDisplay();
    this.updateAllPinButtons();

    // Visual feedback for successful pin/unpin
    buttonElement.style.transform = "scale(1.2)";
    setTimeout(() => {
      buttonElement.style.transform = "scale(1)";
    }, 150);
  }

  updateAllPinButtons() {
    const allPinButtons = document.querySelectorAll(".pin-button");
    allPinButtons.forEach((button) => {
      const chatId = button.getAttribute("data-chat-id");
      const isPinned = this.pinnedChats.has(chatId);

      button.innerHTML = isPinned ? "📌" : "📍";
      button.className = `pin-button ${isPinned ? "pinned" : ""}`;
      button.title = isPinned ? "Unpin this chat" : "Pin this chat";
    });

    // Update chat highlighting in main history section
    this.updateChatHighlighting();
  }

  updateChatHighlighting() {
    // Remove existing highlighting from all chats
    const allChatLinks = document.querySelectorAll(
      'nav a[href*="/c/"]:not(.pinned-chat-item)'
    );
    allChatLinks.forEach((chatLink) => {
      chatLink.classList.remove("chat-item-pinned");
    });

    // Add highlighting to pinned chats
    let highlightedCount = 0;
    this.pinnedChats.forEach((chatId) => {
      const chatLink = document.querySelector(
        `nav a[href*="/c/${chatId}"]:not(.pinned-chat-item)`
      );
      if (chatLink) {
        chatLink.classList.add("chat-item-pinned");
        highlightedCount++;
      }
    });

    // Only log if in debug mode or if it's a significant update
    if (this.debugMode && highlightedCount > 0) {
      console.log(
        `✨ Highlighted ${highlightedCount} pinned chats in main history`
      );
    }
  }

  checkForDeletedChats() {
    const existingChatIds = new Set();

    // Get all current chat IDs from the sidebar
    const allChatLinks = document.querySelectorAll(
      'nav a[href*="/c/"]:not(.pinned-chat-item)'
    );
    allChatLinks.forEach((chatLink) => {
      const chatId = this.extractChatId(chatLink.href);
      if (chatId) {
        existingChatIds.add(chatId);
      }
    });

    // Check if any pinned chats no longer exist
    const deletedChats = [];
    this.pinnedChats.forEach((chatId) => {
      if (!existingChatIds.has(chatId)) {
        deletedChats.push(chatId);
      }
    });

    // Remove deleted chats from pinned list
    if (deletedChats.length > 0) {
      deletedChats.forEach((chatId) => {
        this.pinnedChats.delete(chatId);
        if (this.debugMode) {
          console.log("🗑️ Auto-removed deleted chat from pins:", chatId);
        }
      });

      // Save the updated pinned chats
      this.savePinnedChats();

      // Update the UI
      this.updatePinnedChatsDisplay();
      this.updateChatHighlighting();

      // Notify popup about the changes
      this.notifyPopupOfChanges();

      console.log(
        `🗑️ Removed ${deletedChats.length} deleted chats from pinned list`
      );
    }
  }

  getChatTitleByElement(chatElement) {
    // Try multiple selectors to get the chat title
    const titleSelectors = [
      "span[data-title]",
      ".text-sm",
      '[data-testid="conversation-title"]',
      'span[dir="auto"]',
      ".truncate",
      "div > div > span",
    ];

    for (const selector of titleSelectors) {
      const titleElement = chatElement.querySelector(selector);
      if (titleElement && titleElement.textContent.trim()) {
        return titleElement.textContent.trim();
      }
    }

    // Fallback: try to get any text content
    const textContent = chatElement.textContent.trim();
    if (textContent && textContent.length > 0 && textContent.length < 100) {
      return textContent;
    }

    return null;
  }

  notifyPopupOfChanges() {
    // Send message to popup if it's open
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime
        .sendMessage({
          action: "pinnedChatsUpdated",
          pinnedChats: Array.from(this.pinnedChats),
        })
        .catch((error) => {
          // Popup might not be open, which is fine
          if (this.debugMode) {
            console.log("Popup not available for notification:", error);
          }
        });
    }
  }

  updatePinnedChatsDisplay() {
    const pinnedList = document.querySelector("#pinned-chats-list");
    const pinnedSection = document.querySelector("#pinned-chats-section");
    const countElement = document.querySelector("#pinned-section-count");

    if (!pinnedList || !pinnedSection) return;

    // Update counter in section header
    if (countElement) {
      countElement.textContent = this.pinnedChats.size;
    }

    // Clear existing pinned chats
    pinnedList.innerHTML = "";

    if (this.pinnedChats.size === 0) {
      pinnedSection.style.display = "none";
      return;
    }

    pinnedSection.style.display = "block";

    // Find and clone pinned chats
    this.pinnedChats.forEach((chatId) => {
      const originalChat = document.querySelector(
        `#history a[href*="${chatId}"]:not(.pinned-chat-item)`
      );
      if (originalChat) {
        const pinnedChat = this.createPinnedChatItem(originalChat, chatId);
        pinnedList.appendChild(pinnedChat);
      }
    });
  }

  createPinnedChatItem(originalChat, chatId) {
    const pinnedChat = originalChat.cloneNode(true);
    pinnedChat.className = "pinned-chat-item __menu-item hoverable";

    // Preserve ALL original attributes for proper navigation
    const originalHref = originalChat.getAttribute("href");
    if (originalHref) {
      pinnedChat.setAttribute("href", originalHref);
    } else {
      pinnedChat.setAttribute("href", `/c/${chatId}`);
    }

    // Copy any data attributes that might be needed for navigation
    Array.from(originalChat.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-") || attr.name === "href") {
        pinnedChat.setAttribute(attr.name, attr.value);
      }
    });

    // Ensure it's a proper link element
    if (originalChat.tagName.toLowerCase() === "a") {
      // Keep it as a link
    } else {
      // Convert to proper link if needed
      pinnedChat.setAttribute("role", "link");
      pinnedChat.style.cursor = "pointer";
    }

    // Remove the original pin button and add unpin functionality
    const existingPin = pinnedChat.querySelector(".pin-button");
    if (existingPin) {
      existingPin.remove();
    }

    // Add unpin button
    const unpinButton = document.createElement("button");
    unpinButton.className = "pin-button pinned";
    unpinButton.innerHTML = "📌";
    unpinButton.title = "Unpin this chat";
    unpinButton.setAttribute("data-chat-id", chatId);

    unpinButton.addEventListener("click", (e) => {
      // CRITICAL: Stop all event propagation to prevent chat navigation
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();

      console.log("Unpinning chat from pinned section:", chatId);
      this.togglePin(chatId, unpinButton);
    });

    // Prevent any parent link clicks when interacting with unpin button
    unpinButton.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    unpinButton.addEventListener("mouseup", (e) => {
      e.stopPropagation();
    });

    // Add click handler for navigation (only for non-button areas)
    pinnedChat.addEventListener("click", (e) => {
      // Don't trigger if clicking the unpin button or any button
      if (e.target.closest(".pin-button") || e.target.closest("button")) {
        if (this.debugMode) {
          console.log("Click on pin button detected, preventing navigation");
        }
        return;
      }

      if (this.debugMode) {
        console.log("🔗 Pinned chat clicked, attempting navigation...");
      }

      // Get the navigation URL
      const href = pinnedChat.getAttribute("href");
      if (this.debugMode) {
        console.log("Pinned chat href:", href);
      }

      if (href) {
        // Try multiple navigation methods for ChatGPT SPA
        try {
          // Method 1: Find and trigger the original chat element
          const originalChatElement = document.querySelector(
            `nav a[href="${href}"]:not(.pinned-chat-item)`
          );

          if (originalChatElement) {
            if (this.debugMode) {
              console.log("✅ Found original chat element, triggering click");
            }
            e.preventDefault();
            // Create a synthetic click event
            const clickEvent = new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            originalChatElement.dispatchEvent(clickEvent);
            return;
          }

          // Method 2: Try to find original by chat ID and trigger
          const chatIdFromHref = href.split("/c/")[1];
          if (chatIdFromHref) {
            const originalByDataId = document.querySelector(
              `nav a[data-chat-id="${chatIdFromHref}"]:not(.pinned-chat-item)`
            );
            if (originalByDataId) {
              if (this.debugMode) {
                console.log("✅ Found original by data-id, triggering click");
              }
              e.preventDefault();
              originalByDataId.click();
              return;
            }
          }

          // Method 3: Use History API for SPA navigation
          if (this.debugMode) {
            console.log("🔄 Using History API navigation");
          }
          e.preventDefault();

          // Update the URL without page reload
          window.history.pushState(null, "", href);

          // Dispatch a custom navigation event that ChatGPT might listen to
          window.dispatchEvent(
            new CustomEvent("chatgpt-navigate", {
              detail: { href, chatId: chatIdFromHref },
            })
          );

          // Also try popstate event
          window.dispatchEvent(new PopStateEvent("popstate", { state: null }));

          // Small delay then try page reload if nothing happened
          setTimeout(() => {
            if (window.location.pathname !== href) {
              if (this.debugMode) {
                console.log(
                  "🔄 SPA navigation failed, using direct navigation"
                );
              }
              window.location.href = href;
            }
          }, 100);
        } catch (error) {
          if (this.debugMode) {
            console.error("❌ Navigation error:", error);
            console.log("🔄 Using browser default navigation");
          }
        }
      } else {
        if (this.debugMode) {
          console.error("❌ No href found for pinned chat");
        }
      }
    });

    const trailingContainer = pinnedChat.querySelector(".trailing");
    if (trailingContainer) {
      trailingContainer.insertBefore(unpinButton, trailingContainer.firstChild);
    }

    return pinnedChat;
  }

  extractChatId(url) {
    const match = url.match(/\/c\/([a-f0-9-]+)/);
    return match ? match[1] : null;
  }

  // Handle messages from popup
  handlePopupMessage(request, sender, sendResponse) {
    switch (request.action) {
      case "chatUnpinned":
        // Update UI when chat is unpinned from popup
        this.pinnedChats.delete(request.chatId);
        this.updatePinnedChatsDisplay();
        this.updateAllPinButtons();
        sendResponse({ success: true });
        break;

      case "allChatsUnpinned":
        // Clear all pins when requested from popup
        this.pinnedChats.clear();
        this.updatePinnedChatsDisplay();
        this.updateAllPinButtons();
        sendResponse({ success: true });
        break;

      case "getPinnedChats":
        // Send current pinned chats to popup
        sendResponse({ pinnedChats: Array.from(this.pinnedChats) });
        break;

      case "getChatTitle":
        // Get chat title from the current page
        const chatLink = document.querySelector(
          `nav a[href*="${request.chatId}"]:not(.pinned-chat-item)`
        );
        if (chatLink) {
          const title = this.getChatTitleByElement(chatLink);
          if (title) {
            sendResponse({ title: title });
          } else {
            sendResponse({ title: `Chat ${request.chatId.substring(0, 8)}` });
          }
        } else {
          sendResponse({ title: `Chat ${request.chatId.substring(0, 8)}` });
        }
        break;

      case "getAllChatTitles":
        // Get all pinned chat titles
        const titles = {};
        this.pinnedChats.forEach((chatId) => {
          const chatElement = document.querySelector(
            `nav a[href*="${chatId}"]:not(.pinned-chat-item)`
          );
          if (chatElement) {
            const title = this.getChatTitleByElement(chatElement);
            titles[chatId] = title || `Chat ${chatId.substring(0, 8)}`;
          } else {
            titles[chatId] = `Chat ${chatId.substring(0, 8)}`;
          }
        });
        sendResponse({ titles: titles });
        break;

      default:
        sendResponse({ error: "Unknown action" });
    }
  }

  // Show user-friendly save error
  showSaveError() {
    const errorDiv = document.createElement("div");
    errorDiv.className = "save-error";
    errorDiv.innerHTML = "⚠️ Could not save changes. Please try again.";
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #fef5e7;
      color: #d69e2e;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #f6ad55;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      animation: slideInRight 0.3s ease-out;
    `;

    document.body.appendChild(errorDiv);

    // Remove after 3 seconds
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.style.animation = "slideInRight 0.3s ease-out reverse";
        setTimeout(() => {
          if (errorDiv.parentNode) {
            document.body.removeChild(errorDiv);
          }
        }, 300);
      }
    }, 3000);
  }

  // Show user-friendly pin limit error
  showPinLimitError(buttonElement) {
    // Create and show temporary error message
    const errorDiv = document.createElement("div");
    errorDiv.className = "pin-limit-error";
    errorDiv.innerHTML =
      "⚠️ Pin limit reached (10 max). Unpin some chats first.";
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #fee;
      color: #c53030;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid #feb2b2;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      animation: slideInRight 0.3s ease-out;
    `;

    // Add slide-in animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(errorDiv);

    // Visual feedback on button
    buttonElement.style.transform = "scale(1.1)";
    buttonElement.style.backgroundColor = "#fed7d7";

    setTimeout(() => {
      buttonElement.style.transform = "scale(1)";
      buttonElement.style.backgroundColor = "";
    }, 300);

    // Remove error message after 4 seconds
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.style.animation = "slideInRight 0.3s ease-out reverse";
        setTimeout(() => {
          document.body.removeChild(errorDiv);
          document.head.removeChild(style);
        }, 300);
      }
    }, 4000);

    console.log("⚠️ Pin limit reached: Cannot pin more than 10 chats");
  }
}

// Global extension instance
let chatGPTExtension = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (chatGPTExtension) {
    chatGPTExtension.handlePopupMessage(request, sender, sendResponse);
  }
  return true; // Keep message channel open for async responses
});

// Initialize the extension when the page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    chatGPTExtension = new ChatGPTPinExtension();
  });
} else {
  chatGPTExtension = new ChatGPTPinExtension();
}
