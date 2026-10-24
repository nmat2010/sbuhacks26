// Popup script for Wolfie Sensei extension

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');

  // Check connection status
  chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATUS' }, (response) => {
    if (response && response.connected) {
      statusEl!.textContent = 'Connected to desktop';
      statusEl!.className = 'status connected';
    } else {
      statusEl!.textContent = 'Not connected to desktop';
      statusEl!.className = 'status disconnected';
    }
  });
});
