# k6 부하 생성기 분리 실험 기록

MacBook Air M2 한 대에서 200 VU 시험을 통과한 뒤 300 VU에서 k6 OOM을 겪고, 생성기를 M1 Mini로 분리해 300 VU 30분 지표를 얻은 기록입니다.

- [블로그 원고](./blog/index.md)
- 환경 구성도: [PNG](./blog/images/loadgen-topology.png) · [SVG 원본](./blog/images/loadgen-topology.svg)

글은 `site/posts.json`에 초안으로 등록했습니다. [블로그 운영 안내](../site/README.md)에 따라 로컬 미리보기의 `k6-loadgen-isolation` 글에서 확인할 수 있습니다.
