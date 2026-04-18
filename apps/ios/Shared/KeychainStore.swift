import Foundation
import Security

/// Thin wrapper over the iOS/macOS keychain. The app and its share extensions share
/// an access group (`group.tryflowy`) so the extension can read the auth token
/// written by the main app's login flow.
public enum KeychainStore {
  public static let accessGroup = "group.tryflowy"
  public static let serviceName = "app.tryflowy.auth"

  public static func read(_ key: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String:       kSecClassGenericPassword,
      kSecAttrService as String: serviceName,
      kSecAttrAccount as String: key,
      kSecAttrAccessGroup as String: accessGroup,
      kSecMatchLimit as String:  kSecMatchLimitOne,
      kSecReturnData as String:  true
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data,
          let value = String(data: data, encoding: .utf8) else {
      return nil
    }
    return value
  }

  @discardableResult
  public static func write(_ key: String, value: String) -> Bool {
    guard let data = value.data(using: .utf8) else { return false }
    let query: [String: Any] = [
      kSecClass as String:       kSecClassGenericPassword,
      kSecAttrService as String: serviceName,
      kSecAttrAccount as String: key,
      kSecAttrAccessGroup as String: accessGroup
    ]
    SecItemDelete(query as CFDictionary)
    var attrs = query
    attrs[kSecValueData as String] = data
    attrs[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    return SecItemAdd(attrs as CFDictionary, nil) == errSecSuccess
  }

  @discardableResult
  public static func delete(_ key: String) -> Bool {
    let query: [String: Any] = [
      kSecClass as String:       kSecClassGenericPassword,
      kSecAttrService as String: serviceName,
      kSecAttrAccount as String: key,
      kSecAttrAccessGroup as String: accessGroup
    ]
    return SecItemDelete(query as CFDictionary) == errSecSuccess
  }
}
