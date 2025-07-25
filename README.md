# 📌 ChatGPT Pin Chats Extension

A Chrome Extension that enhances the ChatGPT web interface by allowing you to pin your favorite conversations for easy access.

## 🌟 Features

- **📌 Pin/Unpin Chats**: Click the pin icon next to any chat to pin or unpin it
- **📋 Pinned Section**: Dedicated "Pinned Chats" section at the top of your sidebar
- **🚀 Popup Interface**: Quick access to pinned chats via extension popup
- **💾 Persistent Storage**: Your pinned chats are saved and restored across browser sessions
- **🔄 Dynamic Updates**: Automatically handles new chats and UI changes
- **🎨 Native Integration**: Styled to match ChatGPT's existing design
- **🌙 Dark Mode Support**: Works seamlessly with ChatGPT's light and dark themes
- **📥 Export/Import**: Backup and export your pinned chats

## 🚀 Installation

### Method 1: Developer Mode (Recommended for testing)

1. **Download the Extension**

   - Clone or download this repository to your local machine
   - Extract if downloaded as ZIP

2. **Enable Developer Mode**

   - Open Chrome and go to `chrome://extensions/`
   - Toggle "Developer mode" in the top right corner

3. **Load the Extension**

   - Click "Load unpacked" button
   - Select the folder containing the extension files
   - The extension should now appear in your extensions list

4. **Verify Installation**
   - Navigate to [chatgpt.com](https://chatgpt.com)
   - You should see pin icons (📍) next to your chats
   - Click the extension icon in the toolbar to open the popup

## 📖 How to Use

### Pinning a Chat

1. Navigate to ChatGPT sidebar
2. Hover over any chat to see the pin icon (📍)
3. Click the pin icon to pin the chat
4. The chat will move to the "📌 Pinned Chats" section at the top

### Using the Popup

1. Click the extension icon in Chrome's toolbar
2. View all your pinned chats in one place
3. Click any pinned chat to open it directly
4. Use the unpin button (📌) to remove pins
5. Access quick actions like "Open ChatGPT" and "Export"

### Unpinning a Chat

1. Click the pin icon (📌) next to any pinned chat (in sidebar or popup)
2. The chat will be removed from the pinned section
3. The original chat remains in your regular chat history

### Features in Action

- **Persistent Pins**: Your pinned chats are saved automatically
- **Visual Feedback**: Pinned chats have a distinct visual style
- **Hover Effects**: Interactive hover states for better UX
- **Real-time Updates**: Pin status updates immediately across all instances
- **Popup Management**: Quick overview and management from the popup

## 🔧 Technical Details

### File Structure

```
chatgpt-pin-extension/
├── manifest.json          # Extension configuration
├── content.js            # Main functionality and DOM manipulation
├── styles.css            # Styling for pin buttons and sections
├── popup.html            # Extension popup interface
├── popup.css             # Popup styling
├── popup.js              # Popup functionality
├── background.js         # Background script
├── README.md            # This file
└── TESTING.md           # Testing guide
```

### Key Components

#### `manifest.json`

- Manifest Version 3 configuration
- Permissions for storage and ChatGPT domain
- Content script injection setup
- Popup configuration

#### `content.js`

- `ChatGPTPinExtension` class with full functionality
- DOM manipulation for injecting pin buttons
- Chrome storage integration for persistence
- MutationObserver for dynamic content handling
- Chat ID extraction and management
- Message handling for popup communication

#### `popup.html/css/js`

- Clean, modern popup interface
- Real-time pinned chats overview
- Quick action buttons (Open ChatGPT, Export, etc.)
- Status indicators and pin management
- Dark mode support

#### `styles.css`

- Pin button styling with hover effects
- Pinned section layout and theming
- Dark mode compatibility
- Responsive design adjustments

### Browser Compatibility

- **Chrome**: ✅ Fully supported (recommended)
- **Edge**: ✅ Should work (Chromium-based)
- **Firefox**: ❌ Would need manifest adaptation
- **Safari**: ❌ Not compatible

## 🛠️ Development

### Testing the Extension

1. Load the extension in developer mode
2. Open ChatGPT in a new tab
3. Try pinning and unpinning various chats
4. Test the popup interface
5. Refresh the page to test persistence
6. Check browser console for any errors

### Debugging

- Open Chrome DevTools (`F12`)
- Check the Console tab for extension logs
- Use `chrome://extensions/` to reload the extension after changes
- Test popup by right-clicking extension icon > Inspect popup

### Storage

The extension uses `chrome.storage.local` to persist pinned chat IDs:

```javascript
// Data structure
{
  "pinnedChats": ["chat-id-1", "chat-id-2", ...]
}
```

## 🔒 Permissions

The extension requires minimal permissions:

- **storage**: To save pinned chat preferences
- **host_permissions**: Access to chatgpt.com for content injection
- **activeTab**: For popup status checking

## 🐛 Troubleshooting

### Extension Not Working

1. Ensure you're on chatgpt.com
2. Refresh the page after installing
3. Check if the extension is enabled in chrome://extensions/
4. Look for errors in the browser console

### Popup Issues

1. Right-click the extension icon and select "Inspect popup"
2. Check for JavaScript errors in the popup console
3. Verify the extension has proper permissions

### Pins Not Saving

1. Check if storage permission is granted
2. Ensure you're logged into ChatGPT
3. Try disabling and re-enabling the extension

### UI Issues

1. The extension adapts to ChatGPT's UI - layout changes may affect functionality
2. Clear browser cache if styles appear broken
3. Check if ChatGPT has updated their CSS classes

## 🚨 Known Limitations

- **UI Dependencies**: Relies on ChatGPT's current CSS classes and structure
- **Chat Detection**: Only works with standard ChatGPT conversation URLs
- **No Sync**: Pinned chats are stored locally per browser profile
- **Single Domain**: Only works on chatgpt.com

## 🔄 Future Enhancements

Potential features for future versions:

- **Drag & Drop**: Reorder pinned chats
- **Categories**: Organize pins into folders
- **Sync**: Cloud synchronization across devices
- **Import**: Restore pin configurations from export
- **Keyboard Shortcuts**: Quick pin/unpin hotkeys
- **Chat Titles**: Cache and display actual chat titles
- **Search**: Find specific pinned chats

## 📝 License

This project is provided as-is for educational and personal use. Please respect OpenAI's terms of service when using ChatGPT.

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests to improve the extension!

---

**⚠️ Disclaimer**: This is an unofficial extension and is not affiliated with or endorsed by OpenAI. Use at your own discretion.
