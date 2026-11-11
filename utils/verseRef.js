/**
 * Verse-reference parsing, shared by the build scripts (Node, CommonJS) and the
 * app (Metro bundles this file as-is; types live in verseRef.d.ts).
 *
 * One parser for both sides matters: the prebuilt verse index and the live
 * per-verse YouTube search must agree on what "SB 1.2.6" means, or a lecture
 * would show under one verse offline and another online.
 *
 * Handles the grammars actually found in filenames and video titles:
 *   BG 2.47 · BG-2_47 · BG_02-13-15 · Bhagavad Gita 2.47 · Gita verse 2.7
 *   SB 1.2.6 · SB_01-02-06 · SB-7 9 51-52 · SB1.6.10 · SB -10.46.41-43
 *   Srimad Bhagavatam 10.13.1-2 · SB Canto 10 Chapter 4 Verse 3 · SB 9.20
 *   CC Adi 1.1 · CC_Madhya_08-128 · Cc. Madhya 20.108-109 · CC 2.8.128
 *
 * A reference without a verse (SB 9.20, BG 2) is a chapter-level talk and is
 * returned with `from: null`.
 */

const BOOK_TOKENS = [
  // Order matters: the longer, unambiguous spellings first.
  ['SB', /(?:shrimad|srimad|sreemad)[\s-]*(?:bhagavatam|bhagawatam|bhagwatam|bhagvatam|bhagavata|bhagavat|bhagwat|bhagvat)|bhagavatam|bhagwatam|bhagvatam|s\.\s?b\.?|sb/y],
  ['BG', /(?:bhagavad|bhagavat|bhagawad|bhagwad|bhagwat|bhagvad|bhagvat)[\s-]*(?:gita|geeta|geetha)|b\.\s?g\.?|bg|gita|geeta/y],
  ['CC', /(?:sri[\s-]*)?(?:chaitanya|caitanya)[\s-]*(?:charitamrita|charitamrta|caritamrta|caritamrita|charitamrit|charitamrut)|c\.\s?c\.?|cc/y],
];

const LILAS = [
  ['adi', /(?:adi|aadi)(?:[\s-]*lila)?/y],
  ['madhya', /(?:madhya|madhy)(?:[\s-]*lila)?/y],
  ['antya', /(?:antya|anthya)(?:[\s-]*lila)?/y],
];
const LILA_BY_NUMBER = { 1: 'adi', 2: 'madhya', 3: 'antya' };

/** Words that may sit between a book name and its numbers. */
const FILLER = /(?:[\s.:#,_\-–|()]|as\s+it\s+is|canto|chapter|chap|ch\.?|verses?|vs\.?|texts?|txt|slokas?|shlokas?|no\.?)*/y;
/** Separator between the levels of one reference. */
const LEVEL_SEP = /(?:\s*[.:\-–_]\s*|\s+)(?:(?:canto|chapter|chap|ch\.?|verses?|vs\.?|texts?|slokas?|shlokas?)\s*)?/y;
/** Separator that marks a range end: 2.13-15, 2.13 to 15, 2.13 & 14. */
const RANGE_SEP = /\s*(?:[-–,&]|to|and)\s*/y;
const NUM = /(\d{1,3})(?!\d)/y;

function stripMarks(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/_/g, ' ')
    .toLowerCase();
}

/** Sticky-match `re` at `pos` in `s`; returns [match, newPos] or null. */
function at(re, s, pos) {
  re.lastIndex = pos;
  const m = re.exec(s);
  return m ? [m, re.lastIndex] : null;
}

/** Up to `max` level numbers starting at `pos`, then an optional range end. */
function readNumbers(s, pos, max) {
  const nums = [];
  let p = pos;
  let first = at(NUM, s, p);
  if (!first) return null;
  nums.push(+first[0][1]);
  p = first[1];
  while (nums.length < max) {
    const sep = at(LEVEL_SEP, s, p);
    if (!sep) break;
    const n = at(NUM, s, sep[1]);
    if (!n) break;
    nums.push(+n[0][1]);
    p = n[1];
  }
  // A range end must follow an explicit range separator — a bare space before
  // another number is usually a date ("SB 1.2.6 26-11-2011").
  let end = null;
  const rs = at(RANGE_SEP, s, p);
  if (rs) {
    const n = at(NUM, s, rs[1]);
    // "BG 4.9 - 12/29/2017": a number that runs on into /, . or -digits is
    // the start of a date, not a range end.
    if (n && !/^\s*[/.\-]\s*\d/.test(s.slice(n[1], n[1] + 4))) {
      end = +n[0][1];
      p = n[1];
    }
  }
  return { nums, end, pos: p };
}

function mkRange(from, end) {
  if (from == null) return { from: null, to: null };
  // Only a plausible span counts as a range; "2.47-18" (a date tail) does not.
  const to = end != null && end > from && end - from <= 60 ? end : from;
  return { from, to };
}

/**
 * Every BG / SB / CC reference in `text`, in order of appearance.
 * @returns {{book:'BG'|'SB'|'CC', part:string, chapter:number, from:number|null, to:number|null}[]}
 */
function parseVerseRefs(text) {
  if (!text) return [];
  const s = stripMarks(String(text));
  const out = [];
  let i = 0;
  while (i < s.length) {
    // Book tokens must start at a word boundary.
    if (i > 0 && /[a-z0-9]/.test(s[i - 1])) {
      i++;
      continue;
    }
    let hit = null;
    for (const [book, re] of BOOK_TOKENS) {
      const m = at(re, s, i);
      // ...and must not run into more letters ("bgm", "sbi"), though digits
      // may follow directly ("sb1.6.10").
      if (m && !/[a-z]/.test(s[m[1]] ?? '')) {
        hit = [book, m[1]];
        break;
      }
    }
    if (!hit) {
      i++;
      continue;
    }
    const [book, afterTok] = hit;
    let p = at(FILLER, s, afterTok)[1];
    let ref = null;

    if (book === 'BG') {
      const r = readNumbers(s, p, 2);
      if (r && r.nums[0] >= 1 && r.nums[0] <= 18) {
        const [ch, v] = r.nums;
        ref = { book, part: '', chapter: ch, ...mkRange(v ?? null, v != null ? r.end : null) };
        p = r.pos;
      }
    } else if (book === 'SB') {
      const r = readNumbers(s, p, 3);
      if (r && r.nums.length >= 2 && r.nums[0] >= 1 && r.nums[0] <= 12) {
        const [canto, ch, v] = r.nums;
        ref = { book, part: String(canto), chapter: ch, ...mkRange(v ?? null, v != null ? r.end : null) };
        p = r.pos;
      }
    } else {
      // CC: a lila name, or a leading 1/2/3 when three numbers follow.
      let lila = null;
      for (const [key, re] of LILAS) {
        const m = at(re, s, p);
        if (m && !/[a-z]/.test(s[m[1]] ?? '')) {
          lila = key;
          p = at(FILLER, s, m[1])[1];
          break;
        }
      }
      if (lila) {
        const r = readNumbers(s, p, 2);
        if (r) {
          const [ch, v] = r.nums;
          ref = { book, part: lila, chapter: ch, ...mkRange(v ?? null, v != null ? r.end : null) };
          p = r.pos;
        }
      } else {
        const r = readNumbers(s, p, 3);
        if (r && r.nums.length === 3 && LILA_BY_NUMBER[r.nums[0]]) {
          const [l, ch, v] = r.nums;
          ref = { book, part: LILA_BY_NUMBER[l], chapter: ch, ...mkRange(v, r.end) };
          p = r.pos;
        }
      }
    }

    if (ref && ref.chapter >= 1) out.push(ref);
    i = Math.max(p, i + 1);
  }
  return out;
}

/** "SB/10/4" — the key a chapter is indexed under. */
function chapterKey(book, part, chapter) {
  return `${book}/${part}/${chapter}`;
}

/** Human label: "BG 2.47", "SB 10.4.3-5", "CC Madhya 8.128", "SB 9.20". */
function formatRef(ref) {
  const verse = ref.from == null ? '' : `.${ref.from}${ref.to != null && ref.to !== ref.from ? `-${ref.to}` : ''}`;
  if (ref.book === 'BG') return `BG ${ref.chapter}${verse}`;
  if (ref.book === 'SB') return `SB ${ref.part}.${ref.chapter}${verse}`;
  const lila = ref.part ? ref.part[0].toUpperCase() + ref.part.slice(1) : '';
  return `CC ${lila} ${ref.chapter}${verse}`;
}

/** First verse number of a Vedabase verse entry: "16-18" -> 16. */
const entryStart = (entry) => parseInt(entry, 10);
/** Last verse number of a Vedabase verse entry: "16-18" -> 18. */
const entryEnd = (entry) => {
  const m = String(entry).match(/-(\d+)$/);
  return m ? +m[1] : parseInt(entry, 10);
};

module.exports = { parseVerseRefs, chapterKey, formatRef, entryStart, entryEnd };
