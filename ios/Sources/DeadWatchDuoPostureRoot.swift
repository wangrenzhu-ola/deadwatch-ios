import SwiftUI

private struct DeadWatchPostureSolverA45E {
    let size: CGSize
    let divisions: [CGRect]
    let hingeAngle: Int
    let isPartiallyOpen: Bool

    func resolve() -> DeadWatchGeometryA45E {
        if let div = divisions.first, div.width > 0 || div.height > 0 {
            if div.width >= div.height {
                let top = max(140, Int(round(div.minY)))
                let bottom = min(Int(round(size.height)) - 120, max(top + 12, Int(round(div.maxY))))
                return DeadWatchGeometryA45E(
                    mode: "half-fold-horizontal",
                    hingeTop: top,
                    hingeBottom: bottom,
                    hingeLeft: 0,
                    hingeRight: 0,
                    hingeAngle: hingeAngle
                )
            }
            return DeadWatchGeometryA45E(
                mode: "half-fold-vertical",
                hingeTop: Int(round(size.height)),
                hingeBottom: Int(round(size.height)),
                hingeLeft: Int(round(div.minX)),
                hingeRight: Int(round(div.maxX)),
                hingeAngle: hingeAngle
            )
        }
        if isPartiallyOpen && size.height >= 600 && size.width >= 600 {
            let mid = Int(round(size.height * 0.5))
            return DeadWatchGeometryA45E(
                mode: "half-fold-horizontal",
                hingeTop: mid - 10,
                hingeBottom: mid + 10,
                hingeLeft: 0,
                hingeRight: 0,
                hingeAngle: hingeAngle
            )
        }
        let isUnfolded = size.width >= 680 && size.height >= 600
        return DeadWatchGeometryA45E(
            mode: isUnfolded ? "unfolded" : "compact",
            hingeTop: Int(round(size.height)),
            hingeBottom: Int(round(size.height)),
            hingeLeft: 0,
            hingeRight: 0,
            hingeAngle: hingeAngle
        )
    }
}

struct DeadWatchShellRootA45E: View {
    var body: some View {
        if #available(iOS 27.1, *) {
            DeadWatchFoldSceneA45E()
        } else {
            DeadWatchFlatSceneA45E()
        }
    }
}

@available(iOS 27.1, *)
private struct DeadWatchFoldSceneA45E: View {
    @State private var hingeAngleDegrees: Int = 180
    @State private var isPartiallyOpen: Bool = false

    var body: some View {
        GeometryReader { proxy in
            let divisions = proxy.reservedRegions(kind: .division).filter(\.isActive)
            let payload = DeadWatchPostureSolverA45E(size: proxy.size, divisions: divisions.map(\.frame), hingeAngle: hingeAngleDegrees, isPartiallyOpen: isPartiallyOpen).resolve()
            DeadWatchCanvasViewA45E(posture: payload)
                .ignoresSafeArea()
        }
        .ignoresSafeArea()
        .onHingeChange { _, context in
            if let hinge = context.hinge {
                hingeAngleDegrees = Int(round(hinge.angle.degrees))
                isPartiallyOpen = (hinge.status == .partiallyOpen)
            } else {
                hingeAngleDegrees = 180
                isPartiallyOpen = false
            }
        }
        .statusBarHidden(true)
    }
}

private struct DeadWatchFlatSceneA45E: View {
    var body: some View {
        GeometryReader { proxy in
            let isWide = proxy.size.width >= 680 && proxy.size.height >= 600
            let payload = DeadWatchGeometryA45E(
                mode: isWide ? "unfolded" : "compact",
                hingeTop: Int(round(proxy.size.height)),
                hingeBottom: Int(round(proxy.size.height)),
                hingeLeft: 0,
                hingeRight: 0,
                hingeAngle: 180
            )
            DeadWatchCanvasViewA45E(posture: payload)
                .ignoresSafeArea()
        }
        .ignoresSafeArea()
        .statusBarHidden(true)
    }
}
