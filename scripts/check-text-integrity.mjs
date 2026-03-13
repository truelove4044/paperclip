import fs from "node:fs";
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
    const relativePath = path.relative(rootDir, filePath).replaceAll("\\", "/");
    const buffer = fs.readFileSync(filePath);

    if (hasUtf8Bom(buffer)) {
      errors.push(`${relativePath}: UTF-8 BOM detected`);
      continue;
    }

    let content;
    try {
      content = decoder.decode(buffer);
    } catch {
      errors.push(`${relativePath}: invalid UTF-8`);
      continue;
    }

    if (content.includes(String.fromCharCode(0xfffd))) {
      errors.push(`${relativePath}: replacement character (U+FFFD) detected`);
      continue;
    }

    const { crlf, loneLf } = countLineEndings(content);
    if (crlf > 0) {
      const mode = loneLf > 0 ? "mixed line endings (CRLF + LF)" : "CRLF line endings detected";
      errors.push(`${relativePath}: ${mode}`);
    }
  }

  if (errors.length > 0) {
    console.error("check:text failed");
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(`check:text passed (${textFiles.length} files checked)`);
}

main();
