# VM installation, deployment, and release

This runbook covers the workflows implemented in this repository. End-user
product documentation remains on the [CapRover website](https://caprover.com/).

## Current runtime contract

- Source builds and CI use Node.js 24.
- The root `npm run build` compiles the backend, checks circular dependencies,
  and builds the Next.js frontend in `frontend/`.
- The production Dockerfiles use `node:24-alpine` and publish images for
  `linux/amd64` and `linux/arm64`.
- The CapRover version is defined in
  [`src/utils/CaptainConstants.ts`](../src/utils/CaptainConstants.ts), not in
  `package.json` (the npm package is private and remains at `0.0.0`).
- The control plane uses Docker API `v1.43`. Install a current official Docker
  Engine; Docker Engine 25+ is the recommended baseline for CapRover.

## Install a published image on a VM

### 1. Prepare the VM

Use a dedicated VM with a public, stable IPv4 address. Ubuntu 22.04 or newer
is the recommended operating system. Plan for at least 1 GB of RAM; Docker
builds may need more memory or swap depending on the applications being
deployed.

Install Docker Engine using the [official Ubuntu installation
instructions](https://docs.docker.com/engine/install/ubuntu/). Do not use the
Snap package for Docker. Verify the daemon and API version before installing
CapRover:

```bash
sudo docker version
sudo docker run --rm hello-world
```

The server must not be a Proxmox LXC container. The installer rejects hosts
whose kernel identifies them as `-pve` because Docker Swarm networking is not
reliable in that environment.

Create the persistent CapRover directory. It contains application metadata,
certificates, registry data, and generated configuration:

```bash
sudo install -d -m 0755 /captain
```

### 2. Configure networking

The VM provider firewall/security group and the VM firewall must allow the
same ports. For a single-node installation, expose these ports to the
internet:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw allow 3000/tcp
```

For a cluster or the built-in registry, also allow the Swarm and registry
ports. Restrict these rules to the other cluster nodes whenever possible:

```bash
sudo ufw allow 80,443,3000,996,7946,4789,2377/tcp
sudo ufw allow 7946,4789,2377,443/udp
```

Port 3000 is used for the initial setup and can be blocked after the dashboard
is attached to a domain. See the [CapRover firewall
documentation](https://caprover.com/docs/firewall.html) for provider-specific
firewall considerations.

Create a DNS A record for the VM and a wildcard record for applications. For
example:

```text
apps.example.com       A  <VM_PUBLIC_IP>
*.apps.example.com     A  <VM_PUBLIC_IP>
```

During setup, the CapRover root domain will be `apps.example.com` and the
dashboard will be available at `captain.apps.example.com`. Use DNS-only mode
while configuring a proxy service such as Cloudflare; CapRover needs the DNS
records to resolve directly to the VM.

### 3. Start the installer

Use a released version for production. Replace `1.15.0` with the version being
installed:

```bash
CAPROVER_VERSION=1.15.0

sudo docker run --pull always \
  -p 80:80 \
  -p 443:443 \
  -p 3000:3000 \
  -e ACCEPTED_TERMS=true \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /captain:/captain \
  "caprover/caprover:${CAPROVER_VERSION}"
```

The installer checks the host, initializes Docker Swarm, and creates the
`captain-captain` service. It may take at least 60 seconds after the installer
exits. Follow the service logs from another SSH session:

```bash
sudo docker service ls
sudo docker service logs --since 10m captain-captain
```

For an edge build, use `caprover/caprover-edge:latest` in the same command.
Edge is intended for testing the next version and should not be used for a
production installation.

If the VM is private or behind NAT, set the address explicitly for a local or
single-machine test by adding this option to the installer command:

```bash
-e MAIN_NODE_IP_ADDRESS=127.0.0.1
```

This bypasses public-IP discovery, but public HTTPS and access from outside
the VM still require the appropriate routing and port forwarding.

### 4. Finish the first-time setup

Open `http://<VM_PUBLIC_IP>:3000` and configure the root domain as
`apps.example.com`. Then:

1. Enable HTTPS and force HTTPS after DNS resolves.
2. Change the default password (`captain42`) immediately.
3. Confirm that `https://captain.apps.example.com` loads.
4. Block port 3000 at the provider firewall after setup if it is no longer
   needed.

The CLI can also complete the setup from a developer workstation:

```bash
npm install --global caprover
caprover serversetup
```

## Deploy a new image to an existing VM

Back up the instance before an upgrade. Keep `/captain` intact; deleting it
removes persistent CapRover state. The normal production deployment is an
image update of the existing Swarm service:

```bash
CAPROVER_VERSION=1.15.0

sudo docker service update \
  --detach=false \
  --image "caprover/caprover:${CAPROVER_VERSION}" \
  captain-captain
```

For an edge deployment, force a refresh because the `latest` tag is reused:

```bash
sudo docker service update \
  --detach=false \
  --force \
  --image caprover/caprover-edge:latest \
  captain-captain
```

Verify the rollout and the application health before considering the upgrade
complete:

```bash
sudo docker service ps --no-trunc captain-captain
sudo docker service logs --since 10m captain-captain
curl --fail --silent http://127.0.0.1:3000/checkhealth
```

If the new task does not become healthy, inspect the logs and roll back the
service:

```bash
sudo docker service update --detach=false --rollback captain-captain
```

## Run this repository on a disposable VM

This is for backend/frontend development and integration testing, not for a
production deployment. The debug helper intentionally removes every Docker
Swarm service and recreates `/captain`; never run it on a shared or production
VM.

From the repository root, with Node.js 24 and Docker available:

```bash
npm ci
npm run build
sudo install -d -o "$USER" /captain
sudo ./dev-scripts/dev-clean-run-as-dev.sh
```

The helper builds `dockerfile-captain.debug`, mounts the repository into the
container, and follows `captain-captain` logs. After a source change, rebuild
and restart the debug service with:

```bash
npm run dev
```

For direct Next.js development against an already initialized Captain
instance, see [`frontend/README.md`](../frontend/README.md) and the
[end-to-end test instructions](../e2e/README.md).

## Validate and publish a release

### Image channels

| GitHub event      | Workflow              | Published images                             | Platforms                    |
| ----------------- | --------------------- | -------------------------------------------- | ---------------------------- |
| Push to `master`  | `publish_edge.yml`    | `caprover/caprover-edge:0.0.1` and `:latest` | `linux/amd64`, `linux/arm64` |
| Push to `release` | `publish_release.yml` | `caprover/caprover:<version>` and `:latest`  | `linux/amd64`, `linux/arm64` |

Both workflows run the build, lint, formatter, and test checks before the
Docker publish job. The publish job requires the GitHub Actions secrets
`REGISTRY_USERNAME` and `REGISTRY_PASSWORD` for Docker Hub.

### Release checklist

1. Add the release notes to `CHANGELOG.md`. Move the completed `Next Version`
   entries under a dated version heading.
2. Update `configs.version` in
   `src/utils/CaptainConstants.ts`. This value must be a new semantic version
   greater than the existing release tags on Docker Hub.
3. Run the same checks locally:

    ```bash
    npm ci
    npm run build
    npm run lint
    npm run formatter
    npm run test:all
    npm test -- --runInBand
    ```

4. Push the prepared commit to the `release` branch. GitHub Actions runs
   `.github/workflows/publish_release.yml` and invokes
   `dev-scripts/build_and_push_release.sh`.
5. Verify both the versioned tag and `latest` on Docker Hub. Confirm the
   multi-platform manifest before updating a VM:

    ```bash
    CAPROVER_VERSION=1.15.0
    docker buildx imagetools inspect "caprover/caprover:${CAPROVER_VERSION}"
    ```

6. Deploy the versioned image to the VM using the update procedure above. A
   GitHub release or Git tag is a separate maintainer action; the workflow
   only builds and publishes Docker images.

The publish scripts intentionally refuse local execution unless `CI` and
`GITHUB_REF` are set. Do not run them manually on a workstation; test images
locally with the appropriate Dockerfile instead:

```bash
docker build -f dockerfile-captain.release -t caprover-local:release .
docker build -f dockerfile-captain.edge -t caprover-local:edge .
```

The release script installs binfmt support and configures Docker Buildx in the
GitHub runner so the image is built for both supported architectures.

## Troubleshooting quick checks

```bash
sudo docker version
sudo docker info
sudo docker service ls
sudo docker service ps --no-trunc captain-captain
sudo docker service logs --tail 200 captain-captain
```

If installation fails before the service is created, first check that ports
80, 443, and 3000 are free and reachable from the VM's public address. If the
application reports that Docker is too old, check that the server API version
is at least `1.43` and update Docker using the official package repository.
