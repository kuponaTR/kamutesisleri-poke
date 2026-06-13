// Proaktif uyarı mantığı. Saf tespit fonksiyonları (birim test edilir) + çalışma
// zamanı kontrolleri (runUptimeCheck, runDailyAlerts).

/** Dünkü değer 7 günlük ortalamadan ±pct% saparsa anomali döndürür. */
export function detectTrafficAnomaly(yesterday: number, prior7Avg: number, pct: number) {
  if (!prior7Avg) return null;
  const changePct = Math.round(((yesterday - prior7Avg) / prior7Avg) * 100);
  if (Math.abs(changePct) < pct) return null;
  return {
    changePct,
    direction: changePct < 0 ? ("down" as const) : ("up" as const),
    yesterday,
    prior7Avg,
  };
}

/** Bu haftaki tıklama önceki haftaya göre pct%'den fazla düşerse drop döndürür. */
export function detectSeoDrop(thisWeek: number, prevWeek: number, pct: number) {
  if (!prevWeek) return null;
  const changePct = Math.round(((thisWeek - prevWeek) / prevWeek) * 100);
  if (changePct > -pct) return null;
  return { changePct, thisWeek, prevWeek };
}

/** Önceki duruma göre uptime geçişini belirler. null->up sessiz, ilk down uyarır. */
export function uptimeTransition(
  prev: "up" | "down" | null,
  currentOk: boolean
): "down" | "recovered" | null {
  const cur = currentOk ? "up" : "down";
  if (prev === cur) return null;
  if (cur === "down") return "down";
  if (prev === "down") return "recovered";
  return null; // null -> up: sessiz
}
