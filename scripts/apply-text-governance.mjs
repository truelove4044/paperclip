#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_NAME = "normalize-text-lf";

const ALLOWED_TEXT_EXTENSIONS = new Set([
  ".vue",
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".scss",
  ".html",
  ".txt",
  ".sql",
]);

const ALLOWED_TEXT_FILE_NAMES = new Set([
  ".gitattributes",
  ".editorconfig",
]);

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "output",
  ".appdata",
  ".localappdata",
  ".npm-cache",
  ".playwright-cli",
]);

const GITATTR_START = "# >>> normalize-text-lf managed block";
const GITATTR_END = "# <<< normalize-text-lf managed block";
const GITATTR_BODY = [
  "* text=auto eol=lf",
  "",
  "*.vue  text eol=lf",
  "*.ts   text eol=lf",
  "*.js   text eol=lf",
  "*.mjs  text eol=lf",
  "*.cjs  text eol=lf",
  "*.json text eol=lf",
  "*.md   text eol=lf",
  "*.yml  text eol=lf",
  "*.yaml text eol=lf",
  "*.css  text eol=lf",
  "*.scss text eol=lf",
  "*.html text eol=lf",
  "*.txt  text eol=lf",
  "*.sql  text eol=lf",
  "",
  "*.png binary",
  "*.jpg binary",
  "*.jpeg binary",
  "*.gif binary",
  "*.webp binary",
  "*.ico binary",
  "*.svg binary",
  "*.pdf binary",
];

const EDITORCONFIG_START = "# >>> normalize-text-lf managed block";
const EDITORCONFIG_END = "# <<< normalize-text-lf managed block";
const EDITORCONFIG_BODY = [
  "[*]",
  "charset = utf-8",
  "end_of_line = lf",
  "insert_final_newline = true",
  "indent_style = space",
  "indent_size = 2",
  "",
  "[*.md]",
  "trim_trailing_whitespace = false",
];

const CHECK_SCRIPT_RELATIVE = path.join("scripts", "check-text-integrity.mjs");
const APPLY_SCRIPT_RELATIVE = path.join("scripts", "apply-text-governance.mjs");
const CHECK_SCRIPT_CONTENT = `import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

const allowedTextExtensions = new Set([
  ".vue",
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".scss",
  ".html",
  ".txt",
  ".sql",
]);

const allowedTextFileNames = new Set([
  ".gitattributes",
  ".editorconfig",
]);

const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "output",
  ".appdata",
  ".localappdata",
  ".npm-cache",
  ".playwright-cli",
]);

function hasUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function countLineEndings(content) {
  let crlf = 0;
  let loneLf = 0;
  for (let i = 0; i < content.length; i += 1) {
    const code = content.charCodeAt(i);
    if (code !== 10) continue;
    if (i > 0 && content.charCodeAt(i - 1) === 13) {
      crlf += 1;
    } else {
      loneLf += 1;
    }
  }
  return { crlf, loneLf };
}

function walkFiles(dirPath, fileCollector) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      walkFiles(fullPath, fileCollector);
      continue;
    }
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (allowedTextExtensions.has(ext) || allowedTextFileNames.has(entry.name)) {
      fileCollector.push(fullPath);
    }
  }
}

function main() {
  const textFiles = [];
  walkFiles(rootDir, textFiles);

  const errors = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });

  for (const filePath of textFiles) {
    const relativePath = path.relative(rootDir, filePath).replaceAll("\\\\", "/");
    const buffer = fs.readFileSync(filePath);

    if (hasUtf8Bom(buffer)) {
      errors.push(\`\${relativePath}: UTF-8 BOM detected\`);
      continue;
    }

    let content;
    try {
      content = decoder.decode(buffer);
    } catch {
      errors.push(\`\${relativePath}: invalid UTF-8\`);
      continue;
    }

    if (content.includes(String.fromCharCode(0xfffd))) {
      errors.push(\`\${relativePath}: replacement character (U+FFFD) detected\`);
      continue;
    }

    const { crlf, loneLf } = countLineEndings(content);
    if (crlf > 0) {
      const mode = loneLf > 0 ? "mixed line endings (CRLF + LF)" : "CRLF line endings detected";
      errors.push(\`\${relativePath}: \${mode}\`);
    }
  }

  if (errors.length > 0) {
    console.error("check:text failed");
    for (const err of errors) {
      console.error(\`- \${err}\`);
    }
    process.exit(1);
  }

  console.log(\`check:text passed (\${textFiles.length} files checked)\`);
}

main();
`;

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    dryRun: false,
    noPackageUpdate: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("--root requires a path value");
      }
      options.root = path.resolve(value);
      i += 1;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--no-package-update") {
      options.noPackageUpdate = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log([
        `Usage: node ${path.basename(process.argv[1])} [--root <path>] [--dry-run] [--no-package-update]`,
        "",
        "Options:",
        "  --root <path>          Target project root. Defaults to current working directory.",
        "  --dry-run              Print intended changes without writing files.",
        "  --no-package-update    Skip package.json scripts injection.",
      ].join("\n"));
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function hasUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function normalizeTextToLf(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function decodeUtf8(buffer, filePath) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error(`Invalid UTF-8 content: ${filePath}`);
  }
}

function upsertManagedBlock(existingText, startMarker, endMarker, bodyLines) {
  const normalized = normalizeTextToLf(existingText || "");
  const block = [startMarker, ...bodyLines, endMarker].join("\n");
  const blockRegex = new RegExp(`${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`, "g");

  if (blockRegex.test(normalized)) {
    return normalized.replace(blockRegex, block);
  }
  if (!normalized.trim()) {
    return `${block}\n`;
  }
  return `${normalized.replace(/\n+$/g, "")}\n\n${block}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeUtf8NoBom(filePath, content, dryRun, summary) {
  const normalizedContent = normalizeTextToLf(content);
  let before = null;
  if (fs.existsSync(filePath)) {
    before = fs.readFileSync(filePath);
  }
  const nextBuffer = Buffer.from(normalizedContent, "utf8");
  const changed = before === null || !before.equals(nextBuffer);

  if (changed && !dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, nextBuffer);
  }

  if (changed) {
    summary.changed += 1;
    summary.changedFiles.push(filePath);
  }
  return changed;
}

function updateGitattributes(rootDir, dryRun, summary) {
  const filePath = path.join(rootDir, ".gitattributes");
  const current = fs.existsSync(filePath) ? decodeUtf8(fs.readFileSync(filePath), filePath) : "";
  const next = upsertManagedBlock(current, GITATTR_START, GITATTR_END, GITATTR_BODY);
  writeUtf8NoBom(filePath, next, dryRun, summary);
}

function updateEditorconfig(rootDir, dryRun, summary) {
  const filePath = path.join(rootDir, ".editorconfig");
  const current = fs.existsSync(filePath) ? decodeUtf8(fs.readFileSync(filePath), filePath) : "";
  const base = current.trim() ? current : "root = true\n";
  const next = upsertManagedBlock(base, EDITORCONFIG_START, EDITORCONFIG_END, EDITORCONFIG_BODY);
  writeUtf8NoBom(filePath, next, dryRun, summary);
}

function updatePrettierConfig(rootDir, dryRun, summary, warnings) {
  const candidates = [".prettierrc.json", ".prettierrc"];
  for (const name of candidates) {
    const filePath = path.join(rootDir, name);
    if (!fs.existsSync(filePath)) continue;

    let parsed;
    try {
      parsed = JSON.parse(decodeUtf8(fs.readFileSync(filePath), filePath));
    } catch {
      warnings.push(`Skipped ${name}: not valid JSON`);
      return;
    }

    parsed.endOfLine = "lf";
    const next = `${JSON.stringify(parsed, null, 2)}\n`;
    writeUtf8NoBom(filePath, next, dryRun, summary);
    return;
  }
}

function updatePackageJson(rootDir, dryRun, summary, warnings) {
  const filePath = path.join(rootDir, "package.json");
  if (!fs.existsSync(filePath)) return;

  let pkg;
  try {
    pkg = JSON.parse(decodeUtf8(fs.readFileSync(filePath), filePath));
  } catch {
    warnings.push("Skipped package.json: invalid JSON");
    return;
  }

  if (typeof pkg !== "object" || pkg === null || Array.isArray(pkg)) {
    warnings.push("Skipped package.json: root must be an object");
    return;
  }

  if (!pkg.scripts || typeof pkg.scripts !== "object" || Array.isArray(pkg.scripts)) {
    pkg.scripts = {};
  }
  pkg.scripts["check:text"] = "node scripts/check-text-integrity.mjs";
  pkg.scripts["lint:text"] = "npm run check:text";
  pkg.scripts["apply:text"] = "node scripts/apply-text-governance.mjs";
  pkg.scripts["apply:text:dry-run"] = "node scripts/apply-text-governance.mjs --dry-run";

  const next = `${JSON.stringify(pkg, null, 2)}\n`;
  writeUtf8NoBom(filePath, next, dryRun, summary);
}

function writeCheckScript(rootDir, dryRun, summary) {
  const filePath = path.join(rootDir, CHECK_SCRIPT_RELATIVE);
  writeUtf8NoBom(filePath, CHECK_SCRIPT_CONTENT, dryRun, summary);
}

function writeApplyScript(rootDir, dryRun, summary) {
  const sourcePath = fileURLToPath(import.meta.url);
  const destinationPath = path.join(rootDir, APPLY_SCRIPT_RELATIVE);
  if (path.resolve(sourcePath) === path.resolve(destinationPath)) {
    return;
  }
  const content = decodeUtf8(fs.readFileSync(sourcePath), sourcePath);
  writeUtf8NoBom(destinationPath, content, dryRun, summary);
}

function collectGovernedFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) continue;
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED_TEXT_EXTENSIONS.has(ext) || ALLOWED_TEXT_FILE_NAMES.has(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

function normalizeGovernedTextFiles(rootDir, dryRun, summary, warnings) {
  const files = collectGovernedFiles(rootDir);
  summary.checked += files.length;

  for (const filePath of files) {
    const buffer = fs.readFileSync(filePath);
    let text;
    try {
      text = decodeUtf8(buffer, filePath);
    } catch (err) {
      warnings.push(err.message);
      continue;
    }

    const hadBom = hasUtf8Bom(buffer);
    const normalized = normalizeTextToLf(text);
    const nextBuffer = Buffer.from(normalized, "utf8");
    const changed = hadBom || !buffer.equals(nextBuffer);

    if (changed && !dryRun) {
      fs.writeFileSync(filePath, nextBuffer);
    }
    if (changed) {
      summary.changed += 1;
      summary.changedFiles.push(filePath);
    }
  }
}

function toRelativeList(rootDir, files) {
  return files.map((file) => path.relative(rootDir, file).replaceAll("\\", "/")).sort();
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = options.root;
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    throw new Error(`Root directory not found: ${rootDir}`);
  }

  const summary = {
    checked: 0,
    changed: 0,
    changedFiles: [],
  };
  const warnings = [];

  updateGitattributes(rootDir, options.dryRun, summary);
  updateEditorconfig(rootDir, options.dryRun, summary);
  writeCheckScript(rootDir, options.dryRun, summary);
  writeApplyScript(rootDir, options.dryRun, summary);
  updatePrettierConfig(rootDir, options.dryRun, summary, warnings);
  if (!options.noPackageUpdate) {
    updatePackageJson(rootDir, options.dryRun, summary, warnings);
  }
  normalizeGovernedTextFiles(rootDir, options.dryRun, summary, warnings);

  console.log(`[${SKILL_NAME}] root: ${rootDir}`);
  console.log(`[${SKILL_NAME}] mode: ${options.dryRun ? "dry-run" : "write"}`);
  console.log(`[${SKILL_NAME}] checked files: ${summary.checked}`);
  console.log(`[${SKILL_NAME}] changed files: ${summary.changed}`);

  if (summary.changedFiles.length > 0) {
    console.log("[normalize-text-lf] changed list:");
    for (const relative of toRelativeList(rootDir, summary.changedFiles)) {
      console.log(`- ${relative}`);
    }
  }

  if (warnings.length > 0) {
    console.warn("[normalize-text-lf] warnings:");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`[${SKILL_NAME}] failed: ${error.message}`);
  process.exit(1);
}
