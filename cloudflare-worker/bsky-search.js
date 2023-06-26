import { fetchGuarded } from "./bsky-fetch-guarded";

export async function searchPost(searchTerm) {
  let url =
    "https://search.bsky.social/search/posts?" +
    new URLSearchParams({
      q: searchTerm,
    });
  let response = await fetchGuarded(url);
  if (response !== null) {
    return response.json();
  } else {
    return null;
  }
}
