/**
 * Id and display title for an archive file that has no catalogue entry — the
 * other-speaker lectures in the verse index. Shared by build-verse-index.js and
 * the app (types in archiveId.d.ts), so the id the app derives is the one the
 * index was built with.
 *
 * Ids key downloads, history and favourites, and double as the on-disk
 * download folder name, so they must be filesystem-safe, unique and stable.
 * Same scheme as scrape-audio.js: readable slug plus an FNV-1a hash of the
 * full path, because collapsing punctuation alone makes distinct files collide.
 */

const AUDIO_EXT = /\.(mp3|m4a|wma|ogg|wav|aac)$/i;

/**
 * `shard` ("bg", "sb10", "cc", "noi", "iso"…) is the verse-index file the row lives in. It is
 * part of the id so a saved id resolves by loading that one shard, not all 18.
 */
function archiveId(filePath, shard) {
  const slug = filePath
    .slice(filePath.lastIndexOf('/') + 1)
    .replace(AUDIO_EXT, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
    .replace(/-+$/, '');
  let h = 0x811c9dc5;
  for (let i = 0; i < filePath.length; i++) {
    h ^= filePath.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `gst-${shard ? `${shard}-` : ''}${slug}-${h.toString(36)}`;
}

function archiveTitle(fileName) {
  return fileName
    .replace(AUDIO_EXT, '')
    .replace(/_/g, ' ')
    .replace(/\s+-\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { archiveId, archiveTitle };
