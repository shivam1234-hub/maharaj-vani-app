import { MaharajKey } from './types';

export interface MaharajConfig {
  key: MaharajKey;
  /** Full honorific, used on the detail header. */
  name: string;
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
};

export const MAHARAJ_ORDER: MaharajKey[] = ['radhanath', 'lokanath', 'bhaktiashraya', 'gourgovinda'];

export const getMaharaj = (key: MaharajKey) => MAHARAJAS[key];
