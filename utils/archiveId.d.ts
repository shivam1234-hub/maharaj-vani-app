/** Stable, filesystem-safe id for an uncatalogued archive file ("gst-…"). */
export function archiveId(filePath: string, shard?: string): string;
/** Display title from an archive file name. */
export function archiveTitle(fileName: string): string;
