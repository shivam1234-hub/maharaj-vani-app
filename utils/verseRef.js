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
 *   NOI 5 · Nectar of Instruction Text 4-6 · Upadesamrta Shloka 06
 *   NOD Chapter 16 · Nectar of Devotion 15-16 · NOD Introduction
 *   Brahma Samhita 5.29 · Sri Brahma Samhita Verse 29-31 · Bs 5.1
 *   Sri Isopanisad Mantra 5 · Ishopanishad 12-13 · Isopanisad Invocation
 *
 * A reference without a verse (SB 9.20, BG 2) is a chapter-level talk and is
 * returned with `from: null`.
 */

const BOOK_TOKENS = [
  // Order matters: the longer, unambiguous spellings first.
  ['SB', /(?:shrimad|srimad|sreemad)[\s-]*(?:bhagavatam|bhagawatam|bhagwatam|bhagvatam|bhagavata|bhagavat|bhagwat|bhagvat)|bhagavatam|bhagwatam|bhagvatam|s\.\s?b\.?|sb/y],
  ['BG', /(?:bhagavad|bhagavat|bhagawad|bhagwad|bhagwat|bhagvad|bhagvat)[\s-]*(?:gita|geeta|geetha)|b\.\s?g\.?|bg|gita|geeta/y],
  ['CC', /(?:sri[\s-]*)?(?:chaitanya|caitanya)[\s-]*(?:charitamrita|charitamrta|caritamrta|caritamrita|charitamrit|charitamrut)|c\.\s?c\.?|cc/y],
  // The smaller books. A bare abbreviation counts only where it cannot be
  // something else: "BS" is also Bhakti Sadachar / Bhakti Shastri, so it needs
  // the "5.N" form; "ISO" needs a mantra number.
  ['NOI', /nectar[\s-]*of[\s-]*instructions?|upadesh?amrit(?:a|am)?|upadesh?amrta|noi/y],
  ['NOD', /nectar[\s-]*of[\s-]*devotion|nod/y],
  ['BS', /brahma[\s-]*samhit(?:h?a)?|bs/y],
  ['ISO', /i[sś]h?op?a?ni[sś]h?a?da?|ishopanisha?d|iso/y],
];

/** Books with a single implicit chapter, by the chapter number Vedabase uses. */
const SINGLE_CHAPTER = { NOI: 1, ISO: 1, BS: 5 };
/** Verses per single-chapter book, to tell a verse from a session number. */
const BOOK_VERSES = { NOI: 11, ISO: 18, BS: 62 };
/** Nectar of Devotion chapters (its Introduction is chapter 0). */
const NOD_CHAPTERS = 51;

const LILAS = [
  ['adi', /(?:adi|aadi)(?:[\s-]*lila)?/y],
  ['madhya', /(?:madhya|madhy)(?:[\s-]*lila)?/y],
  ['antya', /(?:antya|anthya)(?:[\s-]*lila)?/y],
];
const LILA_BY_NUMBER = { 1: 'adi', 2: 'madhya', 3: 'antya' };

/** Words that may sit between a book name and its numbers. */
const FILLER = /(?:[\s.:#,_\-–|()]|as\s+it\s+is|canto|chapter|chap|ch\.?|verses?|vs\.?|texts?|txt|slokas?|shlokas?|mantras?|no(?![a-z])\.?)*/y;
/** Separator between the levels of one reference. */
const LEVEL_SEP = /(?:\s*[.:\-–_]\s*|\s+)(?:(?:canto|chapter|chap|ch\.?|verses?|vs\.?|texts?|slokas?|shlokas?|mantras?)\s*[.:\-–]?\s*)?/y;
/**
 * "Verse 7" / "Chapter 16" a few words after a smaller book's name, when
 * something else sits in between ("Nectar of Instruction Hindi - Verse 07",
 * "NOI Course 08 - Text 05"). Stops at the next book name.
 */
const LOOKAHEAD = 40;
const VERSE_WORD = /(?:verses?|texts?|slokas?|shlokas?|mantras?)[\s.:\-–]*(?=\d)/g;
const CHAPTER_WORD = /(?:chapters?|chap|ch\.?)[\s.:\-–]*(?=\d)/g;
/** First "Verse N"-style marker within reach of `pos`, as the position of its number. */
const ANOTHER_BOOK = /(?:^|[^a-z0-9])(?:sb|bg|cc|noi|nod|bs|iso|srimad|bhagav|gita|c(?:h)?aitanya|nectar|brahma|i[sś]h?op|upades)/;
function lookahead(s, pos, re) {
  let win = s.slice(pos, pos + LOOKAHEAD);
  const other = win.match(ANOTHER_BOOK);
  if (other) win = win.slice(0, other.index);
  re.lastIndex = 0;
  const m = re.exec(win);
  return m ? pos + m.index + m[0].length : null;
}
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
 * Every BG / SB / CC / NOI / NOD / BS / ISO reference in `text`, in order of
 * appearance. A Nectar of Devotion chapter range ("NOD 15-16") comes back as
 * one reference per chapter, since that book is indexed chapter by chapter.
 * @returns {{book:string, part:string, chapter:number, from:number|null, to:number|null}[]}
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
    /** The bare abbreviation, not the book's full name ("noi", not "nectar of instruction"). */
    const short = afterTok - i <= 3;
    let p = at(FILLER, s, afterTok)[1];
    let ref = null;
    let extra = [];

    if (book === 'NOI' || book === 'ISO' || book === 'BS') {
      const chapter = SINGLE_CHAPTER[book];
      const max = BOOK_VERSES[book];
      /** Verse (and range end) read at `q`; BS may spell out its chapter, "5.29". */
      const verseAt = (q) => {
        const r = readNumbers(s, q, book === 'BS' ? 2 : 1);
        if (!r) return null;
        if (book === 'BS' && r.nums.length === 2) {
          // "5.29" is chapter and verse; "29-31" is a range.
          return r.nums[0] === 5 ? { v: r.nums[1], end: r.end, pos: r.pos } : { v: r.nums[0], end: r.nums[1], pos: r.pos };
        }
        if (book === 'BS' && short) return null; // "BS 2017", "BS Camp 3"
        return { v: r.nums[0], end: r.end, pos: r.pos };
      };
      let hitV = verseAt(p);
      const invocation = book === 'ISO' && /^invocation/.test(s.slice(p));
      if ((!hitV || hitV.v < 1 || hitV.v > max) && !invocation && !(book === 'BS' && short)) {
        const q = lookahead(s, p, VERSE_WORD);
        const alt = q != null ? verseAt(q) : null;
        if (alt) hitV = alt;
      }
      if (hitV && hitV.v >= 1 && hitV.v <= max) {
        ref = { book, part: '', chapter, ...mkRange(hitV.v, hitV.end != null && hitV.end <= max ? hitV.end : null) };
        p = hitV.pos;
      } else if (invocation) {
        ref = { book, part: '', chapter, from: 0, to: 0 };
        p += 'invocation'.length;
      } else if (!hitV && !short) {
        // "Nectar of Instruction Seminar Day 1": a talk on the book as a whole.
        ref = { book, part: '', chapter, from: null, to: null };
      }
    } else if (book === 'NOD') {
      let r = readNumbers(s, p, 1);
      if (!r) {
        const q = lookahead(s, p, CHAPTER_WORD);
        if (q != null) r = readNumbers(s, q, 1);
      }
      if (r && r.nums[0] >= 1 && r.nums[0] <= NOD_CHAPTERS) {
        const from = r.nums[0];
        const { to } = mkRange(from, r.end != null && r.end <= NOD_CHAPTERS ? r.end : null);
        // A run of chapters is filed under each; a wide span is a course, not a class.
        const last = to - from <= 4 ? to : from;
        ref = { book, part: '', chapter: from, from: null, to: null };
        for (let c = from + 1; c <= last; c++) extra.push({ book, part: '', chapter: c, from: null, to: null });
        p = r.pos;
      } else if (/^introduction/.test(s.slice(p))) {
        ref = { book, part: '', chapter: 0, from: null, to: null };
        p += 'introduction'.length;
      }
    } else if (book === 'BG') {
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

    if (ref && (ref.chapter >= 1 || book === 'NOD')) out.push(ref, ...extra);
    i = Math.max(p, i + 1);
  }
  // "Nectar of Instruction NOI 01-02" names the book twice; the whole-book
  // reading is redundant next to the verse one.
  return out.filter(
    (r) =>
      r.from != null ||
      !SINGLE_CHAPTER[r.book] ||
      !out.some((o) => o.book === r.book && o.chapter === r.chapter && o.from != null),
  );
}

/** "SB/10/4" — the key a chapter is indexed under. */
function chapterKey(book, part, chapter) {
  return `${book}/${part}/${chapter}`;
}

/**
 * Human label: "BG 2.47", "SB 10.4.3-5", "CC Madhya 8.128", "SB 9.20",
 * "NOI 5", "NOD 16", "Bs 5.29", "Iso 7", "Iso Invocation".
 */
function formatRef(ref) {
  const nums = ref.from == null ? '' : `${ref.from}${ref.to != null && ref.to !== ref.from ? `-${ref.to}` : ''}`;
  const verse = nums ? `.${nums}` : '';
  if (ref.book === 'NOI') return nums ? `NOI ${nums}` : 'NOI';
  if (ref.book === 'ISO') return ref.from === 0 ? 'Iso Invocation' : nums ? `Iso ${nums}` : 'Iso';
  if (ref.book === 'BS') return `Bs ${ref.chapter}${verse}`;
  if (ref.book === 'NOD') return ref.chapter === 0 ? 'NOD Introduction' : `NOD ${ref.chapter}`;
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
