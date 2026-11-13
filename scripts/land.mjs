import { feature } from "topojson-client";
import { readFileSync, writeFileSync } from "node:fs";
const topo = JSON.parse(readFileSync(".cache/states.json"));
const states = feature(topo, topo.objects.states);
states.features = states.features.filter(
  (f) => Number(f.id) <= 56 && !["02", "15"].includes(f.id),
);
writeFileSync(".cache/land.json", JSON.stringify(states));
