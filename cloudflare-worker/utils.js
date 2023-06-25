export function jsonResponse(obj) {
  let response = new Response(JSON.stringify(obj));
  response.headers.set("Content-Type", "application/json");
  return response;
}
