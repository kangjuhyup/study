# Astro 원본 블로그와 Medium 병행 운영

## 목표

학습 기록의 Markdown과 이미지를 한 곳에서 관리하고, 공개 대상으로 선택한 글을 Astro 블로그로 배포한다. Medium에는 공개된 원본 URL을 사용해 사용자가 원하는 글만 가져온다. Medium API나 MCP는 만들지 않는다.

이 문서는 구현 검토안이다. 구현 승인은 아래 파일 생성, 블로그 전용 의존성 설치와 로컬 검증 범위에 해당한다. commit, push, GitHub 설정 변경과 실제 발행은 별도로 진행한다.

## 현재 저장소와 보존 범위

- Git remote: `https://github.com/kangjuhyup/study.git`.
- 기존 학습 자료: `oom-snapshot/`. 첫 글은 `oom-snapshot/blog/index.md`.
- 기존 스크린샷: `oom-snapshot/blog/images/01-comparison-retainers.png`.
- 루트에 애플리케이션 package.json이나 lockfile은 없다.
- `oom-snapshot/.nvmrc`와 기존 코드, 로그, JSON, 스냅샷, HTML, 사용자 문서 변경은 보존한다.
- 새 블로그는 `site/`에서 관리하고 루트의 RV Workflow 규칙을 상속한다.

## 블로그 구성

- 이름: `Study`. 작성자 표기: `kangjuhyup`. 한국어 기술 블로그.
- 기본 공개 주소: `https://kangjuhyup.github.io/study/`. 실제 사용 가능 여부와 Pages 활성화는 배포 시 확인한다. 도메인 구매는 범위에 없다.
- `/study/`: 공개 글 목록. 제목, 짧은 요약, 발행일을 표시한다.
- `/study/posts/nodejs-oom-heap-snapshot/`: 첫 글의 고정 주소.
- 밝은 배경과 읽기 편한 본문 폭을 사용한다. 장식보다 글, 코드, 표와 이미지의 가독성을 우선한다.
- 모바일에서는 긴 코드와 표 영역만 가로 스크롤하며, 이미지는 본문 폭 안에 표시한다.
- 글 페이지는 목록으로 돌아가는 링크, 목차, 본문을 제공한다. 제목은 한 번만 표시한다.
- 댓글, 로그인, 관리자 화면, 방문자 추적, 검색 UI는 첫 버전에 포함하지 않는다.

## 원문과 공개 대상 관리

`site/posts.json`에 공개 대상으로 선택한 원문만 등록한다. 각 항목은 고정 slug, 저장소 기준 source 경로, 제목, 요약, 날짜와 draft 여부를 갖는다. 기존 원문을 사이트 폴더에 수동 복제하지 않는다.

빌드는 등록한 Markdown을 읽고 그 글에서 참조하는 로컬 이미지만 처리한다. 저장소 전체나 학습 폴더 전체를 정적 파일로 복사하지 않는다. 경로가 workspace 밖으로 벗어나거나 파일이 없으면 해당 경로를 식별할 수 있는 오류로 실패한다. 로컬 링크 중 공개 대상으로 해석할 수 없는 링크도 검증 오류로 보고한다.

첫 글은 기존 본문을 그대로 사용한다. 코드의 공백과 줄바꿈, 표의 값, 링크, 이미지와 대체 텍스트를 보존한다. 첫 글의 발행일은 실제 최초 공개 시점에 맞춰 확정하며, 최초 검증에서는 draft로 취급한다. 공개되지 않은 글은 배포 결과와 사이트맵에 포함하지 않는다. 로컬 검토 모드에서만 draft를 볼 수 있고 검색 제외 메타데이터를 제공한다.

공개 시 초안에서 공개로 전환하고 발행일을 기록한다. 이미 공개한 글은 slug를 유지하며 원문 변경이 다음 배포에 반영된다. 재현 프로그램 실행이나 스냅샷 재생성은 블로그 빌드에 포함하지 않는다.

## 검색과 원본 주소

공개 글은 정적 HTML로 생성한다. 페이지별 title, description, 한국어 lang, 절대 canonical URL과 기본 Open Graph 텍스트 메타데이터를 제공한다. 새 홍보 이미지를 생성하지 않는다.

사이트맵과 robots.txt를 생성한다. GitHub Pages의 `/study/` 경로가 링크, 이미지, 메타데이터와 사이트맵에 일관되게 반영돼야 한다. Search Console 등록 절차를 운영 문서에 적되 실제 계정 등록이나 검색 노출을 완료했다고 보고하지 않는다.

## Medium 운영

1. Astro에 글을 공개하고 원본 주소가 열리는지 확인한다.
2. Medium의 `Import a story`에 원본 URL을 입력한다.
3. 제목, 코드, 표와 이미지를 확인한다. 가져오기가 실패하면 수동 복사로 보완한다.
4. Medium의 canonical 링크가 Astro 원본 주소인지 확인한다.
5. 사용자가 Medium에서 공개 발행한다.

Medium 가져오기는 자동 동기화가 아니다. 이후 수정은 Astro 원문에 먼저 반영하고 Medium 사본은 사용자가 별도로 갱신한다. 기존 Medium 글이 있다면 원본 주소 연결을 개별 확인하며 자동 삭제·이전하지 않는다.

## 도구체인과 배포 설정

- `site/` 전용 Node.js는 로컬에 설치된 `24.20.0`을 사용한다. 적용 시 선택한 Astro 버전의 공식 지원 범위를 확인하고 전용 `.nvmrc`에 기록한다.
- 새 사이트의 package manager는 해당 Node 배포판의 npm으로 고정한다. 실제 버전을 확인해 package.json에 기록한다.
- Astro와 필요한 빌드 도구만 설치하고 `site/package-lock.json`으로 고정한다. 루트와 기존 학습 폴더의 런타임 설정은 변경하지 않는다.
- 정적 배포 결과는 `site/dist/`. 개발 서버와 의존성 설치는 이 명세의 구현 승인 후에만 수행한다.
- `.github/workflows/deploy-blog.yml`은 GitHub Actions에서 `site/`의 고정 환경으로 설치·빌드하고 GitHub Pages에 배포하도록 작성한다. 코드와 이미지 변경도 배포 입력에 포함한다.
- 실제 commit/push와 Pages 활성화는 구현 검증 뒤 사용자에게 구체적인 변경을 제시하고 진행한다. Sites 호스팅은 사용하지 않고, 선택한 Astro + GitHub Pages 구성을 따른다.

## 구현 순서와 역할

1. frontend: `site/` 도구체인과 공개 대상 등록 구조, 원문·이미지 처리 구현.
2. frontend: 목록·상세 화면, draft 검토 모드, 메타데이터와 사이트맵 구현.
3. document: 배포 workflow, `site/README.md`, Medium 운영 절차 작성. 루트 README의 사용자 변경을 유지하며 블로그 안내 링크 추가.
4. qa: 빌드·콘텐츠·경로 검증 및 변경 범위 확인. 이후 배포 가능한 결과를 보고.

앞 단계의 콘텐츠 계약에 의존하므로 초기 구현은 순서대로 진행한다. 독립 검증이 가능한 시점에만 작업 분리를 검토한다.

## 완료 기준

- 고정 도구체인에서 의존성 설치와 프로덕션 빌드가 성공한다.
- 첫 글의 제목, 코드 블록, 표, 링크와 스크린샷이 원문과 대응한다.
- 공개 빌드에는 draft 본문·이미지·사이트맵 항목이 없고, 검토 모드에서는 첫 글을 확인할 수 있다.
- 공개 전환 fixture로 `/study/` 기준의 상세 주소, 이미지 주소, canonical과 사이트맵 URL을 검증한다.
- 원문 또는 이미지 누락, 중복 slug, workspace 밖의 경로를 빌드가 거부한다.
- 배포 결과에 `.heapsnapshot`, 로그, 분석 JSON, 에이전트 설정과 조사 문서가 포함되지 않는다.
- 기존 학습 파일은 변경되지 않으며 `git diff --check`와 신규 파일의 공백 검증이 통과한다.
- 서버 실행·배포·검색 노출·Medium 가져오기 중 실제 수행하지 않은 항목은 별도로 명시한다.

## 근거

- [Astro Markdown 지원](https://docs.astro.build/en/guides/markdown-content/)
- [Astro GitHub Pages 배포](https://docs.astro.build/en/guides/deploy/github/)
- [Medium 가져오기와 canonical 자동 설정](https://help.medium.com/hc/en-us/articles/214550207-Importing-a-post-to-Medium)
- [Medium 가져오기 실패 시 수동 처리](https://help.medium.com/hc/en-us/articles/360033931713-Trouble-importing-content-using-the-import-tool)
