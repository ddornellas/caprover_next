# CapRover web application

The active CapRover interface is a Next.js App Router application. It uses
Server Components for authenticated reads, client components only where
interaction is required, Tailwind CSS, and shadcn/ui-owned components.

The previous CRA application is preserved under `legacy/` while its workflows
are migrated one at a time. It is not part of the production build.

## Development

From the repository root:

```bash
npm ci
npm run dev:next
```

The custom server keeps CapRover's existing Express API v2 routes and delegates
web requests to Next.js in the same process. Set `IS_CAPTAIN_INSTANCE=1` when
running against a local Captain instance; the normal Docker development image
sets this automatically.

Browser mutations and reads go through the Next route handler at
`/api/caprover/*`. That BFF forwards cookies, CSRF origin headers, uploads,
streaming downloads, and API v2 response statuses to the existing Express
managers. Direct `/api/v2/*` access remains available for CLI clients and
webhooks.

## Production build

The root `npm run build` compiles the backend, runs the circular-dependency
check, and builds this application with Next.js. The release and development
Dockerfiles use that single build, so the image no longer clones a second
frontend repository.

## Migration rule

Existing API v2 status codes, response shapes, authentication contracts, and
Docker/Swarm managers remain the source of truth. New pages should add a thin
server-side data adapter and reuse those contracts instead of moving Docker
operations into browser code.
