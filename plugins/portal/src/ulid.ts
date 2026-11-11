/**
 * ULIDs for event ids: 48 bits of Unix milliseconds then 80 random bits, Crockford base32.
 * The sandbox has no `crypto`, so randomness is `Math.random`; ids only need to be unique per
 * server, and the portal dedupes on them. Ids made in the same millisecond increment the random
 * part, so they still sort in creation order.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;

export type UlidFactory = (nowMs: number) => string;

export function ulidFactory(random: () => number = Math.random): UlidFactory {
  let lastTime = -1;
  let digits: number[] = [];

  return (nowMs: number): string => {
    const time = Math.max(0, Math.floor(nowMs));
    if (time <= lastTime) {
      // Same (or an earlier, clock stepped back) millisecond: bump the random part. If it
      // overflows, borrow the next millisecond so ids keep increasing.
      let i = RANDOM_LEN - 1;
      for (; i >= 0; i--) {
        if (digits[i]! < 31) {
          digits[i]!++;
          break;
        }
        digits[i] = 0;
      }
      if (i < 0) lastTime++;
    } else {
      lastTime = time;
      digits = Array.from({ length: RANDOM_LEN }, () => Math.floor(random() * 32) & 31);
    }
    return encodeTime(lastTime) + digits.map((d) => ALPHABET[d]).join("");
  };
}

function encodeTime(ms: number): string {
  let out = "";
  let t = ms;
  for (let i = 0; i < TIME_LEN; i++) {
    out = ALPHABET[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}
