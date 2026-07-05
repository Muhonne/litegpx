import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const requiredDocs = ["PRODUCT.md", "USE_CASES.md", "DATA.md"];
const errors = [];

for (const file of requiredDocs) {
  const docsPath = path.join(root, "docs", file);
  const rootPath = path.join(root, file);
  if (!fs.existsSync(docsPath)) errors.push(`Missing docs/${file}`);
  if (fs.existsSync(rootPath)) errors.push(`${file} should live under docs/, not the workspace root`);
}

const markdownFiles = [];
function collectMarkdown(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdown(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      markdownFiles.push(fullPath);
    }
  }
}

for (const dir of ["docs", "web", "mobile", "mapdataservice"]) {
  collectMarkdown(path.join(root, dir));
}
markdownFiles.push(path.join(root, "AGENTS.md"));

const linkPattern = /\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/g;
for (const file of markdownFiles) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1].split("#")[0];
    if (/^[a-z]+:\/\//i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      errors.push(`${path.relative(root, file)} links to missing ${match[1]}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Documentation structure OK (${markdownFiles.length} markdown files checked).`);
