// Browsers the Chrome extension can run in. When one of these is frontmost the extension is
// asked to report the active tab (desk.state.reporting) and its domain is attached to app_events.
const BROWSER_APP_NAMES = [
  'google chrome',
  'google chrome canary',
  'google chrome beta',
  'chromium',
  'brave browser',
  'microsoft edge',
  'arc',
  'vivaldi',
  'opera'
];

export function isBrowserApp(appName: string): boolean {
  return BROWSER_APP_NAMES.includes(appName.trim().toLowerCase());
}
