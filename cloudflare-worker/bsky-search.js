import { fetchGuarded } from "./bsky-fetch-guarded";

export async function searchPost(searchTerm, params) {
  let urlParams = {
    q: searchTerm,
  };
  if (params.count !== undefined) {
    urlParams.count = params.count;
  }
  if (params.offset !== undefined) {
    urlParams.offset = params.offset;
  }
  let url =
    "https://search.bsky.social/search/posts?" + new URLSearchParams(urlParams);
  let response = await fetchGuarded(url);
  if (response !== null) {
    return response.json();
  } else {
    return null;
  }
}
