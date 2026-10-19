// Reads the pipeline's cloud-optimized GeoTIFFs straight from the browser with
// geotiff.js. A COG is tiled internally and carries reduced-resolution copies
// (overviews), so a point read fetches one small block and a polygon read picks
// the overview whose resolution fits the job. Nothing is downloaded whole.
import { fromUrl, type BlockedSourceOptions, type GeoTIFF, type GeoTIFFImage, type RemoteSourceOptions } from 'geotiff';
import type { Grid } from '../math/volume';

export interface Cog {
  tiff: GeoTIFF;
  images: GeoTIFFImage[];
  /** Top-left corner of the full-resolution image, projected units. */
  originX: number;
  originY: number;
  /** Full-resolution cell size (meters). */
  cell: number;
  nodata: number | null;
  bbox: [number, number, number, number];
}

export async function openCog(url: string): Promise<Cog> {
  // geotiff.js forwards block options to its fetch source at runtime; the type only lists the remote ones.
  const options: RemoteSourceOptions & BlockedSourceOptions = { blockSize: 65536, cacheSize: 256, allowFullFile: false };
  const tiff = await fromUrl(url, options);
  const count = await tiff.getImageCount();
  const images: GeoTIFFImage[] = [];
  for (let i = 0; i < count; i++) images.push(await tiff.getImage(i));
  const base = images[0];
  const [ox, oy] = base.getOrigin();
  const [rx] = base.getResolution();
  return {
    tiff, images, originX: ox, originY: oy, cell: Math.abs(rx),
    nodata: base.getGDALNoData(), bbox: base.getBoundingBox() as [number, number, number, number],
  };
}

function clean(v: number, nodata: number | null): number {
  return nodata !== null && v === nodata ? NaN : v;
}

/** Value of the full-resolution cell containing (x, y); NaN outside or where there is no data. */
export async function pointValue(cog: Cog, x: number, y: number): Promise<number> {
  const col = Math.floor((x - cog.originX) / cog.cell);
  const row = Math.floor((cog.originY - y) / cog.cell);
  const base = cog.images[0];
  if (col < 0 || row < 0 || col >= base.getWidth() || row >= base.getHeight()) return NaN;
  const [band] = await base.readRasters({ window: [col, row, col + 1, row + 1] }) as unknown as [ArrayLike<number>];
  return clean(band[0], cog.nodata);
}

/**
 * Read a projected bounding box as a Grid, using the coarsest overview that still
 * gives at most `maxCells` cells. Returns null if the box misses the raster.
 */
export async function readWindow(
  cog: Cog, minX: number, minY: number, maxX: number, maxY: number, maxCells = 1_500_000,
): Promise<Grid | null> {
  const [bx0, by0, bx1, by1] = cog.bbox;
  minX = Math.max(minX, bx0); maxX = Math.min(maxX, bx1);
  minY = Math.max(minY, by0); maxY = Math.min(maxY, by1);
  if (minX >= maxX || minY >= maxY) return null;

  let image = cog.images[0];
  let cell = cog.cell;
  for (const img of cog.images) {
    const c = (cog.bbox[2] - cog.bbox[0]) / img.getWidth();
    const cells = ((maxX - minX) / c) * ((maxY - minY) / c);
    image = img; cell = c;
    if (cells <= maxCells) break;
  }
  const col0 = Math.max(0, Math.floor((minX - cog.originX) / cell));
  const row0 = Math.max(0, Math.floor((cog.originY - maxY) / cell));
  const col1 = Math.min(image.getWidth(), Math.ceil((maxX - cog.originX) / cell));
  const row1 = Math.min(image.getHeight(), Math.ceil((cog.originY - minY) / cell));
  if (col1 <= col0 || row1 <= row0) return null;
  const [band] = await image.readRasters({ window: [col0, row0, col1, row1] }) as unknown as [ArrayLike<number>];
  const width = col1 - col0, height = row1 - row0;
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = clean(band[i], cog.nodata);
  return { data, width, height, originX: cog.originX + col0 * cell, originY: cog.originY - row0 * cell, cell };
}
