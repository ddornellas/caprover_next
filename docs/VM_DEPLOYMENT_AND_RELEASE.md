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
- Stable releases use `ddornellas/caprover-next`; edge releases use
  `ddornellas/caprover-next-edge`.
- The control plane uses Docker API `v1.43`. Install a current official Docker
  Engine; Docker Engine 25+ is the recommended baseline for CapRover.

## Install CapRover Next on a VM

Use a dedicated VM with a public, stable IPv4 address. Ubuntu 22.04/24.04 and
Debian 12+ are supported. Allocate at least 1 GB of RAM and enough disk for
the applications you plan to build. Proxmox LXC containers are rejected; use a
real VM instead.

The installer installs Docker Engine from the official repository, prepares
`/captain`, creates a random initial admin password, runs the existing
CapRover bootstrap in the background, waits for `captain-captain` to be
healthy, and writes a protected manifest under `/etc/caprover-next`.

Download a released installer and verify it before running it:

```bash
VERSION=1.15.0
curl -fsSLO "https://github.com/ddornellas/caprover_next/releases/download/v${VERSION}/caprover-next-install"
curl -fsSLO "https://github.com/ddornellas/caprover_next/releases/download/v${VERSION}/checksums.txt"
sha256sum -c checksums.txt
chmod 0755 caprover-next-install
```

Install the stable channel:

```bash
sudo ./caprover-next-install install \
  --version 1.15.0 \
  --domain apps.example.com \
  --node-ip <VM_PUBLIC_IP> \
  --accept-terms
```

For a VM behind NAT, pass the address reachable by the Swarm node instead:

```bash
sudo ./caprover-next-install install --node-ip 192.168.1.20 --accept-terms
```

The installer never deletes an existing `/captain`. If `captain-captain`
already exists, it stops and asks you to use `upgrade` rather than silently
replacing a running installation.

For an existing installation that still runs `caprover/caprover`, do not run
`install` again. Take a backup and migrate the control-plane image in place:

```bash
sudo ./caprover-next-install backup
sudo ./caprover-next-install upgrade \
  --image ddornellas/caprover-next \
  --version 1.15.0 \
  --image-digest sha256:<64-hex>
```

The service name, `/captain` data, volumes, labels, and API v2 remain unchanged
by this migration.

### Network and firewall

The provider firewall must allow TCP 80 and 443. Port 3000 is needed during
the first setup. The installer can configure UFW only when explicitly asked:

```bash
sudo ./caprover-next-install install \
  --domain apps.example.com \
  --admin-cidr 198.51.100.0/24 \
  --configure-firewall \
  --accept-terms
```

Without `--admin-cidr`, the dashboard port is opened publicly and a warning is
printed. Restrict it to an administrator network whenever possible. Swarm
ports (2377/tcp, 7946/tcp+udp, and 4789/udp) must be opened only between nodes
when adding workers. If SSH is not on port 22, pass `--ssh-port` so the
installer does not lock out the administrator. Keep DNS records pointed
directly at the VM while
requesting certificates:

```text
apps.example.com       A  <VM_PUBLIC_IP>
*.apps.example.com     A  <VM_PUBLIC_IP>
```

The installer prints the initial password file. Read it once, log in, and
change the password immediately:

```bash
sudo cat /etc/caprover-next/initial-admin-password
```

### Installer operations

```bash
sudo ./caprover-next-install status
sudo ./caprover-next-install doctor
sudo ./caprover-next-install backup
sudo ./caprover-next-install upgrade --version 1.16.0 --image-digest sha256:<64-hex>
sudo ./caprover-next-install rollback
```

`upgrade` waits for a healthy service and requests a Docker rollback if the
new task fails. `backup` writes a mode-0600 archive below
`/captain/installer/backups`; copy it to separate storage. `uninstall` removes
only a service carrying CapRover's managed-service label and preserves data by
default:

```bash
sudo ./caprover-next-install uninstall
```

Removing data is a separate, non-interactive destructive action:

```bash
sudo ./caprover-next-install uninstall --remove-data --non-interactive
```

For CI or cloud-init, use `--non-interactive` and pin both the image version
and digest. Use `--dry-run` to inspect all commands before making changes.

## Cloud-init and provider automation

The checked-in example at
[`examples/cloud-init/caprover-next.yaml`](../examples/cloud-init/caprover-next.yaml)
installs a pinned release during the first boot. Copy it into a provider's
user-data field, replace the release URL, domain, node IP, and admin CIDR, and
keep the provider security group aligned with the VM firewall. Terraform and
Ansible should call the same installer rather than reimplementing Docker or
Swarm setup.

## Deploy a new image to an existing VM

The operator CLI creates a mode-0600 backup before every upgrade, updates the
control plane with a stop-first strategy for host-published ports, and waits
for a health check:

```bash
sudo ./caprover-next-install upgrade \
  --version 1.16.0 \
  --image-digest sha256:<64-hex>
```

Keep `/captain` intact; it contains application metadata, certificates,
registry data, and generated configuration. For a manual emergency rollback:

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

| GitHub event      | Workflow                 | Published artifact                                  | Platforms                    |
| ----------------- | ------------------------ | --------------------------------------------------- | ---------------------------- |
| Push to `master`  | `publish_edge.yml`       | `ddornellas/caprover-next-edge:0.0.1` and `:latest` | `linux/amd64`, `linux/arm64` |
| Push to `release` | `publish_release.yml`    | `ddornellas/caprover-next:<version>` and `:latest`  | `linux/amd64`, `linux/arm64` |
| Tag `vX.Y.Z`      | `publish_installer.yml` | GitHub Release + VM installer                       | n/a                          |

Both workflows run the build, lint, formatter, and test checks before the
Docker publish job. The publish job requires the GitHub Actions secrets
`REGISTRY_USERNAME` and `REGISTRY_PASSWORD` for the fork's Docker Hub
namespace. The release workflow also uploads the installer and its checksum as
an artifact; attach those files to the corresponding signed GitHub Release.

### Release checklist

1. Add the release notes to `CHANGELOG.md`. Move the completed `Next Version`
   entries under a dated version heading.
2. Update `configs.version` in
   `src/utils/CaptainConstants.ts`. This value must be a new semantic version
   greater than the existing release tags in the fork's Docker Hub repository.
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
    docker buildx imagetools inspect "ddornellas/caprover-next:${CAPROVER_VERSION}"
    ```

6. Push a signed `vX.Y.Z` tag after the release branch has published the
   image. `publish_installer.yml` validates the version and creates a GitHub
   Release containing `caprover-next-install` and `checksums.txt`.

7. Record the image digest in the release notes and deploy the versioned image
   to the VM using the update procedure above.

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
