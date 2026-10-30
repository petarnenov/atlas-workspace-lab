import { readFileSync } from "node:fs";
const ns = "atlas-lab";
const object = (apiVersion, kind, name, spec) => ({
  apiVersion,
  kind,
  metadata: { name, namespace: ns },
  ...spec,
});
const label = (name) => ({ app: name });
const env = (values) =>
  Object.entries(values).map(([name, value]) => ({ name, value }));
const secretEnv = (name, key, secret) => ({
  name,
  valueFrom: { secretKeyRef: { name: secret, key } },
});
const resources = (memory = "512Mi", cpu = "1000m") => ({
  requests: { cpu: "100m", memory: "128Mi" },
  limits: { cpu, memory },
});
const secure = {
  allowPrivilegeEscalation: false,
  readOnlyRootFilesystem: true,
  capabilities: { drop: ["ALL"] },
};
const podSecurity = {
  runAsNonRoot: true,
  runAsUser: 10001,
  runAsGroup: 10001,
  fsGroup: 10001,
  seccompProfile: { type: "RuntimeDefault" },
};
const tmp = { name: "tmp", emptyDir: { sizeLimit: "128Mi" } };
const service = (name, port) =>
  object("v1", "Service", name, {
    spec: {
      selector: label(name),
      ...(name === "kafka"
        ? { clusterIP: "None", publishNotReadyAddresses: true }
        : {}),
      ports: [
        { name: "main", port, targetPort: port },
        ...(name === "kafka"
          ? [{ name: "controller", port: 9093, targetPort: 9093 }]
          : []),
      ],
    },
  });
const keyVolume = (name, keys) => ({
  name: "keys",
  secret: {
    secretName: name,
    defaultMode: 0o440,
    items: keys.map((key) => ({ key, path: key })),
  },
});
const mountKeys = { name: "keys", mountPath: "/keys", readOnly: true };
const volumeMounts = [{ name: "tmp", mountPath: "/tmp" }];
const tcp = (port) => ({
  tcpSocket: { port },
  periodSeconds: 5,
  timeoutSeconds: 2,
  failureThreshold: 6,
});
const http = (path, port) => ({
  httpGet: { path, port },
  periodSeconds: 5,
  timeoutSeconds: 3,
  failureThreshold: 6,
});
function deployment(name, port, values, secret, keys = []) {
  const worker = name === "processing-worker";
  const c = {
    name,
    image: `atlas/${name}:build`,
    imagePullPolicy: "Never",
    env: env(values),
    securityContext: secure,
    resources: resources(worker ? "640Mi" : "512Mi"),
    volumeMounts: [...volumeMounts, ...(keys.length ? [mountKeys] : [])],
    ...(worker ? {} : { ports: [{ containerPort: port }] }),
    readinessProbe: worker
      ? {
          exec: {
            command: [
              "java",
              "-Xmx48m",
              "-XX:MaxMetaspaceSize=64m",
              "-cp",
              "/app/probe:/app/extracted/lib/*",
              "WorkerReady",
            ],
          },
          periodSeconds: 15,
          timeoutSeconds: 10,
          failureThreshold: 4,
        }
      : tcp(port),
    startupProbe: worker
      ? {
          exec: { command: ["/bin/sh", "-c", "test -r /app/parser.jar"] },
          failureThreshold: 30,
          periodSeconds: 5,
        }
      : { ...tcp(port), failureThreshold: 60 },
    ...(worker
      ? {}
      : { livenessProbe: { ...tcp(port), failureThreshold: 12 } }),
  };
  if (secret)
    for (const key of worker
      ? ["LAB_WORKER_DB_PASSWORD", "LAB_WORKER_OBJECT_PASSWORD"]
      : name === "asset-service"
        ? ["LAB_ASSET_DB_PASSWORD", "LAB_ASSET_OBJECT_PASSWORD"]
        : [])
      c.env.push(secretEnv(key, key, secret));
  if (worker)
    c.env.push(
      {
        name: "POD_NAME",
        valueFrom: { fieldRef: { fieldPath: "metadata.name" } },
      },
      { name: "SPRING_KAFKA_CONSUMER_CLIENT_ID", value: "$(POD_NAME)" },
    );
  return object("apps/v1", "Deployment", name, {
    spec: {
      replicas: 1,
      ...(worker ? { strategy: { type: "Recreate" } } : {}),
      selector: { matchLabels: label(name) },
      template: {
        metadata: { labels: label(name) },
        spec: {
          automountServiceAccountToken: false,
          securityContext: podSecurity,
          terminationGracePeriodSeconds: 30,
          containers: [c],
          volumes: [tmp, ...(keys.length ? [keyVolume(secret, keys)] : [])],
        },
      },
    },
  });
}
function stateful(name, port, image, values, secret, path, uid, probe) {
  const c = {
    name,
    image,
    imagePullPolicy: image.startsWith("atlas/") ? "Never" : "IfNotPresent",
    ports: [{ containerPort: port }],
    env: env(values),
    envFrom: secret ? [{ secretRef: { name: secret } }] : [],
    resources: resources(name === "kafka" ? "1024Mi" : "512Mi"),
    securityContext: secure,
    volumeMounts: [...volumeMounts, { name: "data", mountPath: path }],
    readinessProbe: probe,
    startupProbe: { ...probe, failureThreshold: 90 },
    livenessProbe: { ...probe, failureThreshold: 12 },
  };
  const extra = [];
  if (name === "postgres") {
    extra.push({ name: "socket", emptyDir: {} });
    c.volumeMounts.push({ name: "socket", mountPath: "/var/run/postgresql" });
  }
  if (name === "storage") {
    extra.push({ name: "logs", emptyDir: { sizeLimit: "128Mi" } });
    c.volumeMounts.push({ name: "logs", mountPath: "/logs" });
  }
  if (name === "kafka") {
    extra.push(
      { name: "config", emptyDir: {} },
      { name: "logs", emptyDir: { sizeLimit: "128Mi" } },
    );
    c.volumeMounts.push(
      { name: "config", mountPath: "/opt/kafka/config" },
      { name: "logs", mountPath: "/opt/kafka/logs" },
    );
  }
  const initContainers =
    name === "kafka"
      ? [
          {
            name: "config-seed",
            image,
            imagePullPolicy: "Never",
            command: ["/bin/sh", "-ec", "cp -R /opt/kafka/config/. /config/"],
            securityContext: secure,
            resources: resources("128Mi"),
            volumeMounts: [{ name: "config", mountPath: "/config" }],
          },
        ]
      : [];
  if (name === "kafka")
    c.env.push({ name: "KAFKA_HEAP_OPTS", value: "-Xms256m -Xmx512m" });
  return object("apps/v1", "StatefulSet", name, {
    spec: {
      serviceName: name,
      replicas: 1,
      selector: { matchLabels: label(name) },
      template: {
        metadata: { labels: label(name) },
        spec: {
          automountServiceAccountToken: false,
          securityContext: {
            ...podSecurity,
            runAsUser: uid,
            runAsGroup: uid,
            fsGroup: uid,
          },
          initContainers,
          containers: [c],
          volumes: [tmp, ...extra],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: { name: "data" },
          spec: {
            accessModes: ["ReadWriteOnce"],
            resources: { requests: { storage: "2Gi" } },
          },
        },
      ],
    },
  });
}
function job(name, image, command, secret) {
  return object("batch/v1", "Job", name, {
    spec: {
      backoffLimit: 2,
      activeDeadlineSeconds: 180,
      template: {
        metadata: { labels: label(name) },
        spec: {
          restartPolicy: "Never",
          automountServiceAccountToken: false,
          securityContext: podSecurity,
          containers: [
            {
              name,
              image,
              imagePullPolicy: "Never",
              command,
              envFrom: secret ? [{ secretRef: { name: secret } }] : [],
              resources: resources("256Mi"),
              securityContext: secure,
              volumeMounts: [
                ...volumeMounts,
                ...(secret
                  ? [
                      {
                        name: "policies",
                        mountPath: "/policies",
                        readOnly: true,
                      },
                    ]
                  : []),
              ],
            },
          ],
          volumes: [
            tmp,
            ...(secret
              ? [{ name: "policies", configMap: { name: "storage-policies" } }]
              : []),
          ],
        },
      },
    },
  });
}
function networkProof(mode) {
  const proof = job(`network-proof-${mode}`, "atlas/asset-service:build", [
    "java",
    "-Xmx32m",
    "-cp",
    "/app/probe",
    "NetworkCheck",
    mode,
    "postgres:5432",
    "kafka:19092",
    "storage:9000",
  ]);
  proof.spec.backoffLimit = 0;
  proof.spec.activeDeadlineSeconds = 60;
  proof.spec.template.metadata.labels.app =
    mode === "allow" ? "asset-service" : "network-proof-deny";
  return proof;
}
const peer = (name) => ({ podSelector: { matchLabels: label(name) } });
const ports = (port) => [{ protocol: "TCP", port }];
function allow(name, from, to, port) {
  return [
    object("networking.k8s.io/v1", "NetworkPolicy", `${name}-in`, {
      spec: {
        podSelector: { matchLabels: label(to) },
        policyTypes: ["Ingress"],
        ingress: [{ from: [peer(from)], ports: ports(port) }],
      },
    }),
    object("networking.k8s.io/v1", "NetworkPolicy", `${name}-out`, {
      spec: {
        podSelector: { matchLabels: label(from) },
        policyTypes: ["Egress"],
        egress: [{ to: [peer(to)], ports: ports(port) }],
      },
    }),
  ];
}
export function manifests() {
  const v = JSON.parse(readFileSync("infra/k8s/versions.json"));
  const items = [
    {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: ns,
        labels: {
          "pod-security.kubernetes.io/enforce": "restricted",
          "pod-security.kubernetes.io/enforce-version": "v1.35",
        },
      },
    },
    object("v1", "ConfigMap", "storage-policies", {
      data: Object.fromEntries(
        ["asset.json", "worker.json"].map((file) => [
          file,
          readFileSync(`infra/storage/${file}`, "utf8"),
        ]),
      ),
    }),
    stateful(
      "postgres",
      5432,
      "atlas/postgres:build",
      {
        POSTGRES_USER: "local_admin",
        PGDATA: "/var/lib/postgresql/data/pgdata",
      },
      "postgres-admin",
      "/var/lib/postgresql/data",
      70,
      {
        exec: {
          command: ["pg_isready", "-U", "local_admin", "-d", "postgres"],
        },
        periodSeconds: 5,
        timeoutSeconds: 3,
      },
    ),
    stateful(
      "kafka",
      19092,
      "atlas/kafka:build",
      {
        KAFKA_NODE_ID: "1",
        KAFKA_PROCESS_ROLES: "broker,controller",
        KAFKA_LISTENERS: "INTERNAL://:19092,CONTROLLER://:9093",
        KAFKA_ADVERTISED_LISTENERS: "INTERNAL://kafka:19092",
        KAFKA_LISTENER_SECURITY_PROTOCOL_MAP:
          "INTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT",
        KAFKA_INTER_BROKER_LISTENER_NAME: "INTERNAL",
        KAFKA_CONTROLLER_LISTENER_NAMES: "CONTROLLER",
        KAFKA_CONTROLLER_QUORUM_VOTERS: "1@kafka:9093",
        KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "1",
        KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: "1",
        KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: "1",
        KAFKA_LOG_RETENTION_HOURS: "168",
        KAFKA_LOG_DIRS: "/var/lib/kafka/data",
        KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false",
      },
      null,
      "/var/lib/kafka/data",
      1000,
      {
        exec: {
          command: [
            "/opt/kafka/bin/kafka-topics.sh",
            "--bootstrap-server",
            "localhost:19092",
            "--list",
          ],
        },
        periodSeconds: 15,
        timeoutSeconds: 10,
      },
    ),
    stateful(
      "storage",
      9000,
      v.storage,
      {
        RUSTFS_ACCESS_KEY: "local_admin",
        RUSTFS_CONSOLE_ENABLE: "false",
        RUSTFS_ADDRESS: ":9000",
        RUSTFS_VOLUMES: "/data",
      },
      "storage-admin",
      "/data",
      10001,
      http("/health/ready", 9000),
    ),
    ...[
      ["postgres", 5432],
      ["kafka", 19092],
      ["storage", 9000],
      ["workspace-api", 8080],
      ["asset-service", 8081],
      ["portal-ui", 8080],
    ].map(([n, p]) => service(n, p)),
    networkProof("allow"),
    networkProof("deny"),
    job("kafka-init", "atlas/kafka:build", [
      "/bin/sh",
      "-ec",
      'for topic in asset.uploaded.v1 asset.processed.v1; do /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:19092 --create --if-not-exists --topic "$topic" --partitions 1 --replication-factor 1 --config retention.ms=604800000; done',
    ]),
    job(
      "storage-init",
      "atlas/storage-init:build",
      ["/bin/sh", "/bootstrap.sh"],
      "storage-bootstrap",
    ),
    deployment(
      "workspace-api",
      8080,
      {
        SERVER_ADDRESS: "0.0.0.0",
        LAB_ASSET_URL: "http://asset-service:8081",
        LAB_FIXTURE_PUBLIC_KEY: "/keys/fixture-public.pem",
        LAB_SERVICE_PRIVATE_KEY: "/keys/service-private.pem",
      },
      "api-identity",
      ["fixture-public.pem", "service-private.pem"],
    ),
    deployment(
      "asset-service",
      8081,
      {
        SERVER_ADDRESS: "0.0.0.0",
        ASSET_DB_URL: "jdbc:postgresql://postgres:5432/assets",
        KAFKA_BOOTSTRAP: "kafka:19092",
        LAB_OBJECT_ENDPOINT: "http://storage:9000",
        LAB_SERVICE_PUBLIC_KEY: "/keys/service-public.pem",
      },
      "asset-runtime",
      ["service-public.pem"],
    ),
    deployment(
      "processing-worker",
      0,
      {
        WORKER_DB_URL: "jdbc:postgresql://postgres:5432/worker_checkpoint",
        KAFKA_BOOTSTRAP: "kafka:19092",
        LAB_OBJECT_ENDPOINT: "http://storage:9000",
        LAB_SERVICE_PUBLIC_KEY: "/keys/service-public.pem",
        LAB_PARSER_JAR: "/app/parser.jar",
      },
      "worker-runtime",
      ["service-public.pem"],
    ),
    deployment("portal-ui", 8080, {}, null),
    object("networking.k8s.io/v1", "NetworkPolicy", "default-deny", {
      spec: { podSelector: {}, policyTypes: ["Ingress", "Egress"] },
    }),
    object("networking.k8s.io/v1", "NetworkPolicy", "dns", {
      spec: {
        podSelector: {},
        policyTypes: ["Egress"],
        egress: [
          {
            to: [
              {
                namespaceSelector: {
                  matchLabels: { "kubernetes.io/metadata.name": "kube-system" },
                },
                podSelector: { matchLabels: { "k8s-app": "kube-dns" } },
              },
            ],
            ports: [
              { protocol: "UDP", port: 53 },
              { protocol: "TCP", port: 53 },
            ],
          },
        ],
      },
    }),
    ...allow("ui-api", "portal-ui", "workspace-api", 8080),
    ...allow("api-assets", "workspace-api", "asset-service", 8081),
    ...["asset-service", "processing-worker"].flatMap((from) =>
      [
        ["postgres", 5432],
        ["kafka", 19092],
        ["storage", 9000],
      ].flatMap(([to, p]) => allow(`${from}-${to}`, from, to, p)),
    ),
    ...allow("kafka-bootstrap", "kafka-init", "kafka", 19092),
    ...allow("storage-bootstrap", "storage-init", "storage", 9000),
    ...allow("kafka-internal", "kafka", "kafka", 9093),
    ...allow("kafka-broker", "kafka", "kafka", 19092),
  ];
  const ui = items.find(
    (x) => x.kind === "Deployment" && x.metadata.name === "portal-ui",
  ).spec.template.spec;
  ui.securityContext = {
    ...podSecurity,
    runAsUser: 101,
    runAsGroup: 101,
    fsGroup: 101,
  };
  ui.containers[0].readinessProbe = http("/", 8080);
  return items;
}
