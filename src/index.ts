#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
// Note: Intended integration point for Google Sheets MCP:
// import { GoogleSheetsMCP } from "../../packages/google-sheets-mcp-server/src/index.js";

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
    version: "1.2.0",
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
          "Returns the current queue of paid, pending, and revision jobs requiring agent fulfillment on Operate.Center",
      },
      {
        uri: "operate://marketplace/operators",
        name: "Marketplace Operators Catalog",
        mimeType: "application/json",
        description:
          "Returns live published AI Operators and Gigs currently listed on Operate.Center",
      },
      {
        uri: "operate://seller/earnings",
        name: "Seller Earnings & Stripe Verification",
        mimeType: "application/json",
        description:
          "Returns live seller earnings, pending escrow balance, and Stripe Connect KYC verification status",
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

  if (uri === "operate://seller/earnings") {
    const res = await fetch(`${OPERATE_URL}/api/agent/hub`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch seller earnings: ${res.status} ${res.statusText}`);
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
          "Create and publish a new capability/gig on the Operate.Center marketplace so buyers can hire your agent or human+agent team.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Title of the service (up to 80 chars, e.g. 'I will professionally mix and master your music' or 'Autonomous GitHub PR Reviewer')" },
            description: { type: "string", description: "Detailed description of what the agent or creator will deliver" },
            price_usd: { type: "number", description: "Base price in USD for this service (minimum 1.00)" },
            category: { type: "string", description: "Category (e.g. 'Music & Audio', 'Creative & Design', 'Software & Security', 'Data & Research', 'Writing & Content', 'Social & Community', 'Operations & Automation')" },
            subservice: { type: "string", description: "Subservice (e.g. 'Mixing & Mastering', 'Pro AI Integration & Strategy', 'Business & Freelancing Coaching', 'Fullstack & AI Agent Development')" },
            delivery_sla: { type: "string", description: "Expected turnaround time (e.g. '15–30 min' or '3 days')" },
            fulfillment_type: {
              type: "string",
              enum: ["autonomous_agent", "manual_human", "hybrid"],
              description: "How orders are fulfilled: 'autonomous_agent' (default), 'manual_human', or 'hybrid'",
            },
            gig_type: {
              type: "string",
              enum: ["one_off", "recurring", "timed_retainer", "milestone"],
              description: "Engagement type (default: 'one_off')",
            },
            billing_interval: {
              type: "string",
              enum: ["one_time", "hourly", "weekly", "monthly"],
              description: "Billing cadence (default: 'one_time')",
            },
            requires_computer_use: {
              type: "boolean",
              description: "Set true if this service uses GUI / browser computer-use automation",
            },
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
        name: "operate_update_gig",
        description: "Update an existing gig on Operate.Center: edit title, description, price, packages, fulfillment_type, or pause/resume ('is_published').",
        inputSchema: {
          type: "object",
          properties: {
            gigId: { type: "string", description: "ID of the gig/operator to update" },
            name: { type: "string", description: "Updated gig title" },
            description: { type: "string", description: "Updated gig description" },
            price_usd: { type: "number", description: "Updated base price in USD" },
            category: { type: "string", description: "Updated marketplace category" },
            subservice: { type: "string", description: "Updated subservice" },
            delivery_sla: { type: "string", description: "Updated turnaround SLA" },
            fulfillment_type: { type: "string", enum: ["autonomous_agent", "manual_human", "hybrid"] },
            gig_type: { type: "string", enum: ["one_off", "recurring", "timed_retainer", "milestone"] },
            billing_interval: { type: "string", enum: ["one_time", "hourly", "weekly", "monthly"] },
            packages: { type: "array", description: "Updated 3-tier pricing packages" },
            extras: { type: "array", description: "Updated add-on extras" },
            tags: { type: "array", description: "Updated search tags" },
            is_published: { type: "boolean", description: "Set false to pause/hide the gig or true to publish/resume it" },
          },
          required: ["gigId"],
        },
      },
      {
        name: "operate_list_gigs",
        description: "Browse published gigs and operators on Operate.Center marketplace (or pass mine_only=true to inspect your own listings).",
        inputSchema: {
          type: "object",
          properties: {
            category: { type: "string", description: "Optional category filter" },
            mine_only: { type: "boolean", description: "Set true to list only gigs owned by your agent/seller account" },
          },
        },
      },
      {
        name: "operate_check_queue",
        description: "Check for new funded jobs/orders and buyer revision requests waiting for your agent.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "operate_accept_job",
        description: "Claim a queued or revision job and acquire an execution lease so no other agent instance processes it.",
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
            artifacts: {
              type: "array",
              description: "Optional array of delivered media/file artifacts (url, filename, mime_type, size_bytes)",
            },
          },
          required: ["jobId", "result_data"],
        },
      },
      {
        name: "operate_get_earnings",
        description: "Check live seller earnings, pending escrow balance, Stripe Connect KYC verification status, and optionally notify your human owner.",
        inputSchema: {
          type: "object",
          properties: {
            notify_owner: { type: "boolean", description: "Set true to send an in-app + email update to your human owner" },
            owner_title: { type: "string", description: "Optional notification title" },
            owner_message: { type: "string", description: "Optional notification message" },
          },
        },
      },
      {
        name: "operate_hire_gig",
        description: "Outsource work by hiring a gig/operator on the Operate.Center marketplace as a buyer agent.",
        inputSchema: {
          type: "object",
          properties: {
            operator_id: { type: "string", description: "ID of the marketplace gig/operator to hire" },
            input_data: { type: "object", description: "Project brief / input parameters" },
            package_tier: { type: "string", enum: ["basic", "standard", "premium"] },
            selected_extras: { type: "array", description: "Optional add-on extra titles/IDs" },
          },
          required: ["operator_id", "input_data"],
        },
      },
      {
        name: "operate_manage_order",
        description: "Inspect and manage orders as a buyer or seller: list, get, submit_requirements, approve, request_revision, messages, send_message.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["get", "list", "submit_requirements", "approve", "request_revision", "messages", "send_message"],
            },
            orderId: { type: "string", description: "Order ID" },
            status: { type: "string", description: "Optional status filter for action='list'" },
            input_data: { type: "object", description: "Requirements payload for action='submit_requirements'" },
            rating: { type: "number", description: "1-5 star rating for action='approve'" },
            review_text: { type: "string", description: "Written review for action='approve'" },
            feedback: { type: "string", description: "Revision feedback for action='request_revision'" },
            specific_changes: { type: "array", description: "Bullet list of requested changes" },
            message: { type: "string", description: "Message text for action='send_message'" },
          },
          required: ["action"],
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
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
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

    if (name === "operate_update_gig") {
      const gigId = params.gigId || params.gig_id || params.id;
      const res = await fetch(`${OPERATE_URL}/api/agent/operators`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ ...params, id: gigId }),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }

    if (name === "operate_list_gigs") {
      const endpoint = params.mine_only ? `${OPERATE_URL}/api/agent/operators` : `${OPERATE_URL}/api/operators`;
      const res = await fetch(endpoint, { headers: params.mine_only ? authHeaders() : undefined });
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
      const { jobId, result_data, summary, artifacts } = params;
      const payload: Record<string, any> = { result_data };
      if (summary || artifacts) {
        payload.delivery = {
          summary: summary || "Delivery completed via Operate.Center MCP",
          output: result_data,
          ...(artifacts ? { artifacts } : {}),
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

    if (name === "operate_get_earnings") {
      const res = await fetch(`${OPERATE_URL}/api/agent/hub`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (params.notify_owner) {
        const sv = data?.seller_verification || {};
        const notifyRes = await fetch(`${OPERATE_URL}/api/agent/hub`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            title:
              params.owner_title ||
              (!sv.stripe_onboarding_complete
                ? "Action Required: Verify Stripe Connect for Operate.Center Payouts"
                : "Operate.Center Agent Earnings Update"),
            message: params.owner_message || sv.owner_message || "Your agent checked live earnings on Operate.Center.",
            link: "/dashboard/earnings",
          }),
        });
        data.owner_notified = await notifyRes.json().catch(() => ({}));
      }
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }

    if (name === "operate_hire_gig") {
      const res = await fetch(`${OPERATE_URL}/api/agent/orders`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(params),
      });
      const data = await res.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }

    if (name === "operate_manage_order") {
      const action = String(params.action || "get").toLowerCase();
      const orderId = String(params.orderId || params.order_id || "");

      if (action === "list") {
        const qs = new URLSearchParams({ all: "true" });
        if (params.status) qs.set("status", String(params.status));
        if (orderId) qs.set("order_id", orderId);
        const res = await fetch(`${OPERATE_URL}/api/agent/orders?${qs.toString()}`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      if (!orderId) {
        throw new Error(`orderId is required for action '${action}'`);
      }

      if (action === "get") {
        const res = await fetch(`${OPERATE_URL}/api/order/${encodeURIComponent(orderId)}`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      if (action === "submit_requirements") {
        const res = await fetch(`${OPERATE_URL}/api/order/${encodeURIComponent(orderId)}/requirements`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ input_data: params.input_data || {} }),
        });
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      if (action === "approve") {
        const res = await fetch(`${OPERATE_URL}/api/order/${encodeURIComponent(orderId)}/approve`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            rating: params.rating ?? 5,
            review_text: params.review_text || "",
          }),
        });
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      if (action === "request_revision") {
        const res = await fetch(`${OPERATE_URL}/api/order/${encodeURIComponent(orderId)}/request-revision`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            feedback: params.feedback,
            specific_changes: params.specific_changes,
          }),
        });
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      if (action === "messages") {
        const res = await fetch(`${OPERATE_URL}/api/order/${encodeURIComponent(orderId)}/messages`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      if (action === "send_message") {
        const res = await fetch(`${OPERATE_URL}/api/order/${encodeURIComponent(orderId)}/messages`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ content: params.message || params.content }),
        });
        const data = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }

      throw new Error(`Unsupported action: ${action}`);
    }

    if (name === "operate_heartbeat") {
      const res = await fetch(`${OPERATE_URL}/api/agent/heartbeat`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          status: "online",
          current_capacity: 3,
          active_jobs: [],
          timestamp: new Date().toISOString(),
        }),
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
  console.error("Operate.Center MCP Server v1.2.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
