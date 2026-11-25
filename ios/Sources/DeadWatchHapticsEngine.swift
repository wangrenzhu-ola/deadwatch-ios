import CoreHaptics
import UIKit

@MainActor
final class DeadWatchPulseA45E {
    private var engine: CHHapticEngine?
    private let generators: [UIImpactFeedbackGenerator.FeedbackStyle: UIImpactFeedbackGenerator] = [
        .light: UIImpactFeedbackGenerator(style: .light),
        .medium: UIImpactFeedbackGenerator(style: .medium),
        .heavy: UIImpactFeedbackGenerator(style: .heavy),
    ]

    init() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        engine = try? CHHapticEngine()
        try? engine?.start()
    }

    func trigger(kind: String, intensity: Double) {
        let clamped = Float(max(0.2, min(1.0, intensity)))
        if let engine {
            let events: [CHHapticEvent]
            switch kind {
            case "perfect_dodge", "shield_break": events = makeDualWaveEvents()
            case "slam", "heavy", "hurt": events = makeHeavyPulseEvents(clamped)
            default: events = makeCrispTapEvents(clamped)
            }
            do {
                let pattern = try CHHapticPattern(events: events, parameters: [])
                let player = try engine.makePlayer(with: pattern)
                try engine.start()
                try player.start(atTime: 0)
                return
            } catch {
                // Fall back to UIImpactFeedbackGenerator below.
            }
        }
        dispatchFallback(kind: kind, clamped: clamped)
    }

    private func makeDualWaveEvents() -> [CHHapticEvent] {
        [
            CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.95),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.9),
                ],
                relativeTime: 0
            ),
            CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.8),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
                ],
                relativeTime: 0.05,
                duration: 0.12
            ),
        ]
    }

    private func makeHeavyPulseEvents(_ clamped: Float) -> [CHHapticEvent] {
        [
            CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: clamped),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.45),
                ],
                relativeTime: 0,
                duration: 0.09
            ),
        ]
    }

    private func makeCrispTapEvents(_ clamped: Float) -> [CHHapticEvent] {
        [
            CHHapticEvent(
                eventType: .hapticTransient,
                parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: clamped * 0.75),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.7),
                ],
                relativeTime: 0
            ),
        ]
    }

    private func dispatchFallback(kind: String, clamped: Float) {
        let style: UIImpactFeedbackGenerator.FeedbackStyle
        switch kind {
        case "slam", "heavy", "shield_break", "hurt": style = .heavy
        case "perfect_dodge", "hit", "double_jump": style = .medium
        default: style = .light
        }
        generators[style]?.impactOccurred(intensity: CGFloat(clamped))
    }
}
