# Superpowers workflow의 토큰·시간 비교 연구

Superpowers 적용 방식에 따른 토큰·시간과 결과 품질을 비교한다. 과제별 실험 조건과 원시 자료는 각각 보존한다.

| 실험 | 비교 대상 | 문서 |
| --- | --- | --- |
| 읽기 전용 코드 감사 | scoped Superpowers 명시 여부 A/B | [보고서](./report.md) |
| 간단한 코드 변경 | 직접 구현 / Superpowers / 개인 scoped A/B/C | [벤치마크](./workflow-code-benchmark/README.md) · [블로그 원고](./workflow-code-benchmark/blog/index.md) |

## 읽기 전용 코드 감사 실험

아래는 첫 번째 실험의 자료와 재현 명령이다. 동일한 코드 감사 과제에서 scoped Superpowers 사용 명시 여부만 바꿔 새 Codex CLI 세션으로 실행하며 실제 프로젝트 코드를 수정하지 않는다.

- [실험 설계](./protocol.md)
- [실험 결과](./report.md)
- [프롬프트 A](./prompts/A.txt) · [프롬프트 B](./prompts/B.txt)
- [합성 과제](./fixture/contract.md) · [코드](./fixture/settlement.py) · [데이터](./fixture/events.json)
- [실행기](./run.py) · [usage 정규화](./normalize.py) · [통계 계산](./analyze.py)
- [compact raw data](./results/campaign-01/)

## 실행 환경과 재현

Python 3.10.15 (`.python-version`), Codex CLI 0.153.4, 모델 `gpt-5.6-sol`, reasoning `medium`. Python 표준 라이브러리만 사용한다. Node·npm 및 Astro는 이 연구의 실행 의존성이 아니다. Codex 인증은 기존 로컬 설정을 사용하며 인증 파일을 복사하지 않는다. runtime이나 의존성 설치는 실행기가 수행하지 않는다.

```sh
cd scoped-superpowers-ab
python3 --version
codex --version
python3 run.py --output results/reproduction-01 --pairs 3 --seed 20260908 --model gpt-5.6-sol --reasoning medium
python3 normalize.py results/reproduction-01
python3 analyze.py results/reproduction-01
python3 verify.py results/reproduction-01
```

결과 디렉터리가 이미 있으면 실행을 거부한다. 새 이름으로 실행해 이전 결과를 보존한다. 총 6개의 Codex 세션을 실행하므로 해당 모델 사용량이 발생한다. 각 실행의 300초 timeout은 CLI 프로세스 경과 시간 기준이다.

workflow 파일은 설치된 rv-workflow에서 그대로 복사한 연구용 입력이다. 플러그인 설치나 변경이 아니며 복제된 라이선스·고지 파일을 함께 보관한다.
