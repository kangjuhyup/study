# 간단한 코드 변경에서 workflow의 자율 선택과 비용

같은 짧은 변경 요청을 직접 구현 환경, Superpowers 기본 진입 환경, 개인 scoped 정책 환경에 주고 실제 선택한 절차와 토큰·시간·정답을 비교한다.

- [설계와 통제 범위](./protocol.md)
- [연구 결과](./report.md)
- [블로그 원고](./blog/index.md)
- [동일 사용자 요청](./prompts/A.txt)
- [A 설정](./arms/A.md) · [B 설정](./arms/B.md) · [C 설정](./arms/C.md)
- [실행기](./run.py) · [독립 채점](./grade.py)
- [compact raw data와 산출물](./results/autonomous-01/)
- [동결 upstream 출처·해시](./sources.json)

## 재현

Python 3.10.15 (`.python-version`) 및 Codex CLI 0.153.4를 사용한다. Python 표준 라이브러리 외에 설치할 의존성은 없다. 모델 `gpt-5.6-sol`, reasoning `medium`은 실행기에 고정돼 있다. 현재 계정에 해당 모델을 실행할 권한과 사용량이 필요하다.

```sh
cd scoped-superpowers-ab/workflow-code-benchmark
python3 --version
codex --version
python3 run.py --output results/reproduction-01
python3 analyze.py results/reproduction-01
python3 inspect_process.py results/reproduction-01
python3 verify.py results/reproduction-01
```

이 명령은 총 9개의 새 모델 세션을 실행한다. 기존 결과 디렉터리는 덮어쓰지 않는다. `--seed`로 순서를, `--timeout`으로 실행 제한을 바꾸면 별도 조건으로 기록한다. 비교 재현에는 기본값을 사용한다.

2026-09-09 공개 대상으로 등록했다. [게시된 글](https://kangjuhyup.github.io/study/posts/superpowers-small-code-benchmark/)에서 읽을 수 있다.

이 연구는 기존 루트 폴더에서 현재 위치로 이동했다. 원시 실행 기록의 절대 경로는 측정 당시 값으로 보존하며, 새 실행은 위 명령을 사용한다.
