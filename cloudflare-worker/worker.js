
// let's be nice
const MAX_SEARCH_TERMS = 5;

const DID_JSON = {
  "@context": ["https://www.w3.org/ns/did/v1"],
  id: "",
  alsoKnownAs: [],
  authentication: null,
  verificationMethod: [],
  service: [
    {
      id: "#bsky_fg",
      type: "BskyFeedGenerator",
      serviceEndpoint: "",
    },
  ],
};

function cloneObj(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function wellKnown(request) {
  let host = request.headers.get("Host");
  let didJson = cloneObj(DID_JSON);
  didJson.id = `did:web:${host}`;
  didJson.service[0].serviceEndpoint = `https://${host}`;
  return jsonResponse(didJson);
}

function jsonResponse(obj) {
  let response = new Response(JSON.stringify(obj));
  response.headers.set("Content-Type", "application/json");
  return response;
}

async function getFeedSkeleton(request) {
  let searchTerms = CONFIG.searchTerms.slice(0, MAX_SEARCH_TERMS);
  let responsePromises = [];

  for (let searchTerm of searchTerms) {
    let url = "https://search.bsky.social/search/posts?"
        + new URLSearchParams({
          q: searchTerm,
        });
    responsePromises.push(fetch(url));
  }
  let responses = await Promise.all(responsePromises);

  let allItems = [];
  for (let response of responses) {
    let items = await response.json();
    allItems = allItems.concat(items);
  }

  let timestampURLs = [];
  for (let item of allItems) {
    let did = item.user.did;
    let rkey = item.tid.split("/").slice(-1)[0];
    let timestamp = item.post.createdAt;
    let atURL = `at://${did}/app.bsky.feed.post/${rkey}`;
    timestampURLs.push([timestamp, atURL]);
  }

  timestampURLs = timestampURLs.toSorted((b, a) => (a === b) ? 0 : (a < b) ? -1 : 1);

  let rv = { feed: [] };
  for (let timestampUrl of timestampURLs) {
    let atUrl = timestampUrl[1];
    rv.feed.push({ post : atUrl });
  }

  return jsonResponse(rv);
}

export default {
  async fetch(request, env, ctx) {
    console.clear();
    // lame-o routing
    if (request.url.endsWith("/.well-known/did.json")) {
      return await wellKnown(request);
    }
    if (request.url.indexOf("/xrpc/app.bsky.feed.getFeedSkeleton") > -1) {
      return await getFeedSkeleton(request);
    }
    return new Response(`{}`);
  },
};

// CONFIG

const CONFIG = {
  "recordName": "emotional-suppo",
  "displayName": "Emotional Support Pets",
  "description": "Cute animals feed",
  "searchTerms": [
    "cats",
    "dogs",
    "penguins",
    "red pandas",
    "quokkas"
  ],
  "avatar": "avatar.png"
}
