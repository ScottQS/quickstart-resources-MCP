# MCP Reporting Server (TypeScript)

An MCP server that exposes an online reporting API as tools.

## Tools

- `get-report`
  - Sends a `GET` request to a relative endpoint on the configured reporting API.
  - Accepts optional query parameters.
- `create-report`
  - Sends a `POST` request to a relative endpoint on the configured reporting API.
  - Accepts optional query parameters and JSON payload.
- `reporting-api-config`
  - Returns the active server base URL and whether auth is enabled.

## Configuration

You can configure the API target with environment variables:

- `REPORTING_API_BASE_URL` (optional, default: `https://jsonplaceholder.typicode.com`)
- `REPORTING_API_KEY` (optional bearer token)

## Build

```bash
npm install
npm run build
```

## Run (stdio transport)

```bash
node build/index.js
```

## Example tool calls

- `get-report` with endpoint `/posts` and query `{ "userId": 1 }`
- `get-report` with endpoint `/posts/1`
- `create-report` with endpoint `/posts` and payload `{ "title": "Daily KPI", "body": "Revenue +4.2%" }`
