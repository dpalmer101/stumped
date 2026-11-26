/**
 * New features, oldest first. Ids are stored once seen, so never change or reuse one. Only for
 * changes to how the game is played or features players could miss: see REQUIREMENTS.md §10a.
 */
export interface NewsItem {
  id: string;
  title: string;
  /** HTML. */
  body: string;
}

export const NEWS: readonly NewsItem[] = [
  {
    id: "deliveries",
    title: "Deliveries",
    body: "Every ball now has a delivery. A <b>fast ball</b> gives you 15 seconds, a <b>slower ball</b> 25. Anything else? Same 20 seconds.",
  },
];

/** A player back after a long break sees only the latest this many. */
export const MAX_NEWS = 5;

/** What the player hasn't seen yet, newest first. */
export function unseenNews(
  seen: readonly string[],
  news: readonly NewsItem[] = NEWS,
  max = MAX_NEWS,
): NewsItem[] {
  return news
    .filter((n) => !seen.includes(n.id))
    .reverse()
    .slice(0, max);
}

export const newsIds = (news: readonly NewsItem[] = NEWS): string[] => news.map((n) => n.id);
