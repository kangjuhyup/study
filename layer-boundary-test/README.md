# TypeScript 계층 경계 테스트

가상의 `campaign` 모듈에서 Domain 정책이 `import type`으로 Application command를 참조하는 상황을 만들고, 정적 계층 검사로 발견한 뒤 domain-local 타입으로 수정합니다. 외부 서비스는 필요하지 않습니다.

## 자료

- [기술 글](./blog/index.md)
- [계층 테스트](./test/architecture/layer-boundary.spec.ts)
- [위반 fixture](./fixtures/violation/modules/campaign/domain/reminder/reminder-schedule-policy.ts)
- [수정 fixture](./fixtures/fixed/modules/campaign/domain/reminder/reminder-schedule-policy.ts)

## 다시 실행하기

macOS/Linux와 nvm 기준입니다. `.nvmrc`에 지정한 Node.js 24.20.0과 npm 11.19.0을 사용하며 외부 패키지는 설치하지 않습니다.

```bash
cd layer-boundary-test
nvm use
node --version
npm --version

npm run test:violation # 의도한 실패: 종료 코드 1
npm run test:fixed     # 수정 후 통과: 종료 코드 0
npm test               # 수정 fixture 검사: 테스트 1개 통과
```

위반 명령의 실패는 재현 성공을 뜻합니다. 두 fixture를 나란히 두어 기존 파일을 바꾸지 않고도 실패 전후를 반복해서 확인할 수 있습니다.

2026-09-08 공개했습니다. [게시된 글](https://kangjuhyup.github.io/study/posts/typescript-layer-boundary-test/)에서 확인할 수 있습니다.
