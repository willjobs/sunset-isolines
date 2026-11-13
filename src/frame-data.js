export const BAND_SCHEMA = 4;

/** Bucket meanings must agree with the legend, including cached responses. */
export function validateFrame(data) {
  if (
    data?.type !== "FeatureCollection" ||
    data.bandSchema !== BAND_SCHEMA ||
    !Array.isArray(data.features) ||
    data.features.some(
      (feature) =>
        feature.properties?.kind !== "band" ||
        !Number.isInteger(feature.properties.bucket) ||
        feature.properties.bucket < 0 ||
        feature.properties.bucket > 5 ||
        !["Polygon", "MultiPolygon"].includes(feature.geometry?.type),
    )
  )
    throw new Error(
      "Sunset frame does not match the current six-band data version",
    );
  return data;
}
