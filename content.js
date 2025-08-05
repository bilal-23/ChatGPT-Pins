// ChatGPT Pin Extension - Content Script
//
// DEBUG MODE: To enable detailed console logging, change this.debugMode = true in constructor
// This will show all pin/unpin actions and navigation attempts in console
//
class ChatGPTPinExtension {
  constructor() {
    this.pinnedChats = new Set();
    this.pinnedChatTitles = {}; // Store chat titles alongside IDs
    this.observer = null;
    this.updateTimeout = null;
    this.lastUpdateTime = 0;
    this.debugMode = true; // Enable debug mode to see title extraction
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

    // Monitor URL changes for active chat highlighting
    this.monitorUrlChanges();

    // Apply highlighting on init (with a delay to ensure DOM is ready)
    setTimeout(() => {
      this.updateChatHighlighting();
      this.updateMainChatVisibility();
    }, 1000);
  }

  async loadPinnedChats() {
    try {
      const result = await chrome.storage.local.get(["pinnedChats"]);
      const loadedChats = result.pinnedChats || [];

      // Handle both old format (array of IDs) and new format (array of objects)
      this.pinnedChats = new Set();
      this.pinnedChatTitles = {};

      loadedChats.forEach(item => {
        if (typeof item === 'string') {
          // Old format: just chat ID
          this.pinnedChats.add(item);
          this.pinnedChatTitles[item] = `Chat ${item.substring(0, 8)}`;
        } else if (item && item.id) {
          // New format: object with id and title
          this.pinnedChats.add(item.id);
          this.pinnedChatTitles[item.id] = item.title || `Chat ${item.id.substring(0, 8)}`;
        }
      });

      // Enforce 10 pin limit on load (trim excess if needed)
      if (this.pinnedChats.size > 10) {
        const chatsArray = Array.from(this.pinnedChats);
        const excessChats = chatsArray.slice(10);
        excessChats.forEach(chatId => {
          this.pinnedChats.delete(chatId);
          delete this.pinnedChatTitles[chatId];
        });
        console.warn(`⚠️ Pin limit exceeded. Removed ${excessChats.length} excess pins.`);
        await this.savePinnedChats();
      }

      if (this.debugMode) {
        console.log(`📌 Loaded ${this.pinnedChats.size} pinned chats:`, this.pinnedChatTitles);
      }



    } catch (error) {
      console.error("Error loading pinned chats:", error);
      this.pinnedChats = new Set();
      this.pinnedChatTitles = {};
    }
  }

  async savePinnedChats() {
    try {
      // Save as array of objects with id and title
      const pinnedChatsArray = Array.from(this.pinnedChats).map(chatId => ({
        id: chatId,
        title: this.pinnedChatTitles[chatId] || `Chat ${chatId.substring(0, 8)}`
      }));

      await chrome.storage.local.set({
        pinnedChats: pinnedChatsArray
      });

      if (this.debugMode) {
        console.log("💾 Saved pinned chats:", pinnedChatsArray);
      }
    } catch (error) {
      console.error("Error saving pinned chats:", error);
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
    this.updateMainChatVisibility();
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
      // Unpin the chat
      this.pinnedChats.delete(chatId);
      delete this.pinnedChatTitles[chatId];
      
      // Update button appearance
      buttonElement.innerHTML = "📍";
      buttonElement.className = "pin-button";
      buttonElement.title = "Pin this chat";
      
      if (this.debugMode) {
        console.log(`📍 Unpinned chat: ${chatId}`);
      }

      // Remove visual highlighting from main chat history
      const mainChatLink = document.querySelector(
        `nav a[href*="/c/${chatId}"]:not(.pinned-chat-item)`
      );
      if (mainChatLink) {
        mainChatLink.classList.remove("chat-item-pinned");
      }
    } else {
      // Check pin limit before adding
      if (this.pinnedChats.size >= 10) {
        console.warn("⚠️ Pin limit reached: Cannot pin more than 10 chats");
        return;
      }

      // Get the chat title before pinning
      const chatElement = document.querySelector(
        `nav a[href*="/c/${chatId}"]:not(.pinned-chat-item)`
      );
      
      let chatTitle = `Chat ${chatId.substring(0, 8)}`; // Default fallback
      
      if (chatElement) {
        const extractedTitle = this.getChatTitleByElement(chatElement);
        if (extractedTitle && extractedTitle.trim()) {
          chatTitle = extractedTitle.trim();
        }
      }

      // Pin the chat with title
      this.pinnedChats.add(chatId);
      this.pinnedChatTitles[chatId] = chatTitle;
      
      // Update button appearance
      buttonElement.innerHTML = "📌";
      buttonElement.className = "pin-button pinned";
      buttonElement.title = "Unpin this chat";
      
      if (this.debugMode) {
        console.log(`📌 Pinned chat: ${chatId} - "${chatTitle}"`);
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
    this.updateMainChatVisibility(); // Update visibility after pin/unpin

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

    // Update active pinned chat highlighting
    this.updateActivePinnedChat();

    // Update visibility of pinned chats in main history
    this.updateMainChatVisibility();
  }

  updateChatHighlighting() {
    // DISABLED: Chat highlighting feature removed per user request
    // This function now does nothing to prevent highlights on pinned chats
    return;
    
    // Original highlighting code commented out below:
    /*
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
    */
  }

  updateActivePinnedChat() {
    // Get current chat ID from URL
    const currentUrl = window.location.href;
    const currentChatId = this.getCurrentChatId(currentUrl);
    
    // Remove active class from all pinned chats
    const allPinnedChats = document.querySelectorAll('.pinned-chat-item');
    allPinnedChats.forEach(chat => {
      chat.classList.remove('active');
    });
    
    // Add active class to current pinned chat if it exists
    if (currentChatId && this.pinnedChats.has(currentChatId)) {
      const activePinnedChat = document.querySelector(`.pinned-chat-item[href*="${currentChatId}"]`);
      if (activePinnedChat) {
        activePinnedChat.classList.add('active');
        if (this.debugMode) {
          console.log(`✨ Marked pinned chat as active: ${currentChatId}`);
        }
      }
    }
  }

  getCurrentChatId(url = window.location.href) {
    // Extract chat ID from URLs like: https://chatgpt.com/c/12345-67890-abcdef
    const match = url.match(/\/c\/([a-f0-9\-]+)/);
    return match ? match[1] : null;
  }

  updateMainChatVisibility() {
    // Remove hidden class from all chats first
    const allChatLinks = document.querySelectorAll('nav a[href*="/c/"]:not(.pinned-chat-item)');
    allChatLinks.forEach((chatLink) => {
      chatLink.classList.remove("hidden-pinned-chat");
    });

    // Hide pinned chats from main chat history
    let hiddenCount = 0;
    this.pinnedChats.forEach((chatId) => {
      const chatLink = document.querySelector(
        `nav a[href*="/c/${chatId}"]:not(.pinned-chat-item)`
      );
      if (chatLink) {
        chatLink.classList.add("hidden-pinned-chat");
        hiddenCount++;
      }
    });

    if (this.debugMode && hiddenCount > 0) {
      console.log(`🙈 Hidden ${hiddenCount} pinned chats from main history`);
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
      this.updateMainChatVisibility(); // Update visibility after pin/unpin

      // Notify popup about the changes
      this.notifyPopupOfChanges();

      console.log(
        `🗑️ Removed ${deletedChats.length} deleted chats from pinned list`
      );
    }
  }

  getChatTitleByElement(chatElement) {
    if (this.debugMode) {
      console.log(`🔍 Attempting to extract title from:`, chatElement);
    }

    // Try multiple selectors to get the chat title (comprehensive list for current ChatGPT)
    const titleSelectors = [
      // ChatGPT's main title selectors (try these first)
      'div[class*="truncate"]',
      'span[class*="truncate"]', 
      '[class*="conversation-title"]',
      '[data-testid="conversation-title"]',
      
      // Common text containers in ChatGPT sidebar
      '.flex-1 > div',
      '.relative.grow > div',
      '.overflow-hidden div',
      '.text-ellipsis',
      
      // Generic text selectors
      'span[title]:not([title=""])',
      '.text-sm.truncate',
      '.text-sm',
      'span[dir="auto"]',
      
      // Fallback to any meaningful text
      'div:not(:has(button)):not(:empty)',
      'span:not(:has(button)):not(:empty)',
      'div',
      'span'
    ];

    for (const selector of titleSelectors) {
      try {
        const titleElements = chatElement.querySelectorAll(selector);
        
        for (const titleElement of titleElements) {
          if (titleElement && titleElement.textContent) {
            const title = titleElement.textContent.trim();
            
            // Enhanced filtering to get meaningful titles
            if (title && 
                title.length > 0 && 
                title.length < 200 && 
                !title.includes('📌') && 
                !title.includes('📍') &&
                !title.includes('🗑️') &&
                !title.includes('New chat') &&
                !title.match(/^[\s\n\r]*$/) &&
                !title.match(/^[0-9\-]+$/) && // Avoid pure numbers/IDs
                title !== 'undefined' &&
                title !== 'null') {
              
              if (this.debugMode) {
                console.log(`✅ Found title using selector "${selector}": "${title}"`);
              }
              return title;
            }
          }
        }
      } catch (e) {
        // Continue to next selector if this one fails
        continue;
      }
    }

    // Final fallback: get the cleanest text from the entire element
    const allText = chatElement.textContent || chatElement.innerText || '';
    if (allText) {
      const cleanedText = allText
        .replace(/📌|📍|🗑️/g, '') // Remove emoji icons
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      // Split by common separators and take the longest meaningful part
      const parts = cleanedText.split(/[\n\r\t]/).map(p => p.trim()).filter(p => p.length > 0);
      for (const part of parts) {
        if (part.length > 3 && part.length < 100 && !part.match(/^[0-9\-]+$/)) {
          if (this.debugMode) {
            console.log(`📝 Using fallback text: "${part}"`);
          }
          return part;
        }
      }
    }

    if (this.debugMode) {
      console.warn(`⚠️ Could not extract title from chat element. Element HTML:`, chatElement.outerHTML);
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

    // Update active pinned chat highlighting
    this.updateActivePinnedChat();

    // Update visibility of pinned chats in main history
    this.updateMainChatVisibility();

    // Schedule periodic cleanup of pinned chats to catch any dynamically added elements
    setTimeout(() => {
      this.periodicCleanupPinnedChats();
    }, 500);
  }

  periodicCleanupPinnedChats() {
    const allPinnedChats = document.querySelectorAll('.pinned-chat-item');
    allPinnedChats.forEach(pinnedChat => {
      this.cleanupPinnedChatButtons(pinnedChat);
    });
  }

  createPinnedChatItem(originalChat, chatId) {
    const pinnedChat = originalChat.cloneNode(true);
    pinnedChat.className = "pinned-chat-item __menu-item hoverable";

    // Use stored title instead of extracting from DOM
    const storedTitle = this.pinnedChatTitles[chatId] || `Chat ${chatId.substring(0, 8)}`;

    // Update the title in the cloned element
    const titleElement = pinnedChat.querySelector('div, span');
    if (titleElement) {
      titleElement.textContent = storedTitle;
      titleElement.title = storedTitle;
    }

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

    // Remove 3-dot menus and other unwanted action buttons from pinned chats
    const unwantedElements = pinnedChat.querySelectorAll([
      'button[aria-label*="More"]',          // More actions button
      'button[aria-label*="menu"]',          // Menu buttons
      'button[aria-label*="options"]',       // Options buttons
      '[role="button"][aria-label*="More"]', // Role-based more buttons
      '.dropdown-button',                    // Generic dropdown buttons
      '.more-button',                        // More buttons
      '.menu-button',                        // Menu buttons
      '.options-button',                     // Options buttons
      'button:has(svg)',                     // Buttons with SVG icons (likely action buttons)
      'button[aria-haspopup]',              // Dropdown/popup buttons
      'button[data-testid*="menu"]',        // Test ID menu buttons
      'button[data-testid*="more"]',        // Test ID more buttons
      '[data-state="closed"]',              // Dropdown state elements
      '.relative button:not(.pin-button)',   // Other buttons that aren't pin buttons
      'button:not(.pin-button)',            // All buttons except pin buttons
      '[role="button"]:not(.pin-button)'    // All role buttons except pin buttons
    ].join(', '));

    unwantedElements.forEach(element => {
      element.remove();
    });

    // Also remove any trailing action containers that might contain 3-dot menus
    const trailingContainers = pinnedChat.querySelectorAll('.trailing');
    trailingContainers.forEach(container => {
      // Remove all buttons except pin buttons from trailing containers
      const buttonsToRemove = container.querySelectorAll('button:not(.pin-button), [role="button"]:not(.pin-button)');
      buttonsToRemove.forEach(button => button.remove());
      
      // If the trailing container is now empty, remove it entirely
      if (container.children.length === 0) {
        container.remove();
      }
    });

    // Additional cleanup for any remaining unwanted elements
    const allButtons = pinnedChat.querySelectorAll('button, [role="button"]');
    allButtons.forEach(button => {
      // Remove any button that isn't a pin button
      if (!button.classList.contains('pin-button') && 
          !button.hasAttribute('data-chat-id') &&
          button.innerHTML !== '📌' && 
          button.innerHTML !== '📍') {
        button.remove();
      }
    });

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

    // Find or create a trailing container for the unpin button
    let trailingContainer = pinnedChat.querySelector(".trailing");
    if (!trailingContainer) {
      // Create a trailing container if none exists
      trailingContainer = document.createElement("div");
      trailingContainer.className = "trailing";
      pinnedChat.appendChild(trailingContainer);
    }

    // Insert the unpin button at the beginning of the trailing container
    trailingContainer.insertBefore(unpinButton, trailingContainer.firstChild);

    // Schedule a delayed cleanup to catch any dynamically added elements
    setTimeout(() => {
      this.cleanupPinnedChatButtons(pinnedChat);
    }, 100);

    return pinnedChat;
  }

  cleanupPinnedChatButtons(pinnedChat) {
    // Remove any buttons that aren't pin buttons (catches dynamically added elements)
    const unwantedButtons = pinnedChat.querySelectorAll('button:not(.pin-button), [role="button"]:not(.pin-button)');
    unwantedButtons.forEach(button => {
      // Double-check it's not our unpin button
      if (!button.classList.contains('pin-button') && 
          button.innerHTML !== '📌' && 
          button.innerHTML !== '📍') {
        button.remove();
      }
    });

    // Force hide any remaining elements via class
    pinnedChat.querySelectorAll('[aria-label*="More"], [aria-label*="menu"], [aria-label*="options"]').forEach(el => {
      if (!el.classList.contains('pin-button')) {
        el.style.display = 'none';
      }
    });
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
        this.updateMainChatVisibility(); // Update visibility after pin/unpin
        sendResponse({ success: true });
        break;

      case "allChatsUnpinned":
        // Clear all pins when requested from popup
        this.pinnedChats.clear();
        this.updatePinnedChatsDisplay();
        this.updateAllPinButtons();
        this.updateMainChatVisibility(); // Update visibility after pin/unpin
        sendResponse({ success: true });
        break;

      case "getPinnedChats":
        // Send current pinned chats to popup
        sendResponse({ pinnedChats: Array.from(this.pinnedChats) });
        break;

      case "getAllChatTitles":
        // Return the stored titles (much simpler now!)
        const titles = {};
        this.pinnedChats.forEach((chatId) => {
          titles[chatId] = this.pinnedChatTitles[chatId] || `Chat ${chatId.substring(0, 8)}`;
        });
        
        console.log("📋 Returning stored titles:", titles);
        sendResponse({ titles: titles });
        break;

      case "getChatTitle":
        // Return stored title for specific chat
        const storedTitle = this.pinnedChatTitles[request.chatId];
        if (storedTitle) {
          sendResponse({ title: storedTitle });
        } else {
          sendResponse({ title: `Chat ${request.chatId.substring(0, 8)}` });
        }
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

  monitorUrlChanges() {
    // Monitor URL changes using both popstate and pushstate/replacestate
    let currentUrl = window.location.href;
    
    // Listen for browser back/forward navigation
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        this.updateActivePinnedChat();
      }, 100);
    });
    
    // Override pushState and replaceState to catch programmatic navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(() => {
        if (window.chatGPTPinExtension) {
          window.chatGPTPinExtension.updateActivePinnedChat();
        }
      }, 100);
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      setTimeout(() => {
        if (window.chatGPTPinExtension) {
          window.chatGPTPinExtension.updateActivePinnedChat();
        }
      }, 100);
    };
    
    // Also monitor for URL changes with a periodic check as fallback
    setInterval(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        this.updateActivePinnedChat();
      }
    }, 1000);
    
    if (this.debugMode) {
      console.log("📍 URL change monitoring initialized");
    }
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
