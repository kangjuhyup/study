# 계층 컨벤션은 테스트로 지킨다: import type 경계 검사하기

이 글에서 가장 중요한 것은 Presentation이 Application 타입을 참조하면 무조건 잘못이라는 결론이 아니다. **어떤 의존을 허용할지 팀이 컨벤션으로 정하고, 그 약속을 테스트로 지키는 것**이 핵심이다.

가령 “Presentation DTO는 다른 계층의 타입을 직접 참조하지 않는다”는 컨벤션을 정했다고 해 보자. Application에 이미 필요한 값을 담은 `ReminderTemplateView`가 있다면 다음처럼 가져다 쓰고 싶어진다.

```typescript
import type { ReminderTemplateView } from '../../../application/query/dto/response/reminder-template.view';
```

실행되는 JavaScript에는 이 import가 남지 않고 빌드와 기능 테스트도 통과할 수 있다. 하지만 팀이 정한 컨벤션에는 어긋난다. 이 글에서는 가상의 `campaign` 모듈에 위반을 만들고, 경계 테스트로 찾아낸 뒤 transport-local 타입으로 끊어 본다.

> 아래 도메인과 코드는 계층 경계 테스트를 설명하기 위한 최소 예제다.

## 문제의 기준은 import type이 아니라 컨벤션이다

위반한 DTO의 전체 모습은 다음과 같다.

```typescript
import type { ReminderTemplateView } from '../../../application/query/dto/response/reminder-template.view';

export class GetReminderTemplateResponseDto {
  readonly code: string;
  readonly content: string;
  readonly buttonLabel: string;

  constructor(source: ReminderTemplateView) {
    this.code = source.code;
    this.content = source.content;
    this.buttonLabel = source.buttonLabel;
  }

  static of(source: ReminderTemplateView) {
    return new GetReminderTemplateResponseDto(source);
  }
}
```

`import type`은 런타임 의존성을 만들지 않는다. 하지만 이 파일을 컴파일하려면 Application의 선언이 필요하다. 타입의 이름이나 위치가 바뀌면 DTO도 고쳐야 하고, Application view의 모양이 Presentation의 입력 계약을 결정한다. 따라서 컨벤션이 소스 계층의 독립성까지 요구한다면 `import type`도 검사 대상이어야 한다.

한 파일만 보면 대수롭지 않다. 같은 선택이 여러 DTO에 반복되면 이야기가 달라진다. Application 내부 모델을 정리했을 뿐인데 API 계층 파일이 함께 바뀌고, 내부에는 필요하지만 외부에는 공개하면 안 되는 필드를 추가하기도 어려워진다. ORM이나 외부 SDK 타입까지 재사용하기 시작하면 저장 방식의 세부사항이 전송 계약으로 새어 나올 수 있다.

나중에 경계를 되살리려면 퍼져 있는 타입을 나누고 매핑을 추가하며 호출부를 한꺼번에 고쳐야 한다. 계층 침식은 기능을 즉시 깨뜨리지 않기 때문에 이렇게 쌓이기 쉽다.

물론 Application의 공개 계약을 Presentation이 사용하도록 설계한 프로젝트라면 이 참조는 문제가 아니다. 경계 테스트보다 먼저 필요한 것은 팀이 선택한 규칙이다. 이 예제의 컨벤션은 다음과 같다.

> Presentation DTO는 Application·Domain·Infrastructure 타입을 직접 참조하지 않는 transport-local 스키마여야 한다.

## 실패하는 장면부터 재현해 보기

위반 전후를 반복해서 볼 수 있도록 두 fixture를 나란히 뒀다. 별도의 서버 프로젝트를 복제하지 않고 테스트에 필요한 파일만 남겼다.

```text
layer-boundary-test/
├─ fixtures/
│  ├─ violation/modules/campaign/...
│  └─ fixed/modules/campaign/...
└─ test/architecture/layer-boundary.spec.ts
```

Node.js 24.20.0과 npm 11.19.0을 사용하며 외부 패키지는 없다.

```bash
cd layer-boundary-test
nvm use

npm run test:violation
```

위반 fixture를 검사하면 테스트가 실패하고 문제의 DTO가 그대로 나타난다.

```text
✖ keeps presentation DTOs as transport-local schemas

+ [
+   'fixtures/violation/modules/campaign/presentation/reminder-sms/dto/get-reminder-template-response.dto.ts'
+ ]
- []

tests 1
pass 0
fail 1
```

이 실패가 재현의 성공이다. 수정된 fixture는 같은 테스트를 통과한다.

```bash
npm run test:fixed
```

```text
✔ keeps presentation DTOs as transport-local schemas
tests 1
pass 1
fail 0
```

## 컨벤션을 코드로 옮기기

문장으로 합의한 컨벤션을 그대로 검사 순서로 옮긴다. `modules` 아래의 TypeScript 파일을 모으고, `presentation/dto`의 `.dto.ts`만 남긴 뒤 상대 import가 Application·Domain·Infrastructure를 향하는지 확인한다. 발견한 파일을 `offenders`에 모아 빈 배열과 비교하면 끝이다.

[GitHub에서 실제 테스트 코드 보기](https://github.com/kangjuhyup/study/blob/main/layer-boundary-test/test/architecture/layer-boundary.spec.ts)

```typescript
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    return stat.isDirectory()
      ? collectTypeScriptFiles(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });
}

function relativeImportTargets(file: string): string[] {
  const source = readFileSync(file, 'utf8');

  return [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(
    ([, specifier]) => resolve(dirname(file), specifier),
  );
}

test('keeps presentation DTOs as transport-local schemas', () => {
  const sourceRoot = resolve(process.env.LAYER_SOURCE_ROOT ?? 'fixtures/fixed');
  const modulesRoot = join(sourceRoot, 'modules');
  const moduleFiles = collectTypeScriptFiles(modulesRoot);
  const offenders = moduleFiles
    .filter((file) => file.includes('/presentation/'))
    .filter((file) => file.includes('/dto/') && file.endsWith('.dto.ts'))
    .filter((file) =>
      relativeImportTargets(file).some(
        (target) =>
          target.includes('/application/') ||
          target.includes('/domain/') ||
          target.includes('/infrastructure/'),
      ),
    )
    .map((file) => relative(process.cwd(), file));

  assert.deepEqual(offenders, []);
});
```

정규식은 `from` 절을 찾기 때문에 `import type`도 따로 예외 처리할 필요가 없다. `resolve(dirname(file), specifier)`는 `../../../application/...` 같은 상대 경로가 실제로 향하는 위치를 계산한다. 단순히 소스에서 `application`이라는 단어만 찾는 것보다 오탐이 적고, 실패했을 때 어느 DTO를 고쳐야 하는지도 알 수 있다.

## 타입을 DTO 가까이 돌려놓기

해결은 Application import를 지우고 DTO가 실제로 요구하는 모양을 같은 파일에 선언하는 것이다.

```typescript
type ReminderTemplateSource = {
  readonly code: string;
  readonly content: string;
  readonly buttonLabel: string;
};

export class GetReminderTemplateResponseDto {
  readonly code: string;
  readonly content: string;
  readonly buttonLabel: string;

  constructor(source: ReminderTemplateSource) {
    this.code = source.code;
    this.content = source.content;
    this.buttonLabel = source.buttonLabel;
  }

  static of(source: ReminderTemplateSource) {
    return new GetReminderTemplateResponseDto(source);
  }
}
```

`ReminderTemplateSource`는 `code`, `content`, `buttonLabel`만 안다. 특정 Application 타입의 이름과 위치는 모른다. TypeScript의 구조적 타이핑 덕분에 같은 모양의 값은 그대로 받을 수 있으므로 런타임 변환도 추가되지 않는다.

## 컨벤션을 테스트로 만들 때의 트레이드오프

첫 번째 교환은 **중복과 독립성**이다. transport-local 타입을 만들면 비슷한 필드 선언이 하나 더 생긴다. 양쪽 계약이 함께 바뀌는 날에는 타입과 매핑 지점도 각각 고쳐야 한다. 대신 Application 내부 변경이 Presentation 전체로 번지는 일을 막고, 내부 모델과 API 계약을 서로 다른 속도로 발전시킬 수 있다.

두 번째 교환은 **단순함과 정확성**이다. 지금의 정규식 검사는 빠르고 이해하기 쉽지만 완전한 파서는 아니다. 주석을 import로 오인할 수 있고 alias, re-export, 동적 import는 놓친다. 이런 문법을 실제로 사용한다면 TypeScript Compiler API의 AST와 `resolveModuleName` 같은 해석기로 확장해야 한다. 정확도는 높아지지만 검사 코드와 실행 시간, 유지 비용도 함께 늘어난다.

마지막 교환은 **자동화와 판단**이다. 경계 테스트를 CI에 넣으면 첫 금지 import에서 실패하고 모든 리뷰에 같은 컨벤션을 적용할 수 있다. 하지만 무엇을 금지할지는 테스트가 결정하지 못한다. 팀이 먼저 의존 방향과 예외를 합의해야 하며, 컨벤션이 바뀌면 테스트도 함께 바꿔야 한다. `offenders`가 비었다고 책임 분리와 응집도까지 좋아지는 것도 아니다.

이 테스트는 좋은 설계나 컨벤션을 대신 만들어 주지 않는다. 다만 팀이 이미 선택한 컨벤션이 문서에만 머물지 않고, 모든 변경과 CI에서 같은 기준으로 작동하게 한다. 계층 경계 테스트의 가장 큰 가치는 바로 이 일관성에 있다.
