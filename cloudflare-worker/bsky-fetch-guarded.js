export let fetchCount = 0;
const MAX_FETCHES = 7;

export async function fetchGuarded() {
  fetchCount++;
  if (fetchCount > MAX_FETCHES) {
    console.log(`NOT fetching ${fetchCount}`);
    return null;
  } else {
    console.log(`fetch ${fetchCount}`);
    return await fetch(...arguments);
  }
}
