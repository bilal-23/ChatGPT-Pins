// ChatGPT Pin Extension - Background Script
// This script runs in the background and handles extension lifecycle events

chrome.runtime.onInstalled.addListener((details) => {
  console.log("ChatGPT Pin Extension installed/updated:", details.reason);

  if (details.reason === "install") {
    // First-time installation
    console.log("Welcome to ChatGPT Pin Extension!");

    // Initialize storage if needed
    chrome.storage.local.get(["pinnedChats"], (result) => {
      if (!result.pinnedChats) {
        chrome.storage.local.set({ pinnedChats: [] }, () => {
          console.log("Initialized empty pinned chats storage");
        });
      }
    });
  } else if (details.reason === "update") {
    console.log(
      "ChatGPT Pin Extension updated to version:",
      chrome.runtime.getManifest().version
    );
  }
});

// Handle storage errors
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.pinnedChats) {
    console.log("Pinned chats updated:", changes.pinnedChats.newValue);
  }
});

// Extension error handling
chrome.runtime.onSuspend.addListener(() => {
  console.log("ChatGPT Pin Extension suspended");
});

// Listen for tab updates to reinject if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("chat.openai.com")
  ) {
    console.log("ChatGPT tab loaded, extension should be active");
  }
});

// Handle extension icon click (if popup is added later)
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes("chat.openai.com")) {
    // Extension is already working via content script
    console.log("ChatGPT Pin Extension is active on this tab");
  } else {
    // Redirect to ChatGPT
    chrome.tabs.create({ url: "https://chat.openai.com" });
  }
});

// Message passing between content script and background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPinnedChats") {
    chrome.storage.local.get(["pinnedChats"], (result) => {
      sendResponse({ pinnedChats: result.pinnedChats || [] });
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === "savePinnedChats") {
    chrome.storage.local.set({ pinnedChats: request.pinnedChats }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === "logError") {
    console.error("Content script error:", request.error);
    sendResponse({ logged: true });
  }
});
