import { fetchWithCounter } from "./bsky-auth";

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
  return await fetchWithCounter(url, {
    headers: {
      Authorization: `Bearer ${session.accessJwt}`,
    },
  });
}
