/** Floodlights are on from 9pm to 5am, the player's local time. */
export const isNight = (now: Date): boolean => now.getHours() >= 21 || now.getHours() < 5;

/** Ball one's greeting for the player's local time; none in the small hours. */
export function greeting(now: Date): string | undefined {
  const h = now.getHours();
  if (h < 5) return undefined;
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
