#if canImport(AppKit) && !canImport(UIKit)
import Cocoa
import Social
import UniformTypeIdentifiers

final class ShareViewControllerMac: NSViewController {
  override func loadView() {
    let v = NSView(frame: NSRect(x: 0, y: 0, width: 320, height: 120))
    self.view = v
  }

  override func viewDidLoad() {
    super.viewDidLoad()

    let label = NSTextField(labelWithString: "Saving to Tryflowy…")
    label.alignment = .center
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
    ])

    guard KeychainStore.read("pb_token") != nil else {
      label.stringValue = "Please log in to Tryflowy first"
      DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
        self.extensionContext?.completeRequest(returningItems: nil)
      }
      return
    }

    let urlString = Bundle.main.infoDictionary?["TryflowyAppURL"] as? String ?? "https://tryflowy.app"
    guard let appURL = URL(string: urlString) else {
      label.stringValue = "Invalid app URL"
      return
    }
    let client = IngestClient(appURL: appURL)

    Task {
      guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return }
      for item in items {
        guard let providers = item.attachments else { continue }
        for provider in providers {
          if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let urlString = await loadURL(provider) {
              do { _ = try await client.ingestURL(urlString) }
              catch { await show(label: label, "Failed — retry from iOS"); return }
              await show(label: label, "Saved ✓")
              return
            }
          }
        }
      }
      await show(label: label, "Unsupported content")
    }
  }

  @MainActor
  private func show(label: NSTextField, _ text: String) async {
    label.stringValue = text
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
      self.extensionContext?.completeRequest(returningItems: nil)
    }
  }

  private func loadURL(_ provider: NSItemProvider) async -> String? {
    await withCheckedContinuation { cont in
      provider.loadItem(forTypeIdentifier: UTType.url.identifier) { value, _ in
        if let url = value as? URL { cont.resume(returning: url.absoluteString) }
        else if let s = value as? String { cont.resume(returning: s) }
        else { cont.resume(returning: nil) }
      }
    }
  }
}
#endif
