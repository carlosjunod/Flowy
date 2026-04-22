#if canImport(UIKit)
import UIKit
import Social
import UniformTypeIdentifiers
import MobileCoreServices

/// Thin share extension: reads `pb_token` from the shared keychain,
/// posts URL or image to the Flowy ingest API, shows a success/failure banner.
class ShareViewController: UIViewController {
  private let statusLabel = UILabel()
  private let retryButton = UIButton(type: .system)
  private var lastBody: () async throws -> Void = {}

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    statusLabel.textAlignment = .center
    statusLabel.numberOfLines = 0
    statusLabel.font = .preferredFont(forTextStyle: .title3)
    statusLabel.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(statusLabel)

    retryButton.setTitle("Retry", for: .normal)
    retryButton.translatesAutoresizingMaskIntoConstraints = false
    retryButton.isHidden = true
    retryButton.addTarget(self, action: #selector(retry), for: .touchUpInside)
    view.addSubview(retryButton)

    NSLayoutConstraint.activate([
      statusLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      statusLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
      statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
      retryButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      retryButton.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 16)
    ])

    guard KeychainStore.read("pb_token") != nil else {
      showLoginRequired()
      return
    }
    Task { await handleShare() }
  }

  private func showLoginRequired() {
    statusLabel.text = "Please log in to Flowy first"
    retryButton.setTitle("Close", for: .normal)
    retryButton.isHidden = false
    lastBody = { [weak self] in
      await MainActor.run { self?.extensionContext?.completeRequest(returningItems: nil) }
    }
  }

  @objc private func retry() {
    Task {
      do { try await lastBody() }
      catch { await MainActor.run { self.statusLabel.text = "Failed — tap Retry" } }
    }
  }

  private func setupClient() -> IngestClient? {
    let urlString = Bundle.main.infoDictionary?["TryflowyAppURL"] as? String
      ?? ProcessInfo.processInfo.environment["NEXT_PUBLIC_APP_URL"]
      ?? "https://tryflowy.app"
    guard let url = URL(string: urlString) else { return nil }
    return IngestClient(appURL: url)
  }

  private func handleShare() async {
    await MainActor.run { statusLabel.text = "Saving to Flowy…" }
    guard let client = setupClient() else {
      await MainActor.run { statusLabel.text = "Invalid app URL" }
      return
    }

    guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
      await finishWith(success: false, message: "Nothing to share")
      return
    }

    // First pass: prefer a URL if the share contains one (links always take priority).
    for item in items {
      guard let attachments = item.attachments else { continue }
      for provider in attachments {
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
          if let urlString = await loadURL(provider: provider) {
            await submit(client: client, kind: .url(urlString))
            return
          }
        }
      }
    }

    // Second pass: video (screen recording) wins over images if present.
    for item in items {
      guard let attachments = item.attachments else { continue }
      for provider in attachments {
        if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier)
          || provider.hasItemConformingToTypeIdentifier(UTType.video.identifier)
          || provider.hasItemConformingToTypeIdentifier(UTType.quickTimeMovie.identifier) {
          if let video = await loadVideo(provider: provider) {
            await submit(client: client, kind: .video(video.data, video.mime))
            return
          }
        }
      }
    }

    // Third pass: collect ALL images across all attachments and send as one entry.
    var images: [Data] = []
    for item in items {
      guard let attachments = item.attachments else { continue }
      for provider in attachments {
        if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
          if let data = await loadImage(provider: provider) {
            images.append(data)
          }
        }
      }
    }
    if !images.isEmpty {
      await MainActor.run {
        self.statusLabel.text = images.count == 1
          ? "Saving to Tryflowy…"
          : "Saving \(images.count) images to Tryflowy…"
      }
      await submit(client: client, kind: .images(images))
      return
    }

    // Last resort: plain text that looks like a URL.
    for item in items {
      guard let attachments = item.attachments else { continue }
      for provider in attachments {
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
          if let text = await loadText(provider: provider),
             let url = looksLikeURL(text) {
            await submit(client: client, kind: .url(url))
            return
          }
        }
      }
    }

    await finishWith(success: false, message: "Unsupported content type")
  }

  enum ShareKind {
    case url(String)
    case images([Data])
    case video(Data, String)
  }

  private func submit(client: IngestClient, kind: ShareKind) async {
    lastBody = { [client, kind, weak self] in
      switch kind {
      case .url(let s):
        _ = try await client.ingestURL(s)
      case .images(let list):
        _ = try await client.ingestImages(list)
      case .video(let data, let mime):
        _ = try await client.ingestScreenRecording(data, mime: mime)
      }
      await MainActor.run { self?.finishSuccess() }
    }
    do {
      try await lastBody()
    } catch IngestError.notAuthenticated {
      await MainActor.run { self.showLoginRequired() }
    } catch {
      await finishWith(success: false, message: "Failed — tap Retry")
    }
  }

  @MainActor
  private func finishSuccess() {
    statusLabel.text = "Saved to Flowy ✓"
    retryButton.isHidden = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
      self.extensionContext?.completeRequest(returningItems: nil)
    }
  }

  @MainActor
  private func finishWith(success: Bool, message: String) {
    statusLabel.text = message
    retryButton.isHidden = success
    if !success { retryButton.setTitle("Retry", for: .normal) }
  }

  // MARK: - Provider helpers

  private func loadURL(provider: NSItemProvider) async -> String? {
    await withCheckedContinuation { cont in
      provider.loadItem(forTypeIdentifier: UTType.url.identifier) { value, _ in
        if let url = value as? URL { cont.resume(returning: url.absoluteString) }
        else if let str = value as? String, URL(string: str) != nil { cont.resume(returning: str) }
        else { cont.resume(returning: nil) }
      }
    }
  }

  private func loadImage(provider: NSItemProvider) async -> Data? {
    await withCheckedContinuation { cont in
      provider.loadItem(forTypeIdentifier: UTType.image.identifier) { value, _ in
        if let url = value as? URL, let d = try? Data(contentsOf: url) {
          cont.resume(returning: Self.jpegData(from: d))
        } else if let image = value as? UIImage {
          cont.resume(returning: image.jpegData(compressionQuality: 0.85))
        } else if let raw = value as? Data {
          cont.resume(returning: Self.jpegData(from: raw))
        } else {
          cont.resume(returning: nil)
        }
      }
    }
  }

  private struct VideoPayload { let data: Data; let mime: String }

  private func loadVideo(provider: NSItemProvider) async -> VideoPayload? {
    // Prefer a file URL so we can read the raw bytes without re-encoding.
    let identifier: String = {
      if provider.hasItemConformingToTypeIdentifier(UTType.quickTimeMovie.identifier) {
        return UTType.quickTimeMovie.identifier
      }
      if provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier) {
        return UTType.movie.identifier
      }
      return UTType.video.identifier
    }()
    return await withCheckedContinuation { cont in
      provider.loadItem(forTypeIdentifier: identifier) { value, _ in
        if let url = value as? URL, let data = try? Data(contentsOf: url) {
          let mime = Self.mimeForVideo(url: url)
          cont.resume(returning: VideoPayload(data: data, mime: mime))
        } else if let raw = value as? Data {
          cont.resume(returning: VideoPayload(data: raw, mime: "video/mp4"))
        } else {
          cont.resume(returning: nil)
        }
      }
    }
  }

  private static func mimeForVideo(url: URL) -> String {
    let ext = url.pathExtension.lowercased()
    if ext == "mov" { return "video/quicktime" }
    if ext == "webm" { return "video/webm" }
    return "video/mp4"
  }

  private func loadText(provider: NSItemProvider) async -> String? {
    await withCheckedContinuation { cont in
      provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { value, _ in
        cont.resume(returning: value as? String)
      }
    }
  }

  private static func jpegData(from data: Data) -> Data? {
    if let image = UIImage(data: data) {
      return image.jpegData(compressionQuality: 0.85)
    }
    return data
  }

  private func looksLikeURL(_ text: String) -> String? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") { return trimmed }
    return nil
  }
}
#endif
