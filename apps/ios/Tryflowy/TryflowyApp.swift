#if canImport(SwiftUI) && canImport(WebKit)
import SwiftUI
import WebKit

@main
struct TryflowyApp: App {
  var body: some Scene {
    WindowGroup {
      WebAppView()
        .ignoresSafeArea()
    }
  }
}

struct WebAppView: View {
  private var appURL: URL {
    let s = Bundle.main.infoDictionary?["TryflowyAppURL"] as? String ?? "https://tryflowy.app"
    return URL(string: s) ?? URL(string: "https://tryflowy.app")!
  }

  var body: some View {
    WebView(url: appURL)
  }
}

#if canImport(UIKit)
import UIKit
struct WebView: UIViewRepresentable {
  let url: URL
  func makeUIView(context: Context) -> WKWebView { let wv = WKWebView(); wv.load(URLRequest(url: url)); return wv }
  func updateUIView(_ uiView: WKWebView, context: Context) {}
}
#else
import AppKit
struct WebView: NSViewRepresentable {
  let url: URL
  func makeNSView(context: Context) -> WKWebView { let wv = WKWebView(); wv.load(URLRequest(url: url)); return wv }
  func updateNSView(_ nsView: WKWebView, context: Context) {}
}
#endif

#endif
