// Copy lint — §6 of the handoff: every user-facing string is care language,
// not research language. "The screen is what gets audited."
//
// Scans source trees for banned terms. Korean research vocabulary is banned
// anywhere in source (identifiers are English, so any hit is copy). Banned
// English terms are only flagged inside string literals, because words like
// "score" legitimately appear in identifiers (adl_score).
//
// Usage: node scripts/copy-lint.mjs <dir-or-file> [...more]
// Exits 1 with a listing if anything is found. Runs as part of the web build.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const KOREAN_BANNED = [
  "연구", "실험", "피험자", "참여자", "데이터 수집", "측정 프로토콜",
  "기준선", "결과지표", "번아웃", "위험도", "스트레스 점수", "고독사",
];
const ENGLISH_BANNED_IN_STRINGS = [
  /\bstudy\b/i, /\bsubject\b/i, /\btrial\b/i, /\bburnout\b/i,
  /\brisk score\b/i, /\bstress score\b/i, /\bstreak\b/i,
];

const EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".expo", "dist", "build"]);

function* walk(path) {
  const st = statSync(path);
  if (st.isFile()) { yield path; return; }
  for (const entry of readdirSync(path)) {
    if (SKIP_DIRS.has(entry)) continue;
    yield* walk(join(path, entry));
  }
}

// Strip // line comments and /* */ block comments so the lint audits SCREEN
// copy, not the documentation that (necessarily) names the banned words. A
// banned Korean word in an actual UI string still gets caught below.
function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let inStr = null; // quote char when inside a string literal
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (inStr) {
      out += c;
      if (c === "\\") { out += next ?? ""; i += 2; continue; }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { inStr = c; out += c; i++; continue; }
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") out += "\n"; i++; }
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function stringLiterals(src) {
  // Good-enough literal extraction: '...', "...", `...`
  const out = [];
  const re = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = re.exec(src))) out.push({ text: m[0], index: m.index });
  return out;
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

const violations = [];
for (const root of process.argv.slice(2)) {
  let files;
  try { files = [...walk(root)]; } catch { continue; }
  for (const file of files) {
    if (!EXTS.has(extname(file))) continue;
    const src = stripComments(readFileSync(file, "utf8"));
    for (const term of KOREAN_BANNED) {
      let i = -1;
      while ((i = src.indexOf(term, i + 1)) !== -1) {
        violations.push({ file, line: lineOf(src, i), term });
      }
    }
    for (const lit of stringLiterals(src)) {
      for (const re of ENGLISH_BANNED_IN_STRINGS) {
        if (re.test(lit.text)) {
          violations.push({ file, line: lineOf(src, lit.index), term: re.source });
        }
      }
    }
  }
}

if (violations.length) {
  console.error("Copy lint failed — research/score language in user-facing source:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  banned term: ${v.term}`);
  }
  console.error(
    "\nUse care language instead (돌봄/어르신/이용자/오늘의 기록/평소/변화). See CONTRIBUTING.md.",
  );
  process.exit(1);
}
console.log("copy-lint: OK (no research language in UI source)");
