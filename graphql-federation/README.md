# GraphQL Federation 학습

Apollo Federation 2의 스키마 합성과 Entity 조회를 정리하고, Profile·Inventory·Products 세 Subgraph를 실제 HTTP로 연결합니다. `me → profile / inventory → products`에서 쿼리의 필드 선택에 따라 호출 범위가 달라지는 것을 확인합니다.

- [한국어 기술 글 초안](./blog/index.md): BFF·마이크로서비스와 Federation의 관계, Apollo 구성 요소·대체 구현·트레이드오프, Entity, 주요 Directive와 Query Plan
- [스키마와 Resolver](./sample/schemas.mjs): Profile·Inventory·Products의 필드 분담과 Entity 연결
- [Gateway 구성](./sample/graph.mjs): 스키마 합성, HTTP 호출과 Query Plan 기록
- [통합 테스트](./test/federation.test.mjs)
- 요청·응답 흐름도는 블로그 원문의 `mermaid` 코드 블록으로 관리합니다. 이전 SVG·PNG는 `blog/images/`에 보관합니다.

## 실행 환경

이 폴더는 Node.js **24.20.0**, npm **11.19.0**을 사용합니다. `.nvmrc`, `package.json`, `package-lock.json`으로 버전을 고정하며 사이트와 독립적으로 설치합니다.

Apollo Server 5.5.1, Federation 관련 패키지 2.14.4, GraphQL.js 16.14.2를 사용합니다. 스키마의 `@link`는 필요한 기능을 제공하는 Federation **v2.3**을 선택합니다. 이는 npm 패키지 버전과 별개이며 최신 사양 버전이라는 의미가 아닙니다. Resolver는 별도 빌드 없이 실행할 수 있는 ESM JavaScript로 작성했습니다.

```sh
cd graphql-federation
nvm use
npm ci
npm test
npm run demo
```

`npm run demo`는 빈 포트에 Profile·Inventory·Products·Gateway를 띄웁니다. 프로필만 조회, 보유 상품까지 조회, 상품 없이 개수만 조회, 상품 배송비 조회의 네 쿼리를 비교합니다. 응답, Query Plan, Subgraph로 보낸 쿼리와 Entity representation을 출력한 뒤 종료합니다. DB, Docker, GraphOS 계정이나 API 키는 필요하지 않습니다. `me`는 인증 없이 고정된 가상 사용자를 반환합니다.

## 서버를 직접 조회하기

```sh
npm start
```

| 서버 | 로컬 주소 |
| --- | --- |
| Gateway | `http://127.0.0.1:4000/` |
| Products | `http://127.0.0.1:4001/` |
| Inventory | `http://127.0.0.1:4002/` |
| Profile | `http://127.0.0.1:4003/` |

다른 터미널에서 Gateway를 조회합니다. 사용 중인 포트가 있으면 해당 프로세스를 종료하거나 `sample/start.mjs`의 포트를 바꿉니다.

```sh
curl --silent --show-error http://127.0.0.1:4000/ \
  -H 'content-type: application/json' \
  --data '{"query":"{ me { profile { displayName email } inventory { totalCount products { id name price } } } }"}'
```

`Ctrl+C`로 Gateway와 세 Subgraph를 함께 종료합니다. 학습용 서버는 루프백 주소에만 바인딩합니다. 인증, 영속 저장, 운영용 장애 처리는 포함하지 않습니다.

## 검증 결과

2026-10-02에 위 고정 버전으로 8개 테스트를 확인했습니다. 세 Subgraph로 확장한 실행 증거는 [demo.txt](./results/2026-10-02-profile-inventory/demo.txt), [test.txt](./results/2026-10-02-profile-inventory/test.txt)에 보관합니다. 초기 두 Subgraph 실행 결과는 `results/2026-10-02/`에 보존했습니다.

| 시나리오 | 확인할 동작 |
| --- | --- |
| 프로필만 조회 | Profile만 호출하고 Inventory·Products는 호출하지 않음 |
| 내 보유 상품 조회 | Profile → Inventory → Products, 사용자 키와 상품 키로 연결 |
| 상품 없이 보유 개수 조회 | Profile → Inventory만 호출하고 Products는 호출하지 않음 |
| 상품명만 조회 | Products만 호출하고 Inventory는 호출하지 않음 |
| 상품 두 개의 재고·배송비 조회 | 두 Subgraph의 결과를 합치고, 선택하지 않은 가격·무게를 representation에 전달 |
| Subgraph `_entities` 직접 조회 | 알려진 키로 상품을 찾고 없는 상품은 `null` 반환 |
| 없는 상품 조회 | `product: null`, Inventory 호출 없음 |
| 중복 필드 합성 | 공유 선언 없이 두 Subgraph가 `Product.name`을 제공하면 `INVALID_FIELD_SHARING` |

배송비는 예제 규칙입니다. 10만 원 이상이면 무료이며, 그 외에는 무게 1kg 단위 올림에 3천 원을 곱합니다. 키보드는 3천 원, 모니터는 0원입니다.

실제 HTTP 요청과 응답을 검증하며 성능 벤치마크는 하지 않습니다. Query Plan 기록은 Gateway의 실험적 콜백을 사용하므로 패키지 업그레이드 시 API를 다시 확인합니다. 재실행 로그는 `results/<새 날짜 또는 실행 ID>/`에 저장해 기존 증거를 보존합니다.

## 블로그에서 검토하기

글은 `site/posts.json`에 초안으로 등록했습니다. 저장소 루트에서 다음 명령으로 확인합니다.

```sh
cd site
nvm use
npm run dev
```

미리보기 경로는 `/posts/graphql-federation/`입니다. 발행 절차는 [블로그 운영 안내](../site/README.md)를 따릅니다.
