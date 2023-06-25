import { jsonResponse } from "./utils";

export async function feedGeneratorWellKnown(request) {
  let host = request.headers.get("Host");
  let didJson = {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: `did:web:${host}`,
    alsoKnownAs: [],
    authentication: null,
    verificationMethod: [],
    service: [
      {
        id: "#bsky_fg",
        type: "BskyFeedGenerator",
        serviceEndpoint: `https://${host}`,
      },
    ],
  };
  return jsonResponse(didJson);
}
