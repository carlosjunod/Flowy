import Foundation

public enum IngestError: Error {
  case notAuthenticated
  case badResponse(status: Int, body: String?)
  case network(Error)
  case encoding
}

public enum IngestType: String {
  case url, screenshot
}

public struct IngestClient {
  public let appURL: URL
  public init(appURL: URL) { self.appURL = appURL }

  public func ingestURL(_ rawURL: String) async throws -> String {
    try await post(body: ["type": IngestType.url.rawValue, "raw_url": rawURL])
  }

  public func ingestImage(_ jpegData: Data) async throws -> String {
    let b64 = jpegData.base64EncodedString()
    return try await post(body: ["type": IngestType.screenshot.rawValue, "raw_image": b64])
  }

  private func post(body: [String: String]) async throws -> String {
    guard let token = KeychainStore.read("pb_token") else { throw IngestError.notAuthenticated }

    var req = URLRequest(url: appURL.appendingPathComponent("/api/ingest"))
    req.httpMethod = "POST"
    req.timeoutInterval = 10
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    do {
      req.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
    } catch {
      throw IngestError.encoding
    }

    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 10
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
