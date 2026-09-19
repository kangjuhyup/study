# 실행 가능한 최소 인증 샘플

Docker Compose로 실행한다. Node.js 설치나 npm install은 필요 없다.

```text
curl → Envoy → 보호 API
          └─ Authorizer → 데모 introspection 서버
```

Envoy는 실제 프록시다. 데모 서버는 고정 토큰으로 인증 성공·실패를 재현한다. 로그인 UI, 실제 OIDC 서버, DB, 사용자 매핑은 이 샘플에서 제외했다. API는 읽기 전용 `/api/profile` 하나다.

## 실행

이 디렉터리에서 실행한다.

```sh
docker compose -p study-auth-sample up -d
docker compose -p study-auth-sample run --rm test
```

이미지가 없으면 Docker가 내려받는다. 버전은 Node.js 24.20.0과 Envoy 1.36.9로 고정했다. 테스트는 준비 상태를 기다린 뒤 12개 시나리오를 확인한다.

직접 호출하려면 다음 명령을 사용한다. `demo-valid`는 이 샘플에서만 쓰는 공개된 테스트 문자열이다.

```sh
curl -i -X POST http://127.0.0.1:18080/api/profile \
  -H 'Authorization: Bearer demo-valid'
```

응답:

```json
{"user":"demo-user","via":"verified-edge-assertion","bearerForwarded":false}
```

## 비교할 요청

| 요청 | 결과 |
| --- | --- |
| `demo-valid` | 200 |
| 토큰 없음·알 수 없는 토큰 | 401 |
| `demo-expired` | 401 |
| `demo-no-scope` | 403 |
| `demo-auth-down` | 503 — 데모 인증 서버가 장애 응답 |
| 위조한 assertion만 전달 | 401 |
| 정상 토큰 + 위조한 assertion | 위조 헤더를 교체하고 200 |
| 직접 API 포트에 Bearer 또는 위조 assertion 전달 | 401 |
| OPTIONS | 204 |
| `/graphql` 별칭 호출 | 404 |

직접 접근 검사를 위해 보호 API의 `18081` 포트도 loopback에 열어 두었다. 네트워크 격리를 확인할 때는 Compose의 이 port mapping을 제거한다. 서명 검증에 의한 거부와 네트워크 접근 차단은 별개다.

## 파일

- [demo.mjs](./demo.mjs): 데모 introspection, Authorizer, 보호 API. 시작할 때 Ed25519 키를 메모리에 생성한다.
- [envoy.yaml](./envoy.yaml): 외부 헤더 제거 → ext_authz → 원본 Bearer 제거 → API 전달.
- [compose.yaml](./compose.yaml): 독립된 시험 스택.
- [smoke.mjs](./smoke.mjs): 12개 요청의 status와 정상 응답 검증.
- [vite.proxy.ts](./vite.proxy.ts): 기존 UI에 선택적으로 합칠 API 프록시 설정.

작게 실행하려고 세 Node 서버를 한 프로세스에 묶었다. 운영용 인증 구현이나 GraphQL 서버는 아니다. 실제 서비스에 연결할 때는 [구성 가이드](../local-guide.md)의 client 인증·issuer·키 배포·사용자 매핑 계약을 적용한다. 고정 토큰 fixture를 실제 인증 서버로 교체하고 키도 분리 관리한다.

## 종료

```sh
docker compose -p study-auth-sample down
```

## 검증

Envoy 1.36.9의 설정 검증과 실제 Compose 실행에서 12개 시나리오가 통과했다. Auth 장애는 fixture의 503 응답으로 재현하며, 실제 인증 서버의 연결 장애·운영 메시 정책을 검증한 결과와는 구분한다.
