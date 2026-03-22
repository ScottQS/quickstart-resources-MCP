import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_QUICKBOOKS_API_BASE_URL = "https://quickbooks.api.intuit.com";
const QUICKBOOKS_API_BASE_URL =
  process.env.QUICKBOOKS_API_BASE_URL ?? DEFAULT_QUICKBOOKS_API_BASE_URL;
const DEFAULT_REALM_ID = process.env.QUICKBOOKS_REALM_ID;
const DEFAULT_ACCESS_TOKEN = process.env.QUICKBOOKS_ACCESS_TOKEN;

type QueryParamValue = string | number | boolean;
type QueryParams = Record<string, QueryParamValue>;
type ScalarRecord = Record<string, unknown>;

const KNOWN_QUICKBOOKS_REPORTS = [
  "BalanceSheet",
  "ProfitAndLoss",
  "ProfitAndLossDetail",
  "TrialBalance",
  "CashFlow",
  "InventoryValuationSummary",
  "InventoryValuationDetail",
  "CustomerSales",
  "ItemSales",
  "DepartmentSales",
  "ClassSales",
  "CustomerIncome",
  "CustomerBalance",
  "CustomerBalanceDetail",
  "AgedReceivables",
  "AgedReceivableDetail",
  "VendorBalance",
  "VendorBalanceDetail",
  "AgedPayables",
  "AgedPayableDetail",
  "VendorExpenses",
  "AccountListDetail",
  "GeneralLedgerDetail",
  "TaxSummary",
] as const;

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

function normalizeScalarRecord(raw: unknown): ScalarRecord | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  return raw as ScalarRecord;
}

function addQueryParams(url: URL, query?: QueryParams): URL {
  if (!query) {
    return url;
  }

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }

  return url;
}

function buildQuickBooksReportUrl(
  realmId: string,
  reportName: string,
  query?: QueryParams,
): URL {
  const normalizedBase = QUICKBOOKS_API_BASE_URL.endsWith("/")
    ? QUICKBOOKS_API_BASE_URL
    : `${QUICKBOOKS_API_BASE_URL}/`;
  const endpoint = `v3/company/${encodeURIComponent(realmId)}/reports/${encodeURIComponent(
    reportName,
  )}`;
  const url = new URL(endpoint, normalizedBase);

  return addQueryParams(url, query);
}

function parseDateValue(value: QueryParamValue | undefined): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function buildDateRangeWarning(query?: QueryParams): string | null {
  if (!query) {
    return null;
  }

  const start = parseDateValue(query.start_date);
  const end = parseDateValue(query.end_date);
  if (!start || !end) {
    return null;
  }

  const msInDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((end.getTime() - start.getTime()) / msInDay);
  if (diffDays <= 183) {
    return null;
  }

  return [
    "Warning: date range is greater than six months.",
    "QuickBooks recommends limiting report requests to about six months.",
  ].join("\n");
}

function formatApiBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }

  return JSON.stringify(body, null, 2);
}

function formatQuickBooksErrorResponse(
  status: number,
  statusText: string,
  url: URL,
  body: string,
): string {
  return [
    `QuickBooks report request failed (${status} ${statusText})`,
    `URL: ${url.toString()}`,
    "",
    "Response:",
    body,
  ].join("\n");
}

async function runQuickBooksReportRequest(
  realmId: string,
  accessToken: string,
  reportName: string,
  query?: QueryParams,
): Promise<string> {
  const url = buildQuickBooksReportUrl(realmId, reportName, query);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "mcp-quickbooks-reporting-server/1.0",
    Authorization: `Bearer ${accessToken}`,
  };

  try {
    const response = await fetch(url, { method: "GET", headers });
    const contentType = response.headers.get("content-type") ?? "";
    const responseBody: unknown = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    const formattedBody = formatApiBody(responseBody);
    const warning = buildDateRangeWarning(query);

    if (!response.ok) {
      return formatQuickBooksErrorResponse(
        response.status,
        response.statusText,
        url,
        formattedBody,
      );
    }

    const output = [
      `QuickBooks report response (${response.status} ${response.statusText})`,
      `Report: ${reportName}`,
      `URL: ${url.toString()}`,
      "",
      "Body:",
      formattedBody,
    ];

    if (warning) {
      output.unshift("", warning);
    }

    return output.join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    return `Unable to call QuickBooks Reports API: ${message}`;
  }
}

function resolveQuickBooksCredentials(input: {
  realmId?: string;
  accessToken?: string;
}): { realmId: string; accessToken: string } | { error: string } {
  const realmId = input.realmId ?? DEFAULT_REALM_ID;
  const accessToken = input.accessToken ?? DEFAULT_ACCESS_TOKEN;

  if (!realmId) {
    return {
      error:
        "Missing realm ID. Set QUICKBOOKS_REALM_ID or pass realmId in the tool arguments.",
    };
  }

  if (!accessToken) {
    return {
      error:
        "Missing access token. Set QUICKBOOKS_ACCESS_TOKEN or pass accessToken in the tool arguments.",
    };
  }

  return { realmId, accessToken };
}

const server = new McpServer({
  name: "quickbooks-reporting-api",
  version: "1.0.0",
});

server.registerTool(
  "run-quickbooks-report",
  {
    title: "Run QuickBooks Report",
    description:
      "Run any QuickBooks Online report endpoint (Reports API) and return JSON.",
    inputSchema: {
      reportName: z
        .string()
        .min(1)
        .describe("QuickBooks report endpoint name, e.g. ProfitAndLoss"),
      query: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe(
          "Optional report query params (e.g. start_date, end_date, customer, summarize_column_by).",
        ),
      realmId: z
        .string()
        .min(1)
        .optional()
        .describe("QuickBooks company realm ID. Overrides QUICKBOOKS_REALM_ID."),
      accessToken: z
        .string()
        .min(1)
        .optional()
        .describe("OAuth bearer token. Overrides QUICKBOOKS_ACCESS_TOKEN."),
    },
  },
  async ({ reportName, query, realmId, accessToken }) => {
    const credentials = resolveQuickBooksCredentials({
      realmId,
      accessToken,
    });

    if ("error" in credentials) {
      return {
        content: [
          {
            type: "text",
            text: credentials.error,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: await runQuickBooksReportRequest(
            credentials.realmId,
            credentials.accessToken,
            reportName,
            normalizeQueryParams(query),
          ),
        },
      ],
    };
  },
);

server.registerTool(
  "get-profit-and-loss-report",
  {
    title: "Get Profit and Loss Report",
    description:
      "Run QuickBooks ProfitAndLoss report with the most common query parameters.",
    inputSchema: {
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("start_date in yyyy-mm-dd format"),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("end_date in yyyy-mm-dd format"),
      customer: z.string().optional().describe("Optional customer id filter"),
      summarizeColumnBy: z
        .string()
        .optional()
        .describe("Optional summarize_column_by value (for example: Customers)"),
      accountingMethod: z
        .enum(["Cash", "Accrual"])
        .optional()
        .describe("Optional accounting_method value."),
      realmId: z
        .string()
        .min(1)
        .optional()
        .describe("QuickBooks company realm ID. Overrides QUICKBOOKS_REALM_ID."),
      accessToken: z
        .string()
        .min(1)
        .optional()
        .describe("OAuth bearer token. Overrides QUICKBOOKS_ACCESS_TOKEN."),
      extraQuery: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe("Any additional query parameters to include."),
    },
  },
  async ({
    startDate,
    endDate,
    customer,
    summarizeColumnBy,
    accountingMethod,
    realmId,
    accessToken,
    extraQuery,
  }) => {
    const credentials = resolveQuickBooksCredentials({
      realmId,
      accessToken,
    });

    if ("error" in credentials) {
      return {
        content: [
          {
            type: "text",
            text: credentials.error,
          },
        ],
      };
    }

    const query: QueryParams = {
      ...(normalizeQueryParams(normalizeScalarRecord(extraQuery)) ?? {}),
    };
    if (startDate) {
      query.start_date = startDate;
    }
    if (endDate) {
      query.end_date = endDate;
    }
    if (customer) {
      query.customer = customer;
    }
    if (summarizeColumnBy) {
      query.summarize_column_by = summarizeColumnBy;
    }
    if (accountingMethod) {
      query.accounting_method = accountingMethod;
    }

    return {
      content: [
        {
          type: "text",
          text: await runQuickBooksReportRequest(
            credentials.realmId,
            credentials.accessToken,
            "ProfitAndLoss",
            query,
          ),
        },
      ],
    };
  },
);

server.registerTool(
  "list-quickbooks-reports",
  {
    title: "List QuickBooks Report Endpoints",
    description:
      "Return a curated list of common QuickBooks Online Reports API endpoint names.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: [
          "Common QuickBooks Online report endpoints:",
          ...KNOWN_QUICKBOOKS_REPORTS.map((name) => `- ${name}`),
        ].join("\n"),
      },
    ],
  }),
);

server.registerTool(
  "quickbooks-reporting-config",
  {
    title: "QuickBooks Reporting Config",
    description: "Show active QuickBooks reporting API configuration.",
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: "text",
        text: [
          "QuickBooks reporting MCP server configuration:",
          `- Base URL: ${QUICKBOOKS_API_BASE_URL}`,
          `- Default realm configured: ${DEFAULT_REALM_ID ? "yes" : "no"}`,
          `- Default access token configured: ${DEFAULT_ACCESS_TOKEN ? "yes" : "no"}`,
        ].join("\n"),
      },
    ],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("QuickBooks Reporting MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
