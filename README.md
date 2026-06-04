# GreenOps Platform

> **Digital Twin de Datacenter** — Supervision temps réel, monitoring et orchestration de conteneurs
> Projet IEF2I — Module Docker & Kubernetes — Virtualisation des Applications
> Auteur : **Frendi Belkacem**

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture globale](#2-architecture-globale)
3. [Prérequis](#3-prérequis)
4. [Phase 1 — Docker](#4-phase-1--docker)
   - [Services et ports](#41-services-et-ports)
   - [Lancer le projet](#42-lancer-le-projet)
   - [Réseaux et volumes](#43-réseaux-et-volumes)
   - [Variables d'environnement](#44-variables-denvironnement)
   - [Reverse proxy Traefik](#45-reverse-proxy-traefik)
   - [Monitoring Prometheus + Grafana](#46-monitoring-prometheus--grafana)
   - [Authentification JWT](#47-authentification-jwt)
   - [Simulateur de métriques](#48-simulateur-de-métriques)
   - [Pipeline CI/CD GitHub Actions](#49-pipeline-cicd-github-actions)
5. [Phase 2 — Kubernetes](#5-phase-2--kubernetes)
   - [Namespaces](#51-namespaces)
   - [Secrets et ConfigMaps](#52-secrets-et-configmaps)
   - [Déploiements](#53-déploiements)
   - [Services et Ingress](#54-services-et-ingress)
   - [Volumes persistants](#55-volumes-persistants)
   - [HorizontalPodAutoscaler](#56-horizontalpodautoscaler)
   - [RBAC Prometheus](#57-rbac-prometheus)
   - [Déployer sur Kubernetes](#58-déployer-sur-kubernetes)
6. [Makefile — Commandes rapides](#6-makefile--commandes-rapides)
7. [Tests](#7-tests)
8. [Identifiants des services](#8-identifiants-des-services)
9. [Métriques Prometheus exposées](#9-métriques-prometheus-exposées)
10. [Arborescence du projet](#10-arborescence-du-projet)

---

## 1. Vue d'ensemble

GreenOps Platform est un **jumeau numérique de datacenter** composé de :

| Interface | Description | URL |
|-----------|-------------|-----|
| **Dashboard Supervision** | Vue opérateur temps réel — PUE, températures, CPU, alertes | http://localhost:3001 |
| **Tour de Contrôle Admin** | Interface d'administration — contrôle manuel des équipements | http://localhost:3002 |
| **Grafana** | Tableaux de bord métriques historiques | http://localhost:3003 |
| **Prometheus** | Collecte et alertes métriques | http://localhost:3004 |
| **Traefik Dashboard** | Reverse proxy et routage | http://localhost:8080 |
| **API Centrale** | Backend REST + métriques Prometheus | http://localhost:3000 |

Le système simule 3 équipements réseau (`F5 Firewall`, `Switch Cisco`, `VM Linux`) dont les métriques évoluent en temps réel et sont visibles simultanément sur tous les tableaux de bord.

---

## 2. Architecture globale

```
┌─────────────────────────────────────────────────────────────────┐
│                        DOCKER COMPOSE                           │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  Dashboard   │    │ Tour de      │    │    Traefik       │  │
│  │ Supervision  │    │  Contrôle    │    │  Reverse Proxy   │  │
│  │  :3001       │    │   :3002      │    │  :80 / :8080     │  │
│  └──────┬───────┘    └──────┬───────┘    └────────┬─────────┘  │
│         │                   │                     │             │
│         └───────────────────┴─────────────────────┘             │
│                             │  frontend-net                     │
│                    ┌────────▼─────────┐                         │
│                    │   API Centrale   │  /health  /metrics      │
│                    │   Node.js :3000  │  /api/auth/login        │
│                    │   JWT + RBAC     │  /api/metrics/live      │
│                    └──┬──────────┬───┘                          │
│                       │          │  backend-net                 │
│            ┌──────────▼──┐  ┌────▼──────────┐                  │
│            │  PostgreSQL  │  │    Redis       │                  │
│            │   :5432      │  │    :6379       │                  │
│            └─────────────┘  └───────────────┘                   │
│                                                                 │
│  ┌─────────────────────────────────────────────┐               │
│  │            STACK MONITORING                  │               │
│  │  Prometheus :3004  <──── /metrics (5s)      │               │
│  │  Grafana    :3003  <──── datasource          │               │
│  │  Node Exporter :9100 (métriques hôte)        │               │
│  └─────────────────────────────────────────────┘               │
│                                                                 │
│  Simulateur ─────────────────────────────────────────────────> │
│  (push métriques toutes les 5s via /api/metrics/update)        │
└─────────────────────────────────────────────────────────────────┘
```

**Flux de données temps réel :**

```
Simulateur (5s) --> API --> Redis --> Dashboard (1.5s) --> Grafana (5s via Prometheus)
```

---

## 3. Prérequis

| Outil | Version minimale | Vérification |
|-------|-----------------|--------------|
| Docker Desktop | 4.x | `docker --version` |
| Docker Compose | 2.x (intégré) | `docker compose version` |
| kubectl | 1.28+ | `kubectl version --client` |
| Docker Desktop Kubernetes | activé dans les settings | `kubectl get nodes` |
| GNU Make (optionnel) | 4.x | `make --version` |

> **Windows** : Installer Make via `choco install make` ou `winget install GnuWin32.Make`

---

## 4. Phase 1 — Docker

### 4.1 Services et ports

| Conteneur | Image | Port hôte | Rôle |
|-----------|-------|-----------|------|
| `greenops-traefik` | traefik:v3.0 | 80, 8080, 8082 | Reverse proxy, dashboard |
| `greenops-api` | greenops-api-centrale | 3000 | API REST, JWT, métriques |
| `greenops-dashboard` | greenops-dashboard-supervision | 3001 | Frontend React opérateur |
| `greenops-admin` | greenops-tour-de-controle | 3002 | Frontend React admin |
| `greenops-db` | postgres:16-alpine | — (interne) | Base de données |
| `greenops-redis` | redis:7-alpine | — (interne) | Cache métriques live |
| `greenops-prometheus` | prom/prometheus:v2.51.0 | 3004 | Collecte métriques |
| `greenops-grafana` | grafana/grafana:10.4.0 | 3003 | Visualisation |
| `greenops-node-exporter` | prom/node-exporter:v1.7.0 | 9100 | Métriques système hôte |
| `greenops-sim` | greenops-simulateur | — | Génère des métriques |

### 4.2 Lancer le projet

```bash
# 1. Cloner le dépôt
git clone https://github.com/frebelkacem-cell/greenops-platform.git
cd greenops-platform

# 2. Copier les variables d'environnement
cp .env.example .env
# Éditer .env si nécessaire (JWT_SECRET, mots de passe)

# 3. Démarrer tous les services
docker compose up -d

# 4. Vérifier que tout est en ligne
docker compose ps
```

**Résultat attendu :** tous les conteneurs en `Up (healthy)`.

```bash
# Arrêter
docker compose down

# Tout supprimer (volumes inclus)
docker compose down -v
```

### 4.3 Réseaux et volumes

**Réseaux Docker segmentés :**

```
frontend-net (greenops-frontend)
  └── traefik, api-centrale, dashboard-supervision, tour-de-controle, prometheus, grafana

backend-net (greenops-backend)
  └── api-centrale, database, cache, simulateur, prometheus, grafana, node-exporter
```

> L'API est sur les **deux réseaux** : elle expose son interface vers le frontend et accède aux données côté backend. Les frontends ne peuvent pas accéder directement à PostgreSQL ni à Redis.

**Volumes nommés :**

| Volume | Contenu | Taille estimée |
|--------|---------|----------------|
| `greenops-postgres-data` | Données PostgreSQL | ~50 MB |
| `greenops-redis-data` | Données Redis persistées | ~5 MB |
| `greenops-prometheus-data` | Séries temporelles Prometheus (15 jours) | ~500 MB |
| `greenops-grafana-data` | Dashboards et configuration Grafana | ~20 MB |

### 4.4 Variables d'environnement

Toutes les variables sensibles sont dans `.env` (exclu du dépôt par `.gitignore`) :

```env
# PostgreSQL
DB_USER=greenops
DB_PASSWORD=greenops_s3cr3t
DB_NAME=greenops_db
DB_HOST=database
DB_PORT=5432

# Redis
REDIS_HOST=cache
REDIS_PORT=6379

# JWT
JWT_SECRET=<générer avec openssl rand -hex 32>
JWT_EXPIRES_IN=1h

# Simulateur
SIM_INTERVAL_MS=5000
SIM_USER=admin
SIM_PASS=admin

# Grafana
GRAFANA_USER=admin
GRAFANA_PASSWORD=greenops_grafana
```

> **Sécurité :** Générer un JWT_SECRET unique : `openssl rand -hex 32`

### 4.5 Reverse proxy Traefik

Traefik v3 est configuré dans `proxy/traefik.yml` et exposé via Docker Compose.

**Endpoints :**
- `:80` — Point d'entrée HTTP principal
- `:8080` — Dashboard Traefik (http://localhost:8080)
- `:8082` — Métriques Prometheus de Traefik

**Fonctionnement :**
- Traefik écoute le socket Docker pour détecter automatiquement les conteneurs
- Prometheus scrape les métriques Traefik sur `:8082/metrics`

### 4.6 Monitoring Prometheus + Grafana

**Prometheus** scrape 4 cibles :

1. `prometheus` lui-même (localhost:9090)
2. `api-centrale:3000/metrics` — toutes les **5 secondes**
3. `node-exporter:9100` — métriques système hôte
4. `reverse-proxy:8082` — métriques Traefik

**Règles d'alertes** (`monitoring/prometheus/alerts.yml`) :

| Alerte | Condition | Sévérité |
|--------|-----------|----------|
| `HighCPULoad` | CPU > 90% pendant 2 min | critical |
| `HighTemperature` | Temp > 80°C pendant 1 min | critical |
| `HighPUE` | PUE > 2.0 pendant 5 min | warning |
| `APIDown` | API non scrapée pendant 1 min | critical |
| `HighNetworkTraffic` | Trafic > 900 Gbps pendant 2 min | warning |
| `HighFanSpeed` | Ventilateurs > 4500 RPM pendant 1 min | warning |

**Grafana** (http://localhost:3003) — Login : `admin` / `greenops_grafana`

Le dashboard **GreenOps — Datacenter Overview** est provisionné automatiquement avec 9 panneaux :

- Jauge PUE global
- Températures par équipement (bargauge + timeseries)
- Charge CPU par équipement
- Trafic réseau
- Vitesse des ventilateurs
- Historique PUE
- Mémoire Node.js heap
- Requêtes HTTP Traefik
- CPU hôte

Rafraîchissement automatique : **5 secondes**.

### 4.7 Authentification JWT

**Connexion :**

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Réponse : {"token":"eyJ..."}
```

**Utiliser le token :**

```bash
curl http://localhost:3000/api/metrics/live \
  -H "Authorization: Bearer <token>"
```

**Endpoints protégés :**

| Endpoint | Méthode | Rôle requis | Description |
|----------|---------|-------------|-------------|
| `/api/auth/login` | POST | public | Connexion, retourne le JWT |
| `/api/metrics/live` | GET | user / admin | État temps réel de tous les devices |
| `/api/metrics/update` | POST | **admin** | Modifier les métriques d'un device |
| `/api/metrics/history` | GET | user / admin | Historique PostgreSQL (pagination) |
| `/health` | GET | public | Healthcheck du service |
| `/metrics` | GET | public | Métriques Prometheus |

### 4.8 Simulateur de métriques

Le simulateur génère des données réalistes pour 3 équipements :

- **F5 Firewall** — Pare-feu réseau
- **Switch Cisco** — Switch réseau cœur
- **VM Linux** — Machine virtuelle

**Comportement :**
- S'authentifie automatiquement via JWT
- Toutes les 5 secondes, fait évoluer chaque métrique par dérive aléatoire
- Corrèle la température avec la charge CPU
- Réessaie automatiquement si le token expire

**Surveillance :**

```bash
docker compose logs simulateur -f
# [Sim] F5 Firewall  --> CPU: 77.4% | Temp: 41.3°C | PUE: 1.36
# [Sim] Switch Cisco --> CPU: 92.7% | Temp: 45.4°C | PUE: 1.36
# [Sim] VM Linux     --> CPU: 81.3% | Temp: 42.2°C | PUE: 1.35
```

### 4.9 Pipeline CI/CD GitHub Actions

Le pipeline (`.github/workflows/ci-cd.yml`) se déclenche sur push vers `main` ou `develop` :

```
push --> test-api ──┐
                    ├──> build-images (si main) ──> security-scan (Trivy)
push --> validate-compose
push --> validate-k8s
```

| Job | Action |
|-----|--------|
| `test-api` | npm install + lint + tests |
| `build-images` | Build + push vers GitHub Container Registry |
| `validate-compose` | `docker compose config --quiet` |
| `validate-k8s` | `kubectl apply --dry-run=client` |
| `security-scan` | Trivy — vulnérabilités CRITICAL/HIGH |

---

## 5. Phase 2 — Kubernetes

### 5.1 Namespaces

```
greenops               -- Services applicatifs
greenops-monitoring    -- Stack monitoring
```

```bash
kubectl apply -f k8s/namespaces/namespaces.yml
```

### 5.2 Secrets et ConfigMaps

**Secrets** (`k8s/secrets/secrets.yml`) :

| Secret | Namespace | Contenu |
|--------|-----------|---------|
| `greenops-db-secret` | greenops | DB_USER, DB_PASSWORD, DB_NAME |
| `greenops-jwt-secret` | greenops | JWT_SECRET |
| `greenops-grafana-secret` | greenops-monitoring | Admin Grafana |

> Générer les valeurs base64 : `echo -n "valeur" | base64`

**ConfigMaps** (`k8s/configmaps/configmaps.yml`) :

| ConfigMap | Namespace | Contenu |
|-----------|-----------|---------|
| `greenops-api-config` | greenops | DB_HOST, REDIS_HOST, NODE_ENV… |
| `greenops-sim-config` | greenops | API_URL, SIM_INTERVAL_MS… |
| `prometheus-config` | greenops-monitoring | prometheus.yml complet |

### 5.3 Déploiements

| Deployment | Replicas | Stratégie | Probes |
|------------|----------|-----------|--------|
| `database` | 1 | Recreate | exec pg_isready |
| `cache` | 1 | Recreate | exec redis-cli ping |
| `api-centrale` | 2 | RollingUpdate | httpGet /health |
| `dashboard-supervision` | 2 | RollingUpdate | httpGet /healthz |
| `tour-de-controle` | 2 | RollingUpdate | httpGet /healthz |
| `simulateur` | 1 | RollingUpdate | — |
| `prometheus` | 1 | Recreate | httpGet /-/healthy |
| `grafana` | 1 | Recreate | httpGet /api/health |

**Limites de ressources — API Centrale :**

```yaml
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### 5.4 Services et Ingress

**Services ClusterIP :**

| Service | Port | Namespace |
|---------|------|-----------|
| `database` (headless) | 5432 | greenops |
| `cache` (headless) | 6379 | greenops |
| `api-centrale` | 3000 | greenops |
| `dashboard-supervision` | 80 | greenops |
| `tour-de-controle` | 80 | greenops |
| `prometheus` | 9090 | greenops-monitoring |
| `grafana` | 3000 | greenops-monitoring |

**Ingress** (nécessite `ingress-nginx`) :

| Host | Service |
|------|---------|
| `dashboard.greenops.local` | dashboard-supervision |
| `admin.greenops.local` | tour-de-controle |
| `api.greenops.local` | api-centrale |
| `grafana.greenops.local` | grafana |
| `prometheus.greenops.local` | prometheus |

Ajouter dans `C:\Windows\System32\drivers\etc\hosts` :

```
127.0.0.1  dashboard.greenops.local
127.0.0.1  admin.greenops.local
127.0.0.1  api.greenops.local
127.0.0.1  grafana.greenops.local
127.0.0.1  prometheus.greenops.local
```

### 5.5 Volumes persistants

| PVC | Taille | Namespace |
|-----|--------|-----------|
| `postgres-pvc` | 5 Gi | greenops |
| `redis-pvc` | 1 Gi | greenops |
| `prometheus-pvc` | 10 Gi | greenops-monitoring |
| `grafana-pvc` | 2 Gi | greenops-monitoring |

### 5.6 HorizontalPodAutoscaler

**Activer metrics-server (Docker Desktop) :**

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

kubectl patch deployment metrics-server -n kube-system --type=strategic -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"metrics-server","args":["--cert-dir=/tmp","--secure-port=10250","--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname","--kubelet-use-node-status-port","--metric-resolution=15s","--kubelet-insecure-tls"]}]}}}}'
```

**HPAs configurés :**

| HPA | Min | Max | CPU cible | Mémoire |
|-----|-----|-----|-----------|---------|
| `api-centrale-hpa` | 2 | 6 | 60% | 75% |
| `dashboard-hpa` | 2 | 4 | 70% | — |
| `admin-hpa` | 2 | 4 | 70% | — |

```bash
# Vérifier
kubectl get hpa -n greenops
# api-centrale-hpa  cpu: 24%/60%, memory: 22%/75%  2  6  2

# Démonstration scaling
kubectl scale deployment api-centrale --replicas=4 -n greenops
kubectl get pods -n greenops -w
kubectl scale deployment api-centrale --replicas=2 -n greenops
```

### 5.7 RBAC Prometheus

```
ServiceAccount: prometheus-sa
     │
     └──> ClusterRoleBinding: prometheus-role-binding
               │
               └──> ClusterRole: prometheus-role
                         - nodes, services, endpoints, pods --> get, list, watch
                         - /metrics --> get
```

Prometheus découvre automatiquement les pods annotés :

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port:   "3000"
  prometheus.io/path:   "/metrics"
```

### 5.8 Déployer sur Kubernetes

```bash
# Méthode 1 — Makefile
make k8s-apply

# Méthode 2 — Manuelle dans l'ordre
kubectl apply -f k8s/namespaces/
kubectl apply -f k8s/secrets/
kubectl apply -f k8s/configmaps/
kubectl apply -f k8s/volumes/
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/services/
kubectl apply -f k8s/ingress/
kubectl apply -f k8s/hpa/
kubectl apply -f k8s/monitoring/

# Vérifier l'état
kubectl get pods -n greenops
kubectl get pods -n greenops-monitoring
kubectl get hpa -n greenops

# Port-forward sans Ingress
kubectl port-forward svc/api-centrale 3000:3000 -n greenops
kubectl port-forward svc/grafana 3003:3000 -n greenops-monitoring
kubectl port-forward svc/prometheus 3004:9090 -n greenops-monitoring
```

---

## 6. Makefile — Commandes rapides

```bash
make help           # Affiche toutes les commandes

# Docker
make up             # Démarre tous les services
make down           # Arrête tout
make rebuild        # Arrête + rebuild + redémarre
make ps             # État des conteneurs
make logs           # Logs temps réel
make logs-api       # Logs API uniquement

# Kubernetes
make k8s-apply      # Applique tous les manifests
make k8s-status     # Pods + services + ingress + HPA
make k8s-hpa        # État HPA avec métriques
make scale-up       # API --> 4 réplicas (démo)
make scale-down     # Remet à 2 réplicas

# Tests
make test-all       # Tous les tests
make test-health    # GET /health
make test-login     # JWT login
make test-metrics   # Route protégée
make test-unauth    # Vérifie 401 sans token
make test-prometheus # Cibles + règles d'alertes

# Utilitaires
make open           # Ouvre tous les services dans le navigateur
make grafana        # Ouvre Grafana directement
make prometheus-rules # Recharge les alertes
```

---

## 7. Tests

```bash
# Health
curl http://localhost:3000/health

# Login JWT
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'

# Métriques live
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | python3 -c \
  "import sys,json; print(json.load(sys.stdin)['token'])")

curl http://localhost:3000/api/metrics/live -H "Authorization: Bearer $TOKEN"

# Vérifier 401 (sans token)
curl -o /dev/null -w "%{http_code}" http://localhost:3000/api/metrics/live
# Résultat attendu : 401

# Nouvelles métriques Prometheus par device
curl http://localhost:3000/metrics | grep greenops_device
```

---

## 8. Identifiants des services

| Service | URL | Login | Mot de passe |
|---------|-----|-------|--------------|
| Dashboard Supervision | http://localhost:3001 | admin | admin |
| Tour de Contrôle | http://localhost:3002 | admin | admin |
| **Grafana** | http://localhost:3003 | **admin** | **greenops_grafana** |
| Prometheus | http://localhost:3004 | — | — |
| Traefik Dashboard | http://localhost:8080 | — | — |

---

## 9. Métriques Prometheus exposées

**Métriques custom GreenOps** (`GET http://localhost:3000/metrics`) :

| Métrique | Type | Labels | Description |
|----------|------|--------|-------------|
| `datacenter_global_pue` | Gauge | — | PUE global du datacenter |
| `greenops_device_temperature` | Gauge | `device` | Température en °C |
| `greenops_device_cpu_load` | Gauge | `device` | Charge CPU en % |
| `greenops_device_network_traffic` | Gauge | `device` | Trafic réseau en Gbps |
| `greenops_device_fan_speed` | Gauge | `device` | Vitesse ventilateurs en RPM |

**Exemples de requêtes PromQL :**

```promql
# PUE actuel
datacenter_global_pue

# Température moyenne
avg(greenops_device_temperature)

# Devices avec CPU critique (> 80%)
greenops_device_cpu_load > 80

# Ventilateurs à l'arrêt
greenops_device_fan_speed == 0
```

---

## 10. Arborescence du projet

```
greenops-platform/
├── .env.example                        # Template des variables
├── .gitignore
├── docker-compose.yml                  # Orchestration Docker (10 services)
├── Makefile                            # Commandes raccourcies
├── README.md
│
├── .github/workflows/ci-cd.yml         # Pipeline CI/CD
│
├── api-centrale/                       # Backend Node.js
│   ├── Dockerfile                      # Multi-stage, non-root
│   ├── .dockerignore
│   └── src/
│       ├── server.js                   # Express + /health + /metrics
│       ├── auth.middleware.js          # JWT + RBAC
│       ├── routes.auth.js             # POST /api/auth/login
│       ├── routes.metrics.js          # live / update / history
│       ├── prometheus.js              # 5 Gauges (PUE + 4 devices)
│       ├── db.js                      # PostgreSQL
│       ├── redis.js                   # Redis
│       └── pue.js                     # Calcul PUE
│
├── dashboard-supervision/              # React — Opérateur
│   ├── Dockerfile                      # Multi-stage
│   ├── nginx.conf                      # Proxy /api/ + /healthz
│   └── src/
│       ├── App.jsx                     # PUE + graphs + alertes (1.5s)
│       └── api/client.js
│
├── tour-de-controle/                   # React — Admin
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/App.jsx                     # F5Card + CiscoCard + VMCard (1.5s sync)
│
├── simulateur/
│   └── src/index.js                    # Drift algorithm (5s)
│
├── proxy/traefik.yml                   # Traefik v3
│
├── monitoring/
│   ├── prometheus/
│   │   ├── prometheus.yml              # Scrape 5s pour api-centrale
│   │   └── alerts.yml                  # 6 règles d'alertes
│   └── grafana/provisioning/
│       ├── datasources/prometheus.yml
│       └── dashboards/
│           ├── dashboards.yml
│           └── greenops-overview.json  # 9 panneaux, refresh 5s
│
└── k8s/
    ├── namespaces/namespaces.yml
    ├── secrets/secrets.yml             # gitignore
    ├── configmaps/configmaps.yml
    ├── volumes/pvc.yml                 # 4 PVCs
    ├── deployments/deployments.yml     # 8 deployments + probes
    ├── services/services.yml           # 7 services ClusterIP
    ├── ingress/ingress.yml             # 5 routes
    ├── hpa/hpa.yml                     # 3 HPAs
    └── monitoring/monitoring.yml       # Prometheus + Grafana + RBAC
```

---

*Projet académique IEF2I 2025/2026 — Auteur : **Frendi Belkacem***
