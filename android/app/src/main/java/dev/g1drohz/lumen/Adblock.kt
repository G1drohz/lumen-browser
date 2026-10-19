package dev.g1drohz.lumen

import android.content.Context

/** Блокировщик по доменам: список тот же, что и на десктопе (shared/blocklist.txt). */
object Adblock {
    private var hosts: Set<String> = emptySet()

    fun load(ctx: Context) {
        hosts = ctx.assets.open("blocklist.txt").bufferedReader().useLines { seq ->
            seq.map { line -> line.trim().lowercase() }
                .filter { line -> line.isNotEmpty() && !line.startsWith("#") }
                .toSet()
        }
    }

    /** Совпадает с записью списка или является её поддоменом. */
    fun isBlocked(host: String?): Boolean {
        var h = host?.lowercase() ?: return false
        while (true) {
            if (h in hosts) return true
            val i = h.indexOf('.')
            if (i < 0) return false
            h = h.substring(i + 1)
        }
    }
}
