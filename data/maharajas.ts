import { MaharajKey } from './types';

export interface MaharajConfig {
  key: MaharajKey;
  /** Full honorific, used on the detail header. */
  name: string;
  /** "His Holiness" for sannyasis, "His Grace" for Prabhujis — the hero line on Home. */
  honorific: 'His Holiness' | 'His Grace';
  /** Short name for the tab switch and for track metadata on the lock screen. */
  short: string;
  initials: string;
  accent: string;
  /** Root folder on audio.iskcondesiretree.com the catalogue was scraped from. */
  sourceUrl: string;
  /**
   * Channels that publish this Maharaja's lectures. Used to scope live
   * YouTube search and to offer per-channel filter chips.
   */
  youtube: {
    /** Query seed for live search. */
    query: string;
    /**
     * Identifies this Maharaja in a video title or channel name. Used to keep
     * the Home "latest videos" row on topic, since a newest-first search
     * surfaces anything that merely mentions the name.
     */
    match: RegExp;
    channels: Array<{ name: string; channelId: string }>;
  };
}

export const MAHARAJAS: Record<MaharajKey, MaharajConfig> = {
  radhanath: {
    key: 'radhanath',
    honorific: 'His Holiness',
    name: 'His Holiness Radhanath Swami',
    short: 'Radhanath Swami',
    initials: 'RNS',
    accent: '#FF7722',
    sourceUrl:
      'https://audio.iskcondesiretree.com/index.php?q=f&f=%2F02_-_ISKCON_Swamis%2FISKCON_Swamis_-_R_to_Y%2FHis_Holiness_Radhanath_Swami%2FLectures',
    // Channel list is what live search actually returns for this Maharaja,
    // most-frequent first — the lectures are spread across several publishers,
    // so a single official channel would filter out most real results.
    youtube: {
      query: 'Radhanath Swami lecture',
      match: /radhanath/i,
      channels: [
        { name: 'Radhanath-Swami-Media', channelId: 'UChphslaY9GHwg1fKjngCJIg' },
        { name: 'RG Media', channelId: 'UCuyNwFU3fCEhRi3OPk3WvXw' },
        { name: 'HH Radhanath Swami Media Services', channelId: 'UCUZTWReIbBYqOFL9TyKFblg' },
        { name: 'Radha Gopinath Media', channelId: 'UCKsPhfStsvK9NKPjXj0DLvg' },
        { name: 'His Holiness Radhanath Swami', channelId: 'UCzywp4-atthpp2FEKnhivYQ' },
      ],
    },
  },
  lokanath: {
    key: 'lokanath',
    honorific: 'His Holiness',
    name: 'His Holiness Lokanath Swami',
    short: 'Lokanath Swami',
    initials: 'LNS',
    accent: '#E9A825',
    sourceUrl:
      'https://audio.iskcondesiretree.com/index.php?q=f&f=%2F02_-_ISKCON_Swamis%2FISKCON_Swamis_-_D_to_P%2FHis_Holiness_Lokanath_Swami',
    youtube: {
      query: 'Lokanath Swami lecture',
      match: /lokanath/i,
      channels: [
        { name: 'Lokanath Swami Official', channelId: 'UCsdDftx_W6Hi3DWNsZRJvIA' },
        { name: 'Mayapur TV', channelId: 'UCypj9Vvizo4cCERfDFIG3zw' },
      ],
    },
  },
  bhaktiashraya: {
    key: 'bhaktiashraya',
    honorific: 'His Holiness',
    name: 'His Holiness Bhakti Ashraya Vaishnava Swami',
    short: 'Bhakti Ashraya Vaishnava Swami',
    initials: 'BAVS',
    accent: '#5B8DEF',
    sourceUrl:
      'https://audio.iskcondesiretree.com/index.php?q=f&f=%2F02_-_ISKCON_Swamis%2FISKCON_Swamis_-_A_to_C%2FHis_Holiness_Bhakti_Ashraya_Vaishnava_Swami',
    youtube: {
      query: 'Bhakti Ashraya Vaishnava Swami',
      match: /ashraya\s*vai?s?h?nava/i,
      channels: [
        { name: 'Bhakti Ashraya Vaisnava Swami', channelId: 'UCAjbXXOyV673M85ei4Phf-g' },
        { name: 'ISKCON Vrindavan', channelId: 'UCAA6IsLVfbHrP1I_lzxv09Q' },
      ],
    },
  },
  gourgovinda: {
    key: 'gourgovinda',
    honorific: 'His Holiness',
    name: 'His Holiness Gour Govinda Swami',
    short: 'Gour Govinda Swami',
    initials: 'GGS',
    accent: '#17A398',
    sourceUrl:
      'https://audio.iskcondesiretree.com/index.php?q=f&f=%2F02_-_ISKCON_Swamis%2FISKCON_Swamis_-_D_to_P%2FHis_Holiness_Gour_Govinda_Swami',
    youtube: {
      query: 'Gour Govinda Swami lecture',
      match: /gaura?\s*govinda|gour\s*govinda/i,
      channels: [
        { name: 'Sri Srimad Gour Govinda Swami Nectarean Katha', channelId: 'UCY4k4Ei3Qt-36DW_Y-sbe0Q' },
        { name: 'Sri Srimad Gour Govinda Swami Maharaja', channelId: 'UC58YBlESBWOLVexg5doV1Qg' },
        { name: 'Mayapur TV - English', channelId: 'UCdYy78yFUqU8XmbgoMqQeyA' },
        { name: 'ISKCON Dwarka', channelId: 'UChWqU4PXRLrL4SlOwgRNa9w' },
      ],
    },
  },
  radheshyam: {
    key: 'radheshyam',
    honorific: 'His Grace',
    name: 'His Grace Radheshyam Prabhuji',
    short: 'Radheshyam Prabhu',
    initials: 'RSP',
    accent: '#E84393',
    sourceUrl:
      'https://audio.iskcondesiretree.com/index.php?q=f&f=%2F03_-_ISKCON_Prabhujis%2FISKCON_Prabhujis_-_K_to_R%2FHis_Grace_Radhe_Shyam_Prabhu',
    youtube: {
      query: 'Radheshyam Prabhu lecture',
      match: /radhe\s*shyam/i,
      channels: [
        { name: 'Radheshyam Das Devotional Video', channelId: 'UC9Pap1xwEQAo7X1tKqpcpWg' },
        { name: 'ISKCON Hyderabad Abids', channelId: 'UC6YE9D3-cIOS2-L6xgkY8tw' },
      ],
    },
  },
  amarendra: {
    key: 'amarendra',
    honorific: 'His Grace',
    name: 'His Grace Amarendra Prabhuji',
    short: 'Amarendra Prabhu',
    initials: 'AMP',
    accent: '#9B6DFF',
    // He has no folder of his own on the archive; his classes sit in the
    // shared collections (ISKCON Chowpatty, Bhakti Sanga, GEV, …).
    sourceUrl: 'https://audio.iskcondesiretree.com/index.php?q=s&sm=ff&s=Amarendra',
    youtube: {
      query: 'Amarendra Prabhu lecture',
      match: /amarendra/i,
      channels: [
        { name: 'Amarendra Dāsa Official', channelId: 'UChkQ7Q6cEBQenwKugPjOVjA' },
        { name: 'Radha Gopinath Media', channelId: 'UCKsPhfStsvK9NKPjXj0DLvg' },
      ],
    },
  },
  vidvangauranga: {
    key: 'vidvangauranga',
    honorific: 'His Grace',
    name: 'His Grace Vidvan Gauranga Prabhuji',
    short: 'Vidvan Gauranga Prabhu',
    initials: 'VGP',
    accent: '#3FB8AF',
    sourceUrl:
      'https://audio.iskcondesiretree.com/index.php?q=f&f=%2F03_-_ISKCON_Prabhujis%2FISKCON_Prabhujis_-_S_to_Y%2FHis_Grace_Vidvan_Gauranga_Prabhu',
    youtube: {
      query: 'Vidvan Gauranga Prabhu',
      // "Vidvan" is required: plain "Gauranga Prabhu" is HG Gauranga Das, a
      // different devotee with a far larger YouTube presence.
      match: /vidvan\s*gauranga/i,
      channels: [
        { name: 'Mayapur Institute', channelId: 'UC_5qF6Q8NQBqYnVjkgyXVwA' },
        { name: 'ISKCON Vrindavan', channelId: 'UCAA6IsLVfbHrP1I_lzxv09Q' },
        { name: 'Kirtan Mayapur', channelId: 'UCzN7cEEDufL4W-lg-p-8kFA' },
        { name: 'Paratattva', channelId: 'UCrAqsB_5p7qpflluGFB0UzQ' },
      ],
    },
  },
  vamsivadan: {
    key: 'vamsivadan',
    honorific: 'His Grace',
    // HG Vamsivadan Das of the Mayapur Institute.
    name: 'His Grace Vamsi Vadan Prabhuji',
    short: 'Vamsi Vadan Prabhu',
    initials: 'VVP',
    accent: '#F5A623',
    // No folder of his own on the archive; his classes are in the ISKCON
    // NVCC Pune, Mayapur, Vrindavan and Juhu collections.
    sourceUrl: 'https://audio.iskcondesiretree.com/index.php?q=s&sm=ff&s=Vamsi+Vadan',
    youtube: {
      query: 'Vamsi Vadan Prabhu',
      // Pr/Prabhu/Das required: "Vamsivadana Thakura" is the acharya.
      match: /vam(?:s|sh)?i\s*vadana?\s*(?:pr|prabhu|das)/i,
      channels: [
        { name: 'ISKCON Dwarka', channelId: 'UChWqU4PXRLrL4SlOwgRNa9w' },
        { name: 'ISKCON NVCC Pune', channelId: 'UC4HsD5v-9ib6FBFoIX9vE_w' },
        { name: 'VIHE', channelId: 'UCXzjSGf0FZ4qfMcC6HbNCcQ' },
        { name: 'ISKCON Vrindavan', channelId: 'UCAA6IsLVfbHrP1I_lzxv09Q' },
      ],
    },
  },
  kartikeya: {
    key: 'kartikeya',
    honorific: 'His Grace',
    // HG Kartikeya Das, ISKCON Whitefield (Bangalore).
    name: 'His Grace Kartikeya Prabhuji',
    short: 'Kartikeya Prabhu',
    initials: 'KDP',
    accent: '#E05D5D',
    sourceUrl:
      'https://audio.iskcondesiretree.com/index.php?q=f&f=%2F03_-_ISKCON_Prabhujis%2FISKCON_Prabhujis_-_K_to_R%2FHis_Grace_Kartikeya_Prabhu',
    youtube: {
      query: 'Kartikeya Prabhu lecture',
      // Pr/Prabhu/Das required — "Kartikeya" alone is also Lord Siva's son.
      match: /kartikeya\s*(?:pr|prabhu|das)/i,
      channels: [
        { name: 'Kartikeya Das', channelId: 'UCtIgLzkNyOUPZVTvjTGkXRA' },
        { name: 'ISKCON Whitefield', channelId: 'UC_rZ2rKkxUNbko-0Qcjnbsw' },
      ],
    },
  },
};

export const MAHARAJ_ORDER: MaharajKey[] = [
  'radhanath',
  'lokanath',
  'bhaktiashraya',
  'gourgovinda',
  'amarendra',
  'radheshyam',
  'vidvangauranga',
  'vamsivadan',
  'kartikeya',
];

export const getMaharaj = (key: MaharajKey) => MAHARAJAS[key];

/** Neutral colour for guest speakers, who have no accent of their own. */
export const GUEST_ACCENT = '#8E9AC0';

/**
 * A speaker's name as it is shown, with respect: "HH" before a sannyasi
 * (Swami / Goswami / Maharaj), "HG" before a Prabhuji or Mataji, and
 * "Prabhu" spoken as "Prabhuji". Srila Prabhupada is left as he is.
 *
 * `short` stays plain because it seeds YouTube searches and title matching,
 * where an "HH"/"HG" prefix would only add noise; every label on screen goes
 * through this instead.
 */
export function honoured(name: string): string {
  const n = name.trim();
  if (!n || /^(HH|HG|H\.H\.|H\.G\.|Srila)\b/i.test(n) || /prabhupada/i.test(n)) return n;
  if (/\b(Swami|Goswami|Maharaja?)$/i.test(n)) return `HH ${n}`;
  if (/\bPrabhu(ji)?$/i.test(n)) return `HG ${n.replace(/\bPrabhu$/i, 'Prabhuji')}`;
  if (/\b(Mataji|Devi Dasi)$/i.test(n)) return `HG ${n}`;
  return n;
}

/** The name without its HH/HG prefix — for under a "His Grace" heading. */
export function respectful(name: string): string {
  return honoured(name).replace(/^(HH|HG) /, '');
}

/**
 * Speaker label for any recording — catalogued speakers by their short name,
 * guests by the name carried on the record — always with honorific.
 */
export function speakerName(rec: { maharaj: string; speaker?: string }): string {
  if (rec.maharaj in MAHARAJAS) return honoured(MAHARAJAS[rec.maharaj as MaharajKey].short);
  return honoured(rec.speaker ?? 'Guest speaker');
}

/** Config for catalogued speakers, undefined for guests. */
export function maharajOf(key: string): MaharajConfig | undefined {
  return key in MAHARAJAS ? MAHARAJAS[key as MaharajKey] : undefined;
}
