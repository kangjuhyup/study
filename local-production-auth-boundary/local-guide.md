# 운영 인증 경로를 로컬 컨테이너로 재현하기

평소 로컬에서는 애플리케이션을 dev 모드로 실행하고 주변 인프라를 Docker Compose로 관리한다. 기존 로그인과 업무 서비스는 유지하고, API 앞에 **Envoy와 외부 인가 서비스 두 개를 추가**한다. 운영의 전체 서비스 메시 대신 요청 검사·인증 결과 전달·우회 차단을 먼저 재현하는 가이드다.

프로젝트명·주소·서비스명·헤더·설정 변수는 설명용 가명이다. 아래 설정은 연결 템플릿이며, 각 프로젝트의 이미지와 인증 계약에 맞춰 적용한다. 예제의 사용자 정의 환경변수는 해당 서비스에서 구현해야 하는 인터페이스다.

먼저 흐름을 실행해 보려면 [최소 샘플](./samples/README.md)을 사용한다. 아래 가이드는 실제 서비스와 연결할 때의 구성이다.

## dev 실행과 네트워크 격리 시험 나누기

일상 개발에서는 Gateway를 dev 모드로 유지하고 Envoy·Authorizer만 Compose로 실행할 수 있다. 이 경우 아래 Compose의 Gateway 컨테이너는 실행하지 않고, Envoy의 Gateway upstream을 개발 장비의 dev 프로세스로 연결한다. Linux/macOS 등 환경에 맞는 컨테이너→호스트 주소를 사용하며, 컨테이너 내부의 localhost를 호스트 주소로 사용하지 않는다. dev 프로세스의 바인딩 주소와 방화벽도 함께 확인한다.

호스트에서 실행하는 Gateway에 Envoy를 추가했다고 직접 포트 접근이 사라지지는 않는다. dev Gateway는 edge 모드의 서명 검증으로 무인증 요청을 거부해야 한다. **호스트 포트 비공개와 컨테이너 네트워크 격리까지 시험할 때는 아래의 별도 Gateway 컨테이너 구성을 사용한다.** 아래 Compose는 이 격리 시험용 구성이며, 현재 애플리케이션 전체가 컨테이너로 실행된다는 뜻은 아니다.

## 1. 최소 실행 구성 정하기

```text
브라우저 → UI 개발 서버 → Envoy → Gateway → 업무 서비스
                            │        ↑
                            └─ Authorizer
                                    │
                                    └─ 기존 인증 서버의 introspection

Authorizer가 허용하면 Envoy가 서명한 결과를 Gateway로 전달
로그인 화면·OIDC callback·토큰 교환은 기존 경로 유지
```

| 요소 | 로컬 구성 |
| --- | --- |
| Envoy | 호스트의 loopback 포트만 공개 |
| Authorizer | HTTP ext_authz 계약 구현, 호스트 포트 비공개 |
| Gateway | edge assertion 검증 모드, 호스트 포트 비공개 |
| 인증 서버 | 기존 서버 사용, introspection 전용 client 추가 |
| 사용자·업무 서비스 | 기존 서비스 사용 |
| UI | API 요청만 Envoy로 변경 |

아래 예시 API 경로는 `/api/graphql`이다. 실제 Gateway 경로가 다르면 Envoy route와 UI 설정을 함께 맞춘다. URL rewrite까지 추가하기보다 처음에는 동일 경로로 연결하는 편이 확인하기 쉽다.

## 2. 프록시를 붙이기 전에 준비할 코드

### Authorizer의 HTTP 계약 구현하기

Authorizer는 Auth의 introspection endpoint와 별개인 작은 서비스다. Envoy의 검사 요청을 받아 인증 서버에 토큰을 조회하고, 허용 여부와 서명한 결과를 반환한다.

| 입력·결과 | 예제 계약 |
| --- | --- |
| 입력 | API 요청의 method·path와 `Authorization: Bearer ...` |
| 토큰 없음·불활성·claim 불일치 | 401, assertion 없음 |
| 필요한 API scope 부족 | 403, assertion 없음 |
| 정상 검증 | 200 + `x-edge-assertion` |
| 인증 서버 장애·응답 오류 | 503, assertion 없음 |

HTTP ext_authz에서는 원래 요청 경로와 메서드를 처리하도록 구현한다. 이 예시는 별도의 `/check` prefix를 붙이지 않는다. GraphQL 본문은 Authorizer로 복사하지 않으므로 scope 정책은 API 입구의 공통 조건만 담당하고, 작업별 권한은 업무 서비스에서 검사한다.

처리 순서는 다음으로 고정한다.

1. Bearer token을 추출한다. 중복되거나 모호한 인증 입력은 거부한다.
2. 전용 service client로 introspection을 호출한다. client secret은 브라우저에 두지 않는다.
3. `active`, issuer, audience, 만료, 필요한 scope 및 주체 정보를 검사한다.
4. 검사에 성공하면 Gateway만 수신할 수 있는 짧은 수명의 assertion을 서명한다.
5. token·secret·assertion 원문은 로그에 기록하지 않는다.

예제 assertion 계약은 다음과 같이 정할 수 있다. 이는 기존 프로젝트의 확정 계약이 아니라 구현할 때 합의할 예시다.

| 필드 | 예제 의미 |
| --- | --- |
| `iss` | `moa-edge` — assertion 발급자 |
| `aud` | `moa-gateway` — 유일한 수신자 |
| `sub` | introspection에서 확인한 외부 subject |
| `source_issuer` | 원본 토큰의 검증된 issuer; assertion issuer와 구분 |
| `tenant_id`, `scope` | 검증된 tenant와 권한 정보 |
| `iat`, `exp` | 발급 시간과 짧은 만료 시간 |

만료 시간은 원본 access token 만료를 넘지 않게 제한한다. 서명 알고리즘은 검증 측 allowlist로 고정하고, Authorizer의 개인키와 Gateway의 공개키를 분리한다. Gateway→업무 서비스 assertion에는 별도 키·issuer·audience를 사용한다. 짧은 TTL만으로 재사용이 차단되는 것은 아니므로 전송 구간과 내부 접근도 제한한다.

### Gateway의 edge 모드 구현하기

기존 직접 introspection 모드와 edge 모드를 명시적으로 구분한다. 예제 변수 `AUTH_MODE=edge`를 선택하면 다음 순서로 처리하도록 구현한다.

1. `x-edge-assertion`의 서명·알고리즘·issuer·audience·시간·필수 claim을 검사한다.
2. 검증된 외부 주체를 사용자 서비스에 보내 내부 userId를 매핑한다.
3. 기존 업무 서비스용 assertion을 발급한다.

edge 모드에서 assertion이 없거나 잘못되면 거부한다. Bearer token 직접 검사로 자동 fallback하지 않는다. 이 모드에서는 Gateway가 Auth introspection을 다시 호출하지 않는다.

사용자 매핑은 기존 계약을 확인해 연결한다. tenant + subject 기반 구현이라면 여러 issuer의 식별자가 충돌하지 않는지도 점검한다. Auth나 Authorizer에 사용자 서비스 조회를 넣지는 않는다.

**이 단계의 완료 기준:** Authorizer의 허용·거부 응답과 Gateway의 assertion 검증을 각각 테스트하고, 연결할 이미지 두 개를 준비한다. 아래 Compose는 이 이미지들을 실행하는 템플릿이다.

## 3. 네트워크와 Compose 연결하기

격리된 로컬 시험용 폴더에 `compose.yaml`, `envoy.yaml`, `secrets/`를 둔다. `secrets/`와 로컬 환경 파일은 Git에서 제외한다. 기존 프로젝트의 서비스를 재생성하는 override로 바로 사용하지 말고, 시험용 스택 이름을 사용한다.

이미지 참조는 프로젝트가 검증한 tag 또는 digest로 고정한다. `ENVOY_IMAGE`, `AUTHORIZER_IMAGE`, `GATEWAY_IMAGE`, `APP_NETWORK`를 로컬 환경에서 지정한다. 예제는 실제 배포 주소나 키를 포함하지 않는다.

```yaml
services:
  edge:
    image: ${ENVOY_IMAGE:?Set a pinned Envoy image}
    ports:
      - "127.0.0.1:18080:8080"
    volumes:
      - ./envoy.yaml:/etc/envoy/envoy.yaml:ro
    networks: [edge_net]
    depends_on: [authorizer, gateway]

  authorizer:
    image: ${AUTHORIZER_IMAGE:?Build the authorizer first}
    environment:
      PORT: "9000"
      OIDC_ISSUER: ${OIDC_ISSUER:?Set the exact issuer}
      OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:?Set an introspection client}
      OIDC_CLIENT_SECRET_FILE: /run/secrets/introspection_secret
      EDGE_SIGNING_KEY_FILE: /run/secrets/edge_private_key
    secrets: [introspection_secret, edge_private_key]
    networks: [edge_net, app_net]

  gateway:
    image: ${GATEWAY_IMAGE:?Build edge authentication mode first}
    environment:
      PORT: "8081"
      AUTH_MODE: edge
      EDGE_VERIFY_KEY_FILE: /run/secrets/edge_public_key
    secrets: [edge_public_key]
    networks: [edge_net, app_net]
    # Add the application's normal service URLs and its separate subgraph key.
    # Do not publish a host port for Gateway.

networks:
  edge_net:
    internal: true
  app_net:
    external: true
    name: ${APP_NETWORK:?Set the existing local app network}

secrets:
  introspection_secret:
    file: ./secrets/introspection-secret
  edge_private_key:
    file: ./secrets/edge-private.pem
  edge_public_key:
    file: ./secrets/edge-public.pem
```

Authorizer와 Gateway는 컨테이너 내부의 `0.0.0.0`에 바인딩한다.

`app_net`은 기존 인증·업무 서비스에 연결하기 위한 네트워크다. Gateway의 기존 서비스 URL과 업무 서비스용 키 설정도 추가해야 한다. 해당 이미지가 `_FILE` 설정을 지원하지 않으면 먼저 파일에서 읽도록 구현하거나 기존 secret 주입 방식을 연결한다.

인증 서버 URL의 `localhost`는 컨테이너 안에서 자기 자신을 뜻한다. 브라우저용 주소를 그대로 복사하지 말고, 컨테이너에서 도달 가능한 discovery/introspection 주소와 **정확한 issuer 일치 조건**을 함께 확인한다. DNS 별칭을 만들었다고 issuer가 바뀌는 것은 아니다. 검증을 끄기보다 개발 환경에서 지원하는 주소·인증서 설정으로 연결한다.

Gateway를 연결한 네트워크에 신뢰하지 않는 컨테이너를 넣지 않는다. 호스트 포트 비공개는 외부 접근을 줄이지만 같은 네트워크 내 모든 접근까지 차단하지는 않는다. Gateway의 서명 검증이 계속 필요한 이유다.

## 4. Envoy의 API 경로 설정하기

다음 `envoy.yaml`은 API POST만 upstream에 전달한다. OPTIONS는 별도 응답, 다른 경로·메서드는 404로 닫는다. 로그인·가입·health는 이 listener에서 제공하지 않고 기존 경로를 유지한다.

```yaml
static_resources:
  listeners:
    - name: api
      address:
        socket_address: { address: 0.0.0.0, port_value: 8080 }
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: local_api
                route_config:
                  name: api_routes
                  virtual_hosts:
                    - name: api
                      domains: ["*"]
                      routes:
                        - match:
                            path: /api/graphql
                            headers:
                              - name: ":method"
                                string_match: { exact: OPTIONS }
                          direct_response: { status: 204 }
                          typed_per_filter_config:
                            envoy.filters.http.ext_authz:
                              "@type": type.googleapis.com/envoy.extensions.filters.http.ext_authz.v3.ExtAuthzPerRoute
                              disabled: true
                        - match:
                            path: /api/graphql
                            headers:
                              - name: ":method"
                                string_match: { exact: POST }
                          route: { cluster: gateway, timeout: 10s }
                        - match: { prefix: / }
                          direct_response: { status: 404 }
                          typed_per_filter_config:
                            envoy.filters.http.ext_authz:
                              "@type": type.googleapis.com/envoy.extensions.filters.http.ext_authz.v3.ExtAuthzPerRoute
                              disabled: true
                http_filters:
                  - name: envoy.filters.http.lua
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.lua.v3.Lua
                      default_source_code:
                        inline_string: |
                          function envoy_on_request(handle)
                            handle:headers():remove("x-edge-assertion")
                            handle:headers():remove("x-service-assertion")
                            handle:headers():remove("x-jwt-payload")
                          end
                  - name: envoy.filters.http.ext_authz
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.ext_authz.v3.ExtAuthz
                      failure_mode_allow: false
                      status_on_error: { code: ServiceUnavailable }
                      http_service:
                        server_uri:
                          uri: http://authorizer:9000
                          cluster: authorizer
                          timeout: 3s
                        authorization_request:
                          allowed_headers:
                            patterns:
                              - exact: authorization
                        authorization_response:
                          allowed_upstream_headers:
                            patterns:
                              - exact: x-edge-assertion
                  - name: envoy.filters.http.lua
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.lua.v3.Lua
                      default_source_code:
                        inline_string: |
                          function envoy_on_request(handle)
                            handle:headers():remove("authorization")
                          end
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
  clusters:
    - name: authorizer
      type: STRICT_DNS
      connect_timeout: 1s
      load_assignment:
        cluster_name: authorizer
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address: { address: authorizer, port_value: 9000 }
    - name: gateway
      type: STRICT_DNS
      connect_timeout: 1s
      load_assignment:
        cluster_name: gateway
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address: { address: gateway, port_value: 8081 }
```

첫 번째 Lua filter에서 외부 인증 결과 헤더를 제거하고, ext_authz 뒤의 Lua filter에서 원본 Bearer token을 제거한다.

Authorizer가 Gateway에 전달할 허용 응답 헤더는 하나로 제한한다. 프로젝트에서 인증에 사용하는 다른 사용자 정의 헤더도 입력 제거 목록에 추가한다. ext_authz 이후에는 route를 변경하는 filter를 추가하지 않는다.

HTTP filter 계약과 경로별 검사 비활성화는 [Envoy 공식 가이드](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/ext_authz_filter), 응답 헤더 허용 목록은 [v3 API](https://www.envoyproxy.io/docs/envoy/latest/api-v3/extensions/filters/http/ext_authz/v3/ext_authz.proto)를 참고했다. 선택한 Envoy 버전으로 다음 설정 검증을 수행한다.

## 5. 설정 검증 후 실행하기

아래 명령은 별도 시험 스택을 대상으로 실행한다. 기존 스택과 프로젝트 이름이 겹치지 않는지 먼저 확인한다.

```sh
# Required variables and secret files must already be provided locally.
docker compose -p moa-auth-lab config --quiet

# Validate with the exact Envoy image selected for this experiment.
docker compose -p moa-auth-lab run --rm --no-deps edge \
  --mode validate -c /etc/envoy/envoy.yaml

docker compose -p moa-auth-lab up -d authorizer gateway edge
docker compose -p moa-auth-lab ps
```

`depends_on`만으로 애플리케이션의 준비 완료를 보장할 수는 없다. 시작 로그와 readiness를 확인한 뒤 시험한다. 비밀값이 출력되는 설정 dump나 token을 포함하는 verbose 로그는 사용하지 않는다.

UI 개발 서버의 `/api/graphql` 프록시 대상을 `http://127.0.0.1:18080`으로 지정하고, 브라우저에서는 같은 origin의 `/api/graphql`을 호출한다. UI 서버도 컨테이너라면 도달 가능한 Envoy 서비스명을 프록시 대상으로 사용한다. 로그인 설정은 유지한다.

이 예시는 동일 origin 프록시를 사용한다. OPTIONS 응답만으로 cross-origin CORS 지원이 완성되지는 않는다. 브라우저에서 Envoy를 직접 호출하려면 정확한 UI origin에 대한 CORS 응답을 오류·거부 응답까지 포함해 설정한다.

## 6. 성공·거부·장애 확인하기

먼저 토큰 없는 보호 API 요청이 거부되는지 확인한다.

```sh
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  http://127.0.0.1:18080/api/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"query { __typename }"}'
```

정상 토큰 시험은 기존 로그인 UI에서 수행한다. 로그나 문서에 토큰을 옮겨 적지 않고, 읽기 전용의 보호된 업무 query로 확인한다. `__typename` 성공만으로 업무 서비스의 권한 검사까지 검증했다고 볼 수 없다.

| 시험 | 통과 기준 |
| --- | --- |
| 정상 토큰 | 보호된 읽기 query 성공. Authorizer 검사→Gateway 검증 순서 확인 |
| 토큰 없음·변조·만료 | 401 등으로 거부, 보호된 업무 처리 없음 |
| issuer/audience 불일치·scope 부족 | 정의한 인증·권한 조건에 따라 거부 |
| 위조한 edge assertion 헤더 | Envoy에서 제거. 토큰 없으면 거부 |
| 잘못된 서명·만료된 assertion | Gateway 단위·통합 시험에서 거부 |
| Gateway 직접 접근 | 호스트에 공개한 포트 없음. 기존 직접 URL로도 접근 불가 |
| Authorizer 장애 | 시험용 Authorizer 정지 중 Envoy에서 거부 |
| Auth 장애 | Authorizer 시험에서 timeout·실패 주입 시 허용 응답 없음 |
| OPTIONS·알 수 없는 경로·별칭 API | 정한 204/404 응답. 보호된 POST 검사 우회 불가 |
| 중복 검증 | Gateway에서 introspection 호출 없음 |

Authorizer 장애 시험은 별도로 만든 시험 스택에서 수행한다.

```sh
docker compose -p moa-auth-lab stop authorizer
# Repeat the API request and confirm it cannot reach protected work.
docker compose -p moa-auth-lab start authorizer
```

공유 Auth를 정지하는 대신 Authorizer 테스트에 연결 오류와 timeout을 주입한다. API 응답 외에도 비밀값 없는 request ID·검사 횟수·업무 처리 횟수를 대조한다. 결과는 “사례 / 기대 결과 / 실제 status / 보호된 처리 실행 여부 / 통과 여부”로 남긴다.

## 7. Istio에서 확인할 항목 분리하기

컨테이너 구성에서는 인증 계약과 거부 동작을 확인한다. 다음 단계에서 k3d/kind에 같은 서비스를 올리고 Istio extension provider와 CUSTOM AuthorizationPolicy를 설정한다.

이 단계에서는 policy selector, path/method, 허용 헤더, timeout, fail-closed, Ingress를 우회하는 서비스 접근을 확인한다. [Istio 공식 절차](https://istio.io/latest/docs/tasks/security/authorization/authz-custom/)를 참고하고, 클러스터를 만들기 전에 호환되는 Kubernetes/Istio 버전을 고정한다.

평소 로컬 개발은 작은 구성으로 진행하고, 메시 고유의 변경이 있을 때 클러스터 검증을 추가한다. 운영 규모와 배치까지 매번 재현할 필요는 없다.

## 검증 범위

이 가이드는 기존 코드의 인증 책임 분담과 공식 API를 바탕으로 작성한 적용 템플릿이다. Compose/Envoy 실행 검증과 연결 시험은 대상 이미지·edge 모드·전용 client를 준비한 뒤 위 절차로 수행한다.
