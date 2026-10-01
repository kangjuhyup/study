import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const exec = promisify(execFile);

test('배포 산출물은 공개 글만 포함하고, 미리보기와 원본 주소를 분리한다', async t => {
  const root = await mkdtemp(join(tmpdir(), 'study-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, 'site');
  await mkdir(project);
  for (const path of ['src', 'astro.config.mjs', 'package.json']) await cp(resolve(path), join(project, path), { recursive: true });
  await symlink(resolve('node_modules'), join(project, 'node_modules'), 'dir');
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
  const publicDescription = '공개 요약 </script><script id="seo-injection">alert(1)</script>';
  await writeFile(join(root, 'public.png'), image);
  await writeFile(join(root, 'private.png'), Buffer.concat([image, Buffer.from('private')]));
  await writeFile(join(root, 'public.md'), '# 공개 글\n\n## 관찰 결과\n\n![공개 이미지](./public.png)\n\n```js\nconst value = "<hello>";\n```\n');
  await writeFile(join(root, 'private.md'), '# 미공개 글\n\nPRIVATE_SENTINEL\n\n![비공개 이미지](./private.png)\n');
  await writeFile(join(root, 'secret.heapsnapshot'), 'MUST_NOT_SHIP');
  await writeFile(join(root, 'analysis.json'), '{}');
  await writeFile(join(project, 'posts.json'), JSON.stringify([
    { slug: 'public-post', source: 'public.md', title: '공개 글', description: publicDescription, publishedAt: '2026-09-06', draft: false },
    { slug: 'private-post', source: 'private.md', title: '미공개 글', description: '비공개 요약', publishedAt: null, draft: true },
  ]));
  const build = (preview, measurementId = '', verification = '') => exec(process.execPath, [resolve('node_modules/astro/bin/astro.mjs'), 'build'], {
    cwd: project,
    env: { ...process.env, BLOG_PREVIEW: preview ? '1' : '0', PUBLIC_GA_MEASUREMENT_ID: measurementId, PUBLIC_GOOGLE_SITE_VERIFICATION: verification, ASTRO_TELEMETRY_DISABLED: '1' },
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  await build(true, 'G-STUDY12345', 'test-verification-token');
  const review = await readFile(join(project, 'dist-preview/posts/private-post/index.html'), 'utf8');
  assert.match(review, /PRIVATE_SENTINEL/);
  assert.match(review, /noindex, nofollow/);
  assert.doesNotMatch(review, /rel="canonical"/);
  assert.doesNotMatch(review, /utteranc\.es\/client\.js/);
  assert.doesNotMatch(await readFile(join(project, 'dist-preview/posts/public-post/index.html'), 'utf8'), /utteranc\.es\/client\.js/);
  const aboutPreview = await readFile(join(project, 'dist-preview/about/index.html'), 'utf8');
  assert.match(aboutPreview, /noindex, nofollow/);
  assert.doesNotMatch(aboutPreview, /rel="canonical"/);
  assert.doesNotMatch(await readFile(join(project, 'dist-preview/sitemap.xml'), 'utf8'), /<loc>/);
  assert.match(await readFile(join(project, 'dist-preview/robots.txt'), 'utf8'), /Disallow: \//);
  for (const page of ['index.html', 'about/index.html', 'posts/public-post/index.html', 'posts/private-post/index.html']) {
    assert.doesNotMatch(await readFile(join(project, 'dist-preview', page), 'utf8'), /googletagmanager|G-STUDY12345/);
    assert.doesNotMatch(await readFile(join(project, 'dist-preview', page), 'utf8'), /application\/ld\+json|google-site-verification|article:published_time/);
  }
  await build(false);
  const out = join(project, 'dist');
  const article = await readFile(join(out, 'posts/public-post/index.html'), 'utf8');
  assert.match(article, /rel="canonical" href="https:\/\/blog\.rvkang\.app\/posts\/public-post\/"/);
  assert.match(article, /name="description" content="공개 요약/);
  assert.match(article, /<html lang="ko">/);
  assert.match(article, /src="https:\/\/utteranc\.es\/client\.js"/);
  assert.match(article, /repo="kangjuhyup\/study"/);
  assert.match(article, /issue-term="\/study\/posts\/public-post\/"/);
  assert.doesNotMatch(article, /noindex|PRIVATE_SENTINEL/);
  assert.equal((article.match(/<h1[ >]/g) ?? []).length, 1);
  const asset = article.match(/<img src="\/media\/([^"/]+)"/)[1];
  assert.deepEqual(await readFile(join(out, 'media', asset)), image);
  assert.deepEqual(await readdir(join(out, 'media')), [asset]);
  assert.deepEqual(await readdir(join(out, 'posts')), ['public-post']);
  assert.deepEqual(await readdir(join(out, 'study/posts')), ['public-post']);
  for (const [legacy, target] of [
    ['study/index.html', '/'],
    ['study/about/index.html', '/about/'],
    ['study/posts/public-post/index.html', '/posts/public-post/'],
  ]) {
    const redirect = await readFile(join(out, legacy), 'utf8');
    assert(redirect.includes(`rel="canonical" href="https://blog.rvkang.app${target}"`));
    assert(redirect.includes(`content="0;url=${target}"`));
    assert.match(redirect, /noindex, follow/);
    const script = [...redirect.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)][0][1];
    const destinations = [];
    runInNewContext(script, { window: { location: {
      search: '?utm_source=medium', hash: '#section', replace: url => destinations.push(url),
    } } });
    assert.deepEqual(destinations, [`${target}?utm_source=medium#section`]);
  }
  const sitemap = await readFile(join(out, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/blog\.rvkang\.app\/posts\/public-post\//);
  assert.doesNotMatch(sitemap, /private-post/);
  assert.doesNotMatch(sitemap, /\/study\//);
  const files = await readdir(out, { recursive: true });
  assert(!files.some(file => /heapsnapshot|analysis\.json|\.prerender|posts\.json|\.md$/.test(file)));
  assert.doesNotMatch(await readFile(join(out, 'index.html'), 'utf8'), /미공개 글|private-post/);
  const about = await readFile(join(out, 'about/index.html'), 'utf8');
  assert.match(about, /rel="canonical" href="https:\/\/blog\.rvkang\.app\/about\/"/);
  assert.match(about, /<h3[^>]*>더즌<\/h3>/);
  assert.match(about, /main: 백엔드 개발, sub: 프론트엔드 개발/);
  assert.match(about, /<h3[^>]*>캐리버스<\/h3>/);
  assert.match(about, /<h3[^>]*>크립토<\/h3>/);
  assert.match(about, /<time datetime="2022-08"[^>]*>2022\.08<\/time> ~ <time datetime="2023-08"[^>]*>2023\.08<\/time>/);
  assert.match(about, /name="description" content="서비스 개발을 하며 운영 경험과 기술 학습 기록을 하고 있습니다\."/);
  assert.match(about, /href="mailto:fog0510@gmail.com"/);
  assert.match(about, /href="tel:\+821043485571"/);
  assert.match(await readFile(join(out, 'index.html'), 'utf8'), /href="\/about\/"/);
  assert.match(sitemap, /https:\/\/blog\.rvkang\.app\/about\//);
  for (const page of ['index.html', 'about/index.html', 'posts/public-post/index.html']) {
    assert.doesNotMatch(await readFile(join(out, page), 'utf8'), /googletagmanager/);
    assert.doesNotMatch(await readFile(join(out, page), 'utf8'), /google-site-verification/);
  }

  await t.test('공개 글의 SEO 정보는 원문과 일치하고 JSON-LD 안의 HTML은 실행 가능한 태그가 되지 않는다', async () => {
    const schema = html => {
      const scripts = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
      assert.equal(scripts.length, 1);
      return JSON.parse(scripts[0][1]);
    };
    const url = 'https://blog.rvkang.app/posts/public-post/';
    const data = schema(article);
    assert.equal(data['@context'], 'https://schema.org');
    const post = data['@graph'].find(node => node['@type'] === 'BlogPosting');
    assert.equal(post.headline, '공개 글');
    assert.equal(post.description, publicDescription);
    assert.equal(post.url, url);
    assert.equal(post.mainEntityOfPage, url);
    assert.equal(post.datePublished, '2026-09-06');
    assert.equal(post.author.name, 'kangjuhyup');
    assert.equal(post.author.url, 'https://blog.rvkang.app/about/');
    assert.deepEqual(post.image, [`https://blog.rvkang.app/media/${asset}`]);
    assert(!Object.hasOwn(post, 'dateModified'));
    assert.doesNotMatch(article, /<script id="seo-injection"/);
    assert.equal((article.match(/rel="canonical"/g) ?? []).length, 1);
    assert.match(article, /property="og:type" content="article"/);
    assert.match(article, /property="og:site_name" content="Study"/);
    assert(article.includes(`property="og:image" content="https://blog.rvkang.app/media/${asset}"`));
    assert.match(article, /property="og:image:alt" content="공개 이미지"/);
    assert.match(article, /name="twitter:card" content="summary_large_image"/);
    assert.match(article, /property="article:published_time" content="2026-09-06"/);
    assert.match(article, /name="robots" content="index, follow, max-image-preview:large"/);
    const breadcrumb = data['@graph'].find(node => node['@type'] === 'BreadcrumbList');
    assert.deepEqual(breadcrumb.itemListElement.map(item => [item.position, item.name, item.item]), [
      [1, 'Study', 'https://blog.rvkang.app/'],
      [2, '공개 글', url],
    ]);
    assert.equal(schema(about)['@graph'][0]['@type'], 'AboutPage');
    assert.match(about, /property="og:type" content="website"/);
    assert.doesNotMatch(about, /article:published_time|"datePublished"/);
    const home = await readFile(join(out, 'index.html'), 'utf8');
    assert.equal(schema(home)['@graph'][0]['@type'], 'WebPage');
    assert.match(home, /<title>Study · kangjuhyup의 개발 학습 기록<\/title>/);
    assert.match(home, /name="twitter:card" content="summary"/);
    const fallbackURL = home.match(/property="og:image" content="([^"]+)"/)[1];
    const fallbackPath = new URL(fallbackURL).pathname.replace(/^\//, '');
    assert((await readFile(join(out, fallbackPath))).length > 0);
    const robots = await readFile(join(out, 'robots.txt'), 'utf8');
    assert.match(robots, /Sitemap: https:\/\/blog\.rvkang\.app\/sitemap.xml/);
    assert.doesNotMatch(robots, /Disallow/);
  });

  await t.test('GA4는 ID가 있는 공개 페이지에서만 한 번 설정하고 로컬 검토를 수집하지 않는다', async () => {
    await build(false, 'G-STUDY12345', 'test-verification-token');
    for (const page of ['index.html', 'about/index.html', 'posts/public-post/index.html']) {
      const html = await readFile(join(out, page), 'utf8');
      assert.match(html, /name="google-site-verification" content="test-verification-token"/);
      const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .map(match => match[1]).filter(script => script.includes('www.googletagmanager.com/gtag/js'));
      assert.equal(scripts.length, 1);
      const run = (origin, pathname) => {
        const tags = [];
        const window = { location: { origin, pathname } };
        runInNewContext(scripts[0], {
          window,
          document: { createElement: () => ({}), head: { appendChild: tag => tags.push(tag) } },
        });
        return { tags, commands: Array.from(window.dataLayer ?? [], command => Array.from(command)) };
      };
      const production = run('https://blog.rvkang.app', `/${page}`);
      assert.equal(production.tags.length, 1);
      assert.equal(production.tags[0].async, true);
      assert.equal(production.tags[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-STUDY12345');
      assert.deepEqual(production.commands.map(command => command[0]), ['js', 'config']);
      assert.equal(production.commands[1][1], 'G-STUDY12345');
      for (const [origin, pathname] of [
        ['http://localhost:4321', '/'],
        ['http://127.0.0.1:4321', '/'],
        ['https://example.com', '/'],
        ['http://blog.rvkang.app', '/'],
        ['https://kangjuhyup.github.io', '/study/'],
      ]) {
        assert.deepEqual(run(origin, pathname), { tags: [], commands: [] });
      }
    }
    await assert.rejects(build(false, 'GTM-WRONG'), error => {
      assert.match(error.stdout + error.stderr, /PUBLIC_GA_MEASUREMENT_ID/);
      return true;
    });
  });
});
