.PHONY: help \
        up down build rebuild logs ps restart clean \
        k8s-apply k8s-delete k8s-status k8s-pods k8s-hpa k8s-logs k8s-restart \
        test-health test-login test-metrics test-alerts test-traefik test-all \
        scale-up scale-down \
        prometheus-rules grafana open

# ─── Couleurs ────────────────────────────────────────────────────────────────
GREEN  := \033[0;32m
YELLOW := \033[1;33m
CYAN   := \033[0;36m
RESET  := \033[0m

# ─── Variables ───────────────────────────────────────────────────────────────
COMPOSE     = docker compose
KUBECTL     = kubectl
NAMESPACE   = greenops
NAMESPACE_M = greenops-monitoring
API_URL     = http://localhost:3000

# ─────────────────────────────────────────────────────────────────────────────
# AIDE
# ─────────────────────────────────────────────────────────────────────────────
help: ## Affiche cette aide
	@echo ""
	@echo "  $(CYAN)GreenOps Platform — Makefile$(RESET)"
	@echo ""
	@echo "  $(YELLOW)── DOCKER ─────────────────────────────────────────────$(RESET)"
	@grep -E '^(up|down|build|rebuild|logs|ps|restart|clean):.*##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "  $(YELLOW)── KUBERNETES ─────────────────────────────────────────$(RESET)"
	@grep -E '^k8s-[a-z-]+:.*##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "  $(YELLOW)── TESTS ───────────────────────────────────────────────$(RESET)"
	@grep -E '^test-[a-z-]+:.*##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "  $(YELLOW)── SCALING ─────────────────────────────────────────────$(RESET)"
	@grep -E '^scale-[a-z-]+:.*##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""
	@echo "  $(YELLOW)── DIVERS ──────────────────────────────────────────────$(RESET)"
	@grep -E '^(prometheus-rules|grafana|open):.*##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "}; {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}'
	@echo ""

# ─────────────────────────────────────────────────────────────────────────────
# DOCKER
# ─────────────────────────────────────────────────────────────────────────────
up: ## Démarre tous les services (détaché)
	@echo "$(CYAN)Démarrage de GreenOps...$(RESET)"
	$(COMPOSE) up -d
	@echo "$(GREEN)Tous les services sont démarrés.$(RESET)"

down: ## Arrête tous les services
	@echo "$(YELLOW)Arrêt de GreenOps...$(RESET)"
	$(COMPOSE) down

build: ## Construit les images sans cache
	@echo "$(CYAN)Build des images...$(RESET)"
	$(COMPOSE) build --no-cache

rebuild: down build up ## Arrête, rebuild et redémarre tout

logs: ## Affiche les logs en temps réel (Ctrl+C pour quitter)
	$(COMPOSE) logs -f --tail=50

logs-api: ## Logs de l'API Centrale uniquement
	$(COMPOSE) logs -f api-centrale --tail=100

logs-prometheus: ## Logs de Prometheus uniquement
	$(COMPOSE) logs -f prometheus --tail=100

ps: ## État de tous les conteneurs
	$(COMPOSE) ps

restart: ## Redémarre tous les services
	$(COMPOSE) restart

clean: ## Arrête et supprime les conteneurs, réseaux et volumes
	@echo "$(YELLOW)Suppression complète (volumes inclus)...$(RESET)"
	$(COMPOSE) down -v --remove-orphans
	@echo "$(GREEN)Nettoyage terminé.$(RESET)"

# ─────────────────────────────────────────────────────────────────────────────
# KUBERNETES
# ─────────────────────────────────────────────────────────────────────────────
k8s-apply: ## Applique tous les manifests Kubernetes
	@echo "$(CYAN)Application des manifests Kubernetes...$(RESET)"
	$(KUBECTL) apply -f k8s/namespaces/
	$(KUBECTL) apply -f k8s/secrets/
	$(KUBECTL) apply -f k8s/configmaps/
	$(KUBECTL) apply -f k8s/volumes/
	$(KUBECTL) apply -f k8s/deployments/
	$(KUBECTL) apply -f k8s/services/
	$(KUBECTL) apply -f k8s/ingress/
	$(KUBECTL) apply -f k8s/hpa/
	$(KUBECTL) apply -f k8s/monitoring/
	@echo "$(GREEN)Manifests appliqués.$(RESET)"

k8s-delete: ## Supprime toutes les ressources Kubernetes GreenOps
	@echo "$(YELLOW)Suppression des ressources Kubernetes...$(RESET)"
	$(KUBECTL) delete namespace $(NAMESPACE) --ignore-not-found
	$(KUBECTL) delete namespace $(NAMESPACE_M) --ignore-not-found

k8s-status: ## État complet du cluster (pods, services, ingress, hpa)
	@echo "$(CYAN)── Pods greenops ──$(RESET)"
	$(KUBECTL) get pods -n $(NAMESPACE) -o wide
	@echo ""
	@echo "$(CYAN)── Pods greenops-monitoring ──$(RESET)"
	$(KUBECTL) get pods -n $(NAMESPACE_M) -o wide
	@echo ""
	@echo "$(CYAN)── Services ──$(RESET)"
	$(KUBECTL) get svc -n $(NAMESPACE)
	@echo ""
	@echo "$(CYAN)── Ingress ──$(RESET)"
	$(KUBECTL) get ingress -n $(NAMESPACE)
	@echo ""
	@echo "$(CYAN)── HPA ──$(RESET)"
	$(KUBECTL) get hpa -n $(NAMESPACE)

k8s-pods: ## Liste les pods des deux namespaces
	$(KUBECTL) get pods -n $(NAMESPACE)
	@echo ""
	$(KUBECTL) get pods -n $(NAMESPACE_M)

k8s-hpa: ## État des HorizontalPodAutoscalers
	$(KUBECTL) get hpa -n $(NAMESPACE)

k8s-logs: ## Logs de l'API Centrale dans Kubernetes
	$(KUBECTL) logs -n $(NAMESPACE) -l app=api-centrale --tail=50 -f

k8s-restart: ## Redémarre tous les déploiements GreenOps
	@echo "$(CYAN)Redémarrage des déploiements...$(RESET)"
	$(KUBECTL) rollout restart deployment -n $(NAMESPACE)
	$(KUBECTL) rollout restart deployment -n $(NAMESPACE_M)

# ─────────────────────────────────────────────────────────────────────────────
# TESTS
# ─────────────────────────────────────────────────────────────────────────────
test-health: ## Teste le endpoint /health de l'API
	@echo "$(CYAN)Test healthcheck API...$(RESET)"
	@curl -sf $(API_URL)/health | python3 -m json.tool || \
		(echo "$(YELLOW)python3 indisponible, réponse brute :$(RESET)" && curl -s $(API_URL)/health)
	@echo ""
	@echo "$(GREEN)✓ API opérationnelle$(RESET)"

test-login: ## Teste l'authentification JWT (login admin)
	@echo "$(CYAN)Test authentification JWT...$(RESET)"
	@curl -sf -X POST $(API_URL)/api/auth/login \
		-H "Content-Type: application/json" \
		-d '{"username":"admin","password":"admin"}' | python3 -m json.tool || \
		curl -s -X POST $(API_URL)/api/auth/login \
			-H "Content-Type: application/json" \
			-d '{"username":"admin","password":"admin"}'
	@echo ""

test-metrics: ## Teste les métriques (login puis appel /api/metrics/live)
	@echo "$(CYAN)Test métriques — récupération du token...$(RESET)"
	$(eval TOKEN := $(shell curl -sf -X POST $(API_URL)/api/auth/login \
		-H "Content-Type: application/json" \
		-d '{"username":"admin","password":"admin"}' | \
		python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null))
	@if [ -z "$(TOKEN)" ]; then \
		echo "$(YELLOW)Impossible d'obtenir le token — vérifiez que l'API est démarrée$(RESET)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✓ Token obtenu$(RESET)"
	@curl -sf $(API_URL)/api/metrics/live \
		-H "Authorization: Bearer $(TOKEN)" | python3 -m json.tool || \
		curl -s $(API_URL)/api/metrics/live -H "Authorization: Bearer $(TOKEN)"
	@echo ""

test-unauth: ## Vérifie que les routes protégées rejettent les requêtes sans token
	@echo "$(CYAN)Test rejet sans token (doit retourner 401)...$(RESET)"
	@STATUS=$$(curl -o /dev/null -sw "%{http_code}" $(API_URL)/api/metrics/live); \
	if [ "$$STATUS" = "401" ]; then \
		echo "$(GREEN)✓ 401 reçu — protection JWT active$(RESET)"; \
	else \
		echo "$(YELLOW)⚠ Code reçu: $$STATUS (attendu: 401)$(RESET)"; \
	fi

test-prometheus: ## Vérifie que Prometheus scrape bien l'API et charge les alertes
	@echo "$(CYAN)Test Prometheus — cibles actives...$(RESET)"
	@curl -sf "http://localhost:3004/api/v1/targets?state=active" | \
		python3 -c "import sys,json; targets=json.load(sys.stdin)['data']['activeTargets']; \
		[print('  ✓', t['labels']['job'], '-', t['health']) for t in targets]" 2>/dev/null || \
		echo "$(YELLOW)Ouvrir http://localhost:3004/targets pour voir l'état$(RESET)"
	@echo ""
	@echo "$(CYAN)Test Prometheus — règles d'alertes chargées...$(RESET)"
	@curl -sf "http://localhost:3004/api/v1/rules" | \
		python3 -c "import sys,json; groups=json.load(sys.stdin)['data']['groups']; \
		[print('  ✓ Alerte:', r['name']) for g in groups for r in g['rules']]" 2>/dev/null || \
		echo "$(YELLOW)Ouvrir http://localhost:3004/alerts pour voir les règles$(RESET)"

test-traefik: ## Vérifie que Traefik est opérationnel et détecte les services
	@echo "$(CYAN)Test Traefik — services détectés...$(RESET)"
	@curl -sf "http://localhost:8080/api/http/services" | \
		python3 -c "import sys,json; svcs=json.load(sys.stdin); \
		[print('  ✓', s['name']) for s in svcs if s.get('type') == 'loadbalancer']" 2>/dev/null || \
		echo "$(YELLOW)Ouvrir http://localhost:8080 pour le dashboard Traefik$(RESET)"

test-all: test-health test-unauth test-login test-metrics test-prometheus test-traefik ## Lance tous les tests
	@echo ""
	@echo "$(GREEN)══════════════════════════════════════$(RESET)"
	@echo "$(GREEN)  Tous les tests terminés$(RESET)"
	@echo "$(GREEN)══════════════════════════════════════$(RESET)"

# ─────────────────────────────────────────────────────────────────────────────
# SCALING
# ─────────────────────────────────────────────────────────────────────────────
scale-up: ## Scale l'API à 4 réplicas (démo HPA)
	@echo "$(CYAN)Scaling api-centrale → 4 réplicas...$(RESET)"
	$(KUBECTL) scale deployment api-centrale --replicas=4 -n $(NAMESPACE)
	$(KUBECTL) get pods -n $(NAMESPACE) -l app=api-centrale -w

scale-down: ## Remet l'API à 2 réplicas
	@echo "$(YELLOW)Scaling api-centrale → 2 réplicas...$(RESET)"
	$(KUBECTL) scale deployment api-centrale --replicas=2 -n $(NAMESPACE)

# ─────────────────────────────────────────────────────────────────────────────
# DIVERS
# ─────────────────────────────────────────────────────────────────────────────
prometheus-rules: ## Recharge les règles d'alertes Prometheus à chaud
	@echo "$(CYAN)Rechargement des règles Prometheus...$(RESET)"
	@curl -sf -X POST http://localhost:3004/-/reload && \
		echo "$(GREEN)✓ Règles rechargées$(RESET)" || \
		echo "$(YELLOW)Redémarrage nécessaire : make restart$(RESET)"

grafana: ## Ouvre Grafana dans le navigateur (admin / greenops_grafana)
	@echo "$(CYAN)Ouverture de Grafana → http://localhost:3003$(RESET)"
	@echo "  Login : admin / greenops_grafana"
	@python3 -c "import webbrowser; webbrowser.open('http://localhost:3003')" 2>/dev/null || \
		echo "$(YELLOW)Ouvrir manuellement : http://localhost:3003$(RESET)"

open: ## Ouvre tous les services dans le navigateur
	@echo "$(CYAN)Ouverture des services...$(RESET)"
	@python3 -c "import webbrowser, time; \
		urls=['http://localhost:3001','http://localhost:3002','http://localhost:3003', \
		      'http://localhost:3004','http://localhost:8080']; \
		[webbrowser.open(u) or time.sleep(0.5) for u in urls]" 2>/dev/null || \
		echo "Dashboard: http://localhost:3001 | Admin: http://localhost:3002 | Grafana: http://localhost:3003 | Prometheus: http://localhost:3004 | Traefik: http://localhost:8080"
