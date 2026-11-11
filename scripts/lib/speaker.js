/**
 * Who gave a class on audio.iskcondesiretree.com, from where the file sits or
 * what it is named. Shared by build-verse-others.js and build-song-index.js.
 *
 *   tier 1 = another Maharaja (ISKCON Swami)
 *   tier 2 = Srila Prabhupada
 *   tier 3 = other Prabhujis and Matajis
 */

const AUDIO_EXT = /\.(mp3|m4a|wma|ogg|wav|aac)$/i;

const tidy = (s) => s.replace(/_/g, ' ').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** "Kesi Daman Pr" -> "Kesi Daman Prabhu", "Bhakti Vikas Sw" -> "Bhakti Vikas Swami". */
function honorific(name, title) {
  if (/^(swami|sw|goswami|maharaja?)$/i.test(title)) return `${name} ${/goswami/i.test(title) ? 'Goswami' : 'Swami'}`;
  if (/^(mataji|mtj|devi\s*dasi)$/i.test(title)) return `${name} Mataji`;
  return `${name} Prabhu`;
}

/** Words that sit just before an honorific in a title but are not part of a name. */
const NOT_NAME = /^(by|hg|hh|his|her|grace|holiness|sri|srila|class|lecture|day|part|and|with|the|of)$/i;

/**
 * Who gave the class, from where the file sits or what it is named.
 * Returns null when the speaker can't be told — such files are skipped rather
 * than guessed at.
 */
function speakerOf(p) {
  if (p.startsWith('/01_-_Srila_Prabhupada/')) return { speaker: 'Srila Prabhupada', tier: 2 };
  let m = p.match(/^\/02_-_ISKCON_Swamis\/[^/]+\/His_Holiness_([^/]+)\//);
  if (m) return { speaker: tidy(m[1]), tier: 1 };
  m = p.match(/^\/03_-_ISKCON_Prabhujis\/[^/]+\/His_Grace_([^/]+)\//) || p.match(/\/His_Grace_([^/]+)\//);
  if (m) return { speaker: tidy(m[1]).replace(/\s+Prabhu$/i, '') + ' Prabhu', tier: 3 };
  m = p.match(/^\/04_-_ISKCON_Matajis\/(?:[^/]+\/)?Her_Grace_([^/]+)\//) || p.match(/\/Her_Grace_([^/]+)\//);
  if (m) return { speaker: tidy(m[1]).replace(/\s+Mataji$/i, '') + ' Mataji', tier: 3 };
  if (/^\/0[34]_-_ISKCON_/.test(p)) return null;

  // Shared collections name the speaker in the file:
  //   "2017-12-14_BG_18-62_-_Kesi_Daman_Pr_ISKCON_Vrindavan"
  //   "… - Prahladananda_Swami_ISKCON_Slovenia", "Bhakti_Vikas_Sw_BG_08-05_…"
  const file = tidy(p.slice(p.lastIndexOf('/') + 1).replace(AUDIO_EXT, ''));
  const re = /((?:[A-Z][a-z]+\s+){0,3}[A-Z][a-z]+)\s+(Swami|Goswami|Maharaja?|Sw|Prabhuji|Prabhu|Pr|Mataji|Mtj|Devi\s+Dasi)\b/g;
  let best = null;
  for (const hit of file.matchAll(re)) {
    const words = hit[1].split(' ').filter((w) => !NOT_NAME.test(w));
    if (!words.length) continue;
    best = { name: words.join(' '), title: hit[2] };
  }
  if (!best) return null;
  if (/^(Srila|Prabhupada)/i.test(best.name)) return null;
  const tier = /^(swami|goswami|maharaja?|sw)$/i.test(best.title) ? 1 : 3;
  return { speaker: honorific(best.name, best.title), tier };
}

/** Misspellings in the site's own folder names, which would otherwise split one speaker in two. */
const SPELLING = {
  'Prahladananada Swami': 'Prahladananda Swami',
  'Bhakti Vigna Vinasa Narsimha Swami': 'Bhakti Vigna Vinasa Narasimha Swami',
  'Bhakti Prabhupada Vrata Damodar Swami': 'Bhakti Prabhupada Vrata Damodara Swami',
  'Bhakti Prabhupada Vrat Damodar Swami': 'Bhakti Prabhupada Vrata Damodara Swami',
  'Bhakti Prabhupada Vrata Domadar Swami': 'Bhakti Prabhupada Vrata Damodara Swami',
  'Bhakti Aryava Priti Vardhana Swami': 'Bhakti Arjava Priti Vardhana Swami',
  'Bhakti Padma Saurabh Pracahrak Swami': 'Bhakti Padma Saurabh Pracharak Swami',
};

module.exports = { speakerOf, SPELLING };
