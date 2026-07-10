// Generates spotify.svg from the Spotify Web API.
// Self-contained: no third-party action. Needs three env secrets.
import { writeFileSync } from "node:fs";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error("Missing one of SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN secrets.");
  process.exit(1);
}

const xml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");

async function getAccessToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: REFRESH_TOKEN }),
  });
  if (!res.ok) {
    console.error(`Token request failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return (await res.json()).access_token;
}

async function getTrack(token) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // 1) currently playing
  let res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", auth);
  if (res.status === 200) {
    const data = await res.json();
    if (data && data.item) {
      return { item: data.item, isPlaying: !!data.is_playing };
    }
  }

  // 2) fall back to most recently played
  res = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=1", auth);
  if (res.status === 200) {
    const data = await res.json();
    if (data && data.items && data.items[0]) {
      return { item: data.items[0].track, isPlaying: false };
    }
  }

  return null;
}

async function fetchCover(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") || "image/jpeg";
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function bars(playing) {
  if (!playing) return "";
  const xs = [0, 8, 16, 24, 32];
  const durs = ["0.9s", "1.2s", "0.7s", "1.4s", "1.0s"];
  return `<g transform="translate(392,86)">${xs
    .map(
      (x, i) =>
        `<rect x="${x}" y="0" width="5" height="24" rx="1.5" fill="#911515"><animate attributeName="height" values="6;24;10;24;6" dur="${durs[i]}" repeatCount="indefinite"/><animate attributeName="y" values="18;0;14;0;18" dur="${durs[i]}" repeatCount="indefinite"/></rect>`
    )
    .join("")}</g>`;
}

function render({ title, artist, cover, isPlaying }) {
  const status = isPlaying ? "NOW PLAYING" : "LAST PLAYED";
  const coverEl = cover
    ? `<image x="24" y="26" width="78" height="78" href="${cover}" preserveAspectRatio="xMidYMid slice" clip-path="url(#r)"/>`
    : `<rect x="24" y="26" width="78" height="78" rx="8" fill="#1a1a1a" stroke="#2a2a2a"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="130" viewBox="0 0 480 130" fill="none" role="img" aria-label="Spotify: ${xml(clip(title, 60))}">
  <defs><clipPath id="r"><rect x="24" y="26" width="78" height="78" rx="8"/></clipPath></defs>
  <rect x="1" y="1" width="478" height="128" rx="10" fill="#0d0d0d" stroke="#2a2a2a"/>
  ${coverEl}
  <g font-family="Consolas, 'Courier New', monospace">
    <text x="120" y="44" fill="#911515" font-size="12" font-weight="bold">SPOTIFY // ${status}</text>
    <text x="120" y="70" fill="#e0e0e0" font-size="17" font-weight="bold">${xml(clip(title, 26))}</text>
    <text x="120" y="92" fill="#8a8a8a" font-size="13">${xml(clip(artist, 32))}</text>
  </g>
  ${bars(isPlaying)}
</svg>
`;
}

function renderIdle() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="130" viewBox="0 0 480 130" fill="none" role="img" aria-label="Spotify offline">
  <rect x="1" y="1" width="478" height="128" rx="10" fill="#0d0d0d" stroke="#2a2a2a"/>
  <g transform="translate(24,30)"><circle cx="18" cy="35" r="18" fill="none" stroke="#911515" stroke-width="2"/><path d="M8 30 Q18 27 28 32 M9 36 Q18 33 27 38 M11 42 Q18 40 25 44" stroke="#911515" stroke-width="2" stroke-linecap="round" fill="none"/></g>
  <g font-family="Consolas, 'Courier New', monospace">
    <text x="72" y="52" fill="#911515" font-size="12" font-weight="bold">SPOTIFY // SILENT</text>
    <text x="72" y="76" fill="#cccccc" font-size="15" font-weight="bold">No signal on the wire</text>
  </g>
</svg>
`;
}

const token = await getAccessToken();
const track = await getTrack(token);

let svg;
if (!track) {
  svg = renderIdle();
} else {
  const cover = track.item.album?.images?.[0]?.url ? await fetchCover(track.item.album.images[0].url) : null;
  svg = render({
    title: track.item.name,
    artist: (track.item.artists || []).map((a) => a.name).join(", "),
    cover,
    isPlaying: track.isPlaying,
  });
}

writeFileSync("spotify.svg", svg);
console.log("spotify.svg written.");
