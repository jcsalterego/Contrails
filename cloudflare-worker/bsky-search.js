import { fetchWithCounter } from "./bsky-auth";

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
    responses.push(await fetchWithCounter(url));
  }
  return responses.map((response) => {
    return { type: "search", response: response };
  });
}
