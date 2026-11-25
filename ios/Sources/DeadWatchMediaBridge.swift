@preconcurrency import AVFoundation
import Foundation
import Photos
import PhotosUI
import UIKit
import WebKit

private struct DeadWatchAudioMeterA45E {
    static func normalizedLevel(samples: UnsafePointer<Float>, count: Int) -> Double {
        var sum: Float = 0
        for i in 0..<count {
            let v = samples[i]
            sum += v * v
        }
        let rms = sqrt(sum / Float(max(1, count)))
        return min(1.0, Double(rms) * 8.0)
    }
}

@MainActor
final class DeadWatchCaptureA45E: NSObject, PHPickerViewControllerDelegate, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    private let audioEngine = AVAudioEngine()
    private var micActive = false
    private var lastEmit: CFAbsoluteTime = 0
    private weak var boundWebView: WKWebView?
    private let appTitle = "DeadWatch"
    private let bridgeName = "deadWatchNativeBridge"

    func reportBridgeStatus(in webView: WKWebView, trigger: String = "ready") {
        boundWebView = webView
        let safeTrigger = trigger.replacingOccurrences(of: "'", with: "")
        let camAvail = UIImagePickerController.isSourceTypeAvailable(.camera) ? "true" : "false"
        let micState = micActive ? "true" : "false"
        emitJS("window.__duoMedia && window.__duoMedia.onBridgeStatus && window.__duoMedia.onBridgeStatus({ready:true,bridge:'\(bridgeName)',topology:'state_machine_vault',micActive:\(micState),cameraAvailable:\(camAvail),trigger:'\(safeTrigger)'});")
    }

    func toggleVoiceSurge(in webView: WKWebView) {
        boundWebView = webView
        if micActive {
            stopVoiceSurge(in: webView)
            return
        }
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            Task { @MainActor in
                guard let self else { return }
                guard granted else {
                    self.emitJS("window.__duoMedia && window.__duoMedia.onMicState && window.__duoMedia.onMicState(false, 'denied');")
                    return
                }
                self.startAudioTap(in: webView)
            }
        }
    }

    func stopVoiceSurge(in webView: WKWebView? = nil) {
        if let wv = webView ?? boundWebView {
            boundWebView = wv
        }
        if micActive {
            audioEngine.inputNode.removeTap(onBus: 0)
            audioEngine.stop()
            micActive = false
        }
        emitJS("window.__duoMedia && window.__duoMedia.onMicState && window.__duoMedia.onMicState(false, 'stopped');")
    }

    private func startAudioTap(in webView: WKWebView) {
        boundWebView = webView
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.mixWithOthers, .defaultToSpeaker])
            try session.setActive(true)
            let input = audioEngine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.channelCount > 0, format.sampleRate > 0 else {
                emitJS("window.__duoMedia && window.__duoMedia.onMicState && window.__duoMedia.onMicState(true, 'simulated');")
                return
            }
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                guard let ch = buffer.floatChannelData?[0] else { return }
                let n = Int(buffer.frameLength)
                if n <= 0 { return }
                let level = DeadWatchAudioMeterA45E.normalizedLevel(samples: ch, count: n)
                let now = CFAbsoluteTimeGetCurrent()
                Task { @MainActor in
                    guard let self, now - self.lastEmit >= 0.12 else { return }
                    self.lastEmit = now
                    let burst = level >= 0.28 ? "true" : "false"
                    self.emitJS("window.__duoMedia && window.__duoMedia.onMicLevel && window.__duoMedia.onMicLevel(\(String(format: "%.3f", level)), \(burst));")
                }
            }
            audioEngine.prepare()
            try audioEngine.start()
            micActive = true
            emitJS("window.__duoMedia && window.__duoMedia.onMicState && window.__duoMedia.onMicState(true, 'listening');")
        } catch {
            NSLog("[DeadWatchMedia] mic start failed: %@", error.localizedDescription)
            emitJS("window.__duoMedia && window.__duoMedia.onMicState && window.__duoMedia.onMicState(false, 'error');")
        }
    }

    func saveBattleSnapshot(from webView: WKWebView, subtitle: String) {
        boundWebView = webView
        let safeSub = subtitle.isEmpty ? "BATTLE RECORD" : subtitle
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            Task { @MainActor in
                guard let self else { return }
                guard status == .authorized || status == .limited else {
                    self.emitJS("window.__duoMedia && window.__duoMedia.onPhotoSaved && window.__duoMedia.onPhotoSaved(false, 'Photo permission denied');")
                    return
                }
                webView.takeSnapshot(with: nil) { image, err in
                    guard let snap = image, err == nil else {
                        Task { @MainActor in
                            self.emitJS("window.__duoMedia && window.__duoMedia.onPhotoSaved && window.__duoMedia.onPhotoSaved(false, 'Snapshot capture failed');")
                        }
                        return
                    }
                    let poster = Self.renderPoster(snap: snap, title: self.appTitle, subtitle: safeSub)
                    PHPhotoLibrary.shared().performChanges({
                        PHAssetChangeRequest.creationRequestForAsset(from: poster)
                    }) { ok, saveErr in
                        Task { @MainActor in
                            if ok {
                                self.emitJS("window.__duoMedia && window.__duoMedia.onPhotoSaved && window.__duoMedia.onPhotoSaved(true, 'Saved battle poster to Photos');")
                            } else {
                                let msg = saveErr?.localizedDescription ?? "Save error"
                                NSLog("[DeadWatchMedia] save photo error: %@", msg)
                                self.emitJS("window.__duoMedia && window.__duoMedia.onPhotoSaved && window.__duoMedia.onPhotoSaved(false, 'Photo save failed');")
                            }
                        }
                    }
                }
            }
        }
    }

    func pickCommanderAvatar(from webView: WKWebView) {
        boundWebView = webView
        var cfg = PHPickerConfiguration(photoLibrary: .shared())
        cfg.filter = .images
        cfg.selectionLimit = 1
        let picker = PHPickerViewController(configuration: cfg)
        picker.delegate = self
        presentController(picker)
    }

    func captureCommanderCamera(from webView: WKWebView) {
        boundWebView = webView
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            Task { @MainActor in
                guard let self else { return }
                guard granted else {
                    self.emitJS("window.__duoMedia && window.__duoMedia.onPhotoSaved && window.__duoMedia.onPhotoSaved(false, 'Camera permission denied');")
                    return
                }
                guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                    // Simulator hardware has no physical camera sensor: route cleanly to Photo Picker after video auth check.
                    self.pickCommanderAvatar(from: webView)
                    return
                }
                let cam = UIImagePickerController()
                cam.sourceType = .camera
                cam.cameraDevice = .front
                cam.delegate = self
                self.presentController(cam)
            }
        }
    }

    private func presentController(_ vc: UIViewController) {
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
           let root = scene.windows.first(where: \.isKeyWindow)?.rootViewController ?? scene.windows.first?.rootViewController {
            var presenter = root
            while let next = presenter.presentedViewController { presenter = next }
            presenter.present(vc, animated: true)
        }
    }

    nonisolated func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        Task { @MainActor in picker.dismiss(animated: true) }
    }

    nonisolated func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let img = (info[.editedImage] ?? info[.originalImage]) as? UIImage
        Task { @MainActor in
            picker.dismiss(animated: true)
            guard let img else { return }
            let thumb = Self.resizeAvatar(img, side: 128)
            guard let pngData = thumb.pngData() else { return }
            let b64 = pngData.base64EncodedString()
            self.emitJS("window.__duoMedia && window.__duoMedia.onPhotoPicked && window.__duoMedia.onPhotoPicked('data:image/png;base64,\(b64)');")
        }
    }

    nonisolated func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        Task { @MainActor in
            picker.dismiss(animated: true)
            guard let provider = results.first?.itemProvider,
                  provider.canLoadObject(ofClass: UIImage.self) else { return }
            provider.loadObject(ofClass: UIImage.self) { [weak self] obj, _ in
                guard let img = obj as? UIImage else { return }
                let thumb = Self.resizeAvatar(img, side: 128)
                guard let pngData = thumb.pngData() else { return }
                let b64 = pngData.base64EncodedString()
                Task { @MainActor in
                    self?.emitJS("window.__duoMedia && window.__duoMedia.onPhotoPicked && window.__duoMedia.onPhotoPicked('data:image/png;base64,\(b64)');")
                }
            }
        }
    }

    private static func resizeAvatar(_ src: UIImage, side: CGFloat) -> UIImage {
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: fmt).image { _ in
            src.draw(in: CGRect(x: 0, y: 0, width: side, height: side))
        }
    }

    private static func renderPoster(snap: UIImage, title: String, subtitle: String) -> UIImage {
        let size = snap.size
        let footerH: CGFloat = 72
        let fullSize = CGSize(width: size.width, height: size.height + footerH)
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = snap.scale
        return UIGraphicsImageRenderer(size: fullSize, format: fmt).image { ctx in
            snap.draw(at: .zero)
            UIColor(red: 0.03, green: 0.05, blue: 0.11, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: size.height, width: fullSize.width, height: footerH))
            let titleAttr: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 20, weight: .black),
                .foregroundColor: UIColor(red: 0.98, green: 0.80, blue: 0.15, alpha: 1),
            ]
            let subAttr: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 13, weight: .bold),
                .foregroundColor: UIColor.white.withAlphaComponent(0.86),
            ]
            (title.uppercased() as NSString).draw(at: CGPoint(x: 20, y: size.height + 12), withAttributes: titleAttr)
            (subtitle.uppercased() as NSString).draw(at: CGPoint(x: 20, y: size.height + 40), withAttributes: subAttr)
        }
    }

    private func emitJS(_ js: String) {
        boundWebView?.evaluateJavaScript(js, completionHandler: nil)
    }
}
