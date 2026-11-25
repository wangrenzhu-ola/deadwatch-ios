import SwiftUI
import UIKit
import WebKit

struct DeadWatchGeometryA45E: Equatable {
    var mode: String
    var hingeTop: Int
    var hingeBottom: Int
    var hingeLeft: Int
    var hingeRight: Int
    var hingeAngle: Int

    var jsCall: String {
        "window.__duo && window.__duo.setPosture({mode:'\(mode)',hingeTop:\(hingeTop),hingeBottom:\(hingeBottom),hingeLeft:\(hingeLeft),hingeRight:\(hingeRight),hingeAngle:\(hingeAngle)});"
    }
}

@MainActor
final class DeadWatchRelayA45E: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    private let haptics = DeadWatchPulseA45E()
    private let mediaBridge = DeadWatchCaptureA45E()
    private let hostCoordinator = DeadWatchStateVaultA45E()
    weak var webView: WKWebView?
    private var pendingPosture: DeadWatchGeometryA45E?
    private var didFinishLoad = false
    fileprivate var didStartInitialLoad = false

    override init() {
        super.init()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleWillResignActive(_:)),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleDidBecomeActive(_:)),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleWillResignActive(_ notification: Notification) {
        hostCoordinator.transition(to: .suspended)
        guard didFinishLoad, let webView else { return }
        webView.evaluateJavaScript("window.__duoLifecycle && window.__duoLifecycle('pause');", completionHandler: nil)
    }

    @objc private func handleDidBecomeActive(_ notification: Notification) {
        hostCoordinator.transition(to: .foreground)
        guard didFinishLoad, let webView else { return }
        webView.evaluateJavaScript("window.__duoLifecycle && window.__duoLifecycle('resume');", completionHandler: nil)
        let delay = hostCoordinator.resumeReflowDelay()
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, let wv = self.webView else { return }
            wv.evaluateJavaScript("window.dispatchEvent(new Event('resize'));", completionHandler: nil)
            if let payload = self.pendingPosture {
                wv.evaluateJavaScript(payload.jsCall, completionHandler: nil)
            }
            self.mediaBridge.reportBridgeStatus(in: wv, trigger: "resume")
        }
    }

    func startInitialLoadIfReady(_ webView: WKWebView) {
        guard !didStartInitialLoad, webView.bounds.width >= 60, webView.bounds.height >= 60 else { return }
        didStartInitialLoad = true
        if let startURL = URL(string: "\(DeadWatchSchemeA45E.schemeName)://local/index.html") {
            webView.load(URLRequest(url: startURL))
        }
    }

    func pushPosture(_ payload: DeadWatchGeometryA45E) {
        if pendingPosture == payload && didFinishLoad { return }
        pendingPosture = payload
        guard didFinishLoad, let webView else { return }
        webView.evaluateJavaScript(payload.jsCall, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        didFinishLoad = true
        hostCoordinator.transition(to: .foreground)
        if let payload = pendingPosture {
            webView.evaluateJavaScript(payload.jsCall, completionHandler: nil)
        }
        mediaBridge.reportBridgeStatus(in: webView, trigger: "didFinish")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            webView.evaluateJavaScript("window.dispatchEvent(new Event('resize'));", completionHandler: nil)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        NSLog("[DeadWatchWebView] navigation failed: %@", error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        NSLog("[DeadWatchWebView] provisional navigation failed: %@", error.localizedDescription)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        NSLog("[DeadWatchWebView] WebContent process terminated; recovering offline bundle")
        hostCoordinator.transition(to: .reloading)
        didFinishLoad = false
        didStartInitialLoad = false
        startInitialLoadIfReady(webView)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let msgType = body["type"] as? String else { return }
        if msgType == "haptic" {
            let kind = body["kind"] as? String ?? "slash"
            let intensity = body["intensity"] as? Double ?? 0.8
            haptics.trigger(kind: kind, intensity: intensity)
        } else if msgType == "progress" {
            let best = body["best"] as? Int ?? 0
            _ = hostCoordinator.recordBestScore(best, key: "bestScore")
        } else if msgType == "js_error" {
            let detail = body["detail"] as? String ?? "unknown"
            NSLog("[DeadWatchJS] error: %@", detail)
        } else if msgType == "mic_toggle" {
            if let wv = webView {
                mediaBridge.toggleVoiceSurge(in: wv)
            }
        } else if msgType == "mic_stop" {
            mediaBridge.stopVoiceSurge(in: webView)
        } else if msgType == "photo_save" {
            if let wv = webView {
                let subtitle = body["subtitle"] as? String ?? ""
                mediaBridge.saveBattleSnapshot(from: wv, subtitle: subtitle)
            }
        } else if msgType == "photo_pick" {
            if let wv = webView {
                mediaBridge.pickCommanderAvatar(from: wv)
            }
        } else if msgType == "camera_snap" {
            if let wv = webView {
                mediaBridge.captureCommanderCamera(from: wv)
            }
        } else if msgType == "bridge_status" {
            if let wv = webView {
                mediaBridge.reportBridgeStatus(in: wv, trigger: "request")
            }
        }
    }
}

final class DeadWatchViewportA45E: WKWebView {
    var onLayoutNonZero: ((DeadWatchViewportA45E) -> Void)?

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.width >= 60 && bounds.height >= 60 {
            onLayoutNonZero?(self)
        }
    }
}

struct DeadWatchCanvasViewA45E: UIViewRepresentable {
    let posture: DeadWatchGeometryA45E

    func makeCoordinator() -> DeadWatchRelayA45E {
        DeadWatchRelayA45E()
    }

    func makeUIView(context: Context) -> DeadWatchViewportA45E {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.setURLSchemeHandler(DeadWatchSchemeA45E(), forURLScheme: DeadWatchSchemeA45E.schemeName)
        config.userContentController.add(context.coordinator, name: "deadWatchNativeBridge")
        let errScript = WKUserScript(
            source: "window.addEventListener('error', e => { try { window.webkit?.messageHandlers?.deadWatchNativeBridge?.postMessage({type:'js_error', detail: String(e.message || e)}); } catch {} }); window.addEventListener('unhandledrejection', e => { try { window.webkit?.messageHandlers?.deadWatchNativeBridge?.postMessage({type:'js_error', detail: 'promise:' + String(e.reason || e)}); } catch {} });",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(errScript)

        let wv = DeadWatchViewportA45E(frame: .zero, configuration: config)
        wv.isOpaque = true
        wv.backgroundColor = UIColor(red: 0.027, green: 0.043, blue: 0.086, alpha: 1)
        wv.scrollView.isScrollEnabled = false
        wv.scrollView.bounces = false
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.navigationDelegate = context.coordinator
        context.coordinator.webView = wv
        context.coordinator.pushPosture(posture)
        wv.onLayoutNonZero = { [weak coord = context.coordinator] view in
            coord?.startInitialLoadIfReady(view)
        }
        return wv
    }

    func updateUIView(_ uiView: DeadWatchViewportA45E, context: Context) {
        context.coordinator.pushPosture(posture)
        context.coordinator.startInitialLoadIfReady(uiView)
    }
}
