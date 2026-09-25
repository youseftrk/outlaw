#!/usr/bin/env bash
# Generate the 15 VO lines via Fish Audio s2.1-pro-free + the owner's reference voice.
set -u
cd "$(dirname "$0")/.."
mkdir -p audio/vo
KEY="$(cat /tmp/fish-key.txt)"
REF="f76b60630a174b36a15f4bd9ed6708f0"

i=0
grep -o 'id="cap-[0-9]*"[^>]*>[^<]*' index.html | sed 's/.*>//' | while IFS= read -r line; do
  n=$(printf '%02d' "$i")
  i=$((i+1))
  out="audio/vo/line-$n.mp3"
  [ -s "$out" ] && { echo "line-$n exists, skip"; continue; }
  esc=$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$line")
  code=$(curl -s -o "$out" -w '%{http_code}' --max-time 60 \
    -X POST https://api.fish.audio/v1/tts \
    -H "Authorization: Bearer $KEY" -H "model: s2.1-pro-free" \
    -H "content-type: application/json" \
    -d "{\"text\": $esc, \"format\": \"mp3\", \"reference_id\": \"$REF\"}")
  if [ "$code" = "200" ] && [ -s "$out" ] && file "$out" | grep -qi 'audio\|mpeg\|mp3'; then
    dur=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$out")
    echo "line-$n ok ${dur}s : $line"
  else
    echo "line-$n FAILED http=$code : $line"; rm -f "$out"
    sleep 1
  fi
done
echo "--- durations ---"
for f in audio/vo/line-*.mp3; do
  [ -s "$f" ] && echo "$(basename "$f" .mp3),$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$f")"
done | tee audio/vo/durations.json
