/** Floodlights are on from 9pm to 5am, the player's local time. */
export const isNight = (now: Date): boolean => now.getHours() >= 21 || now.getHours() < 5;
