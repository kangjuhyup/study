# `import type`뿐인데 Domain 경계를 넘었다: 의존 컨벤션을 테스트로 지키기

`npm run test:violation`을 실행하자 Domain 파일 하나가 경계 테스트를 깨뜨렸다.

```text
✖ keeps the domain independent from outer layers

+ [
+   'fixtures/violation/modules/campaign/domain/reminder/reminder-schedule-policy.ts'
+ ]
- []

tests 1
pass 0
fail 1
```

문제는 런타임 코드가 아니라 타입 import였다.

```typescript
import type { ScheduleCampaignReminderCommand } from '../../application/command/schedule-campaign-reminder.command';
```

`import type`은 컴파일된 JavaScript에서 사라진다. 기능은 정상이고 빌드도 통과할 수 있다. 그래도 이 코드는 팀이 정한 의존 방향을 거슬렀다.

```text
Presentation ─┐
              ├─> Application ─> Domain
Infrastructure┘

금지: Domain ─> Application·Presentation·Infrastructure
```

이 글에서는 가상의 `campaign` 모듈로 위반을 재현하고, Domain이 필요한 타입을 안쪽으로 옮긴 뒤 같은 테스트가 통과하는 데까지 살펴본다. 예제는 계층 경계 검사에 필요한 파일만 남긴 최소 구성이다.

## 타입만 가져왔는데 왜 역방향 의존일까

위반한 Domain 정책은 Application command를 매개변수 타입으로 사용한다.

```typescript
import type { ScheduleCampaignReminderCommand } from '../../application/command/schedule-campaign-reminder.command';

export class ReminderSchedulePolicy {
  canSchedule(source: ScheduleCampaignReminderCommand, now: Date): boolean {
    return source.content.trim().length > 0 && source.scheduledAt > now;
  }
}
```

런타임 import는 남지 않지만 소스 수준의 결합은 남는다. 이 파일을 타입 검사하려면 Application의 선언이 필요하다. command의 이름이나 위치가 바뀌면 Domain도 고쳐야 하고, 유스케이스가 선택한 입력 형태가 Domain 정책의 인터페이스를 결정한다.

한 번의 참조는 작아 보여도 같은 선택이 반복되면 계층은 서서히 침식된다. Application의 command와 query를 정리할 때 Domain이 함께 바뀌고, Domain 규칙을 다른 유스케이스에서 재사용하려 해도 기존 Application 타입을 끌고 가게 된다. Presentation DTO나 ORM 타입까지 같은 방식으로 들어오기 시작하면 핵심 규칙이 API와 저장 방식의 세부사항을 알게 될 수도 있다.

이 상태가 오래 유지될수록 경계를 되살리는 비용은 커진다. 퍼진 타입을 걷어내고 Domain 계약을 새로 만든 뒤 여러 호출부에 매핑을 추가해야 하기 때문이다. 기능을 즉시 깨뜨리지 않는 의존이라 빌드와 기능 테스트만으로는 구조가 흐려지는 순간을 찾기 어렵다.

그래서 이 예제에서는 다음 컨벤션을 선택했다.

> Domain은 Application·Presentation·Infrastructure를 참조하지 않는다. `import type`도 소스 의존이므로 같은 규칙으로 검사한다.

이 역시 이름만 보고 적용하는 보편 법칙은 아니다. 프로젝트의 계층과 의존 방향을 먼저 합의해야 테스트의 허용 목록도 정할 수 있다.

## 실패를 어떻게 최소한으로 재현했을까

전체 서버를 복제하지 않고 위반 전후에 필요한 파일만 두 fixture로 나눴다.

```text
layer-boundary-test/
├─ fixtures/
│  ├─ violation/modules/campaign/
│  │  ├─ application/command/...
│  │  └─ domain/reminder/...
│  └─ fixed/modules/campaign/domain/reminder/...
└─ test/architecture/layer-boundary.spec.ts
```

Node.js 24.20.0과 npm 11.19.0을 사용하며 외부 패키지는 없다.

```bash
cd layer-boundary-test
nvm use
npm run test:violation
```

위반 fixture는 앞에서 본 Domain 파일을 `offenders`에 남기며 종료 코드 1로 실패한다. 같은 검사에 수정 fixture를 넣으면 결과가 바뀐다.

```bash
npm run test:fixed
```

```text
✔ keeps the domain independent from outer layers
tests 1
pass 1
fail 0
```

두 실행의 차이는 검사 코드가 아니라 fixture의 의존 관계뿐이다.

## 의존 컨벤션을 어떻게 테스트로 옮겼을까

문장으로 정한 규칙을 다음 순서로 검사한다.

1. `modules` 아래의 TypeScript 파일을 재귀적으로 모은다.
2. 그중 `domain` 경로에 있는 파일만 남긴다.
3. 각 파일의 상대 import를 찾는다.
4. import가 실제로 가리키는 경로를 계산한다.
5. Application·Presentation·Infrastructure로 향하는 Domain 파일을 `offenders`에 모아 빈 배열인지 검증한다.

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

test('keeps the domain independent from outer layers', () => {
  const sourceRoot = resolve(process.env.LAYER_SOURCE_ROOT ?? 'fixtures/fixed');
  const modulesRoot = join(sourceRoot, 'modules');
  const moduleFiles = collectTypeScriptFiles(modulesRoot);
  const offenders = moduleFiles
    .filter((file) => file.includes('/domain/'))
    .filter((file) =>
      relativeImportTargets(file).some(
        (target) =>
          target.includes('/application/') ||
          target.includes('/presentation/') ||
          target.includes('/infrastructure/'),
      ),
    )
    .map((file) => relative(process.cwd(), file));

  assert.deepEqual(offenders, []);
});
```

`from` 절을 찾는 정규식은 일반 import와 `import type`을 구분하지 않는다. 컨벤션이 둘 다 금지하므로 의도한 동작이다. `resolve(dirname(file), specifier)`는 소스에서 `application`이라는 단어를 찾는 대신 `../../application/...`이 실제로 향하는 위치를 계산한다. 실패하면 `offenders`에 파일 경로가 남아 수정 지점도 바로 드러난다.

## 무엇을 바꾸자 테스트가 통과했을까

Application import를 제거하고 Domain 정책이 실제로 필요한 값만 Domain 안에 선언했다.

```typescript
type ReminderScheduleCandidate = {
  readonly content: string;
  readonly scheduledAt: Date;
};

export class ReminderSchedulePolicy {
  canSchedule(source: ReminderScheduleCandidate, now: Date): boolean {
    return source.content.trim().length > 0 && source.scheduledAt > now;
  }
}
```

`ReminderScheduleCandidate`는 `content`와 `scheduledAt`만 알 뿐 특정 Application command의 이름과 위치는 모른다. TypeScript의 구조적 타이핑 덕분에 같은 형태의 값은 그대로 받을 수 있어 런타임 변환도 추가되지 않는다. 이 변경 뒤 같은 경계 테스트는 종료 코드 0, `pass 1`, `fail 0`으로 끝났다.

## 무엇을 얻고, 무엇을 감수할까

이 컨벤션으로 얻는 것은 **Domain의 변경 독립성**이다. Application에서 command 이름이나 유스케이스 입력을 바꿔도 Domain 정책이 자동으로 끌려가지 않는다. 핵심 규칙을 다른 유스케이스에서 사용할 때도 기존 Application 타입을 함께 가져올 필요가 없다.

경계 테스트는 그 독립성이 무너지는 첫 import를 CI에서 찾는다. 빌드와 기능 테스트가 놓친 구조 침식을 일찍 발견하면, 의존이 여러 파일로 퍼진 뒤 한꺼번에 분리하는 리팩터링 비용을 줄일 수 있다. 의존 방향 자체도 실행 가능한 문서가 되어 모든 리뷰에 같은 기준을 제공한다.

대신 **타입 중복과 경계 변환 비용**을 감수한다. Domain-local 타입을 두면 Application command와 비슷한 필드 선언이 하나 더 생긴다. 두 계약이 함께 바뀌는 날에는 각각 수정하거나 경계에서 명시적으로 매핑해야 한다. Domain의 독립성이 이 비용보다 중요한 프로젝트인지 먼저 판단해야 한다.

검사의 단순함과 정확성도 교환 관계다. 현재 정규식은 작고 빠르지만 주석을 import로 오인할 수 있고 alias, re-export, 동적 import는 놓친다. 이런 문법을 사용한다면 TypeScript Compiler API로 AST를 순회하고 `resolveModuleName`으로 모듈을 해석하는 검사로 확장해야 한다. 정확도가 높아지는 만큼 테스트 코드와 실행 시간, 유지 비용도 늘어난다.

마지막으로 테스트는 좋은 모듈 설계를 대신하지 않는다. 어떤 의존을 허용할지 팀이 먼저 합의해야 하고, 예외와 컨벤션이 바뀌면 검사도 함께 바꿔야 한다. `offenders`가 비어 있다는 결과는 금지한 import가 없다는 사실만 증명할 뿐, Domain 모델의 응집도나 비즈니스 규칙의 품질까지 보장하지 않는다.

이번 재현에서 직접 확인한 것은 단순하다. Domain이 Application 타입을 `import type`으로 참조하자 테스트가 실패했고, 필요한 계약을 Domain 안으로 옮기자 통과했다. 경계 테스트의 가치는 아키텍처의 정답을 선언하는 데 있지 않다. 팀이 선택한 의존 컨벤션이 조용히 침식되는 순간을 같은 기준으로 잡아내는 데 있다.
