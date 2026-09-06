import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { loadBlog } from '../src/lib/blog.mjs';

const entry = (slug, overrides = {}) => ({
  slug, source: `${slug}/index.md`, title: `Title ${slug}`,
  description: `Description ${slug}`, draft: false, publishedAt: '2026-09-06',
  ...overrides,
});

async function fixture(t, entries, files = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'study-blog-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workspaceRoot = join(directory, 'workspace');
  await mkdir(workspaceRoot);
  const manifestPath = join(workspaceRoot, 'posts.json');
  await writeFile(manifestPath, JSON.stringify(entries));
  for (const post of entries) {
    const path = join(workspaceRoot, post.source);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `# ${post.title}\n\nBody ${post.slug}.\n`);
  }
  for (const [name, content] of Object.entries(files)) {
    const path = join(workspaceRoot, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return { directory, workspaceRoot, manifestPath };
}

test('Public publication excludes drafts and their local image bytes', async t => {
  const draft = entry('draft', { draft: true, publishedAt: null });
  const options = await fixture(t, [entry('public'), draft], {
    'draft/index.md': '# Title draft\n\n![private](secret.png)',
    'draft/secret.png': Buffer.from('private image bytes'),
  });
  const blog = await loadBlog({ ...options, preview: false });
  assert.deepEqual(blog.posts.map(post => post.slug), ['public']);
  assert.equal(blog.images.size, 0);
  assert.equal(blog.preview, false);
});

test('Local preview includes draft posts and their images', async t => {
  const options = await fixture(t, [entry('draft', { draft: true, publishedAt: null })], {
    'draft/index.md': '# Title draft\n\n![draft](image.png)',
    'draft/image.png': Buffer.from([137, 80, 78, 71]),
  });
  const blog = await loadBlog({ ...options, preview: true });
  assert.deepEqual(blog.posts.map(post => post.slug), ['draft']);
  assert.equal(blog.posts[0].draft, true);
  assert.equal(blog.images.size, 1);
  assert.equal(blog.preview, true);
});

test('The page title remains available while its Markdown H1 is omitted from the body', async t => {
  const options = await fixture(t, [entry('article')], {
    'article/index.md': '# Title article\n\n## Findings\n\nA result.',
  });
  const { posts: [post] } = await loadBlog(options);
  assert.equal(post.title, 'Title article');
  assert.doesNotMatch(post.html, /<h1\b|Title article/);
  assert.match(post.html, /<h2 id="findings">Findings<\/h2>/);
  assert.match(post.html, /A result\./);
});

test('Code examples retain their original text without interpreting HTML or Markdown', async t => {
  const options = await fixture(t, [entry('code')], {
    'code/index.md': '# Title code\n\n```js\nconst html = "<div>&</div>";\nconst text = "![not an image](missing.png)";\n```',
  });
  const { posts: [post], images } = await loadBlog(options);
  assert.match(post.html, /<pre><code class="language-js">const html = &quot;&lt;div&gt;&amp;&lt;\/div&gt;&quot;;\nconst text = &quot;!\[not an image\]\(missing\.png\)&quot;;\n<\/code><\/pre>/);
  assert.equal(images.size, 0);
});

test('Local images use the GitHub Pages base and preserve source bytes', async t => {
  const bytes = Buffer.from([137, 80, 78, 71, 0, 255, 13, 10]);
  const options = await fixture(t, [entry('image')], {
    'image/index.md': '# Title image\n\n![Snapshot](images/heap%20snapshot.png)',
    'image/images/heap snapshot.png': bytes,
  });
  const { posts: [post], images } = await loadBlog(options);
  assert.equal(images.size, 1);
  const [name, asset] = [...images][0];
  assert.match(name, /^[a-f0-9]{64}\.png$/);
  assert.ok(post.html.includes(`src="/study/media/${name}"`));
  assert.deepEqual(asset.bytes, bytes);
  assert.equal(asset.contentType, 'image/png');
});

test('Duplicate published addresses fail publication', async t => {
  const options = await fixture(t, [entry('same'), entry('same', { source: 'other/index.md' })]);
  await assert.rejects(loadBlog(options), /중복 slug: same/);
});

test('Missing article sources fail publication', async t => {
  const options = await fixture(t, [entry('missing')]);
  await rm(join(options.workspaceRoot, 'missing/index.md'));
  await assert.rejects(loadBlog(options), /파일을 찾을 수 없습니다: missing\/index\.md/);
});

test('Missing local images fail publication instead of creating broken image URLs', async t => {
  const options = await fixture(t, [entry('missing')], {
    'missing/index.md': '# Title missing\n\n![Missing](absent.png)',
  });
  await assert.rejects(loadBlog(options), /파일을 찾을 수 없습니다: missing\/absent\.png/);
});

for (const kind of ['article', 'image']) {
  test(`A symlink cannot publish a ${kind} outside the study workspace`, async t => {
    const options = await fixture(t, [entry('safe')]);
    const external = join(options.directory, kind === 'article' ? 'private.md' : 'private.png');
    await writeFile(external, kind === 'article' ? '# Title safe\n\nPrivate content.' : 'private image');
    if (kind === 'article') {
      await rm(join(options.workspaceRoot, 'safe/index.md'));
      await symlink(external, join(options.workspaceRoot, 'safe/index.md'));
    } else {
      await writeFile(join(options.workspaceRoot, 'safe/index.md'), '# Title safe\n\n![Private](private.png)');
      await symlink(external, join(options.workspaceRoot, 'safe/private.png'));
    }
    await assert.rejects(loadBlog(options), /workspace 밖의 파일은 사용할 수 없습니다/);
  });
}

test('Public articles cannot link to excluded drafts', async t => {
  const options = await fixture(t, [entry('public'), entry('draft', { draft: true, publishedAt: null })], {
    'public/index.md': '# Title public\n\n[Draft](../draft/index.md)',
  });
  await assert.rejects(loadBlog({ ...options, preview: false }), /공개 대상으로 등록되지 않은 로컬 링크/);
});

test('Links to published local articles resolve to their public addresses and fragments', async t => {
  const options = await fixture(t, [entry('first'), entry('second')], {
    'first/index.md': '# Title first\n\n[Next](../second/index.md#findings)',
    'second/index.md': '# Title second\n\n## Findings\n\nResults.',
  });
  const { posts } = await loadBlog({ ...options, preview: false });
  assert.match(posts.find(post => post.slug === 'first').html, /href="\/study\/posts\/second\/#findings"/);
});
