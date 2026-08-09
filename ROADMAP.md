# CapRover Next Roadmap

This roadmap keeps the Next.js migration and automation work narrow, explicit,
and compatible with the existing API v2 contracts.

## Near term

### Restore One-Click Apps in the Next frontend

- Put One-Click Apps back in the primary navigation.
- Add catalog search, source and tag filters, relevance sorting, custom
  repositories, template review, variable handling, deployment progress, and
  Docker Compose conversion flows.
- Keep the existing one-click managers and API response shapes as the source of
  truth.

### Secure agent access channel

Provide agents with a dedicated API that does not require the CapRover root
password or SSH access to the host.

- Use independently revocable API keys; store only hashes, show the secret once,
  support expiration, rotation, and audit metadata.
- Define explicit roles:
  - `read`: read only the apps and deployment state within the key scope.
  - `deploy_approval`: submit a deployment request, but require a human to
    approve it before execution.
  - `deploy`: execute the approved deployment operations allowed by the key
    scope.
- Scope every key to an explicit app allowlist. Deny access by default when an
  app is not in the allowlist; allow an exact future app name for a creation
  request without granting a wildcard.
- Keep agent operations allowlisted and deployment-focused: no Docker socket,
  Swarm administration, root settings, app deletion, app renaming, volume
  deletion, registry management, or arbitrary server-side commands.
- Make approval requests immutable, single-use, expiring, and auditable. The
  approval UI must show the target app, requested changes, actor, and outcome.
- Reuse existing managers and ownership checks so an agent cannot mutate a
  resource that CapRover does not own or that is outside its scope.
- Surface agent-created apps in **Apps** with `published`, `on_approval`, and
  `paused` states; only a `deploy` key may bypass the approval state.

### App logs with Dozzle

Evaluate and integrate [Dozzle](https://dozzle.dev/) as the log-access layer for
CapRover apps.

- Run it as a CapRover-managed service rather than exposing the host Docker
  socket or port 8080 directly to the internet.
- Expose only the app log and read-only metrics workflows by default; keep
  shell/exec, host access, and unrelated container visibility disabled unless a
  separate, explicit privilege is introduced.
- Map Docker service/container labels to CapRover app ownership and enforce the
  same per-app scope used by agent API keys.
- Put it behind the CapRover domain/TLS and authentication model, with access
  events included in the audit trail.

## Later

- Finish the remaining legacy frontend workflow migrations.
- Add end-to-end tests for the agent approval lifecycle and app-scope denial
  paths.
- Add operational documentation for key rotation, emergency revocation, and
  recovery without SSH.
