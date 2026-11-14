export const ATLAS_SCHEMA = 1;
export const mercatorY = (latitude) =>
  (1 - Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)) / Math.PI) /
  2;

export function decodeAtlas(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8 || view.getUint32(0, true) !== 0x54415353)
    throw Error("Invalid sunset atlas");
  const jsonLength = view.getUint32(4, true);
  if (jsonLength > 100000 || 8 + jsonLength > buffer.byteLength)
    throw Error("Invalid atlas header");
  const meta = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 8, jsonLength)),
  );
  if (
    meta.schema !== ATLAS_SCHEMA ||
    meta.curveEncoding !== "uint16-relative-mercator" ||
    meta.dates?.length !== 365 ||
    !meta.zones?.length ||
    !Number.isFinite(meta.sampleYMin) ||
    !(meta.sampleYStep > 0) ||
    meta.utcStartHour !== 21 ||
    meta.latitudeCount !== 271 ||
    meta.instantCount !== 9 ||
    !Number.isInteger(meta.vertexCount) ||
    !Number.isInteger(meta.indexCount) ||
    meta.indexCount % 3
  )
    throw Error("Unsupported sunset atlas");
  let offset = 8 + Math.ceil(jsonLength / 4) * 4;
  const take = (Type, count) => {
    if (
      count < 0 ||
      offset + count * Type.BYTES_PER_ELEMENT > buffer.byteLength
    )
      throw Error("Truncated atlas");
    const value = new Type(buffer, offset, count);
    offset += value.byteLength;
    return value;
  };
  const vertices = take(Float32Array, meta.vertexCount * 3),
    indices = take(Uint32Array, meta.indexCount),
    curves = take(Uint16Array, 365 * meta.instantCount * meta.latitudeCount);
  offset = Math.ceil(offset / 4) * 4;
  const ranges = take(Float32Array, 365 * meta.instantCount * 2),
    offsets = take(Uint8Array, 365 * meta.zones.length);
  if (
    offset !== buffer.byteLength ||
    indices.some((i) => i >= meta.vertexCount) ||
    offsets.some((i) => i > 4) ||
    vertices.some((v) => !Number.isFinite(v)) ||
    ranges.some((v) => !Number.isFinite(v))
  )
    throw Error("Invalid atlas arrays");
  return { meta, vertices, indices, curves, ranges, offsets };
}
export async function loadAtlas(base) {
  const response = await fetch(`${base}atlas/manifest.json`, {
    cache: "no-cache",
  });
  if (!response.ok) throw Error("Atlas manifest unavailable");
  const manifest = await response.json();
  if (
    manifest.schema !== ATLAS_SCHEMA ||
    !/^sunset-\d{4}-[a-f0-9]{16}\.bin\.gz$/.test(manifest.data)
  )
    throw Error("Incompatible atlas manifest");
  const asset = await fetch(`${base}atlas/${manifest.data}`);
  if (!asset.ok) throw Error("Atlas unavailable");
  let buffer = await asset.arrayBuffer();
  const prefix = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2));
  if (prefix[0] === 0x1f && prefix[1] === 0x8b)
    buffer = await new Response(
      new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const hash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== manifest.sha256) throw Error("Atlas checksum mismatch");
  }
  return decodeAtlas(buffer);
}
/** CPU mirror of the shader, used to validate numerical accuracy. */
export function bucketAt(data, day, zone, longitude, latitude) {
  const { meta, offsets, curves, ranges } = data;
  const f = Math.max(
    0,
    Math.min(
      meta.latitudeCount - 1,
      (mercatorY(latitude) - meta.sampleYMin) / meta.sampleYStep,
    ),
  );
  const row = Math.min(meta.latitudeCount - 2, Math.floor(f)),
    mix = f - row;
  const first = offsets[day * meta.zones.length + zone];
  for (let h = 0; h < 5; h++) {
    const curve = day * meta.instantCount + first + h,
      base = curve * meta.latitudeCount;
    const boundary =
      ranges[curve * 2] +
      (curves[base + row] * (1 - mix) + curves[base + row + 1] * mix) *
        ranges[curve * 2 + 1];
    if (longitude > boundary) return h;
  }
  return 5;
}
/** Pick the fixed time-zone mesh; holes have no triangles and cannot be hit. */
export function zoneAt(data, longitude, latitude) {
  const x = (longitude + 180) / 360,
    y = mercatorY(latitude),
    { vertices: v, indices } = data;
  for (const [zone, region] of data.meta.zones.entries()) {
    const [west, north, east, south] = region.bounds;
    if (x < west || x > east || y < north || y > south) continue;
    for (
      let k = region.firstIndex;
      k < region.firstIndex + region.indexCount;
      k += 3
    ) {
      const a = indices[k] * 3,
        b = indices[k + 1] * 3,
        c = indices[k + 2] * 3;
      const ax = v[a],
        ay = v[a + 1],
        bx = v[b],
        by = v[b + 1],
        cx = v[c],
        cy = v[c + 1];
      if (
        x < Math.min(ax, bx, cx) ||
        x > Math.max(ax, bx, cx) ||
        y < Math.min(ay, by, cy) ||
        y > Math.max(ay, by, cy)
      )
        continue;
      const ab = (bx - ax) * (y - ay) - (by - ay) * (x - ax),
        bc = (cx - bx) * (y - by) - (cy - by) * (x - bx),
        ca = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
      if ((ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0))
        return zone;
    }
  }
  return -1;
}
