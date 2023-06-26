import { fetchGuarded } from "./bsky-fetch-guarded";

export async function appBskyFeedGetAuthorFeed(session, did) {
  if (session === null) {
    return null;
  }
  const url =
    "https://bsky.social/xrpc/app.bsky.feed.getAuthorFeed?" +
    new URLSearchParams({
      actor: did,
      limit: 30,
    });
  return await fetchGuarded(url, {
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
    },
  });
}
