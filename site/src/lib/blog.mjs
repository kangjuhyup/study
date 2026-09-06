import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import MarkdownIt from 'markdown-it';
import { pagePath, isPreview } from './settings.mjs';

// Astro relocates bundled modules while prerendering; npm scripts run from site/.
const defaultWorkspace = resolve(process.cwd(), '..');
const defaultManifest = resolve(process.cwd(), 'posts.json');
const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif' };

async function workspaceFile(root, candidate) {
  const path = await realpath(candidate).catch(() => { throw new Error(`파일을 찾을 수 없습니다: ${relative(root, candidate)}`); });
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`workspace 밖의 파일은 사용할 수 없습니다: ${candidate}`);
  }
  return path;
}

function validateEntries(entries) {
  if (!Array.isArray(entries)) throw new Error('posts.json은 배열이어야 합니다.');
  const slugs = new Set();
  const sources = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || typeof entry.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)) throw new Error('유효한 slug가 필요합니다.');
    if (slugs.has(entry.slug)) throw new Error(`중복 slug: ${entry.slug}`);
    slugs.add(entry.slug);
    if (typeof entry.source !== 'string' || isAbsolute(entry.source) || extname(entry.source) !== '.md') throw new Error(`원문은 workspace 기준 .md 경로여야 합니다: ${entry.slug}`);
    if (sources.has(entry.source)) throw new Error(`중복 원문: ${entry.source}`);
    sources.add(entry.source);
    for (const field of ['title', 'description']) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) throw new Error(`${entry.slug}: ${field}가 필요합니다.`);
    }
    if (typeof entry.draft !== 'boolean') throw new Error(`${entry.slug}: draft는 boolean이어야 합니다.`);
    const date = entry.publishedAt;
    if (date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error(`${entry.slug}: 발행일은 유효한 YYYY-MM-DD 또는 null이어야 합니다.`);
    if (!entry.draft && !date) throw new Error(`${entry.slug}: 공개 글에는 발행일이 필요합니다.`);
  }
}

function headingText(token) {
  return (token.children ?? []).filter(child => child.type === 'text' || child.type === 'code_inline').map(child => child.content).join('');
}

export async function loadBlog({ workspaceRoot = defaultWorkspace, manifestPath = defaultManifest, preview = isPreview() } = {}) {
  const root = await realpath(workspaceRoot);
  const entries = JSON.parse(await readFile(manifestPath, 'utf8'));
  validateEntries(entries);
  const paths = new Map();
  const resolvedSources = new Set();
  for (const entry of entries) {
    const source = await workspaceFile(root, resolve(root, entry.source));
    if (resolvedSources.has(source)) throw new Error(`중복 원문: ${entry.source}`);
    resolvedSources.add(source);
    paths.set(entry.slug, source);
  }
  const visible = entries.filter(entry => preview || !entry.draft);
  const sourceURLs = new Map(visible.map(entry => [paths.get(entry.slug), pagePath(`posts/${entry.slug}/`)]));
  const images = new Map();
  const posts = [];

  for (const entry of visible) {
    const source = paths.get(entry.slug);
    const markdown = await readFile(source, 'utf8');
    const md = new MarkdownIt({ html: false, linkify: true });
    const tokens = md.parse(markdown, {});
    if (tokens[0]?.type !== 'heading_open' || tokens[0].tag !== 'h1' || headingText(tokens[1]) !== entry.title) throw new Error(`${entry.source}: 첫 제목은 등록한 title과 같아야 합니다.`);
    tokens.splice(0, 3);
    const headings = [];
    const ids = new Set();
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'heading_open') continue;
      if (tokens[i].tag === 'h1') throw new Error(`${entry.source}: 본문에 두 번째 h1을 사용할 수 없습니다.`);
      const text = headingText(tokens[i + 1]);
      const stem = text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
      let id = stem;
      for (let count = 2; ids.has(id); count++) id = `${stem}-${count}`;
      ids.add(id);
      tokens[i].attrSet('id', id);
      if (tokens[i].tag === 'h2' || tokens[i].tag === 'h3') headings.push({ text, id, level: Number(tokens[i].tag.slice(1)) });
    }

    async function visit(nodes) {
      for (const token of nodes) {
        if (token.type === 'image') {
          const src = token.attrGet('src');
          if (/^https:\/\//i.test(src)) {
            // Remote images remain links; the build never downloads remote resources.
          } else {
            if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(src)) throw new Error(`${entry.source}: 지원하지 않는 이미지 주소: ${src}`);
            const imagePath = await workspaceFile(root, resolve(dirname(source), decodeURIComponent(src)));
            const extension = extname(imagePath).toLowerCase();
            if (!imageTypes[extension]) throw new Error(`${entry.source}: 지원하지 않는 이미지 형식: ${src}`);
            const bytes = await readFile(imagePath);
            const hash = createHash('sha256').update(bytes).digest('hex');
            const asset = `${hash}${extension}`;
            images.set(asset, { bytes, contentType: imageTypes[extension] });
            token.attrSet('src', pagePath(`media/${asset}`));
          }
          token.attrSet('loading', 'lazy');
          token.attrSet('decoding', 'async');
        }
        if (token.type === 'link_open') {
          const href = token.attrGet('href');
          if (href.startsWith('#')) {
            if (!ids.has(decodeURIComponent(href.slice(1)))) throw new Error(`${entry.source}: 없는 본문 제목 링크: ${href}`);
          } else if (!/^(https?:|mailto:)/i.test(href)) {
            const [pathPart, fragment] = href.split('#');
            const linkedSource = await workspaceFile(root, resolve(dirname(source), decodeURIComponent(pathPart)));
            const url = sourceURLs.get(linkedSource);
            if (!url) throw new Error(`${entry.source}: 공개 대상으로 등록되지 않은 로컬 링크: ${href}`);
            token.attrSet('href', url + (fragment ? `#${fragment}` : ''));
          }
        }
        if (token.children) await visit(token.children);
      }
    }
    await visit(tokens);
    posts.push({ ...entry, path: pagePath(`posts/${entry.slug}/`), html: md.renderer.render(tokens, md.options, {}), headings });
  }
  posts.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.slug.localeCompare(b.slug));
  return { posts, images, preview };
}
