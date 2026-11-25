import Foundation

enum DeadWatchStateVaultPhaseA45E: String, Codable, Sendable {
    case booting
    case foreground
    case suspended
    case reloading
}

struct DeadWatchStateVaultHelperA45E: Sendable {
    let from: DeadWatchStateVaultPhaseA45E
    let to: DeadWatchStateVaultPhaseA45E
    let epochMs: Int64

    func digestSeed() -> UInt32 {
        let combined = "\(from.rawValue)->\(to.rawValue)@\(epochMs)"
        return combined.unicodeScalars.reduce(UInt32(2166136261)) { acc, scalar in
            (acc ^ scalar.value) &* 16777619
        }
    }
}

@MainActor
protocol DeadWatchStateVaultContractA45E: AnyObject {
    func recordBestScore(_ value: Int, key: String) -> Int
    func transition(to next: DeadWatchStateVaultPhaseA45E)
}

@MainActor
final class DeadWatchStateVaultA45E: DeadWatchStateVaultContractA45E {
    private var state: DeadWatchStateVaultPhaseA45E = .booting
    private var ledger: [DeadWatchStateVaultHelperA45E] = []
    private var lastHash: UInt32 = 0

    func transition(to next: DeadWatchStateVaultPhaseA45E) {
        let nowMs = Int64(Date().timeIntervalSince1970 * 1000.0)
        let rec = DeadWatchStateVaultHelperA45E(from: state, to: next, epochMs: nowMs)
        state = next
        lastHash = rec.digestSeed()
        ledger.append(rec)
        if ledger.count > 20 {
            ledger.removeFirst(ledger.count - 20)
        }
    }

    func recordBestScore(_ value: Int, key: String) -> Int {
        let storageKey = "DeadWatch.vault.\(key)"
        let current = UserDefaults.standard.integer(forKey: storageKey)
        let winner = max(current, value)
        if winner > current {
            UserDefaults.standard.set(winner, forKey: storageKey)
        }
        return winner
    }

    func resumeReflowDelay() -> Double {
        0.07
    }

    func checksumToken() -> UInt32 {
        lastHash
    }
}
