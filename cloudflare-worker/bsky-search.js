import { fetchGuarded } from "./bsky-fetch-guarded";

export async function searchPosts(searchTerms) {
  let responses = [];
  let urls = [];
  for (let searchTerm of searchTerms) {
    let url =
      "https://search.bsky.social/search/posts?" +
      new URLSearchParams({
        q: searchTerm,
      });
    urls.push(url);
  }
  for (let url of urls) {
    responses.push(await fetchGuarded(url));
  }
  return responses.map((response) => {
    return { type: "search", response: response };
  });
}
