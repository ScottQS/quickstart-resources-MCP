# MCP QuickBooks Reporting Server (TypeScript)

An MCP server that exposes the **QuickBooks Online Reports API** as MCP tools.

## Tools

- `run-quickbooks-report`
  - Runs any QuickBooks report endpoint, for example `ProfitAndLoss` or `BalanceSheet`.
  - Accepts optional `query`, plus optional `realmId` and `accessToken` overrides.
- `get-profit-and-loss-report`
  - Convenience tool for `ProfitAndLoss` with common query args:
    `startDate`, `endDate`, `customer`, `summarizeColumnBy`, `accountingMethod`.
- `list-quickbooks-reports`
  - Returns a curated list of common QuickBooks report endpoint names.
- `quickbooks-reporting-config`
  - Returns active base URL and whether default realm/token are configured.

## Configuration

Set QuickBooks credentials through environment variables:

- `QUICKBOOKS_API_BASE_URL` (optional, default: `https://quickbooks.api.intuit.com`)
- `QUICKBOOKS_REALM_ID` (recommended)
- `QUICKBOOKS_ACCESS_TOKEN` (recommended OAuth Bearer token)

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

- `run-quickbooks-report` with:
  - `reportName`: `"ProfitAndLoss"`
  - `query`: `{ "start_date": "2025-01-01", "end_date": "2025-03-31", "summarize_column_by": "Customers" }`
- `get-profit-and-loss-report` with:
  - `startDate`: `"2025-01-01"`
  - `endDate`: `"2025-03-31"`
  - `accountingMethod`: `"Accrual"`
