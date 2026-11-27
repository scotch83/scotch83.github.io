#!/usr/bin/env node
/**
 * Type-check the code samples inside a post.
 *
 * The publisher writes posts with fenced TypeScript. A sample that does not compile is worse
 * than no sample: a reader pastes it, it fails, and the post loses its credibility. This
 * script is the mechanical gate — it does not judge whether the prose is right, only that the
 * code is real TypeScript that could actually run.
 *
 * Rules, in order of how much they catch:
 *   1. Every fenced ```ts / ```typescript / ```tsx block must parse.
 *   2. Every identifier must be imported or declared somewhere in the post. A sample may not
 *      lean on a type the reader cannot see - no undeclared `Item`, no bare `MapLibrary`.
 *   3. The blocks of one post are compiled together, so a type declared in block 1 is visible
 *      in block 3. Fragments of a class body are wrapped in a throwaway class, because a post
 *      legitimately shows "the part that changed".
 *
 * Usage:
 *   node automation/verify-code.mjs _posts/2026-11-27-angular-signals-zoneless.md [...]
 *   node automation/verify-code.mjs --changed        # every post added/modified vs origin/main
 *   node automation/verify-code.mjs --changed --base origin/develop
 *
 * Exit code 0 when every post passes, 1 with a per-block report otherwise.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const automationDir = path.dirname(fileURLToPath(import.meta.url));

const CODE_LANGS = new Set(['ts', 'typescript', 'tsx']);
const IMPORT_RE = /^\s*import\s[\s\S]*?from\s+['"][^'"]+['"];?\s*$/;
const TOP_LEVEL_RE =
  /^(export\s+)?(declare\s+)?(async\s+)?(class|interface|type|enum|namespace|function|const|let|var|abstract\s+class)\b/;

/** Pull fenced code blocks out of a markdown document, keeping their starting line. */
function extractBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let current = null;
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w-]*)\s*$/);
    if (!current) {
      if (fence) {
        current = { lang: (fence[2] || '').toLowerCase(), lines: [], fenceLen: fence[1].length };
        startLine = i + 2; // first line of code, 1-based
      }
      continue;
    }
    if (fence && fence[1].length >= current.fenceLen) {
      if (CODE_LANGS.has(current.lang)) {
        blocks.push({ code: current.lines.join('\n'), line: startLine });
      }
      current = null;
      continue;
    }
    current.lines.push(line);
  }
  return blocks;
}

/**
 * Decide whether a block is a whole file or a fragment of one.
 * A fragment is the common case in a post: members shown without their enclosing class.
 */
function isFragment(code) {
  const lines = code.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
  if (!lines.length) return false;
  return !lines.some((l) => TOP_LEVEL_RE.test(l));
}

/** Split the leading import statements off a block, however they are wrapped. */
function splitImports(code) {
  const lines = code.split('\n');
  const imports = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (!/^\s*import\b/.test(line)) break;
    const statement = [];
    let done = false;
    while (i < lines.length && !done) {
      statement.push(lines[i]);
      const text = statement.join('\n');
      if (/;\s*$/.test(text) || /from\s+['"][^'"]+['"]\s*$/.test(text) || /^\s*import\s+['"][^'"]+['"]\s*$/.test(text)) {
        done = true;
      }
      i++;
    }
    imports.push(statement.join('\n').trim());
  }
  return { imports, rest: lines.slice(i).join('\n') };
}

/**
 * Fold the imports of every block into one set per module. A post legitimately imports
 * `@angular/core` in three different samples; compiling them together must not look like a
 * duplicate declaration.
 */
function mergeImports(statements) {
  const modules = new Map();
  const sideEffect = new Set();
  const slot = (mod) => {
    if (!modules.has(mod)) modules.set(mod, { def: new Set(), named: new Set(), ns: new Set() });
    return modules.get(mod);
  };
  for (const raw of statements) {
    const stmt = raw.replace(/\s+/g, ' ').trim();
    const bare = stmt.match(/^import\s+['"]([^'"]+)['"];?$/);
    if (bare) {
      sideEffect.add(bare[1]);
      continue;
    }
    const withFrom = stmt.match(/^import\s+([\s\S]+?)\s+from\s+['"]([^'"]+)['"];?$/);
    if (!withFrom) continue;
    const mod = withFrom[2];
    let clause = withFrom[1].replace(/^type\s+/, '');
    const ns = clause.match(/^\*\s+as\s+([\w$]+)$/);
    if (ns) {
      slot(mod).ns.add(ns[1]);
      continue;
    }
    const named = clause.match(/\{([\s\S]*)\}/);
    if (named) {
      named[1]
        .split(',')
        .map((x) => x.trim().replace(/^type\s+/, ''))
        .filter(Boolean)
        .forEach((x) => slot(mod).named.add(x));
      clause = clause.replace(/\{[\s\S]*\}/, '').replace(/,\s*$/, '').trim();
    }
    if (/^[\w$]+$/.test(clause)) slot(mod).def.add(clause);
  }
  const out = [];
  for (const [mod, s] of modules) {
    for (const ns of s.ns) out.push(`import * as ${ns} from '${mod}';`);
    const def = [...s.def];
    const named = [...s.named];
    if (def.length || named.length) {
      const clause = [def[0], named.length ? `{ ${named.join(', ')} }` : '']
        .filter(Boolean)
        .join(', ');
      out.push(`import ${clause} from '${mod}';`);
    }
  }
  for (const mod of sideEffect) out.push(`import '${mod}';`);
  return out;
}

/** Build one TypeScript module for a post, so its blocks can see each other. */
function buildModule(postName, blocks) {
  const imports = new Set();
  /** @type {{text: string, markdown: number|null}[]} */
  const out = [];
  const push = (text, markdown = null) => out.push({ text, markdown });

  const seen = new Set();
  blocks.forEach((block, index) => {
    const { imports: blockImports, rest } = splitImports(block.code);
    blockImports.forEach((imp) => imports.add(imp.replace(/^import\s+type\s+/, 'import ')));
    const trimmed = rest.trim();
    if (!trimmed) return;
    // A post often repeats a block verbatim ("the same type, now with a field"); the copy is
    // prose, not a second declaration.
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    const bodyLines = rest.replace(/\s+$/, '').split('\n');
    const offset = block.code.split('\n').length - bodyLines.length;
    push(`// block ${index + 1}`);
    if (isFragment(trimmed)) {
      push(`class Snippet${index + 1} {`);
    }
    bodyLines.forEach((text, i) => push(text, block.line + offset + i));
    if (isFragment(trimmed)) push('}');
    push('');
  });

  // The import header is emitted as ordinary entries so the line map stays aligned with the
  // file TypeScript actually compiles.
  const merged = mergeImports([...imports]);
  const header = merged.length
    ? merged.map((text) => ({ text, markdown: null })).concat([{ text: '', markdown: null }])
    : [];
  const lines = header.concat(out);
  return { source: lines.map((l) => l.text).join('\n') + '\n', lines };
}

function diagnose(postName, blocks) {
  const { source, lines: lineMap } = buildModule(postName, blocks);
  // A synthetic path would need a patched compiler host, and TypeScript bypasses the obvious
  // hook; compiling a real temporary file next to the installed dependencies is duller and
  // actually works.
  const dir = existsSync(path.join(automationDir, 'node_modules')) ? automationDir : process.cwd();
  const stem = postName.replace(/\.md$/i, '').replace(/[^\w.-]/g, '_');
  const file = path.join(dir, `.verify-${stem}.ts`);
  const options = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    experimentalDecorators: true,
    useDefineForClassFields: false,
    skipLibCheck: true,
    types: [],
    noUnusedLocals: false,
    allowJs: false,
  };
  try {
    writeFileSync(file, source);
    const program = ts.createProgram([file], options);
    return ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file && path.resolve(d.file.fileName) === path.resolve(file))
      .map((d) => {
        const { line } = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
        return {
          line,
          markdown: lineMap[line] ? lineMap[line].markdown : null,
          text: ts.flattenDiagnosticMessageText(d.messageText, ' '),
          code: d.code,
        };
      });
  } finally {
    rmSync(file, { force: true });
  }
}

function postsFromArgs(args) {
  if (args.includes('--changed')) {
    const baseIndex = args.indexOf('--base');
    const base = baseIndex === -1 ? 'origin/main' : args[baseIndex + 1];
    const out = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`, '--', '_posts'],
      { encoding: 'utf8' },
    );
    return out.split('\n').filter((p) => p.endsWith('.md'));
  }
  return args.filter((a) => !a.startsWith('--'));
}

function main() {
  const posts = postsFromArgs(process.argv.slice(2));
  if (!posts.length) {
    console.log('ok    no posts changed - nothing to type-check');
    return 0;
  }
  let failed = 0;
  for (const post of posts) {
    const markdown = readFileSync(post, 'utf8');
    const blocks = extractBlocks(markdown);
    if (!blocks.length) {
      console.log(`ok    ${post} - no TypeScript samples`);
      continue;
    }
    const diagnostics = diagnose(path.basename(post), blocks);
    if (!diagnostics.length) {
      console.log(`ok    ${post} - ${blocks.length} sample(s) type-check`);
      continue;
    }
    failed++;
    console.error(`FAIL  ${post} - ${diagnostics.length} problem(s) in ${blocks.length} sample(s)`);
    for (const d of diagnostics) {
      const where = d.markdown ? `${post}:${d.markdown}` : `${post} (generated glue)`;
      console.error(`        ${where}  TS${d.code}  ${d.text}`);
    }
    console.error(
      '        The post must declare every type and import its samples use, so a reader can\n' +
        '        paste them into a project and compile.',
    );
  }
  return failed ? 1 : 0;
}

process.exit(main());
