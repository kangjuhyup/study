# 자율 workflow 선택 비교 설계

## 연구 질문

사용자가 간단한 코드 변경만 요청했을 때, Superpowers의 기본 진입 정책이 스스로 작업 절차를 얼마나 추가하는가? 개인 scoped 정책은 같은 정답을 더 적은 토큰·시간으로 얻는가?

앞선 [읽기 전용 감사 실험](../report.md)은 읽기 전용 감사 과제에서 완료 검증 reference를 명시한 경우만 비교했다. 이번 연구는 실제 코드를 수정하며, 세부 workflow 선택을 모델에게 맡긴다. 이전 숫자와 이번 숫자를 한 A/B로 합치지 않는다.

## 잘못 시작한 파일럿과 정정

처음에는 B에 설계→계획→TDD→리뷰→검증을 강제로 요구하는 파일럿을 시작했다. 사용자가 문제는 자율적인 확대 해석이라고 바로잡아 그 실행을 중단했다. `results/campaign-01/interruption.json` 및 `pilots/forced-process/`에 별도 보존하고 모든 비교에서 제외한다. 해당 프로세스의 완료 usage는 얻지 못했으므로 토큰과 정확한 wall time은 unavailable이다.

아래는 이 정정 이후 새로 시작한 `results/autonomous-01`의 설계다. 사용자 요청에 전체 절차를 넣지 않는다.

## 공통 사용자 요청

> 기존 normalize_tags에서 lower() 대신 casefold()를 사용하고, 정규화한 태그의 중복을 첫 등장 순서대로 제거해 주세요. 기존 입력 검증은 유지하고 관련 테스트를 추가해 실행해 주세요.

`prompts/A.txt`, `B.txt`, `C.txt`는 바이트까지 같다. 기존 코드는 입력 타입 검사·strip·lower·공백 제거를 수행한다. 원하는 변경은 casefold와 순서 보존 중복 제거다. 신규 앱이나 신규 아키텍처가 아니다.

## 세 환경

| arm | 달라지는 workflow 설정 | 모델이 정하는 것 |
| --- | --- | --- |
| A | workflow 없음 | 직접 구현·테스트 방법 |
| B | upstream using-superpowers 진입 지침 | 적용할 skill과 작업 절차 |
| C | rv-workflow scoped router 진입 지침 | 규모 판정과 후속 reference 필요 여부 |

전체 source와 scoped source 파일은 **모든 arm에 동일하게 존재**한다. 공통 AGENTS 뒤에 붙이는 `arms/<arm>.md`의 workflow 구성만 다르다. B에 브레인스토밍·계획·TDD 등 구체적 단계나 문서 작성을 강제하지 않는다. C에도 small로 분류하라고 지시하지 않는다.

B의 upstream은 revision `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`의 skills 전체를 동결했다. C는 앞선 연구에서 동결한 installed rv-workflow scoped 문서를 사용한다. 플러그인을 설치·해제하지 않고 파일 읽기를 Skill 도구의 대체 진입점으로 사용한다. 따라서 **workflow 정책의 자율 선택을 비교하는 통제 환경**이며 실제 플러그인 연결 전체의 on/off 실험은 아니다.

## 실행과 통제

- Codex CLI 0.153.4, `gpt-5.6-sol`, reasoning `medium`, Python 3.10.15.
- 동일 계약·초기 코드·source 파일·최종 JSON schema. 매회 같은 임시 경로에 fixture를 새로 복원한다.
- 독립된 새 `codex exec --ephemeral --ignore-user-config`, sandbox workspace-write. resume·이전 답 전달 없음.
- 쓰기는 tags.py, tests/, docs/만 허용. 네트워크·외부 파일·추가 에이전트·의존성 설치·서비스·Git 작업 금지.
- 공통 환경에서 계약 범위 내 승인은 미리 부여한다. 사람이 승인하는 대기 시간과 외부 reviewer/subagent 비용은 제외한다. 리뷰를 선택하면 자기검토로 대체한다. 이 통제 때문에 실제 대화형 사용과 다른 결과가 날 수 있다.
- 요청한 최종 JSON 형식은 implemented, tests_passed, 160자 이내 summary로 동일하다. 문서·테스트 등 중간 산출물은 선택한 workflow의 결과로 허용한다.
- seed 20260908로 arm 배열을 섞은 뒤 Latin square 방식으로 회전: **BCA / CAB / ABC**. 각 arm은 세 위치에 한 번씩 등장한다. 직전 arm의 영향까지 완전히 균형화하지는 못한다.
- 9회를 순차 실행한다. 각 CLI 프로세스 timeout은 600초다. CLI 인프라 실패 시 실패를 보존하고 중단한다.

## 독립 채점

모델이 만든 테스트 통과 주장과 별도로, study 소유 runner가 숨겨 둔 `grade.py`로 결과 tags.py를 실행한다. 14개 unittest 메서드가 공백, casefold, 순서, Unicode, 입력 불변, 잘못된 container·element 등을 검사한다. 일부 메서드에는 여러 subtest가 있다.

실험 전 초기 코드는 14개 중 3개 실패함을 확인했고, 독립 reference 구현은 14개 모두 통과했다. 모델에는 grade.py를 제공하지 않으며 외부 파일 읽기를 금지한다. 채점 실행 시간은 Codex wall time 이후로 분리한다.

정답은 독립 테스트 통과와 보호 파일·허용 쓰기 범위 준수를 모두 만족한 경우다. docs나 테스트 개수가 많다는 이유로 품질 점수를 주지 않는다.

## 관측값

- 실제 `turn.completed.usage`: input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens, total_tokens. 없는 필드는 unavailable; 합산으로 총량을 추정하지 않는다.
- Codex 프로세스 wall time, exit code, 완료/timeout, 독립 채점.
- 도구 실행 command·exit·출력 일부, 파일 변경 이벤트, 최종 코드·테스트·문서와 해시.
- 어떤 스킬을 읽었는지, 계획/설계 문서를 생성했는지, RED→GREEN 실행 흔적이 있는지. 읽은 스킬과 실제 수행한 단계를 구분한다.
- arm별 중간값·범위, B−A/C−A 및 B 대비 C의 절대·백분율 차이. 실행 순서와 개별 값도 남긴다.

API 내부 sampling, prompt cache, 백엔드 부하, OS 캐시·다른 프로세스는 완전히 고정할 수 없다. 승인 대기와 subagent를 배제한 제한된 비용 측정이며, 일반 Superpowers가 항상 과정을 늘린다고 미리 결론 내리지 않는다.

보관 시 정리: 초기 소스 해시는 bytecode cache를 제외한다. 사전 grader가 만든 cache는 최초 측정에서 완전히 통제하지 못했으며 보관본에서는 삭제했다. 재현 실행기는 cache 복사를 제외하고 grader에 -B를 사용한다. 따라서 동일한 소스 실험을 재현하지만 과거 cache 상태까지 동일하지는 않다.
