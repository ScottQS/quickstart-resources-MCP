import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_REPORTING_API_BASE_URL = "https://jsonplaceholder.typicode.com";
const REPORTING_API_BASE_URL =
  process.env.REPORTING_API_BASE_URL ?? DEFAULT_REPORTING_API_BASE_URL;
const REPORTING_API_KEY = process.env.REPORTING_API_KEY;

type QueryParamValue = string | number | boolean;
type QueryParams = Record<string, QueryParamValue>;

function normalizeQueryParams(raw: unknown): QueryParams | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const query: QueryParams = {};
  for (const [key, value] of Object.entries(raw)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      query[key] = value;
    }
  }

  return query;
}

function normalizePayload(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  return raw as Record<string, unknown>;
}

function buildReportingApiUrl(endpoint: string, query?: QueryParams): URL {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    throw new Error(
      "Endpoint must be relative (for example: /posts or /reports/daily).",
    );
  }

  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = new URL(normalizedEndpoint, REPORTING_API_BASE_URL);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function formatApiBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }

  return JSON.stringify(body, null, 2);
}

async function makeReportingRequest(
  method: "GET" | "POST",
  endpoint: string,
  query?: QueryParams,
  payload?: Record<string, unknown>,
): Promise<string> {
  let url: URL;
  try {
    url = buildReportingApiUrl(endpoint, query);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown URL error";
    return `Unable to build reporting API URL: ${message}`;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "mcp-reporting-server/1.0",
  };

  if (REPORTING_API_KEY) {
    headers.Authorization = `Bearer ${REPORTING_API_KEY}`;
  }

  let body: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(payload ?? {});
  }

  try {
    const response = await fetch(url, { method, headers, body });
    const contentType = response.headers.get("content-type") ?? "";
    const responseBody: unknown = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    const formattedBody = formatApiBody(responseBody);

    if (!response.ok) {
      return [
        `Reporting API request failed (${response.status} ${response.statusText})`,
        `URL: ${url.toString()}`,
        "",
        "Response:",
        formattedBody,
      ].join("\n");
    }

    return [
      `Reporting API response (${response.status} ${response.statusText})`,
      `URL: ${url.toString()}`,
      "",
      "Body:",
      formattedBody,
    ].join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    return `Unable to call reporting API: ${message}`;
  }
}

const server = new McpServer({
  name: "reporting-api",
  version: "1.0.0",
});

server.registerTool(
  "get-report",
  {
    title: "Get Report",
    description: "Fetch reporting data from an online API endpoint using GET.",
    inputSchema: {
      endpoint: z
        .string()
        .min(1)
        .describe("Relative API endpoint path (example: /posts or /reports/daily)"),
      query: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe("Optional query parameters (key/value pairs)."),
    },
  },
  async ({ endpoint, query }) => ({
    content: [
      {
        type: "text",
        text: await makeReportingRequest(
          "GET",
          endpoint,
          normalizeQueryParams(query),
        ),
      },
    ],
  }),
);

server.registerTool(
  "create-report",
  {
    title: "Create Report",
    description: "Send reporting payload data to an online API endpoint using POST.",
    inputSchema: {
      endpoint: z
        .string()
        .min(1)
        .describe("Relative API endpoint path (example: /posts or /reports/run)"),
      payload: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Optional JSON payload sent in the request body."),
      query: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe("Optional query parameters (key/value pairs)."),
    },
  },
  async ({ endpoint, payload, query }) => ({
    content: [
      {
        type: "text",
        text: await makeReportingRequest(
          "POST",
          endpoint,
          normalizeQueryParams(query),
          normalizePayload(payload),
        ),
      },
    ],
  }),
);

server.registerTool(
  "reporting-api-config",
  {
    title: "Reporting API Config",
    description: "Show the active reporting API configuration used by this server.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: [
          "Reporting MCP server configuration:",
          `- Base URL: ${REPORTING_API_BASE_URL}`,
          `- Auth header enabled: ${REPORTING_API_KEY ? "yes" : "no"}`,
        ].join("\n"),
      },
    ],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Reporting MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
