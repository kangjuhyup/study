# Node.js OOM · Heap Snapshot 실험

Auth 프로젝트에서 분리한 독립 학습 자료입니다. Node.js 객체를 의도적으로 누적해 OOM을 재현하고, baseline과 힙 한계 근처의 스냅샷을 DevTools로 비교합니다. 외부 패키지나 인증 서버 실행은 필요하지 않습니다.

## 자료

- [재현 코드](./reproduce.cjs)
- [블로그 글과 실제 DevTools 스크린샷](./blog/index.md)
- [실행 초기 스냅샷](./baseline.heapsnapshot)
- [힙 한계 근처 스냅샷](./Heap.20260906.094454.38528.0.001.heapsnapshot)
- [OOM 로그](./oom.log)
- [분석 결과](./analysis.json)
- [기존 실행 기록](./result.json)

스냅샷은 Node.js 24.13.1로 2026-09-06에 생성했습니다. 로그와 `result.json`의 경로는 당시 실행 위치를 기록한 것이므로 원문 그대로 보존했습니다. 현재 파일은 이 폴더에 있습니다.

## 다시 실행하기

macOS/Linux와 nvm 기준입니다. `.nvmrc`에 지정한 Node.js 24.13.1을 사용합니다. 아래 명령은 의도적으로 OOM 종료를 발생시키며, 새 결과 디렉터리를 만들어 기존 분석 자료를 보존합니다.

```bash
cd /Users/kangjuhyup/Documents/study/oom-snapshot
nvm use
node --version

(
  set -eu
  umask 077
  ulimit -c 0
  experiment_root="$PWD"
  mkdir -p results
  run_dir="$(mktemp -d "$experiment_root/results/run.XXXXXX")"
  printf '결과 디렉터리: %s\n' "$run_dir"
  cd "$run_dir"
  node \
    --max-old-space-size=32 \
    --heapsnapshot-near-heap-limit=1 \
    --diagnostic-dir=. \
    "$experiment_root/reproduce.cjs" > oom.log 2>&1
)
```

정상 종료가 아니라 `JavaScript heap out of memory` 오류와 스냅샷 생성을 확인하는 실험입니다. 32MiB는 초기 V8 old-space 한도이며, 프로세스 전체 메모리 제한이 아닙니다. 스냅샷 생성 중 힙 한도가 조정될 수 있으므로 마지막 로그의 메모리 사용량은 더 클 수 있습니다.

## 분석하기

DevTools의 **Memory → Load**에서 baseline과 자동 스냅샷을 불러옵니다. 자동 스냅샷을 선택한 뒤 **Comparison → baseline**에서 `OomLabChunk`를 검색합니다. 인스턴스를 선택하고 **Retainers**에서 `Array → global.oomLabRetained` 참조를 확인합니다.

기존 실행에서는 스냅샷의 `OomLabChunk`가 0개에서 56개로 늘었고, OOM 종료는 로그와 SIGABRT로 확인했습니다. 상세한 수치와 해석은 [블로그 글](./blog/index.md)에 있습니다.
