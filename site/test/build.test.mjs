import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';

const exec = promisify(execFile);

test('배포 산출물은 공개 글만 포함하고, 미리보기와 원본 주소를 분리한다', async t => {
  const root = await mkdtemp(join(tmpdir(), 'study-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, 'site');
  await mkdir(project);
  for (const path of ['src', 'astro.config.mjs', 'package.json']) await cp(resolve(path), join(project, path), { recursive: true });
  await symlink(resolve('node_modules'), join(project, 'node_modules'), 'dir');
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
  await writeFile(join(root, 'public.png'), image);
  await writeFile(join(root, 'private.png'), Buffer.concat([image, Buffer.from('private')]));
  await writeFile(join(root, 'public.md'), '# 공개 글\n\n## 관찰 결과\n\n![공개 이미지](./public.png)\n\n```js\nconst value = "<hello>";\n```\n');
  await writeFile(join(root, 'private.md'), '# 미공개 글\n\nPRIVATE_SENTINEL\n\n![비공개 이미지](./private.png)\n');
  await writeFile(join(root, 'secret.heapsnapshot'), 'MUST_NOT_SHIP');
  await writeFile(join(root, 'analysis.json'), '{}');
  await writeFile(join(project, 'posts.json'), JSON.stringify([
    { slug: 'public-post', source: 'public.md', title: '공개 글', description: '공개 요약', publishedAt: '2026-09-06', draft: false },
    { slug: 'private-post', source: 'private.md', title: '미공개 글', description: '비공개 요약', publishedAt: null, draft: true },
  ]));
  const build = preview => exec(process.execPath, [resolve('node_modules/astro/bin/astro.mjs'), 'build'], {
    cwd: project,
    env: { ...process.env, BLOG_PREVIEW: preview ? '1' : '0', ASTRO_TELEMETRY_DISABLED: '1' },
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  await build(true);
  const review = await readFile(join(project, 'dist-preview/posts/private-post/index.html'), 'utf8');
  assert.match(review, /PRIVATE_SENTINEL/);
  assert.match(review, /noindex, nofollow/);
  assert.doesNotMatch(review, /rel="canonical"/);
  assert.doesNotMatch(review, /utteranc\.es\/client\.js/);
  assert.doesNotMatch(await readFile(join(project, 'dist-preview/posts/public-post/index.html'), 'utf8'), /utteranc\.es\/client\.js/);
  assert.doesNotMatch(await readFile(join(project, 'dist-preview/sitemap.xml'), 'utf8'), /<loc>/);
  await build(false);
  const out = join(project, 'dist');
  const article = await readFile(join(out, 'posts/public-post/index.html'), 'utf8');
  assert.match(article, /rel="canonical" href="https:\/\/kangjuhyup.github.io\/study\/posts\/public-post\/"/);
  assert.match(article, /name="description" content="공개 요약"/);
  assert.match(article, /<html lang="ko">/);
  assert.match(article, /src="https:\/\/utteranc\.es\/client\.js"/);
  assert.match(article, /repo="kangjuhyup\/study"/);
  assert.match(article, /issue-term="pathname"/);
  assert.doesNotMatch(article, /noindex|PRIVATE_SENTINEL/);
  assert.equal((article.match(/<h1[ >]/g) ?? []).length, 1);
  const asset = article.match(/<img src="\/study\/media\/([^"/]+)"/)[1];
  assert.deepEqual(await readFile(join(out, 'media', asset)), image);
  assert.deepEqual(await readdir(join(out, 'media')), [asset]);
  assert.deepEqual(await readdir(join(out, 'posts')), ['public-post']);
  const sitemap = await readFile(join(out, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/kangjuhyup.github.io\/study\/posts\/public-post\//);
  assert.doesNotMatch(sitemap, /private-post/);
  const files = await readdir(out, { recursive: true });
  assert(!files.some(file => /heapsnapshot|analysis\.json|\.prerender|posts\.json|\.md$/.test(file)));
  assert.doesNotMatch(await readFile(join(out, 'index.html'), 'utf8'), /미공개 글|private-post/);
});
