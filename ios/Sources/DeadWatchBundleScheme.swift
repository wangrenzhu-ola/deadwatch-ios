import Foundation
import WebKit

private struct DeadWatchAssetVaultReaderA45E {
    let baseDirectory: URL

    func loadAsset(requestPath: String) -> (Data, String)? {
        let rel = (requestPath.isEmpty || requestPath == "/") ? "index.html" : String(requestPath.drop(while: { $0 == "/" }))
        let target = baseDirectory.appendingPathComponent(rel).standardizedFileURL
        guard target.path.hasPrefix(baseDirectory.standardizedFileURL.path),
              let bytes = try? Data(contentsOf: target) else {
            return nil
        }
        return (bytes, Self.contentType(for: target.pathExtension.lowercased()))
    }

    private static func contentType(for ext: String) -> String {
        switch ext {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "application/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "svg": return "image/svg+xml"
        case "json": return "application/json; charset=utf-8"
        case "woff2": return "font/woff2"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        default: return "application/octet-stream"
        }
    }
}

final class DeadWatchSchemeA45E: NSObject, WKURLSchemeHandler {
    static let schemeName = "deadwatchapp"
    private let reader: DeadWatchAssetVaultReaderA45E

    init(bundle: Bundle = .main) {
        let root = bundle.resourceURL?.appendingPathComponent("DeadWatchPayload", isDirectory: true)
            ?? bundle.bundleURL
        self.reader = DeadWatchAssetVaultReaderA45E(baseDirectory: root)
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(NSError(domain: "DeadWatchScheme", code: 400))
            return
        }
        guard let (data, mime) = reader.loadAsset(requestPath: url.path) else {
            urlSchemeTask.didFailWithError(NSError(domain: "DeadWatchScheme", code: 404))
            return
        }
        let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mime,
                "Content-Length": "\(data.count)",
                "Cache-Control": "no-store",
                "Access-Control-Allow-Origin": "*",
            ]
        )!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {}
}
