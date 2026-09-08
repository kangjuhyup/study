# 사전 고정한 실험 설계

## 질문과 처리

같은 읽기 전용 코드 감사 과제에서 `rv-workflow:scoped-superpowers`의 사용을 명시하면, 사용하지 말라고 한 경우보다 Codex JSON usage와 프로세스 경과 시간이 얼마나 달라지는가?

- A: scoped Superpowers와 bundled reference를 사용하지 않는다.
- B: scoped Superpowers와 bundled verification-before-completion을 사용한다.
- 공통 프롬프트 뒤 마지막 문장만 다르다. 두 arm 모두 새 로컬 증거로 검증하도록 요구한다. 따라서 일반적인 검증 유무 비교가 아니라 **명시적인 workflow 적용의 추가 효과**다.
- 모델 `gpt-5.6-sol`, reasoning `medium`, CLI `0.153.4`를 고정한다. 모델 설정은 호스트의 기존 선택에서 가져왔다.
- 실제 설치된 RV Workflow의 router, routing, verification 문서를 동결 복사했다. 두 arm에 같은 파일이 존재하며 사용 지시만 다르다. 플러그인을 새로 설치하거나 ID를 바꾸지 않는다.
- 설치 메타데이터 버전은 `0.1.0+codex.20260905125105`, 설치 경로 package.json은 `0.1.1`이다. 버전 문자열만으로 동일성을 주장하지 않고 fixture SHA-256을 보존한다.

## 독립 실행

`codex exec --ignore-user-config --ephemeral --skip-git-repo-check --sandbox read-only`를 매회 새 프로세스로 실행한다. resume/fork를 사용하지 않는다. 측정 workspace는 study 밖의 임시 디렉터리이며 study의 진행 중 초안·Git·프로젝트 설정을 모델 입력으로 주지 않는다. 연구를 수행하는 study 소유 세션은 AGENTS startup 규칙을 따르고, 측정 세션에는 동일한 최소 AGENTS를 제공한다.

모든 실행은 같은 fixture 내용, 같은 절대 workspace 경로, 같은 JSON schema를 사용한다. 파일 해시를 실행 전후 검사한다. 모델은 파일을 수정하지 않고 로컬 읽기와 Python 표준 라이브러리 계산만 할 수 있다. 설치, 네트워크, 서비스 실행, 위임은 과제에서 금지한다. 프로세스를 순차 실행해 서로의 자원 경합을 피한다.

seed `20260908`로 첫 arm을 정하고 다음 쌍에서 순서를 교차한다. 세 쌍은 **AB / BA / AB**다. 완전한 독립 무작위 순서가 아닌, 시작 arm만 무작위화한 교차 설계다. 별도 예열 세션은 없다. 실패·timeout도 기록하고, 실행 인프라 실패 시 자동 중단해 원인 확인 전 같은 실패를 반복하지 않는다.

## 과제와 채점

정산 계약, 결함이 있는 Python 함수, 16개 이벤트를 읽고 정확한 계정별 정산 금액과 결함 식별자를 JSON으로 반환한다. 실제 사용자·계정·토큰 데이터가 아닌 합성 fixture다. 날짜 경계, refund 부호, 필터 이전 dedup 순서의 세 결함을 모두 찾아야 한다.

정답은 alpha 875, beta 2050, gamma 800 cents, 전체 3725 cents, 결함 집합 DATE_RULE/DEDUP_RULE/REFUND_RULE이다. JSON 객체 전체를 비교하며 결함 배열 순서만 정규화한다. 값 일부만 맞거나 다른 결함을 추가하면 오답이다. 정답은 runner 쪽에만 있으며 측정 workspace에는 넣지 않는다. 시험 시작 전에 채점 기준을 고정했다.

## 계측

- wall time: Python `perf_counter()`로 codex 프로세스 실행 직전부터 반환까지. CLI 시작, 도구 실행, 네트워크 대기, 모델 추론, 응답 출력 시간을 포함한다. 모델만의 추론 시간이 아니다.
- 토큰: `turn.completed.usage`에 실제 출력된 필드만 집계한다. input_tokens/cached_input_tokens/output_tokens/reasoning_output_tokens/total_tokens 중 노출되지 않은 것은 `unavailable`이다. input+output으로 total을 만들어 채우지 않는다. 원래 usage 객체도 보존한다.
- 종료 코드, turn 완료 여부, timeout, 정답, fixture 보존, 실행한 command와 종료 코드도 기록한다. 스킬 읽기 실행 흔적으로 treatment 이행을 확인한다. 읽기만으로 내부 사고 절차 준수를 증명할 수는 없다.
- arm별 중간값·최소·최대와 B−A 절대 차이 및 A 중간값 대비 백분율을 계산한다. 쌍별 차이도 별도로 저장한다.
- 원문 프롬프트·fixture·workflow·schema와 command template, 해시, compact JSON 결과를 보존한다. 인증 설정, 전체 세션 로그, 세션 ID는 연구 자료로 복사하지 않는다.

## 실제 usage 스키마 확인에 따른 수집 보정

첫 실행에서 reasoning 필드의 실제 이름이 `reasoning_output_tokens`임을 확인했다. 실행 조건이나 프롬프트는 바꾸지 않고, 저장한 원래 usage 객체에서 이 키를 읽도록 정규화기를 보정했다. 이미 시작된 실행기의 메모리에는 초기 필드 선택이 남아 있으므로 전체 실행 종료 후 `normalize.py`를 적용한다. 원래 usage 값은 수정하지 않는다. reasoning을 새로 추정하거나 누락을 0으로 바꾸지 않는다. 이 스키마 확인은 첫 실행 뒤 이뤄졌고, 완전한 사전 등록 연구는 아니다.
