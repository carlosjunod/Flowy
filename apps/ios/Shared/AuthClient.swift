import Foundation

public enum AuthError: Error {
  case badResponse(status: Int, body: String?)
  case network(Error)
  case decoding
}

public struct AuthResult {
  public let token: String
  public let userId: String
  public let email: String
}

public struct AuthClient {
  public let appURL: URL
  public init(appURL: URL) { self.appURL = appURL }

  public func exchangeApple(identityToken: String, email: String?) async throws -> AuthResult {
    var body: [String: String] = ["identity_token": identityToken]
    if let email, !email.isEmpty { body["email"] = email }

    var req = URLRequest(url: appURL.appendingPathComponent("/api/auth/apple"))
    req.httpMethod = "POST"
    req.timeoutInterval = 10
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 10
    let session = URLSession(configuration: config)

    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await session.data(for: req)
    } catch {
      throw AuthError.network(error)
    }

    guard let http = response as? HTTPURLResponse else {
      throw AuthError.badResponse(status: -1, body: nil)
    }
    guard (200..<300).contains(http.statusCode) else {
      throw AuthError.badResponse(status: http.statusCode, body: String(data: data, encoding: .utf8))
    }

    struct Envelope: Decodable {
      struct Inner: Decodable {
        let token: String
        let userId: String
        let email: String
      }
      let data: Inner
    }

    do {
      let parsed = try JSONDecoder().decode(Envelope.self, from: data)
      return AuthResult(token: parsed.data.token, userId: parsed.data.userId, email: parsed.data.email)
    } catch {
      throw AuthError.decoding
    }
  }
}
