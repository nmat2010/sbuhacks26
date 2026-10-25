// Prints the frontmost app's frontmost normal window as one JSON line (Watch mode, WATCH_MODE.md).
// The window number matches Electron desktopCapturer ids ("window:<number>:0"), so the watcher can
// capture exactly that window. Window titles need Screen Recording permission; without it the
// title is null. Build: npm run build:native (universal arm64 + x86_64).
import AppKit
import CoreGraphics

struct Front: Encodable {
  let app: String
  let bundleId: String?
  /** The app can open web links (any browser, known or not): Watch mode treats it as a browser. */
  let isBrowser: Bool
  let pid: Int32
  let windowId: Int?
  let title: String?
  let bounds: [String: Double]?
}

let app = NSWorkspace.shared.frontmostApplication
let pid = app?.processIdentifier ?? -1
var windowId: Int? = nil
var title: String? = nil
var bounds: [String: Double]? = nil

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
if let list = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] {
  // Front to back: the first normal-layer window owned by the frontmost app is its front window
  for w in list {
    guard (w[kCGWindowOwnerPID as String] as? Int32) == pid,
          (w[kCGWindowLayer as String] as? Int) == 0,
          let b = w[kCGWindowBounds as String] as? [String: Double],
          // Skip helper strips and popups (Chrome keeps thin windows above its main one)
          (b["Width"] ?? 0) >= 200, (b["Height"] ?? 0) >= 150,
          ((w[kCGWindowAlpha as String] as? Double) ?? 1) > 0 else { continue }
    windowId = w[kCGWindowNumber as String] as? Int
    title = w[kCGWindowName as String] as? String
    bounds = b
    break
  }
}

// Every app registered to open https links counts as a browser, so an unknown browser is never
// mistaken for an ordinary app (its private windows can't be told apart, so it is not watched)
var isBrowser = false
if let bundle = app?.bundleIdentifier?.lowercased(),
   let handlers = LSCopyAllHandlersForURLScheme("https" as CFString)?.takeRetainedValue() as? [String] {
  isBrowser = handlers.contains { $0.lowercased() == bundle }
}

let out = Front(
  app: app?.localizedName ?? "",
  bundleId: app?.bundleIdentifier,
  isBrowser: isBrowser,
  pid: pid,
  windowId: windowId,
  title: title,
  bounds: bounds
)
if let data = try? JSONEncoder().encode(out), let line = String(data: data, encoding: .utf8) {
  print(line)
}
