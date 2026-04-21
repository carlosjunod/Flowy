#if canImport(SwiftUI) && canImport(AuthenticationServices)
import SwiftUI
import AuthenticationServices

struct SignInView: View {
  let appURL: URL
  let onSuccess: () -> Void

  @State private var errorMessage: String?
  @State private var isLoading = false

  var body: some View {
    VStack(spacing: 24) {
      Spacer()
      Image(systemName: "tray.fill")
        .font(.system(size: 64))
        .foregroundStyle(.tint)
      Text("Flowy")
        .font(.largeTitle)
        .bold()
      Text("Your AI-powered inbox")
        .foregroundStyle(.secondary)
      Spacer()
      SignInWithAppleButton(.signIn,
        onRequest: { req in req.requestedScopes = [.email] },
        onCompletion: handleAuthCompletion)
        .signInWithAppleButtonStyle(.black)
        .frame(height: 50)
        .padding(.horizontal, 40)
        .disabled(isLoading)
      if isLoading {
        ProgressView()
      }
      if let errorMessage {
        Text(errorMessage)
          .foregroundStyle(.red)
          .font(.caption)
          .multilineTextAlignment(.center)
          .padding(.horizontal, 40)
      }
      Spacer()
    }
    .padding()
  }

  private func handleAuthCompletion(_ result: Result<ASAuthorization, Error>) {
    switch result {
    case .success(let auth):
      guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let identityToken = String(data: tokenData, encoding: .utf8) else {
        errorMessage = "Missing identity token from Apple"
        return
      }
      beginExchange(identityToken: identityToken, email: credential.email)
    case .failure(let error):
      if (error as NSError).code == ASAuthorizationError.canceled.rawValue {
        return
      }
      errorMessage = error.localizedDescription
    }
  }

  private func beginExchange(identityToken: String, email: String?) {
    isLoading = true
    errorMessage = nil
    Task {
      do {
        let client = AuthClient(appURL: appURL)
        let result = try await client.exchangeApple(identityToken: identityToken, email: email)
        KeychainStore.write("pb_token", value: result.token)
        await MainActor.run {
          isLoading = false
          onSuccess()
        }
      } catch {
        await MainActor.run {
          isLoading = false
          errorMessage = Self.describe(error)
        }
      }
    }
  }

  private static func describe(_ error: Error) -> String {
    if let authError = error as? AuthError {
      switch authError {
      case .badResponse(let status, let body):
        if status == 400, let body, body.contains("EMAIL_REQUIRED_FIRST_LOGIN") {
          return "Apple didn't share your email. Sign out of Apple ID in Settings → Password & Security → Sign in with Apple → Flowy → Stop Using, then try again."
        }
        return "Sign-in failed (\(status)). \(body ?? "")"
      case .network(let err):
        return "Network error: \(err.localizedDescription)"
      case .decoding:
        return "Couldn't read the server response."
      }
    }
    return error.localizedDescription
  }
}
#endif
