/**
 * Keep disconnected polygon exteriors independent during tile simplification.
 * A subpixel island can flip winding when tile coordinates are rounded. If it
 * shares a feature with the mainland, ring classification can mistake the
 * mainland for a hole. Separate Polygon features prevent that cross-talk while
 * retaining each polygon's genuine holes and all clock/bucket properties.
 */
export function renderFeatures(features) {
  return features.flatMap((feature) =>
    feature.geometry.type === "MultiPolygon"
      ? feature.geometry.coordinates.map((coordinates) => ({
          ...feature,
          geometry: { type: "Polygon", coordinates },
        }))
      : [feature],
  );
}
