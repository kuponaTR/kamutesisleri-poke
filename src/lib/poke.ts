import type { Env } from "../types";

/**
 * Poke inbound API'sine mesaj gönderir. POKE_API_KEY tanımlı değilse sessizce no-op (false).
 * Gönderim başarılıysa true döner.
 */
export async function sendPoke(env: Env, message: string): Promise<boolean> {
  if (!env.POKE_API_KEY) return false;
  const res = await fetch("https://poke.com/api/v1/inbound/api-message", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.POKE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });
  return res.ok;
}
