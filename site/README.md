# Study 블로그

학습 폴더의 Markdown과 이미지를 읽어 Astro 정적 블로그를 만듭니다. 공개할 글은 [posts.json](./posts.json)에서 관리하며, 원문을 이 폴더에 복제하지 않습니다.

배포 예정 주소는 `https://kangjuhyup.github.io/study/`입니다. 이 설정을 추가하는 것만으로 GitHub Pages가 활성화되거나 글이 발행되지는 않습니다.

## 로컬 환경

이 폴더는 Node.js **24.20.0**, npm **11.19.0**, Astro **7.3.1**을 사용합니다. `.nvmrc`, `package.json`, `package-lock.json`을 기준으로 설치하며 다른 학습 폴더의 런타임과 독립적입니다.

저장소 루트에서 시작합니다. nvm과 지정된 Node.js가 설치되어 있어야 합니다.

```sh
cd site
nvm use
node --version
npm --version
npm ci
npm run dev
```

버전 출력은 각각 `v24.20.0`, `11.19.0`이어야 합니다. 개발 서버의 `/study/`에서 목록과 초안을 확인합니다. 서버를 종료하려면 `Ctrl+C`를 누릅니다.

## 검증과 초안 검토

다음 명령은 모두 `site/`에서 실행합니다.

```sh
npm test
npm run build
npm run build:preview
npm run preview:review
```

| 명령 | 용도 |
| --- | --- |
| `npm test` | 콘텐츠와 경로 처리 검증 |
| `npm run build` | 공개 글만 `dist/`에 생성 |
| `npm run dev` | localhost에서 초안 포함 개발 |
| `npm run build:preview` | 초안 포함 검토 결과를 `dist-preview/`에 생성 |
| `npm run preview:review` | `dist-preview/`를 로컬에서 확인 |

검토 모드는 검색 제외 메타데이터를 제공합니다. `dist-preview/`는 로컬 검토용이며 배포하지 않습니다. OOM 글은 2026-09-06에 공개 대상으로 전환했습니다. `draft: true`인 글과 그 글만 사용하는 이미지는 공개 빌드에서 제외됩니다.

## 글 추가와 수정

1. 주제별 폴더에서 원문 Markdown과 이미지를 작성합니다.
2. `posts.json`에 항목을 추가합니다. `source`는 저장소 루트 기준 경로이며, `title`은 원문의 첫 `# 제목`과 같아야 합니다. 본문에는 두 번째 최상위 제목을 두지 않습니다.
3. `draft: true`, `publishedAt: null`로 두고 로컬에서 제목, 코드, 표, 이미지와 링크를 확인합니다.
4. 발행할 때 `draft`를 `false`로 바꾸고 `publishedAt`에 실제 최초 공개 날짜를 `YYYY-MM-DD`로 기록합니다.
5. 테스트와 공개 빌드를 실행해 결과를 확인한 뒤 배포합니다.

```json
{
  "slug": "nodejs-oom-heap-snapshot",
  "source": "oom-snapshot/blog/index.md",
  "title": "Node.js OOM을 직접 재현하고, Heap Snapshot으로 원인을 찾기",
  "description": "Heap Snapshot 비교로 메모리 참조를 추적한 학습 기록",
  "publishedAt": null,
  "draft": true
}
```

공개된 글의 `slug`는 기존 링크를 유지하기 위해 변경하지 않습니다. 원문을 수정하면 다음 빌드에 반영됩니다. 등록한 글과 참조 이미지가 빌드 입력이며, 재현 코드 실행이나 스냅샷 재생성은 필요하지 않습니다. 누락 파일, workspace 밖 경로, 중복 slug와 공개 대상으로 해석할 수 없는 로컬 링크는 오류를 해결한 뒤 다시 빌드합니다.

## GitHub Pages 배포

[배포 workflow](../.github/workflows/deploy-blog.yml)는 `main` push와 수동 실행에서 설치·테스트·공개 빌드를 수행한 뒤 **`site/dist/`만** 배포합니다. PR은 테스트와 빌드만 수행합니다. 글과 이미지 변경도 빌드 대상이 되도록 경로 필터를 두지 않았습니다.

실제 발행을 진행할 때 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다. 이후 `main`에 반영하거나 Actions에서 workflow를 실행하고 성공 여부와 공개 주소를 확인합니다. 수동 실행도 `main`에서만 배포합니다. [Astro 공식 배포 안내](https://docs.astro.build/en/guides/deploy/github/)

## 검색 등록

사이트 공개 후 Google Search Console에 URL 접두어 속성 `https://kangjuhyup.github.io/study/`를 추가하고 제공되는 방법으로 소유권을 확인합니다. **Sitemaps**에서 공개된 `sitemap.xml` 주소를 제출하고 **URL 검사**에서 개별 글의 수집 상태를 확인합니다. 사이트맵 제출은 검색 노출이나 순위를 보장하지 않습니다. [Google 사이트맵 안내](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

## GitHub 이슈 댓글

공개 글 하단에 [utterances](https://utteranc.es/)를 표시합니다. `kangjuhyup/study`의 Issues에 글 경로(`pathname`) 기준으로 연결하므로 제목 수정은 댓글 연결에 영향을 주지 않습니다. 기존 글의 slug는 유지하세요.

저장소는 공개 상태와 Issues 활성화가 필요하며, [utterances GitHub App](https://github.com/apps/utterances)을 해당 저장소에 설치해야 합니다. 첫 댓글이 작성되면 연결할 이슈가 자동 생성됩니다. 댓글 작성자는 GitHub 로그인과 앱 승인이 필요합니다. 미리보기와 초안에는 위젯을 불러오지 않습니다.

## Medium에도 올리기

1. Astro 글을 공개하고 원본 URL이 정상적으로 열리는지 확인합니다.
2. Medium의 **Import a story**에 공개된 원본 URL을 입력합니다.
3. 가져온 제목, 코드, 표, 이미지와 링크를 원문과 비교합니다.
4. Medium 글 설정에서 canonical이 Astro 원본 URL을 가리키는지 확인합니다.
5. Medium에서 최종 확인 후 직접 발행합니다.

가져오기 기능은 원본 canonical을 설정합니다. 가져오기가 실패하면 본문을 수동으로 옮기고 canonical도 직접 확인합니다. Medium은 자동 동기화되지 않으므로, 이후 변경은 Astro 원문에 먼저 반영하고 Medium 사본을 별도로 수정합니다. [Medium 가져오기 안내](https://help.medium.com/hc/en-us/articles/214550207-Importing-a-post-to-Medium)

설계와 보존 범위는 [구현 명세](../docs/specs/2026-09-06-astro-medium-blog.md)를 참고하세요.
