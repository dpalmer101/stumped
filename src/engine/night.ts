/** Floodlights are on from 8pm to 5am, the player's local time. */
export const isNight = (now: Date): boolean => now.getHours() >= 20 || now.getHours() < 5;
