/* Offline test for web/lib/verify.ts — the rule engine, no browser needed.
   Run:  bash web/scripts/uji-verify-video.sh                                    */
const V = require("./verify.js");

const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) process.exitCode = 1;
};

const f = (o) => ({ name: "f", mime: "application/octet-stream", sizeBytes: 1024, ...o });
const reel = (o = {}) => f({ name: "reel-9x16.mp4", mime: "video/mp4", sizeBytes: 24_000_000, durationSec: 6, width: 1080, height: 1920, hasAudio: true, dbfs: -19.5, ...o });
const still = (o = {}) => f({ name: "IMG_001.jpg", mime: "image/jpeg", width: 2000, height: 1500, bgWhite: 1, avgSaturation: 0.2, ...o });
const rule = (r, files, ctx) => V.evaluateRule(r, files, ctx || {});

/* ---- what the video brief asks for ---- */
let r = rule("count(videos) == 1", [reel()]);
ok("one video satisfies count(videos) == 1", r.pass && r.note === "1 videos", r.note);
r = rule("count(videos) == 1", [reel(), reel({ name: "b.mp4" })]);
ok("two videos fail count(videos) == 1", !r.pass && r.kind === "measured", r.note);
r = rule("count(videos) == 1", [still()]);
ok("a photo delivery fails a video count", !r.pass && r.kind === "measured", r.note);

r = rule("mime \u2208 {mp4, webm}", [reel()]);
ok("mp4 passes mime \u2208 {mp4, webm}", r.pass, r.note);
r = rule("mime \u2208 {mp4, webm}", [reel({ name: "cut.webm", mime: "video/webm" })]);
ok("webm passes the same rule", r.pass, r.note);
r = rule("mime \u2208 {mp4, webm}", [reel({ name: "cut.mov", mime: "video/quicktime" })]);
ok("mov fails it", !r.pass && r.kind === "measured", r.note);
r = rule("mime \u2208 {mp4, webm}", [still()]);
ok("a jpg is not in {mp4, webm} (membership, measured)", !r.pass && r.kind === "measured" && r.note.includes("jpg"), r.note);
r = rule("mime \u2208 {jpg}", [still()]);
ok("brief-parser style mime \u2208 {jpg} now measures (was falling through to manual)", r.pass && r.kind === "measured", r.note);

r = rule("duration \u2264 60", [reel()]);
ok("6s reel passes duration \u2264 60", r.pass && r.note.includes("6.0s"), r.note);
r = rule("duration \u2264 60", [reel({ durationSec: 92.4 })]);
ok("92s fails it with the real number", !r.pass && r.note.includes("92.4s"), r.note);
r = rule("30 \u2264 duration \u2264 60", [reel()]);
ok("range 30\u201360s catches a 6s cut", !r.pass && r.kind === "measured", r.note);
r = rule("duration \u2264 60", [still()]);
ok("no timed media = measured fail, not a silent pass", !r.pass && r.kind === "measured", r.note);
r = rule("duration \u2264 60", [reel({ durationSec: undefined })]);
ok("unreadable duration = manual, not a guessed pass", !r.pass && r.kind === "manual", r.note);

r = rule("aspect == 9:16", [reel()]);
ok("1080\u00d71920 is 9:16", r.pass, r.note);
r = rule("aspect == 9:16", [reel({ width: 1920, height: 1080 })]);
ok("landscape fails the vertical rule", !r.pass && r.kind === "measured", r.note);

r = rule("audio \u2265 -30 dBFS", [reel()]);
ok("a mixed track at -19.5 dBFS passes \u2265 -30", r.pass && r.kind === "measured", r.note);
r = rule("audio \u2265 -30 dBFS", [reel({ hasAudio: false, dbfs: undefined })]);
ok("a silent render fails (measured)", !r.pass && r.kind === "measured", r.note);
r = rule("audio \u2265 -30 dBFS", [reel({ hasAudio: undefined, dbfs: undefined })]);
ok("undecodable audio = manual, never assumed silent", !r.pass && r.kind === "manual", r.note);
r = rule("audio \u2265 -10 dBFS", [reel()]);
ok("too quiet for -10 dBFS is reported with its level", !r.pass && r.note.includes("-19.5"), r.note);

r = rule("w == 1080 && h == 1920", [reel()]);
ok("video frame size answers w/h rules", r.pass, r.note);
r = rule("size \u2264 200 MB", [reel()]);
ok("24 MB passes a 200 MB cap", r.pass && r.note.includes("22.9"), r.note);
r = rule("size \u2264 10 MB", [reel()]);
ok("24 MB fails a 10 MB cap", !r.pass && r.kind === "measured", r.note);

/* ---- the honest edges ---- */
r = rule("vision: bg \u2265 97% #FFF", [reel()]);
ok("a white-background rule on a video asks a human instead of failing it", r.kind === "manual", r.note);
r = rule("vision: logo visible in the first 3 seconds", [reel()]);
ok("a taste/vision criterion stays manual", r.kind === "manual", r.note);

/* ---- nothing regressed for the other kinds of work ---- */
r = rule("vision: bg \u2265 97% #FFF", [still()]);
ok("photo with a white background still passes", r.pass, r.note);
r = rule("vision: bg \u2265 97% #FFF", [still(), still({ name: "IMG_014.jpg", bgWhite: 0 })]);
ok("the grey photo still fails by name", !r.pass && r.note.includes("IMG_014.jpg"), r.note);
r = rule("max(w,h) \u2265 2000", [still()]);
ok("long-edge rule unchanged for photos", r.pass, r.note);
r = rule("300 \u2264 words \u2264 500", [f({ name: "copy.txt", mime: "text/plain", text: "word ".repeat(320) })]);
ok("word counts unchanged", r.pass, r.note);
r = rule("png && alpha", [f({ name: "logo.png", mime: "image/png", alpha: true })]);
ok("transparency unchanged", r.pass, r.note);
r = rule("dpi \u2265 300", [still()]);
ok("DPI still handed to a human", r.kind === "manual", r.note);

/* ---- a whole contract, like the demo order ---- */
const verdict = V.evaluateDelivery(
  [
    { rule: "count(videos) == 1" },
    { rule: "mime \u2208 {mp4, webm}" },
    { rule: "duration \u2264 60" },
    { rule: "aspect == 9:16" },
    { rule: "audio \u2265 -30 dBFS" },
    { rule: "vision: logo visible in the first 3 seconds" },
  ],
  [reel()]
);
const measured = verdict.results.filter((x) => x.kind === "measured").length;
ok("demo reel: 5 measured + 1 manual", measured === 5 && verdict.manual === 1, JSON.stringify({ measured, manual: verdict.manual, failed: verdict.failed, source: verdict.source }));
ok("demo reel verdict is mixed (measured + one human eye)", verdict.source === "mixed", verdict.source);

/* ---- the brief parser turns a video brief into these rules ---- */
const D = require("./data.js");
const drafted = D.draftCriteria("Need one vertical reel, 9:16, under 60 seconds, mp4, audio mixed, under 200MB. $220 by Friday.", "en");
const rules = drafted.criteria.map((c) => c.rule);
ok("parser: video count", rules.includes("count(videos) == 1"), rules.join(" | "));
ok("parser: aspect from 9:16", rules.includes("aspect == 9:16"), rules.join(" | "));
ok("parser: duration from \"under 60 seconds\"", rules.includes("duration \u2264 60"), rules.join(" | "));
ok("parser: audio criterion from \"audio mixed\"", rules.includes("audio \u2265 -30 dBFS"), rules.join(" | "));
ok("parser: size cap from \"under 200MB\"", rules.includes("size \u2264 200 MB"), rules.join(" | "));
ok("parser: mp4 became a format rule", rules.some((r) => r.startsWith("mime \u2208") && r.includes("mp4")), rules.join(" | "));
ok("parser: amount picked up", drafted.amount === 220, String(drafted.amount));

const written = D.draftCriteria("4 articles, 800-1200 words each, docx, by 20 Nov, $300", "en");
const wrules = written.criteria.map((c) => c.rule);
ok("parser: 4 articles counted as documents", wrules.includes("count(docs) == 4"), wrules.join(" | "));
ok("parser: word range", wrules.includes("800 \u2264 words \u2264 1200"), wrules.join(" | "));

/* ---- a model writing free-form rules must never get a fragment verdict ---- */
r = rule("ext == .mp4 && ratio == 9:16 && duration == 45s", [reel()]);
ok("compound rule (ext && ratio && duration) is not judged on one clause", r.kind === "manual", `${r.kind}: ${r.note}`);
r = rule("count(videos) == 1 && duration \u2264 60", [reel()]);
ok("a conjunction of two known checks is judged on BOTH clauses", r.pass && r.kind === "measured" && r.note.includes("1 videos") && r.note.includes("6.0s"), `${r.kind}: ${r.note}`);
r = rule("mime == video/mp4 && aspect == 9:16 && duration == 45", [reel()]);
ok("the model's own compound rule fails on the clause that is wrong (45s vs 6.0s)", !r.pass && r.kind === "measured" && r.note.includes("45s"), `${r.kind}: ${r.note}`);
r = rule("count(videos) == 1 && duration \u2264 60 && ext == .mp4", [reel()]);
ok("one unverifiable clause demotes the whole rule to manual", r.kind === "manual", `${r.kind}: ${r.note}`);
r = rule("w == 1080 && h == 1920", [reel()]);
ok("the supported w/h compound still measures", r.pass && r.kind === "measured", r.note);
r = rule("png && alpha", [f({ name: "logo.png", mime: "image/png", alpha: true })]);
ok("png && alpha still measures", r.pass && r.kind === "measured", r.note);
r = rule("audio: music_track == true", [reel()]);
ok("\"music_track == true\" is manual: a level check cannot hear music", r.kind === "manual", r.note);
r = rule("audio present", [reel()]);
ok("\"audio present\" is measured from a real track", r.pass && r.kind === "measured", r.note);
r = rule("audio present", [reel({ hasAudio: false, dbfs: undefined })]);
ok("\"audio present\" fails on a silent render", !r.pass && r.kind === "measured", r.note);
