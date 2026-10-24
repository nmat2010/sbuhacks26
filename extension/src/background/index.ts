// Background service worker for Wolfie Sensei extension
console.log('Wolfie Sensei extension background script loaded');

// Extension state
let desktopConnected = false;
let pairingToken: string | null = null;
let ws: WebSocket | null = null;

// Load pairing token from storage
chrome.storage.local.get(['pairingToken'], (result) => {
  if (result.pairingToken) {
    pairingToken = result.pairingToken;
    connectToDesktop();
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PAGE_SUMMARY') {
    // Forward page summary to desktop if connected
    if (desktopConnected && ws) {
      ws.send(JSON.stringify({
        type: 'page_summary',
        data: message.data,
        tabId: sender.tab?.id
      }));
    }
    sendResponse({ success: true });
  } else if (message.type === 'SET_PAIRING_TOKEN') {
    pairingToken = message.token;
    chrome.storage.local.set({ pairingToken });
    connectToDesktop();
    sendResponse({ success: true });
  } else if (message.type === 'GET_CONNECTION_STATUS') {
    sendResponse({ connected: desktopConnected });
  }
  return true; // Keep message channel open for async response
});

// Track active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url && desktopConnected && ws) {
      const url = new URL(tab.url);
      ws.send(JSON.stringify({
        type: 'tab_change',
        data: {
          domain: url.hostname,
          title: tab.title,
          url: tab.url
        }
      }));
    }
  });
});

// Track tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active && tab.url && desktopConnected && ws) {
    const url = new URL(tab.url);
    ws.send(JSON.stringify({
      type: 'tab_change',
      data: {
        domain: url.hostname,
        title: tab.title,
        url: tab.url
      }
    }));
  }
});

function connectToDesktop() {
  if (!pairingToken) {
    console.log('No pairing token, skipping desktop connection');
    return;
  }

  // Connect to desktop via loopback WebSocket
  const wsUrl = `ws://localhost:45678?token=${pairingToken}`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to Wolfie desktop');
      desktopConnected = true;
    };

    ws.onclose = () => {
      console.log('Disconnected from Wolfie desktop');
      desktopConnected = false;
      // Retry connection after 5 seconds
      setTimeout(connectToDesktop, 5000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      desktopConnected = false;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleDesktopMessage(message);
      } catch (error) {
        console.error('Failed to parse desktop message:', error);
      }
    };
  } catch (error) {
    console.error('Failed to connect to desktop:', error);
    desktopConnected = false;
  }
}

function handleDesktopMessage(message: any) {
  // Handle messages from desktop (to be implemented in later phases)
  console.log('Message from desktop:', message);
}
