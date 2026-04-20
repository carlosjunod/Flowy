#if canImport(SwiftUI) && canImport(WebKit)
import SwiftUI
import WebKit

@main
struct TryflowyApp: App {
  @StateObject private var auth = AuthState()
  @StateObject private var web: WebViewModel

  init() {
    let urlString = Bundle.main.infoDictionary?["TryflowyAppURL"] as? String ?? "https://tryflowy.app"
    let url = URL(string: urlString) ?? URL(string: "https://tryflowy.app")!
    _web = StateObject(wrappedValue: WebViewModel(initialURL: url))
  }

  var body: some Scene {
    WindowGroup {
      Group {
        if auth.isSignedIn {
          WebAppView(model: web)
            .onOpenURL { incoming in
              web.handleIncomingURL(incoming)
            }
        } else {
          SignInView(appURL: web.initialURL, onSuccess: { auth.refresh() })
        }
      }
      .ignoresSafeArea()
      .task { auth.refresh() }
    }
  }
}

@MainActor
final class AuthState: ObservableObject {
  @Published var isSignedIn: Bool = false

  func refresh() {
    isSignedIn = KeychainStore.read("pb_token") != nil
  }

  func signOut() {
    KeychainStore.delete("pb_token")
    isSignedIn = false
  }
}

@MainActor
final class WebViewModel: ObservableObject {
  let initialURL: URL
  @Published var currentURL: URL

  init(initialURL: URL) {
    self.initialURL = initialURL
    self.currentURL = initialURL
  }

  func handleIncomingURL(_ url: URL) {
    // Only accept Universal Links pointing at the same host as the app URL.
    guard let incomingHost = url.host, let appHost = initialURL.host, incomingHost == appHost else {
      return
    }
    currentURL = url
  }
}

struct WebAppView: View {
  @ObservedObject var model: WebViewModel

  var body: some View {
    WebView(url: model.currentURL)
  }
}

#if canImport(UIKit)
import UIKit
struct WebView: UIViewRepresentable {
  let url: URL
  func makeUIView(context: Context) -> WKWebView {
    let view = WKWebView()
    view.load(URLRequest(url: url))
    return view
  }
  func updateUIView(_ uiView: WKWebView, context: Context) {
    if uiView.url != url {
      uiView.load(URLRequest(url: url))
    }
  }
}
#else
import AppKit
struct WebView: NSViewRepresentable {
  let url: URL
  func makeNSView(context: Context) -> WKWebView {
    let view = WKWebView()
    view.load(URLRequest(url: url))
    return view
  }
  func updateNSView(_ nsView: WKWebView, context: Context) {
    if nsView.url != url {
      nsView.load(URLRequest(url: url))
    }
  }
}
#endif

#endif
