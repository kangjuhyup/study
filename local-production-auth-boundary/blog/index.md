# 운영 인증 흐름을 로컬에 작게 가져오기

로컬에서는 애플리케이션을 dev 모드로 실행하고, DB와 캐시는 Docker Compose로 띄운다. 코드를 고치고 바로 확인하기에는 편한 구성이다. 로그인하고 API를 호출하는 흐름도 이 환경에서 확인할 수 있었다.

본문의 서비스명과 설정 예시는 실제 프로젝트를 드러내지 않도록 바꿨다. 샘플은 별도의 학습용 구성이다.

그런데 Kubernetes와 Istio를 사용하는 운영 구성을 설계하면서 차이가 보였다. 로컬에서는 Gateway가 토큰을 검사하지만, 운영에서는 Gateway 앞의 프록시와 외부 인가 서비스를 거치게 하려 했다. **같은 API가 성공해도, 확인한 인증 경로는 달랐다.**

이 차이를 줄이려고 운영 환경 전체를 로컬에 옮기고 싶지는 않았다. 대신 인증에 필요한 부분만 골라 작은 샘플을 만들었다. Envoy 앞단 검사와 Gateway의 결과 검증을 연결하고, 정상·거부 요청 12개를 확인했다.

## 로컬에서 빠진 인증 구간

로컬과 운영 환경에는 아래와 같은 차이가 있다.

| 구분 | 로컬 개발 | 운영 환경    |
| --- | --- | --- |
| 애플리케이션 | dev 프로세스 | Kubernetes Pod |
| DB·캐시 | Docker Compose | 배포 환경의 인프라에 연결 |
| API 접근 | Gateway 직접 호출 | Ingress 경유 |
| 토큰 검사 | Gateway | 외부 인가 서비스 |
| 통신 정책 | 개발용 주소와 포트 | Kubernetes·Istio 설정 |

현재 로컬에서는 Gateway가 인증 서버에 토큰을 확인한다. 운영에 적용하려는 경로에서는 Envoy가 외부 인가 서비스에 요청 허용 여부를 먼저 묻는다.

```text
현재 로컬
클라이언트 → Gateway → 업무 서비스
               └─ 인증 서버

운영에 적용할 경로
클라이언트 → Envoy → Gateway → 업무 서비스
               └─ 외부 인가 서비스 → 인증 서버
```

Envoy는 `ext_authz`로 외부 검사를 호출한다. Istio에서는 `CUSTOM` 정책으로 이 검사를 연결할 수 있다. [Istio 외부 인가](https://istio.io/latest/docs/tasks/security/authorization/authz-custom/)

Gateway에 직접 요청하면 이 앞단을 건너뛴다. 어떤 요청이 검사 대상인지, 인증 결과를 어떻게 전달하는지, 검사에 실패하면 요청이 멈추는지 확인하기 어렵다. 로컬에 가져오려는 부분은 이 구간이었다.

## 전체 메시 대신 Envoy부터 추가하기

먼저 Envoy와 외부 인가 서비스만 추가하기로 했다. 애플리케이션의 dev 실행과 기존 DB·캐시는 유지하고, API 요청이 들어가는 입구를 바꾸는 방식이다.

외부 인가 서비스는 토큰을 확인하고, 통과한 요청에 짧은 수명의 인증 결과를 서명한다. Gateway는 그 결과를 검증한 뒤 내부 사용자 매핑과 업무 처리를 이어 간다. 검증 위치가 옮겨지는 만큼, Gateway의 직접 토큰 조회도 해당 모드에서 제거한다.

현재 API는 opaque access token을 사용한다. 인증 서버의 introspection으로 토큰 상태를 확인하는 방식이다. 따라서 Istio의 JWT 검증 설정만으로 이 조회를 대신할 수는 없다. [Istio RequestAuthentication](https://istio.io/latest/docs/reference/config/security/request_authentication/)

이 구성에서는 전체 메시나 운영의 복제본 수까지 맞출 필요가 없다. 우선 **토큰 검사 → 결과 전달 → Gateway 검증**이라는 순서를 로컬에 남기는 데 집중했다.

## 바로 실행할 수 있는 크기로 줄이기

[저장소의 샘플](https://github.com/kangjuhyup/study/tree/main/local-production-auth-boundary/samples)에는 Envoy, 외부 인가 서비스, 데모 인증 서버, 보호 API를 넣었다. 별도 계정 없이 실행하도록 인증 서버는 고정된 테스트 토큰을 사용한다. 실제 서비스에 연결할 때는 이 부분을 기존 인증 서버로 바꾼다.

샘플 실행은 두 명령이면 된다. Node.js를 별도로 설치할 필요도 없다.

```sh
# local-production-auth-boundary/samples에서 실행
docker compose -p study-auth-sample up -d
docker compose -p study-auth-sample run --rm test
```

흐름을 살펴보기 쉽도록 업무 API는 `/api/profile` 하나로 줄였다. 데모 인증 서버와 외부 인가 서비스, 보호 API는 하나의 Node 프로세스에서 실행한다. Envoy는 별도 컨테이너로 요청을 처리한다.

중요한 설정은 외부 인가 호출과 결과 전달이다. 아래는 샘플의 `ext_authz` 설정 중 일부다.

```yaml
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
```

`authorizer`는 Envoy에 정의한 cluster 이름이다. 샘플에서는 Node 데모 컨테이너의 외부 인가 포트로 연결된다.

외부 인가 서비스에는 Bearer token을 보내고, Gateway에는 서명한 `x-edge-assertion`을 전달한다. 호출에 실패하면 `failure_mode_allow: false`에 따라 요청을 통과시키지 않는다. [Envoy ext_authz](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/ext_authz_filter)

헤더를 전달하기 전후에도 처리가 필요했다. 클라이언트가 보낸 인증 결과 헤더는 먼저 지운다. 외부 검사가 끝난 뒤에는 원본 Bearer token을 제거한다. Gateway는 자신을 대상으로 서명된 결과만 검증한다.

```text
외부에서 보낸 인증 결과 헤더 제거
→ 토큰 검사
→ 서명한 인증 결과 전달
→ 원본 Bearer token 제거
→ Gateway 검증
```

## 성공 요청과 거부 요청을 함께 확인하기

정상 토큰으로 호출하면 다음 응답을 받는다. `demo-valid`는 샘플 전용 테스트 문자열이다.

```sh
curl -X POST http://127.0.0.1:18080/api/profile \
  -H 'Authorization: Bearer demo-valid'
```

```json
{
  "user": "demo-user",
  "via": "verified-edge-assertion",
  "bearerForwarded": false
}
```

Gateway가 서명 결과를 검증했고, 원본 Bearer token은 전달되지 않았다. 같은 구성에서 거부해야 할 요청도 확인했다.

| 확인한 요청 | 결과 |
| --- | --- |
| 정상 토큰 | 200 |
| 토큰 없음·변조·만료 | 각각 401 |
| scope 부족 | 403 |
| 데모 인증 서버의 장애 응답 | 503 |
| 위조한 인증 결과만 전달 | 401 |
| 정상 토큰과 위조한 결과를 함께 전달 | 위조 헤더 교체 후 200 |
| Gateway에 Bearer 또는 위조한 결과로 직접 요청 | 각각 401 |
| OPTIONS / 등록하지 않은 경로 | 각각 204 / 404 |

**12개 요청이 모두 기대한 결과를 반환했다.** 특히 정상 토큰과 위조 헤더를 함께 보낸 경우에도 Gateway는 외부 입력을 신뢰하지 않고 새로 서명된 결과를 받았다.

직접 접근 시험을 위해 샘플의 Gateway 포트는 로컬에 열어 두었다. 여기서 확인한 것은 서명 검증에 의한 거부다. 네트워크 접근 차단까지 시험하려면 포트 공개를 제거해야 한다. 인증 서버 장애도 데모의 503 응답으로 재현했으므로, 실제 연결 실패와 타임아웃은 별도로 확인할 항목이다.

## 평소 개발에 가져올 부분

실제 dev 환경에서는 애플리케이션을 그대로 실행하고, API 요청만 Envoy로 보낼 수 있다. Vite를 사용한다면 프록시 대상을 바꾸는 식이다.

```ts
// 기존 server.proxy 설정에 추가
'/api/profile': {
  target: 'http://127.0.0.1:18080',
  changeOrigin: true,
},
```

Envoy의 upstream은 dev Gateway에 연결한다. 이때 컨테이너 내부의 `localhost`는 개발 장비를 가리키지 않으므로, 호스트에 도달할 주소를 지정해야 한다. Gateway의 서명 검증도 함께 적용한다. [Vite 프록시 설정](https://vite.dev/config/server-options.html#server-proxy)

키 관리, 실제 인증 서버 연결, 사용자 매핑 등 프로젝트에 적용할 항목은 [구성 가이드](https://github.com/kangjuhyup/study/blob/main/local-production-auth-boundary/local-guide.md)에 정리했다. 업무 서비스로 보내는 인증 정보는 별도 계약을 유지하고, 작업별 권한도 해당 서비스에서 계속 검사한다.

Istio 정책의 적용 대상이나 메시 내부 통신을 확인할 때는 k3d 또는 kind로 범위를 넓히려 한다. 평소에는 dev 환경과 작은 Compose 구성을 사용하고, 메시 설정을 검증할 때 클러스터를 추가하는 방식이다.

이번 샘플에서는 전체 Kubernetes 환경 없이도 앞단 검사와 인증 결과 전달을 실행해 볼 수 있었다. 운영과 로컬을 가깝게 만드는 기준은 구성 요소의 개수보다, **개발 중 확인해야 할 요청 경로가 남아 있는가**에 두려 한다.
