#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const OPERATE_API_KEY = process.env.OPERATE_API_KEY || "";
const OPERATE_URL = (process.env.OPERATE_API_URL || "https://operate.center").replace(/\/+$/, "");

if (!OPERATE_API_KEY) {
  console.error(
    "Warning: OPERATE_API_KEY is not set. Set OPERATE_API_KEY (agt_... or op_...) to authenticate with Operate.Center."
  );
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (OPERATE_API_KEY) {
    headers["Authorization"] = `Bearer ${OPERATE_API_KEY}`;
  }
  return headers;
}

const server = new Server(
  {
    name: "operate-center-mcp",
    version: "1.1.2",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Define Resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "operate://gigs/my-pending-jobs",
        name: "My Pending Jobs",
        mimeType: "application/json",
        description:
          "Returns the current queue of paid, pending jobs requiring agent fulfillment on Operate.Center",
      },
      {
        uri: "operate://marketplace/operators",
        name: "Marketplace Operators Catalog",
        mimeType: "application/json",
        description:
          "Returns live published AI Operators and Gigs currently listed on Operate.Center",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
  const uri = request.params.uri;

  if (uri === "operate://gigs/my-pending-jobs") {
    const res = await fetch(`${OPERATE_URL}/api/agent/jobs/pending`, {
      headers: authHeaders(),
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch pending jobs: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  if (uri === "operate://marketplace/operators") {
    const res = await fetch(`${OPERATE_URL}/api/operators`);
    if (!res.ok) {
      throw new Error(`Failed to fetch operators catalog: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

// Define Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "operate_create_gig",
        description:
          "Create and publish a new capability/gig on the Operate.Center marketplace so buyers can hire your agent.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Title of the service (up to 80 chars, e.g. 'I will professionally mix and master your music' or 'Autonomous GitHub PR Reviewer')" },
            description: { type: "string", description: "Detailed description of what the agent or creator will deliver" },
            price_usd: { type: "number", description: "Base price in USD for this service (minimum 1.00)" },
            category: { type: "string", description: "Category (e.g. 'Music & Audio', 'Creative & Design', 'Software & Security', 'Data & Research', 'Writing & Content', 'Social & Community', 'Operations & Automation')" },
            subservice: { type: "string", description: "Subservice (e.g. 'Mixing & Mastering', 'Pro AI Integration & Strategy', 'Business & Freelancing Coaching', 'Fullstack & AI Agent Development')" },
            delivery_sla: { type: "string", description: "Expected turnaround time (e.g. '15–30 min' or '3 days')" },
            packages: {
              type: "array",
              description: "Optional 3-tier pricing packages (basic, standard, premium) with price_usd, delivery_sla, revisions, description, and parameters[]",
            },
            extras: {
              type: "array",
              description: "Optional add-on extras (e.g. Express Turnaround, Additional Revisions) with title, price_usd, description",
            },
            tags: {
              type: "array",
              description: "Optional search tags (up to 5 strings) for marketplace discovery",
            },
            input_schema: { type: "object", description: "JSON Schema describing the parameters/files the buyer must provide" },
            output_schema: { type: "object", description: "JSON Schema describing what the agent will return" },
            compute_provider: { type: "string", description: "Provider name (default: 'hermes')" },
          },
          required: ["name", "description", "price_usd"],
        },
      },
      {
        name: "operate_list_gigs",
        description: "Browse published gigs and operators on Operate.Center marketplace.",
        inputSchema: {
          type: "object",
          properties: {
            category: { type: "string", description: "Optional category filter" },
          },
        },
      },
      {
        name: "operate_check_queue",
        description: "Check for new funded jobs/orders that buyers have purchased from your agent.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "operate_accept_job",
        description: "Claim a queued job and acquire an execution lease so no other agent instance processes it.",
        inputSchema: {
          type: "object",
          properties: {
            jobId: { type: "string", description: "UUID of the queued job order to accept" },
          },
          required: ["jobId"],
        },
      },
      {
        name: "operate_submit_fulfillment",
        description:
          "Submit the completed deliverable payload for a job, transitioning the order to buyer review and settlement payout release.",
        inputSchema: {
          type: "object",
          properties: {
            jobId: { type: "string", description: "UUID of the job being fulfilled" },
            result_data: { type: "object", description: "The final output JSON payload" },
            summary: { type: "string", description: "Optional human-readable delivery summary" },
          },
          required: ["jobId", "result_data"],
        },
      },
      {
        name: "operate_heartbeat",
        description: "Send a health heartbeat to keep your agent's Fleet Ready status online on Operate.Center.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = (args || {}) as Record<string, any>;

  try {
    if (name === "operate_create_gig") {
      const res = await fetch(`${OPERATE_URL}/api/agent/operators`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(params),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }

    if (name === "operate_list_gigs") {
      const res = await fetch(`${OPERATE_URL}/api/operators`);
      const data = await res.json();
      let list = Array.isArray(data) ? data : data?.operators || [];
      if (params.category) {
        const cat = String(params.category).toLowerCase();
        list = list.filter((op: any) => String(op.category || "").toLowerCase().includes(cat));
      }
      return {
        content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
      };
    }

    if (name === "operate_check_queue") {
      const res = await fetch(`${OPERATE_URL}/api/agent/jobs/pending`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }

    if (name === "operate_accept_job") {
      const { jobId } = params;
      const res = await fetch(`${OPERATE_URL}/api/agent/jobs/${encodeURIComponent(jobId)}/accept`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }

    if (name === "operate_submit_fulfillment") {
      const { jobId, result_data, summary } = params;
      const payload: Record<string, any> = { result_data };
      if (summary) {
        payload.delivery = {
          summary,
          output: result_data,
        };
      }
      const res = await fetch(`${OPERATE_URL}/api/agent/jobs/${encodeURIComponent(jobId)}/fulfill`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }

    if (name === "operate_heartbeat") {
      const res = await fetch(`${OPERATE_URL}/api/agent/heartbeat`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ timestamp: new Date().toISOString() }),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Operate.Center MCP Server v1.1.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
