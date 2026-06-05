# Documentation Technique — GreenOps Platform

> **Digital Twin Datacenter** — Supervision temps réel d'infrastructure réseau  
> Auteur : Frendi Belkacem | Stack : Node.js · React · PostgreSQL · Redis · Docker · Kubernetes · Prometheus · Grafana

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture détaillée](#2-architecture-détaillée)
3. [Partie 1 — Docker](#3-partie-1--docker)
   - [Structure des images](#31-structure-des-images)
   - [Réseaux et volumes](#32-réseaux-et-volumes)
   - [Variables d'environnement](#33-variables-denvironnement)
   - [API — Routes et sécurité](#34-api--routes-et-sécurité)
   - [Redis — Registre dynamique](#35-redis--registre-dynamique)
   - [PostgreSQL — Schéma](#36-postgresql--schéma)
   - [Prometheus — Métriques](#37-prometheus--métriques)
4. [Partie 2 — Kubernetes](#4-partie-2--kubernetes)
   - [Namespaces](#41-namespaces)
   - [Objets déployés](#42-objets-déployés)
   - [HPA — Auto-scaling](#43-hpa--auto-scaling)
   - [Secrets et ConfigMaps](#44-secrets-et-configmaps)
5. [CI/CD — GitHub Actions](#5-cicd--github-actions)
   - [Pipeline complet](#51-pipeline-complet)
   - [Jobs détaillés](#52-jobs-détaillés)
   - [Déclencheurs](#53-déclencheurs)
6. [Guide de démarrage rapide](#6-guide-de-démarrage-rapide)

---

## 1. Vue d'ensemble

GreenOps Platform est un **jumeau numérique de datacenter** qui surveille en temps réel des équipements réseau dynamiques (switches, firewalls, VMs, serveurs, routeurs).

### Fonctionnalités clés

| Fonctionnalité | Description |
|---|---|
| **Devices dynamiques** | Ajout/suppression d'équipements sans redémarrage |
| **Métriques temps réel** | Polling 1.5s sur le Dashboard, scrape Prometheus 5s |
| **PUE global** | Calcul automatique de l'efficacité énergétique |
| **Alertes** | 6 règles Prometheus (CPU, temp, PUE, API, fans, réseau) |
| **Auto-scaling K8s** | HPA déclenché à 60% CPU |
| **CI/CD** | Build + tests + push GHCR + scan sécurité automatique |

### Accès aux interfaces

| Service | URL | Identifiants |
|---|---|---|
| Dashboard Supervision | http://localhost:3001 | admin / admin |
| Tour de Contrôle | http://localhost:3002 | admin / admin |
| Grafana | http://localhost:3003 | admin / greenops_grafana |
| Prometheus | http://localhost:3004 | — |
| Traefik Dashboard | http://localhost:8080 | — |
| API REST | http://localhost:3000 | JWT Bearer |

---

## 2. Architecture détaillée

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          COUCHE PRÉSENTATION                            │
│                                                                         │
│  ┌─────────────────────┐          ┌─────────────────────────────────┐  │
│  │  Dashboard          │          │  Tour de Contrôle               │  │
│  │  Supervision        │          │  React + polling 1.5s           │  │
│  │  React + polling    │          │  Ajout/suppression devices       │  │
│  │  1.5s               │          │  Modification métriques          │  │
│  │  :3001              │          │  :3002                          │  │
│  └─────────┬───────────┘          └─────────────┬───────────────────┘  │
│            │                                     │                      │
│            └──────────────────┬──────────────────┘                     │
│                               │ HTTP / JWT Bearer                      │
│                    ┌──────────▼──────────┐                             │
│                    │   Traefik v3.0       │                             │
│                    │   Reverse Proxy      │ :80 / :8080                │
│                    └──────────┬──────────┘                             │
└───────────────────────────────┼─────────────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────────────┐
│                       COUCHE MÉTIER                                     │
│                               │                                         │
│                    ┌──────────▼──────────┐                             │
│                    │   API Centrale       │                             │
│                    │   Node.js / Express  │ :3000                      │
│                    │   JWT + RBAC         │                             │
│                    │   /health            │                             │
│                    │   /metrics (Prom)    │                             │
│                    │   /api/auth          │                             │
│                    │   /api/metrics       │                             │
│                    │   /api/devices       │                             │
│                    └──────┬──────────┬───┘                             │
│                           │          │                                  │
│          ┌────────────────┘          └──────────────────┐              │
│          │ SQL (historique)               HGet/Set (live)│              │
│  ┌───────▼──────────┐              ┌─────────────────────▼──────────┐  │
│  │   PostgreSQL 16   │              │          Redis 7               │  │
│  │   metrics_history │              │   device:{name} → état live   │  │
│  │   users           │              │   greenops:devices → registre  │  │
│  └───────────────────┘              └───────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Simulateur                                                       │  │
│  │  Lit /api/devices toutes les 5s → génère métriques réalistes     │  │
│  │  Drift naturel : CPU ↕ → température corrélée → fans réactifs    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────────────┐
│                      COUCHE MONITORING                                  │
│                               │ GET /metrics (5s)                       │
│                    ┌──────────▼──────────┐                             │
│                    │    Prometheus        │ :3004                      │
│                    │    Scrape 5s         │                             │
│                    │    Retention 15 jours│                             │
│                    │    6 règles alertes  │                             │
│                    └──────────┬──────────┘                             │
│                               │ PromQL datasource                      │
│                    ┌──────────▼──────────┐                             │
│                    │    Grafana 10.4      │ :3003                      │
│                    │    10 panels         │                             │
│                    │    Refresh 5s        │                             │
│                    └─────────────────────┘                             │
│                                                                         │
│  ┌─────────────────────────────────────────┐                          │
│  │  Node Exporter :9100                    │                          │
│  │  Métriques système hôte (CPU, RAM, disk)│                          │
│  └─────────────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flux de données temps réel

```
Simulateur ──POST /api/metrics/update──► API ──SET──► Redis
                                          │
                                          └──INSERT──► PostgreSQL

Dashboard  ──GET /api/metrics/live──► API ──HGETALL──► Redis ──► réponse JSON

Prometheus ──GET /metrics (5s)──► API ──► prom-client Registry ──► format text
                                                │
                                         Grafana (read) ──► 10 panels
```

---

## 3. Partie 1 — Docker

### 3.1 Structure des images

#### api-centrale — Multi-stage build

```dockerfile
# STAGE 1 : Installation dépendances
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev       # uniquement prod

# STAGE 2 : Image finale (pas d'outils de build)
FROM node:20-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
USER appuser                     # non-root pour la sécurité
EXPOSE 3000
CMD ["node", "src/server.js"]
```

**Résultat** : image ~180 MB au lieu de ~450 MB sans multi-stage (+60% plus légère).

#### dashboard-supervision / tour-de-controle — Build React

```dockerfile
# STAGE 1 : Build React
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build                # génère /app/build

# STAGE 2 : Nginx qui sert les fichiers statiques
FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

Le nginx.conf proxy `/api/*` vers `http://api-centrale:3000` — pas de CORS nécessaire.

#### Healthchecks configurés

```yaml
# Exemple pour l'API
healthcheck:
  test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3000/health',
         r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))\""]
  interval: 15s
  timeout: 5s
  retries: 5
  start_period: 30s
```

Chaque service déclare un healthcheck → Docker Compose démarre dans l'ordre grâce à `condition: service_healthy`.

---

### 3.2 Réseaux et volumes

```
RÉSEAUX
├── greenops-frontend (bridge)
│   ├── traefik
│   ├── api-centrale
│   ├── dashboard-supervision
│   ├── tour-de-controle
│   ├── prometheus
│   └── grafana
│
└── greenops-backend (bridge)
    ├── api-centrale
    ├── database (PostgreSQL)
    ├── cache (Redis)
    ├── simulateur
    ├── prometheus
    └── grafana

VOLUMES PERSISTANTS
├── greenops-postgres-data  → /var/lib/postgresql/data
├── greenops-redis-data     → /data
├── greenops-prometheus-data→ /prometheus
└── greenops-grafana-data   → /var/lib/grafana
```

> **Règle de sécurité** : `database` et `cache` sont uniquement sur `backend-net`.  
> Les frontends React ne peuvent jamais atteindre PostgreSQL ou Redis directement.

---

### 3.3 Variables d'environnement

Fichier `.env` à la racine (ne jamais commiter) :

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

# JWT (256 bits, base64url)
JWT_SECRET=xEKjTMkWpLzBfGlPYcu9QdVn1wOg6qR7a8XvmyIHF5hrZCSJ3e4NisoAbt02DU
JWT_EXPIRES_IN=1h

# Simulateur
SIM_INTERVAL_MS=5000
SIM_USER=admin
SIM_PASS=admin

# Grafana
GRAFANA_USER=admin
GRAFANA_PASSWORD=greenops_grafana
```

---

### 3.4 API — Routes et sécurité

#### Authentification JWT

```
POST /api/auth/login
Body: { username, password }
Response: { token, username, role }

Toutes les routes protégées nécessitent :
Header: Authorization: Bearer <token>
```

Middleware `authenticate` → vérifie le JWT  
Middleware `requireRole('admin')` → vérifie le rôle

#### Endpoints disponibles

```
GET  /health                        → status de l'API
GET  /metrics                       → métriques Prometheus (format text)

POST /api/auth/login                → connexion

GET  /api/metrics/live              → état live de tous les devices [AUTH]
POST /api/metrics/update            → mise à jour métriques d'un device [ADMIN]
GET  /api/metrics/history           → historique PostgreSQL [AUTH]
  ?device=F2I-1&limit=100&offset=0

GET  /api/devices                   → liste des devices enregistrés [AUTH]
POST /api/devices                   → ajouter un device [ADMIN]
  Body: { name, type, metrics: { temperature, cpu_load, ram, network_traffic, fan_speed } }
DELETE /api/devices/:name           → supprimer un device [ADMIN]
```

---

### 3.5 Redis — Registre dynamique

Redis stocke deux types de données :

```
HASH greenops:devices
  └── "F2I-1"       → {"name":"F2I-1","type":"switch","addedAt":"..."}
  └── "F5 Firewall" → {"name":"F5 Firewall","type":"firewall","addedAt":"..."}

STRING device:f2i-1
  └── {"temperature":35.2,"cpu_load":24.1,"ram":40.5,"network_traffic":3.9,"fan_speed":1200}

STRING device:f5_firewall
  └── {"temperature":28.0,"cpu_load":15.3,"ram":22.1,"network_traffic":1.2,"fan_speed":1000}
```

Le simulateur lit le `HASH greenops:devices` à chaque tick → découvre automatiquement les nouveaux devices → initialise leur état.

---

### 3.6 PostgreSQL — Schéma

```sql
-- Table utilisateurs
CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  username   VARCHAR(100) UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,      -- bcrypt hash (rounds=12)
  role       VARCHAR(50) NOT NULL DEFAULT 'operator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table historique métriques
CREATE TABLE metrics_history (
  id              SERIAL PRIMARY KEY,
  device          VARCHAR(100) NOT NULL,
  temperature     NUMERIC(5,2),
  network_traffic NUMERIC(8,3),
  cpu_load        NUMERIC(5,2),
  fan_speed       INTEGER,
  ram             NUMERIC(5,2),          -- colonne ajoutée via migration
  global_pue      NUMERIC(6,4),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Migration automatique au démarrage via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

---

### 3.7 Prometheus — Métriques exposées

| Métrique | Type | Labels | Description |
|---|---|---|---|
| `datacenter_global_pue` | Gauge | — | PUE global du datacenter |
| `greenops_device_temperature` | Gauge | `device` | Température (°C) |
| `greenops_device_cpu_load` | Gauge | `device` | Charge CPU (%) |
| `greenops_device_ram` | Gauge | `device` | RAM utilisée (%) |
| `greenops_device_network_traffic` | Gauge | `device` | Trafic réseau (Gbps) |
| `greenops_device_fan_speed` | Gauge | `device` | Vitesse ventilateurs (RPM) |

**Exemple de requête PromQL :**
```promql
# Température de tous les devices
greenops_device_temperature

# CPU moyen sur 5 minutes
avg_over_time(greenops_device_cpu_load{device="F2I-1"}[5m])

# PUE des 30 dernières minutes
datacenter_global_pue[30m]
```

**Règles d'alertes configurées :**
```yaml
- alert: HighCPU          # CPU > 90% pendant 1m
- alert: HighTemperature  # temp > 35°C pendant 2m
- alert: HighPUE          # PUE > 1.8 pendant 5m
- alert: APIDown          # API inaccessible pendant 30s
- alert: FanStopped       # fan_speed == 0 pendant 1m
- alert: HighNetworkTraffic # trafic > 80 Gbps pendant 2m
```

---

## 4. Partie 2 — Kubernetes

### 4.1 Namespaces

```
CLUSTER Kubernetes (Docker Desktop)
├── namespace: greenops
│   ├── Deployment: api-centrale
│   ├── Deployment: dashboard-supervision
│   ├── Deployment: tour-de-controle
│   ├── Deployment: simulateur
│   ├── Service: api-service
│   ├── Service: dashboard-service
│   ├── Service: admin-service
│   ├── HPA: api-hpa
│   ├── Secret: greenops-secrets
│   ├── ConfigMap: greenops-config
│   └── PersistentVolumeClaim: postgres-pvc, redis-pvc
│
└── namespace: greenops-monitoring
    ├── Deployment: prometheus
    ├── Deployment: grafana
    ├── Service: prometheus-service
    ├── Service: grafana-service
    ├── ServiceAccount: prometheus
    ├── ClusterRole: prometheus
    └── ClusterRoleBinding: prometheus
```

---

### 4.2 Objets déployés

#### Deployment API (extrait)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-centrale
  namespace: greenops
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api-centrale
  template:
    spec:
      containers:
        - name: api-centrale
          image: greenops-api-centrale:latest
          ports:
            - containerPort: 3000
          env:
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: greenops-secrets
                  key: jwt-secret
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
```

#### Service (exposition réseau)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: greenops
spec:
  selector:
    app: api-centrale
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP       # interne au cluster
```

---

### 4.3 HPA — Auto-scaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
  namespace: greenops
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-centrale
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60    # seuil 60%
```

**Fonctionnement :**

```
metrics-server (collecte toutes les 15s)
        │
        ▼
   CPU moyen > 60% ?
   ├── OUI → créer un pod (max 5)
   └── NON → rien (ou supprimer si CPU << 60%)

État actuel : CPU 24% → 1 replica actif
```

**Patch appliqué pour Docker Desktop :**
```bash
kubectl patch deployment metrics-server \
  -n kube-system \
  --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-",
       "value":"--kubelet-insecure-tls"}]'
```

Sans ce patch, le metrics-server ne peut pas lire les métriques Kubelet → HPA bloqué sur `<unknown>`.

---

### 4.4 Secrets et ConfigMaps

#### Secret (données sensibles — base64)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: greenops-secrets
  namespace: greenops
type: Opaque
data:
  jwt-secret: <base64>        # JWT_SECRET
  db-password: <base64>       # DB_PASSWORD
  grafana-password: <base64>  # GRAFANA_PASSWORD
```

> Les Secrets sont chiffrés dans **etcd** (base de données interne K8s).  
> Ils n'apparaissent jamais en clair dans les logs ni les manifests versionnés.

#### ConfigMap (données non sensibles)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: greenops-config
  namespace: greenops
data:
  DB_USER: greenops
  DB_NAME: greenops_db
  DB_HOST: database-service
  REDIS_HOST: cache-service
  JWT_EXPIRES_IN: "1h"
  SIM_INTERVAL_MS: "5000"
```

---

## 5. CI/CD — GitHub Actions

### 5.1 Pipeline complet

```
Push sur main / develop
        │
        ▼
┌───────────────────┐    ┌────────────────────┐
│   test-api        │    │  validate-compose  │
│   - Lint          │    │  - docker compose  │
│   - Tests         │    │    config --quiet  │
└────────┬──────────┘    └────────┬───────────┘
         │                        │
         │    ┌───────────────────┘
         │    │   ┌────────────────────┐
         │    │   │  validate-k8s      │
         │    │   │  - kubectl dry-run │
         │    │   └────────────────────┘
         │    │
         ▼    ▼
┌────────────────────┐
│   build-images     │  (uniquement si push sur main)
│   Matrix :         │
│   - api-centrale   │
│   - dashboard      │
│   - tour-controle  │
│   - simulateur     │
│   → Push sur GHCR  │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│   security-scan    │
│   Trivy            │
│   CRITICAL + HIGH  │
└────────────────────┘
```

### 5.2 Jobs détaillés

#### Job 1 — `test-api` : Tests et lint de l'API

```yaml
test-api:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
        cache-dependency-path: api-centrale/package.json
    - run: npm install
      working-directory: api-centrale
    - run: npm run lint --if-present
    - run: npm test --if-present
```

**Rôle** : Vérifie que le code de l'API est syntaxiquement correct et que les tests passent avant tout build.

---

#### Job 2 — `validate-compose` : Validation Docker Compose

```yaml
validate-compose:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: cp .env.example .env
    - run: docker compose config --quiet
```

**Rôle** : Vérifie que le `docker-compose.yml` est syntaxiquement valide et que toutes les références sont correctes.

---

#### Job 3 — `validate-k8s` : Validation manifests Kubernetes

```yaml
validate-k8s:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/setup-kubectl@v3
      with:
        version: 'v1.29.0'
    - name: Validate all manifests (dry-run)
      run: |
        for f in k8s/**/*.yml; do
          kubectl apply --dry-run=client -f "$f"
        done
```

**Rôle** : Simule l'application de tous les manifests Kubernetes sans rien déployer. Détecte les erreurs de schéma YAML.

---

#### Job 4 — `build-images` : Build et push Docker (main seulement)

```yaml
build-images:
  needs: test-api                              # attend la réussite des tests
  if: github.ref == 'refs/heads/main'          # seulement sur main
  strategy:
    matrix:
      service:
        - { name: api-centrale,          context: ./api-centrale }
        - { name: dashboard-supervision, context: ./dashboard-supervision }
        - { name: tour-de-controle,      context: ./tour-de-controle }
        - { name: simulateur,            context: ./simulateur }
  steps:
    - uses: docker/login-action@v3             # connexion GHCR
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    - uses: docker/setup-buildx-action@v3     # BuildKit (layers cache)
    - uses: docker/metadata-action@v5          # génère les tags
      with:
        tags: |
          type=sha,prefix=sha-                 # tag par commit SHA
          type=raw,value=latest                # tag latest sur main
    - uses: docker/build-push-action@v5
      with:
        push: true
        cache-from: type=gha                   # cache GitHub Actions
        cache-to: type=gha,mode=max
```

**Résultat** : 4 images publiées sur GitHub Container Registry (`ghcr.io`) :
```
ghcr.io/frebelkacem-cell/greenops-api-centrale:latest
ghcr.io/frebelkacem-cell/greenops-dashboard-supervision:latest
ghcr.io/frebelkacem-cell/greenops-tour-de-controle:latest
ghcr.io/frebelkacem-cell/greenops-simulateur:latest
```

---

#### Job 5 — `security-scan` : Scan de vulnérabilités Trivy

```yaml
security-scan:
  needs: build-images
  steps:
    - uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'          # scan filesystem complet
        scan-ref: '.'
        format: 'table'
        exit-code: '0'           # ne bloque pas le pipeline (informatif)
        severity: 'CRITICAL,HIGH'
```

**Rôle** : Scanne le code source et les dépendances à la recherche de CVE (vulnerabilités) de niveau CRITICAL ou HIGH. Le résultat est affiché dans les logs GitHub Actions.

---

### 5.3 Déclencheurs

```yaml
on:
  push:
    branches: [main, develop]   # tout push sur main ou develop
  pull_request:
    branches: [main]            # toute PR vers main
```

| Événement | Jobs déclenchés |
|---|---|
| Push sur `develop` | test-api + validate-compose + validate-k8s |
| Push sur `main` | Tous les jobs (+ build + security scan) |
| Pull Request vers `main` | test-api + validate-compose + validate-k8s |

**Badges de statut** (à ajouter dans le README) :
```markdown
![CI/CD](https://github.com/frebelkacem-cell/greenops-platform/actions/workflows/ci-cd.yml/badge.svg)
```

---

## 6. Guide de démarrage rapide

### Docker Compose

```bash
# Cloner
git clone https://github.com/frebelkacem-cell/greenops-platform.git
cd greenops-platform

# Configuration
cp .env.example .env

# Démarrer
docker compose up -d

# Vérifier
docker compose ps
docker compose logs api-centrale --tail 20

# Arrêter
docker compose down
```

### Kubernetes

```bash
# Prérequis : Docker Desktop avec Kubernetes activé

# Déployer
kubectl apply -f k8s/namespaces/
kubectl apply -f k8s/secrets/
kubectl apply -f k8s/configmaps/
kubectl apply -f k8s/volumes/
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/services/
kubectl apply -f k8s/hpa/
kubectl apply -f k8s/monitoring/

# Vérifier
kubectl get pods -n greenops
kubectl get pods -n greenops-monitoring
kubectl get hpa -n greenops

# HPA status
kubectl describe hpa api-hpa -n greenops
```

### Commandes Makefile

```bash
make up          # docker compose up -d
make down        # docker compose down
make rebuild     # rebuild et redémarre
make ps          # état des containers
make logs        # logs en temps réel
make k8s-apply   # applique tous les manifests K8s
make k8s-status  # état des pods K8s
make k8s-hpa     # état du HPA
make test-all    # test health + login + métriques
make grafana     # ouvre Grafana dans le navigateur
```

---

*Documentation générée pour GreenOps Platform v2.0.0 — Frendi Belkacem*
