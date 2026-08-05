#!/usr/bin/env bash
# Downloads a small set of public geo-tagged landmark images into
# data/sample/ and writes data/sample_meta.csv (filename,lat,lon) so you can
# build a real FAISS index with scripts/build_index.py.
#
# No torch/transformers required -- only curl. Images come from Wikimedia
# Commons via the stable Special:FilePath redirect. Extend the SAMPLES array
# below (name|url|lat|lon per line) to grow the dataset.
#
# Usage: bash scripts/build_data.sh

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAMPLE_DIR="$DIR/data/sample"
CSV="$DIR/data/sample_meta.csv"

mkdir -p "$SAMPLE_DIR"

# name|url|lat|lon
SAMPLES=(
  "eiffel|https://commons.wikimedia.org/wiki/Special:FilePath/Eiffel%20Tower%20from%20the%20Tour%20Montparnasse%203%2C%20Paris%20May%202014.jpg|48.8584|2.2945"
  "liberty|https://commons.wikimedia.org/wiki/Special:FilePath/Statue%20of%20Liberty%2C%20NY.jpg|40.6892|-74.0445"
  "colosseum|https://commons.wikimedia.org/wiki/Special:FilePath/Colosseo%202020.jpg|41.8902|12.4922"
  "bigben|https://commons.wikimedia.org/wiki/Special:FilePath/Big%20Ben%20(2018).jpg|51.5007|-0.1246"
  "tajmahal|https://commons.wikimedia.org/wiki/Special:FilePath/Taj%20Mahal%20(March%202021).jpg|27.1751|78.0421"
)

ok=0
echo "filename,lat,lon" > "$CSV"

for entry in "${SAMPLES[@]}"; do
  IFS='|' read -r name url lat lon <<< "$entry"
  out="$SAMPLE_DIR/${name}.jpg"
  if curl --fail --location --silent --show-error --max-time 60 -o "$out.tmp" "$url"; then
    mv "$out.tmp" "$out"
    echo "data/sample/${name}.jpg,${lat},${lon}" >> "$CSV"
    echo "downloaded ${name}.jpg (${lat},${lon})"
    ok=$((ok + 1))
  else
    rm -f "$out.tmp"
    echo "skipped ${name}: download failed (Wikimedia URL may have moved)" >&2
  fi
done

if [ "$ok" -eq 0 ]; then
  echo "error: no images downloaded (check network / Wikimedia URLs)" >&2
  exit 1
fi

echo "done: $ok image(s) in $SAMPLE_DIR, manifest at $CSV"
