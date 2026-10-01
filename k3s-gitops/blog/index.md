# Oracle A1 한 대로 시작하는 K3s: 구축부터 GitOps 운영까지

개인 프로젝트 서버를 고르면서 Oracle Cloud의 A1 인스턴스가 눈에 들어왔다. 무료로 사용할 수 있는 데다, 내가 만들 서비스를 올려보기에도 사양이 넉넉해 보였다.

서버가 생긴 김에 쿠버네티스도 직접 운영해보고 싶었다. 앱을 올리고, 새 버전을 배포하고, 문제가 생기면 상태를 들여다보는 과정까지 한 번 연결해보기로 했다.

이미 사용하던 A1의 K3s 환경을 정리하고 다시 설치하는 것부터 시작했다. 이후 GitHub Actions와 Argo CD로 배포 흐름을 만들고, 인증서와 비밀값, 데이터베이스, 모니터링을 하나씩 붙였다. 이 글은 그 과정을 정리한 기록이다.

*프로젝트명과 도메인은 생략했고, 트리와 구성도는 읽기 쉽도록 단순화했다.*

## 1. 개인 프로젝트 서버로 Oracle A1 선택하기

개인 프로젝트 서버는 비용부터 생각하게 된다. 기능을 만드는 동안에도 서버는 계속 켜져 있어야 하고, 처음부터 사용자가 많은 것도 아니다. A1은 서버 비용 부담을 낮추면서 여러 서비스를 올려볼 수 있다는 점에서 마음에 들었다.

API 서버와 PostgreSQL, Redis를 함께 두고, 배포와 모니터링 도구까지 써보고 싶었다. A1 한 대에서 이런 구성을 시작해볼 만하다고 판단했다.

조금 아쉬운 부분은 ARM64 환경이었다. 사용할 이미지에 `linux/arm64` 빌드가 있는지 살펴봐야 했고, 직접 만드는 앱 이미지도 A1에서 실행할 수 있도록 빌드해야 했다. 이미지와 바이너리를 고를 때 아키텍처를 한 번 더 확인하는 일이 생겼다.

그래서 플랫폼과 앱 이미지의 ARM64 지원을 확인하고, 배포할 버전을 고정했다. 이미지 digest도 함께 남겨 실제로 어떤 이미지를 배포했는지 다시 찾아볼 수 있게 했다.

> 무료 제공량은 현재 안내를 함께 확인하면 좋다. 2026-10-01에 확인한 Oracle 공식 문서에는 월 1,500 OCPU 시간과 9,000 GB 시간, Always Free 계정 기준 2 OCPU·12GB 상당으로 나와 있다. 선택 당시의 경험과 현재 무료 조건은 구분해서 읽어야 한다. [Oracle Always Free 안내](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

### K8s·K3s·k0s 차이와 K3s 선택 이유

서버를 골랐다면 쿠버네티스를 어떻게 설치할지도 정해야 한다. 여기서 K8s는 Kubernetes의 약칭이고, K3s와 k0s는 Kubernetes를 설치하고 운영하기 쉽게 묶은 배포판이다. K3s나 k0s를 써도 Pod, Deployment, Service 같은 Kubernetes 리소스를 사용한다. [Kubernetes 소개](https://kubernetes.io/docs/concepts/overview/), [K3s 소개](https://docs.k3s.io/), [k0s 소개](https://docs.k0sproject.io/stable/)

차이는 클러스터를 만드는 과정과 처음부터 제공하는 구성에 있다. 비교할 때의 K8s는 범위가 넓으므로, 아래에서는 `kubeadm`으로 직접 구성하는 경우를 기준으로 잡았다.

| 비교 항목 | Kubernetes 직접 구성 (`kubeadm`) | K3s | k0s |
| --- | --- | --- | --- |
| 설치 방식 | 런타임·kubelet 등을 준비하고 kubeadm으로 초기화 | 단일 바이너리로 설치·실행 | 단일 바이너리로 설치·실행 |
| 컨테이너 런타임 | containerd 등 호환 런타임을 직접 준비 | containerd 기본 제공 | containerd 기본 제공 |
| Pod 네트워크 | CNI 플러그인을 선택해 설치 | Flannel 기본 제공 | Kube-router 기본, Calico 등 선택 가능 |
| 외부 노출·영속 볼륨 | Ingress·LoadBalancer·스토리지를 선택해 구성 | Traefik·ServiceLB·local-path-provisioner 제공 | Ingress·LoadBalancer·스토리지를 추가 구성 |
| 클러스터 상태 저장 | etcd | SQLite 기본, embedded etcd·외부 DB 선택 가능 | 단일 노드 SQLite, 다중 노드 etcd 기본 |
| 노드 역할 | control-plane과 worker 배치를 구성 | server가 control-plane과 worker 역할을 함께 수행 가능 | controller와 worker 분리가 기본, 단일 노드에서 결합 가능 |

설치와 기본 구성은 [kubeadm 설치 안내](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/create-cluster-kubeadm/), [K3s 기본 구성](https://docs.k3s.io/), [k0s 기본 구성](https://docs.k0sproject.io/stable/), [k0s 아키텍처](https://docs.k0sproject.io/stable/architecture/), [k0s 단일 노드 구성](https://docs.k0sproject.io/stable/k0s-single-node/), [k0s 스토리지 안내](https://docs.k0sproject.io/stable/storage/)를 기준으로 정리했다.

`kubeadm`으로 구성하면 네트워크와 저장소를 하나씩 고르고 연결하는 과정을 직접 다룰 수 있다. K3s와 k0s는 런타임과 기본 네트워크를 함께 제공하므로 클러스터를 시작할 때 준비할 일을 줄여준다. k0s도 단일 서버에서 사용할 수 있고, controller와 worker를 나눠 운영할 수도 있다.

이번에는 K3s의 기본 구성이 A1 한 대에서 시작하려는 목적에 잘 맞았다. ServiceLB로 외부 요청을 연결하고 local-path로 볼륨을 사용할 수 있었다. 기본 Traefik은 끄고 Istio를 연결했지만, 필요한 구성은 남겨서 활용하는 방식으로 시작할 수 있었다.

클러스터를 준비한 뒤에는 Deployment와 Service를 Git으로 관리하고 Argo CD로 배포해보고 싶었다. K3s가 그 출발점을 마련해줬다. 이후 붙이는 DB와 Istio, 모니터링도 서버 자원을 쓰므로 전체 사용량은 함께 살펴보도록 했다.

## 2. 배포·운영 구조와 도구별 역할

도구를 여러 개 쓰다 보면 설정을 어디에서 바꿔야 할지 헷갈릴 수 있다. 그래서 설치를 맡는 도구와 이후 배포를 맡는 도구부터 정했다.

각 도구는 다음 일을 맡는다.

| 도구 | 담당 역할 |
| --- | --- |
| GitHub Actions | 앱 소스에서 컨테이너 이미지 빌드·게시 |
| GHCR | 빌드한 컨테이너 이미지 보관·공급 |
| Terraform | 기존 OCI 인스턴스의 선언과 관리 상태 |
| Ansible | 호스트 준비, K3s 설치·설정, 최초 부트스트랩 |
| Argo CD | 플랫폼과 애플리케이션의 GitOps 배포 |
| Doppler | 비밀값의 원본과 Kubernetes Secret 동기화 |
| cert-manager | 외부 TLS 인증서 발급과 갱신 |
| Prometheus·Grafana·Alertmanager | 메트릭 수집, 상태 관찰과 알림 |

Terraform에는 이미 사용하던 A1을 편입했다. 기존 인스턴스를 코드로 관리할 수 있게 연결하고, plan에서 인스턴스가 교체되거나 원치 않는 변경이 생기지 않는지 확인했다.

Ansible은 호스트를 준비하고 K3s와 초기 Argo CD를 설치하는 데 썼다. Argo CD가 Git에 연결된 뒤에는 플랫폼과 앱 변경을 GitOps로 이어갔다.

호스트 설정을 바꿀 때는 Ansible, 앱 배포를 바꿀 때는 GitOps 저장소, 비밀값을 바꿀 때는 Doppler를 보면 된다. 변경할 곳을 이렇게 나눠두고 작업을 진행했다.

### 역할을 따라 나눈 저장소 구조

폴더도 도구가 맡은 일에 맞춰 나눴다. 아래는 주요 경로만 남긴 예시로, 환경명은 `a1-lab`, 앱 이름은 `demo`로 바꿨다.

```text
infrastructure/
├── terraform/
│   └── environments/a1-lab/    # 기존 인스턴스 편입·노드 선언
├── ansible/
│   ├── inventories/a1-lab/     # 설치 대상·비밀값 없는 설정
│   ├── playbooks/              # 초기화·설치·검증 작업 진입점
│   └── roles/                  # 호스트·K3s·bootstrap 구현
├── gitops/
│   ├── platform/               # 플랫폼 공통 values·설치 선언
│   │   ├── argocd/
│   │   ├── istio/
│   │   ├── cert-manager/
│   │   ├── doppler/
│   │   ├── cnpg/
│   │   └── monitoring/
│   ├── apps/
│   │   └── demo/               # 앱의 기본 배포 선언
│   └── clusters/a1-lab/
│       ├── root/               # Application·AppProject 연결
│       ├── demo/               # 앱의 환경별 패치·라우팅
│       ├── postgresql/         # DB 워크로드 선언
│       ├── redis/              # Redis 워크로드 선언
│       └── monitoring/         # 수집·알림·공개 경로 연결
├── scripts/                    # inventory 생성·선언·접속 검증
└── docs/
    ├── architecture/           # 설계와 선택 근거
    └── runbooks/               # 설치·변경·검증·복구 절차
```

`gitops/apps/`에는 앱의 기본 Deployment와 Service를 둔다. `gitops/clusters/`에서는 이 앱을 해당 환경에 맞게 조정한다. 자원 설정이나 비밀값 참조, 공개 경로가 여기에 들어간다. 앱의 기본 구성과 환경에 맞춘 설정을 따로 읽을 수 있게 한 셈이다.

같은 클러스터에 노드를 추가할 때는 노드 정의와 inventory를 늘리면 된다. 클러스터 폴더나 Argo CD를 노드마다 만들 필요는 없다. 비밀값, Terraform state, kubeconfig와 생성 inventory는 Git에 두는 원본과 분리했다.

### 한 대의 노드에 배치한 구성

폴더는 여러 개지만 실제로 실행되는 곳은 A1 한 대다. 서버 안에 무엇이 올라가는지 모아보면 다음과 같다.

```text
Oracle A1 한 대
└── Ubuntu / K3s 단일 노드
    ├── Control plane + embedded etcd
    ├── CoreDNS / Flannel / ServiceLB
    ├── Argo CD                  # Git 선언 반영
    ├── Istio gateway            # 외부 요청 라우팅
    ├── cert-manager             # 외부 TLS 인증서 관리
    ├── Doppler Operator         # 비밀값 → Kubernetes Secret
    ├── 애플리케이션             # API·UI·worker
    ├── PostgreSQL / Redis       # 앱 데이터
    ├── 모니터링                 # 수집·대시보드·알림
    └── local-path PVC           # 같은 노드의 디스크 사용
```

이 구성요소들은 모두 같은 CPU와 메모리, 디스크를 쓴다. 서버 한 대가 멈추면 함께 영향을 받는다는 점도 운영할 때 계속 생각해야 했다.

## 3. 기존 인스턴스 초기화부터 K3s 클러스터 구성까지

먼저 이미 사용하던 A1의 K3s 환경부터 정리했다. 기존 구성을 이어받기보다는, 이번에 만든 설치 절차로 클러스터를 다시 구성하기로 했다.

처음에는 OS 교체도 검토했지만, 실제로는 인스턴스와 Ubuntu, SSH 환경을 유지했다. 기존 K3s와 앱, DB, 로컬 영속 볼륨 데이터는 정리했다. 이번에는 기존 데이터를 보존하지 않기로 했으므로 데이터 삭제까지 포함한 초기화였다.

기존 서비스를 멈추고 프로세스와 마운트를 정리한 다음, 클러스터 파일과 네트워크 흔적을 제거했다. 호스트 상태를 확인하고 나서 새 K3s를 설치하는 순서였다.

여기서 한 번 멈췄다. CNI 인터페이스를 지우는 중에 이미 사라진 인터페이스를 다시 삭제하려다 정리 작업이 중단된 것이다. 남은 프로세스와 마운트가 없는지 확인한 뒤, 정리 단계만 재개해서 마무리했다.

패키지를 준비할 때는 예전 Jenkins 설치에서 남은 apt 저장소가 서명 오류를 냈다. 해당 설정을 보존하면서 비활성화한 뒤 진행했다. 같은 OS를 계속 쓰는 만큼, K3s 외에 남아 있는 설정도 살펴볼 필요가 있었다.

새 K3s는 버전과 ARM64 바이너리의 체크섬을 고정해서 설치했다. 외부 요청은 나중에 Istio로 연결할 생각이어서 기본 Traefik은 끄고 ServiceLB를 켰다. Pod와 Service의 주소 대역, 노드 주소, 방화벽도 함께 확인했다.

설치가 끝나면 API와 노드부터 확인하고, 기본 Pod와 DNS가 동작하는지 차례로 살펴봤다.

- Kubernetes API readiness
- 노드의 `Ready` 상태
- CoreDNS, local-path-provisioner, metrics-server의 준비 상태
- 클러스터 내부 서비스 이름에 대한 DNS 응답

이때 기록한 RAM 사용량은 약 0.9GB였다. Argo CD나 DB, 모니터링을 붙이기 전의 초기 K3s 상태에서 확인한 값이다.

API와 노드가 준비되고 클러스터 내부 DNS도 응답하는 것을 확인한 뒤, 앱을 배포할 환경을 붙이기 시작했다.

## 4. Argo CD로 GitOps 배포 체계 만들기

클러스터가 준비됐으니 이제 앱을 배포할 차례다. GitHub Actions에서 이미지를 빌드해 GitHub Container Registry(GHCR)에 올리고, Argo CD가 이미지 참조의 변경을 감지해 Sync하도록 흐름을 연결했다. 배포에 쓸 매니페스트와 Helm values는 GitOps 저장소에 둔다.

### GitHub Actions에서 GHCR, Argo CD Sync까지

앱 소스 변경이나 릴리스에 맞춰 GitHub Actions가 이미지를 빌드한다. `linux/amd64`와 `linux/arm64` manifest를 함께 게시하고, A1에서는 ARM64 이미지를 사용한다.

앱 소스 저장소에서 이미지를 만들고, GitOps 저장소에서 배포할 이미지와 설정을 정한다. 전체 흐름은 다음과 같다.

```text
앱 소스 변경 / 릴리스
        │
        ▼
GitHub Actions
        │ 컨테이너 이미지 빌드
        ▼
GHCR에 이미지 게시
        │ 배포할 이미지 digest 확인
        ▼
GitOps 저장소의 이미지 참조 갱신
        │ 변경 커밋 반영
        ▼
Argo CD가 배포 선언 변경 감지
        │ Auto Sync
        ▼
K3s에 새 워크로드 선언 적용
        │ 노드가 GHCR에서 이미지 pull
        ▼
마이그레이션 Job / Deployment 반영
        │
        ▼
Ready 상태와 실제 서비스 동작 확인
```

배포할 이미지의 digest를 GitOps 선언에 넣으면 Argo CD가 Git과 클러스터의 차이를 감지해 자동으로 동기화한다. GHCR에 이미지를 올리는 단계와 GitOps 저장소의 이미지 참조를 바꾸는 단계가 연결되는 방식이다. [Argo CD 자동 동기화 정책](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/)

앱은 마이그레이션 Job이 성공한 뒤 Deployment를 진행하도록 했다. 배포 후에는 Job 완료와 새 이미지 적용, API·UI·worker의 Ready 상태를 보고 실제 로그인도 확인했다.

### 최초 bootstrap과 Argo CD 자기관리

Argo CD가 배포를 맡으려면 우선 Argo CD부터 설치해야 한다. 이 첫 단계는 Ansible로 준비했다. 최소 리소스와 Git 연결을 만들고, 루트 Application이 플랫폼별 Application을 연결하도록 했다.

Argo CD 자신도 관리 대상에 넣었다. 최초 설치가 끝나면 Argo CD의 설정 역시 Git을 통해 바꾸는 방식이다.

루트 Application이 Git의 `root/` 선언을 읽고, 여기에서 각 Application을 연결한다. 트리로 보면 관계가 더 잘 보인다.

```text
Ansible 최초 bootstrap
└── Argo CD + 루트 Application 준비
    └── 루트 Application이 Git의 root/ 선언 반영
        ├── Argo CD Application      # 자기관리
        ├── Istio Application
        ├── cert-manager Application
        ├── Doppler Application
        ├── CNPG / PostgreSQL Application
        ├── Redis Application
        ├── Monitoring Application
        └── Demo Application         # 앱 원본 + 환경별 패치
```

각 Application은 연결된 매니페스트와 Helm values를 읽어 맡은 워크로드를 반영한다. 이 트리는 Application의 연결 관계를 보여주며, 리소스 삭제가 전파되는 관계를 뜻하지는 않는다.

동기화와 삭제 정책은 따로 정했다. 자동 prune은 꺼뒀기 때문에 Git에서 파일을 지워도 클러스터의 리소스가 바로 삭제되지는 않는다. 리소스를 없앨 때는 삭제할 대상과 영향을 함께 살펴보도록 했다. [Argo CD 자동 동기화 정책](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/)

이 설정 때문에 앱 배포 후에 눈에 띄는 상태가 하나 있었다. 새 마이그레이션 Job과 워크로드는 정상 반영됐는데, 이전에 완료된 Job이 남아 Application이 `Healthy`이면서 `OutOfSync`로 표시됐다.

`Healthy`는 리소스의 건강 상태이고, `OutOfSync`는 Git과 실제 상태에 차이가 있다는 뜻이다. 이때는 남아 있는 이전 Job이 그 차이였다. 두 값을 함께 보고 나니 무엇이 정상이고 무엇을 정리해야 하는지 구분할 수 있었다.

이전 버전으로 돌아갈 때도 Git에서 검증된 이미지와 설정을 반영한다. DB 마이그레이션까지 진행한 배포라면 데이터와 스키마는 따로 살펴봐야 한다. Git을 되돌리는 것만으로 DB도 이전 상태가 되는 것은 아니기 때문이다.

## 5. 외부 서비스 연결과 통신 보안

앱을 올린 다음에는 외부에서 접속할 경로를 만들었다. 도메인으로 들어온 요청을 어느 서비스에 전달할지, HTTPS는 어디에서 처리할지 정하는 단계다.

외부 연결은 K3s ServiceLB와 Istio gateway로 구성했다. ServiceLB가 노드의 호스트 포트로 LoadBalancer Service를 연결하고, Istio가 서비스별 라우팅을 맡는다. 별도의 OCI Load Balancer를 만드는 구성은 아니다. [K3s ServiceLB 문서](https://docs.k3s.io/networking/networking-services#service-load-balancer)

도메인은 DNS에서 A1의 공인 주소로 연결한다. 요청은 같은 gateway에 들어오지만, TLS를 처리하는 위치는 서비스마다 조금 다르다.

```text
클라이언트의 HTTPS 요청
        │
        ▼
A1 공인 경로 / ServiceLB
        │
        ▼
Istio gateway
        ├── 앱·Grafana: gateway에서 TLS 종료
        │       └── 내부 HTTP → Service → Pod
        │
        └── Argo CD: SNI 라우팅 / TLS passthrough
                └── HTTPS → Argo CD 서버에서 TLS 종료

인증서 공급: cert-manager → TLS Secret → TLS 종료 지점
DNS 인증:   Doppler → DNS API 토큰 Secret → cert-manager
```

이 경로를 연결하면서 OCI 네트워크 규칙과 호스트 방화벽도 함께 확인했다. Service 설정뿐 아니라 실제 요청이 서버의 포트까지 도착할 수 있는지도 봐야 했다.

인증서는 매번 직접 교체하는 대신 cert-manager에 맡기기로 했다. Cloudflare DNS-01을 연결하고, DNS API 토큰은 Doppler로 공급했다. cert-manager는 인증용 TXT 레코드를 관리하며, 서비스 접속용 DNS 레코드는 따로 설정한다. [cert-manager Cloudflare 설정](https://cert-manager.io/docs/configuration/acme/dns01/cloudflare/)

앱과 Grafana의 HTTPS는 gateway에서 처리하고 내부 서비스로 HTTP를 전달한다. Argo CD는 서버의 HTTPS를 유지하도록 TLS passthrough를 사용했다.

앱과 모니터링 namespace에는 자원을 고려해 sidecar를 넣지 않았다. 이 경로의 gateway 이후 구간은 HTTP이고, Redis 연결에는 Redis 자체 mTLS를 사용한다. 외부 HTTPS와 내부 통신의 암호화 범위를 구간별로 나눠서 정리했다.

설정이 반영되면 실제 HTTPS 응답과 인증서, 로그인 동작도 확인한다. 인증서 갱신은 cert-manager로 관리하도록 설정했으며, 갱신 결과는 운영하면서 계속 살펴볼 부분이다.

## 6. 비밀값과 애플리케이션 데이터 관리

배포 설정을 Git에 모으면서 비밀번호와 토큰은 어디에 둘지도 정했다. Git에는 어떤 값을 어디에서 가져올지 남기고, 실제 값은 Doppler에 보관했다.

Doppler Operator가 필요한 값을 Kubernetes Secret으로 가져오면 앱이 환경변수나 파일로 읽는다. 앱에 필요한 키만 전달하고, DB 관리자나 복제용 자격 증명은 따로 구분했다.

값을 바꾼 뒤에는 앱이 새 값을 읽었는지도 챙겨야 한다. 환경변수나 시작할 때 읽는 인증서 파일은 Secret만 바꿔도 기존 프로세스에 반영되지 않을 수 있다. 그래서 Git의 Pod template을 바꾸고 재배포하는 과정까지 연결했다.

PostgreSQL은 CloudNativePG로 배포했다. 앱 계정으로 TLS 접속을 하고 임시 테이블 트랜잭션도 실행해봤다. 비관리자 권한과 허용하지 않은 접속의 거부까지 확인하면서, 앱이 쓸 계정으로 DB를 사용할 수 있는지 살펴봤다.

Redis는 master와 읽기 전용 replica를 두고, 앱별 계정과 키 접두사로 ACL을 나눴다. 연결에는 Redis 자체 mTLS를 적용했다. 두 Pod는 같은 A1에 있고 자동 승격도 구성하지 않았으므로, replica가 있어도 서버 한 대의 장애를 견디는 구조는 아니다.

데이터는 local-path PVC에 저장한다. 시작하기 간단한 방식이지만 실제 데이터는 A1의 디스크에 남는다. PVC를 유지하는 것과 서버 밖에 백업을 두는 일은 따로 준비해야 한다.

PVC에 적은 요청 용량이 실제 디스크 사용량을 그 크기로 제한해주지는 않는다. DB와 운영 도구가 같은 디스크를 쓰는 만큼, 호스트의 여유 공간도 함께 살펴보도록 했다.

## 7. 단일 노드의 자원과 서비스 상태 관찰하기

처음 K3s만 설치했을 때는 메모리 사용이 크지 않았다. 하지만 앱과 DB, 배포 도구를 하나씩 붙이면 모두 같은 서버의 자원을 쓴다. 설치가 끝난 뒤에도 어떤 서비스가 얼마나 쓰는지 들여다볼 수 있어야 했다.

이를 위해 Prometheus, Grafana, Alertmanager를 붙였다. Prometheus가 메트릭을 모으고, Grafana에서 살펴보고, Alertmanager로 알림을 받는 구성이다. 노드와 워크로드뿐 아니라 DB 메트릭도 연결했다.

모니터링 자체도 자원을 사용하므로 메모리 한도와 데이터 보존 범위를 정했다. 오래 모으는 것만 생각하면 메트릭이 디스크를 계속 차지하니, 얼마 동안 얼마나 보관할지도 함께 설정했다.

워크로드에는 requests와 limits를 설정했다. requests는 스케줄링에 쓸 자원 기준, limits는 사용 한도다. 처음 정한 값을 출발점으로 두고 실제 사용량을 보며 조정하려고 했다. [Kubernetes 자원 관리 문서](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

설치한 뒤에는 화면이 뜨는 것에서 한 걸음 더 들어가 다음을 살펴봤다.

- 수집 대상이 실제로 메트릭을 제공하는지
- 대시보드가 필요한 데이터를 보여주는지
- 인증이 필요한 화면에서 익명 접근이 거부되는지
- Alertmanager의 알림이 전달되는지

대시보드와 알림 전달까지 확인했고, Grafana의 조회 권한은 모니터링 namespace로 제한했다.

한 가지 기억할 점은 감시 도구도 같은 A1에 있다는 것이다. 서버 전체가 멈추면 모니터링도 함께 멈춘다. 서버 밖에서 상태를 확인하는 경로는 따로 마련할 필요가 있다.

## 8. 백업·복구와 노드 확장 준비

처음에는 단일 서버에 맞춰 SQLite로 K3s를 설치했다. 이후 control-plane을 늘릴 가능성을 생각하면서 embedded etcd로 전환했다.

기존 설치를 확인하고 K3s를 멈춰 로컬 백업을 만든 뒤, etcd 초기화 설정으로 다시 시작했다. etcd와 API 상태를 확인하고, 노드의 UID가 이전과 같은지도 대조했다. 클러스터를 지우고 새로 만드는 과정 없이 전환을 마쳤다.

K3s는 단일 SQLite 클러스터를 embedded etcd로 바꾸는 경로를 제공한다. 다만 etcd를 쓴다고 서버 한 대가 HA 구성이 되지는 않는다. embedded etcd의 HA에는 최소 세 대의 server와 서로 일치하는 설정이 필요하다. [K3s embedded etcd 문서](https://docs.k3s.io/datastore/ha-embedded)

백업에서는 무엇을 복구할지부터 나눠야 했다. etcd 스냅샷은 Kubernetes 상태를 위한 것이고, PostgreSQL과 Redis 데이터는 별도로 챙겨야 한다. K3s를 복구할 때 쓸 백업 시점의 server token도 함께 보관해야 한다. [K3s 스냅샷과 복원 문서](https://docs.k3s.io/cli/etcd-snapshot)

지금은 자동 etcd 스냅샷과 Wasabi 업로드를 꺼둔 상태다. etcd 전환 때 만든 로컬 백업이 있으며, 정기 백업과 외부 저장은 다음에 연결할 부분이다.

백업을 연결할 때는 파일이 올라가는 것부터 다시 내려받아 복원하는 과정까지 확인하려고 한다. 서버가 없어졌을 때 필요한 데이터와 인증 정보를 어디에서 가져올 수 있는지도 함께 정리할 생각이다.

노드를 늘릴 때도 목적에 따라 구성이 달라진다. agent를 추가하면 앱을 배치할 자원이 늘어나고, server를 추가하면 control-plane의 가용성을 구성할 수 있다. DB 복제와 데이터 저장 방식은 그에 맞춰 따로 준비해야 한다.

## 9. 운영에서 확인한 결과와 남은 과제

기존 A1을 정리하고 K3s를 다시 설치한 뒤, 앱을 배포하고 상태를 살펴보는 흐름까지 연결했다.

Terraform에 기존 인스턴스를 편입한 뒤 변경 없는 plan을 확인했고, K3s 설치 후에는 API와 노드, 시스템 Pod, DNS가 정상 동작하는 것을 확인했다. etcd로 전환한 뒤에도 노드 UID가 유지됐다.

앱 배포에서는 마이그레이션 Job이 완료되고 새 이미지의 API·UI·worker가 Ready 상태가 되는 것을 확인했다. UI 응답과 관리자 로그인, OIDC discovery도 살펴봤다. 모니터링에서는 메트릭과 대시보드, 알림 전달까지 연결했다.

이번에 정리하고 싶었던 건 변경을 어디에 남길지였다. 서버 준비는 Ansible, 배포는 GitOps, 비밀값은 Doppler로 나눠두니 각 작업을 다시 따라가 볼 곳이 생겼다.

상태 표시를 읽는 데도 배운 점이 있었다. 이전 Job이 남아 `Healthy`와 `OutOfSync`가 함께 표시됐던 일이 그 예다. Pod 상태, Git과의 차이, 실제 서비스 응답을 함께 봐야 배포 결과를 이해할 수 있었다.

여전히 서버는 한 대다. 앱과 Redis에 복제본을 두어도 A1이 멈추면 함께 영향을 받는다. 서비스가 늘어나면 자원 사용과 데이터 보관 방식도 다시 살펴봐야 한다.

A1 한 대에서 시작했지만 설치, 이미지 빌드, 배포, 상태 확인을 하나의 흐름으로 이어볼 수 있었다. 앞으로 앱을 추가하거나 설정을 바꿀 때도 이 경로에 변경을 남기며 운영해보려고 한다.
