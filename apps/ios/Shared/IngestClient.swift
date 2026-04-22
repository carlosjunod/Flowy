import Foundation

public enum IngestError: Error {
  case notAuthenticated
  case badResponse(status: Int, body: String?)
  case network(Error)
  case encoding
}

public enum IngestType: String {
  case url, screenshot, screen_recording
}

public struct IngestClient {
  public let appURL: URL
  public init(appURL: URL) { self.appURL = appURL }

  public func ingestURL(_ rawURL: String) async throws -> String {
    try await postJSON(body: ["type": IngestType.url.rawValue, "raw_url": rawURL], timeout: 10)
  }

  public func ingestImage(_ jpegData: Data) async throws -> String {
    try await ingestImages([jpegData])
  }

  public func ingestImages(_ images: [Data]) async throws -> String {
    guard !images.isEmpty else { throw IngestError.encoding }
    let encoded = images.map { $0.base64EncodedString() }
    // Keep `raw_image` as the first image for any legacy server path.
    var body: [String: Any] = [
      "type": IngestType.screenshot.rawValue,
      "raw_images": encoded,
    ]
    if let first = encoded.first { body["raw_image"] = first }
    // Multi-image uploads are much larger than a URL payload — give them room to finish.
    return try await postJSON(body: body, timeout: 60)
  }

  public func ingestScreenRecording(_ videoData: Data, mime: String) async throws -> String {
    let b64 = videoData.base64EncodedString()
    return try await postJSON(body: [
      "type": IngestType.screen_recording.rawValue,
      "raw_video": b64,
      "video_mime": mime,
    ], timeout: 120)
  }

  private func postJSON(body: [String: Any], timeout: TimeInterval) async throws -> String {
    guard let token = KeychainStore.read("pb_token") else { throw IngestError.notAuthenticated }

    var req = URLRequest(url: appURL.appendingPathComponent("/api/ingest"))
    req.httpMethod = "POST"
    req.timeoutInterval = timeout
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    do {
      req.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
    } catch {
      throw IngestError.encoding
    }

    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = timeout
    let session = URLSession(configuration: config)

    do {
      let (data, response) = try await session.data(for: req)
      guard let http = response as? HTTPURLResponse else {
        throw IngestError.badResponse(status: -1, body: nil)
      }
      guard (200..<300).contains(http.statusCode) else {
        throw IngestError.badResponse(status: http.statusCode, body: String(data: data, encoding: .utf8))
      }
      struct Envelope: Decodable { let data: Inner? }
      struct Inner: Decodable { let id: String; let status: String }
      let parsed = try JSONDecoder().decode(Envelope.self, from: data)
      return parsed.data?.id ?? ""
    } catch let e as IngestError {
      throw e
    } catch {
      throw IngestError.network(error)
    }
  }
}
