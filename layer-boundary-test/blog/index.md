# import type도 계층 경계를 넘는다: TypeScript 경계 테스트 만들기

기능 테스트와 빌드가 통과해도 계층 규칙은 깨질 수 있다. 다음 코드는 런타임에는 남지 않지만 Presentation을 Application 타입에 결합한다.

```typescript
import type { ReminderTemplateView } from '../../../application/query/dto/response/reminder-template.view';
```

이 글에서는 가상의 `campaign` 모듈로 위반을 재현하고, 경계 테스트를 만든 뒤 transport-local 타입으로 수정한다.

> 아래 도메인과 코드는 계층 경계 테스트를 설명하기 위한 최소 예제다.

## import type도 결합이다

위반한 Presentation DTO는 Application view를 생성자 타입으로 사용한다.

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

TypeScript는 `import type`을 JavaScript 출력에서 제거한다. 하지만 컴파일에는 Application 선언이 필요하고, 그 타입의 이름·위치·필드가 바뀌면 Presentation도 영향을 받는다. 런타임 의존성이 없다는 사실과 소스 계층이 독립적이라는 판단은 별개다.

이 글에서 검증할 정책은 다음 한 문장이다.

> Presentation DTO는 Application·Domain·Infrastructure 타입을 직접 참조하지 않는 transport-local 스키마여야 한다.

이 정책 없이 결합을 허용하면 작은 편의가 다음 비용으로 누적될 수 있다.

| 상황 | 결과 |
| --- | --- |
| Application 타입을 여러 DTO가 공유 | 내부 리팩터링이 API 계층까지 연쇄 전파된다. |
| 내부 모델과 응답 모델을 같은 타입으로 사용 | 두 계약을 서로 다른 속도로 변경하거나 API 버전을 유지하기 어려워진다. |
| ORM·외부 SDK 타입까지 재사용 | 저장 방식과 외부 서비스의 세부사항이 전송 계약으로 새어 나간다. |
| 결합이 퍼진 뒤 경계를 복원 | 타입 분리, 매핑 추가와 호출부 수정을 한꺼번에 해야 한다. |

계층 침식은 즉시 기능 장애를 만들지 않아 발견이 늦다. 경계 테스트는 첫 번째 금지 import가 추가될 때 실패해 확산을 막는다.

## 실패와 수정을 재현한다

재현 자료는 위반 상태와 수정 상태를 fixture로 분리하고, 계층 테스트는 `test/architecture`에 둔다.

```text
layer-boundary-test/
├─ .nvmrc
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
npm run test:fixed
```

첫 명령은 `import type`이 있는 fixture를 검사한다. 종료 코드 1과 위반 파일이 출력된다.

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

두 번째 명령은 수정 fixture를 검사하고 종료 코드 0으로 끝난다.

```text
✔ keeps presentation DTOs as transport-local schemas
tests 1
pass 1
fail 0
```

## 경계 테스트 만들기

검사는 다음 순서로 진행한다.

1. `modules` 아래의 TypeScript 파일을 재귀 수집한다.
2. `presentation/dto` 아래의 `.dto.ts`만 남긴다.
3. `from` 뒤의 상대 import를 추출한다.
4. DTO 위치를 기준으로 import 대상을 해석한다.
5. 대상 경로에 `application`, `domain`, `infrastructure`가 있으면 `offenders`에 추가하고 빈 배열인지 확인한다.

`test/architecture/layer-boundary.spec.ts`의 전체 코드는 다음과 같다.

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

정규식이 `from` 절을 찾기 때문에 `import type`도 예외 없이 검사된다. 상대 경로는 `resolve(dirname(file), specifier)`로 해석하므로 `../../../application/...`이 실제로 어느 계층을 가리키는지도 판단할 수 있다.

## transport-local 타입으로 수정한다

Application import를 제거하고 DTO가 필요한 입력 모양만 같은 파일에 선언한다.

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

`ReminderTemplateSource`는 `code`, `content`, `buttonLabel`만 표현한다. TypeScript의 구조적 타이핑 덕분에 같은 모양의 Application 값은 그대로 받을 수 있다. 런타임 변환을 추가하지 않고 타입의 소유권만 Presentation으로 옮긴다.

## 경계 테스트의 트레이드오프

이 테스트는 결합을 없애는 대신 다른 비용을 선택한다.

| 선택 | 얻는 것 | 지불하는 비용 |
| --- | --- | --- |
| DTO에 transport-local 타입 선언 | Application과 Presentation을 독립적으로 변경할 수 있다. | 비슷한 필드 선언과 매핑 지점을 따로 관리한다. |
| 경로 기반 규칙을 CI에서 강제 | 첫 금지 import에서 실패하고 모든 리뷰에 같은 기준을 적용한다. | 허용 방향과 예외를 먼저 합의하고, 폴더 구조가 바뀌면 테스트도 고쳐야 한다. |
| 정규식으로 상대 import 검사 | 외부 도구 없이 빠르고 이해하기 쉬운 검사를 만든다. | 주석을 오인할 수 있고 alias, re-export, 동적 import를 놓친다. |
| AST와 모듈 해석기로 확장 | 실제 import 대상을 더 정확히 찾아 오탐과 미탐을 줄인다. | 검사 코드, 의존성, 실행 시간과 유지 비용이 늘어난다. |
| 아키텍처 규칙 자동화 | 의존 방향을 실행 가능한 문서로 남기고 구조 침식을 일찍 발견한다. | 통과 결과가 책임 분리와 응집도까지 보증하지는 않는다. 설계 리뷰는 여전히 필요하다. |

따라서 모든 프로젝트에 가장 강한 검사기를 먼저 넣을 필요는 없다. 계층 정책이 합의돼 있고 같은 위반이 반복될 가능성이 있다면 작은 경로 검사부터 시작할 가치가 크다. alias와 re-export를 실제로 사용해 정규식의 사각지대가 문제가 될 때 AST 검사로 확장하면 된다.

핵심 트레이드오프는 **타입 선언의 중복을 조금 허용해 계층의 독립성과 변경 범위를 지키는 것**이다. 경계 테스트는 어느 쪽을 선택했는지 CI에서 일관되게 확인하는 장치다.
