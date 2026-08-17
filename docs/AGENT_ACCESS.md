# Agent access

CapRover exposes a separate agent channel under `/api/v2/agent/`. Agents use
an API key instead of the root password and never need SSH or the Docker
socket.

## Create a key

An administrator can create a key in **Agents**. Every key
must have:

- a name;
- one role: `read`, `deploy_approval`, or `deploy`;
- an explicit list of app names. Names may refer to apps that do not exist yet;
  this is how an agent is allowed to request creation of a specific new app;
- an optional expiration date of at most one year.

The administrator can also record a human owner, provider, and purpose, then
apply a deploy policy that independently controls new-app creation,
Dockerfile-based deploys, and accepted image-name prefixes. Existing keys can
be paused, resumed, rotated, or permanently revoked without restarting
CapRover.

The plaintext key is shown only once. CapRover stores only its SHA-256 hash.
Revoke an exposed key immediately from the same screen.

## Authentication

Send the key as a Bearer token:

```bash
export CAPROVER_AGENT_KEY='cr_agent_...'

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${CAPROVER_AGENT_KEY}" \
  https://captain.example.com/api/v2/agent
```

The response reports the key role and its app scope. A key cannot see or
mutate apps outside that exact scope.

Start an integration by reading `/api/v2/agent/manifest` and
`/api/v2/agent/context`. The manifest describes the stable agent operations;
context provides safe app state, recent deployment state, and guardrails
without environment values, host data, or raw Docker objects.
`/api/v2/agent/events` returns a scoped timeline with client IPs removed.

## MCP endpoint

Use `https://captain.example.com/api/v2/agent/mcp` as a Streamable HTTP MCP
server and configure the same `Authorization: Bearer ...` header. CapRover Next
supports the stable `2025-11-25` lifecycle in stateless mode: `initialize`,
`ping`, `tools/list`, `tools/call`, and `notifications/initialized`. It does not
open a server-sent event stream because all exposed operations are
request/response tools.

The MCP tool list is derived from the key role. Read identities receive
context, app, log, event, and deployment-status tools. Deploy identities also
receive preview and deploy tools. Calls reuse the exact same app scope, policy,
idempotency, approval, audit, verification, and rollback path as the REST API.

## Read apps and logs

```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${CAPROVER_AGENT_KEY}" \
  https://captain.example.com/api/v2/agent/apps

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${CAPROVER_AGENT_KEY}" \
  https://captain.example.com/api/v2/agent/apps/my-api/logs
```

The responses intentionally contain safe app status data only. They do not
return environment variables, repository credentials, volumes, Docker
objects, or host details.

## Deploy an app

Agents can deploy an existing, scoped app using a restricted Captain
definition. The accepted payload contains only `appName`, `gitHash`, and a
Captain definition with `schemaVersion: 2` plus exactly one of `imageName` or
`dockerfileLines`.

```bash
curl --fail --silent --show-error -X POST \
  -H "Authorization: Bearer ${CAPROVER_AGENT_KEY}" \
  -H 'Content-Type: application/json' \
  https://captain.example.com/api/v2/agent/deployments \
  -d '{
    "appName": "my-api",
    "gitHash": "abc123",
    "captainDefinition": {
      "schemaVersion": 2,
      "imageName": "registry.example.com/my-api:abc123"
    }
  }'
```

To request a new app, use an exact app name already included in the key scope
and set `createApp` to `true`. The optional description is shown to the human
approver and in **Apps** while the request is pending:

```json
{
  "appName": "new-api",
  "createApp": true,
  "description": "API created by the release agent",
  "captainDefinition": {
    "schemaVersion": 2,
    "imageName": "registry.example.com/new-api:abc123"
  }
}
```

`read` keys receive 403 for this endpoint. `deploy_approval` keys create a
pending request and return its deployment ID. For a new app, that request is
immediately visible in **Apps** with status `On approval`; it does not create a
Docker service until a human approves it. A human administrator must approve
it in **Agents** before the deploy starts. `deploy` keys start
new-app deploys directly. Poll the returned ID at
`/api/v2/agent/deployments/:id`.

Apps use three statuses: `Published` for a running app, `On approval` for a
new app waiting for a human approval, and `Paused` when its instance count is
zero. Pending apps cannot be opened or deleted from the Apps list.

The agent channel deliberately has no app deletion, rename, volume deletion,
registry administration, Swarm administration, arbitrary command, or SSH
operation. Deployments are always checked against the key's exact allowlist;
there are no wildcards or permissions to create an arbitrary app name.
