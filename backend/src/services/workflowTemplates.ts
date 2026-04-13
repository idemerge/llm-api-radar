import * as fs from 'fs';
import * as path from 'path';

// Load built-in test image (workflow screenshot) for vision benchmark
function loadBuiltinImage(): { type: 'base64'; mediaType: string; data: string } | null {
  try {
    const imgPath = path.resolve(__dirname, '../../../docs/screenshots/screenshot-workflow.png');
    const buf = fs.readFileSync(imgPath);
    return { type: 'base64', mediaType: 'image/png', data: buf.toString('base64') };
  } catch {
    return null;
  }
}

const builtinImage = loadBuiltinImage();

export interface WorkflowTemplate {
  name: string;
  description: string;
  tasks: Array<{
    name: string;
    description?: string;
    config: {
      prompt: string;
      systemPrompt?: string;
      maxTokens: number;
      concurrency: number;
      iterations: number;
      streaming?: boolean;
      warmupRuns?: number;
      requestInterval?: number;
      randomizeInterval?: boolean;
      images?: Array<{ type: 'url' | 'base64'; url?: string; mediaType?: string; data?: string }>;
    };
    tags?: Record<string, string>;
  }>;
  options: {
    stopOnFailure: boolean;
    cooldownBetweenTasks: number;
  };
}

export const workflowTemplates: WorkflowTemplate[] = [
  // ────────────────────────────────────────────────
  // 0. Quick Benchmark
  // ────────────────────────────────────────────────
  {
    name: 'Quick Benchmark',
    description:
      'Single-task benchmark — pick providers, set a prompt, and run. The fastest way to compare LLM performance.',
    tasks: [
      {
        name: 'Benchmark',
        config: {
          prompt: 'Explain quantum computing in simple terms that a 10-year-old could understand.',
          maxTokens: 4096,
          concurrency: 3,
          iterations: 5,
          streaming: true,
          warmupRuns: 0,
        },
      },
    ],
    options: { stopOnFailure: true, cooldownBetweenTasks: 0 },
  },

  // ────────────────────────────────────────────────
  // 1. Latency Profile
  // ────────────────────────────────────────────────
  {
    name: 'Latency Profile',
    description: 'Measure TTFT, TPOT, and full response latency across providers with progressively longer prompts',
    tasks: [
      {
        name: 'Short Prompt (TTFT Baseline)',
        description: 'Minimal input to measure pure first-token latency',
        config: {
          prompt: 'What is 2+2?',
          maxTokens: 50,
          concurrency: 1,
          iterations: 20,
          streaming: true,
          warmupRuns: 0,
        },
        tags: { phase: 'short', metric: 'ttft' },
      },
      {
        name: 'Medium Prompt (Balanced)',
        description: 'Typical API call length to measure balanced latency',
        config: {
          prompt:
            'Explain how a hash table works, including collision resolution strategies like chaining and open addressing. Provide time complexity for each operation.',
          maxTokens: 500,
          concurrency: 1,
          iterations: 15,
          streaming: true,
          warmupRuns: 0,
        },
        tags: { phase: 'medium', metric: 'balanced' },
      },
      {
        name: 'Long Prompt (Generation-bound)',
        description: 'Long output request to measure sustained generation speed',
        config: {
          prompt:
            'Write a detailed technical design document for a distributed rate limiter service. Include architecture diagram description, algorithm choice (token bucket vs sliding window), data storage, failure modes, and scaling strategy.',
          maxTokens: 2000,
          concurrency: 1,
          iterations: 10,
          streaming: true,
          warmupRuns: 0,
        },
        tags: { phase: 'long', metric: 'tpot' },
      },
      {
        name: 'System Prompt Impact',
        description: 'Heavy system prompt to measure its impact on TTFT',
        config: {
          prompt: 'Summarize this approach in 3 bullet points.',
          systemPrompt:
            'You are a senior software architect reviewing technical proposals. Always respond with numbered bullet points. Use precise technical language. Flag any risks or trade-offs. Consider scalability, maintainability, and cost implications.',
          maxTokens: 300,
          concurrency: 1,
          iterations: 15,
          streaming: true,
          warmupRuns: 0,
        },
        tags: { phase: 'sysprompt', metric: 'overhead' },
      },
    ],
    options: { stopOnFailure: false, cooldownBetweenTasks: 3000 },
  },

  // ────────────────────────────────────────────────
  // 2. Concurrency Ladder
  // ────────────────────────────────────────────────
  {
    name: 'Concurrency Ladder',
    description: 'Ramp concurrency 1→5→10→25→50 to find the performance inflection point',
    tasks: [
      {
        name: '1 Concurrent',
        description: 'Baseline — no contention',
        config: {
          prompt: 'Write a Python function that performs binary search on a sorted list.',
          concurrency: 1,
          iterations: 20,
          maxTokens: 200,
          streaming: true,
          warmupRuns: 0,
        },
        tags: { concurrency: '1' },
      },
      {
        name: '5 Concurrent',
        description: 'Light load',
        config: {
          prompt: 'Write a Python function that performs binary search on a sorted list.',
          concurrency: 5,
          iterations: 20,
          maxTokens: 200,
          streaming: true,
        },
        tags: { concurrency: '5' },
      },
      {
        name: '10 Concurrent',
        description: 'Moderate load',
        config: {
          prompt: 'Write a Python function that performs binary search on a sorted list.',
          concurrency: 10,
          iterations: 20,
          maxTokens: 200,
          streaming: true,
        },
        tags: { concurrency: '10' },
      },
      {
        name: '25 Concurrent',
        description: 'Heavy load',
        config: {
          prompt: 'Write a Python function that performs binary search on a sorted list.',
          concurrency: 25,
          iterations: 20,
          maxTokens: 200,
          streaming: true,
        },
        tags: { concurrency: '25' },
      },
      {
        name: '50 Concurrent',
        description: 'Stress — find the breaking point',
        config: {
          prompt: 'Write a Python function that performs binary search on a sorted list.',
          concurrency: 50,
          iterations: 20,
          maxTokens: 200,
          streaming: true,
        },
        tags: { concurrency: '50' },
      },
    ],
    options: { stopOnFailure: false, cooldownBetweenTasks: 5000 },
  },

  // ────────────────────────────────────────────────
  // 3. Streaming vs Batch
  // ────────────────────────────────────────────────
  {
    name: 'Streaming vs Batch',
    description: 'Side-by-side comparison of streaming and non-streaming latency',
    tasks: [
      {
        name: 'Streaming Mode',
        description: 'Server-sent events for real-time output',
        config: {
          prompt:
            'Design a REST API for a task management application with CRUD operations, authentication, and rate limiting. Include endpoint definitions, request/response schemas, and error handling.',
          streaming: true,
          concurrency: 5,
          iterations: 20,
          maxTokens: 800,
          warmupRuns: 0,
        },
        tags: { mode: 'streaming' },
      },
      {
        name: 'Non-Streaming Mode',
        description: 'Traditional request-response (full payload)',
        config: {
          prompt:
            'Design a REST API for a task management application with CRUD operations, authentication, and rate limiting. Include endpoint definitions, request/response schemas, and error handling.',
          streaming: false,
          concurrency: 5,
          iterations: 20,
          maxTokens: 800,
          warmupRuns: 0,
        },
        tags: { mode: 'batch' },
      },
    ],
    options: { stopOnFailure: true, cooldownBetweenTasks: 3000 },
  },

  // ────────────────────────────────────────────────
  // 4. Token Length Gradient
  // ────────────────────────────────────────────────
  {
    name: 'Token Length Gradient',
    description: 'Measure throughput at 100/500/2000/8000 token output lengths',
    tasks: [
      {
        name: '100 Tokens',
        description: 'Brief output — measure bare generation speed',
        config: {
          prompt: 'Define artificial intelligence in one paragraph.',
          maxTokens: 100,
          concurrency: 3,
          iterations: 15,
          streaming: true,
          warmupRuns: 0,
        },
        tags: { tokens: '100' },
      },
      {
        name: '500 Tokens',
        description: 'Medium output — typical chatbot response',
        config: {
          prompt:
            'Explain how Docker container networking works, including bridge, host, and overlay networks. Include practical examples of when to use each.',
          maxTokens: 500,
          concurrency: 3,
          iterations: 15,
          streaming: true,
        },
        tags: { tokens: '500' },
      },
      {
        name: '2000 Tokens',
        description: 'Long output — documentation or report',
        config: {
          prompt:
            'Write a complete getting-started guide for Kubernetes including pod management, service discovery, deployment strategies, and monitoring setup. Include code examples.',
          maxTokens: 2000,
          concurrency: 3,
          iterations: 10,
          streaming: true,
        },
        tags: { tokens: '2000' },
      },
      {
        name: '8000 Tokens',
        description: 'Very long output — stress test sustained generation',
        config: {
          prompt:
            'Write a comprehensive systems design document for a real-time collaborative text editor (like Google Docs). Cover operational transformation vs CRDT, conflict resolution, presence indicators, version history, offline support, and scaling to millions of concurrent users.',
          maxTokens: 8000,
          concurrency: 1,
          iterations: 5,
          streaming: true,
        },
        tags: { tokens: '8000' },
      },
    ],
    options: { stopOnFailure: false, cooldownBetweenTasks: 3000 },
  },

  // ────────────────────────────────────────────────
  // 5. Provider Showdown
  // ────────────────────────────────────────────────
  {
    name: 'Provider Showdown',
    description: 'Multi-dimensional comparison: knowledge, code, creativity, analysis, long context, and JSON',
    tasks: [
      {
        name: 'Knowledge Q&A',
        description: 'Factual accuracy and depth',
        config: {
          prompt:
            'Explain the CAP theorem in distributed systems. Give a real-world example of each trade-off decision (CP vs AP) with specific database systems.',
          maxTokens: 500,
          concurrency: 3,
          iterations: 10,
          streaming: true,
          warmupRuns: 0,
        },
        tags: { category: 'knowledge' },
      },
      {
        name: 'Code Generation',
        description: 'Production-quality code output',
        config: {
          prompt:
            'Write a production-ready Go HTTP middleware that implements rate limiting using a sliding window counter algorithm with Redis as the backing store. Include proper error handling, context cancellation support, and configuration.',
          maxTokens: 1000,
          concurrency: 3,
          iterations: 10,
          streaming: true,
        },
        tags: { category: 'code' },
      },
      {
        name: 'Creative Writing',
        description: 'Narrative coherence and style',
        config: {
          prompt:
            'Write a 400-word flash fiction story about a debugger that discovers its own source code contains a message from its creator. The tone should shift from technical to philosophical.',
          maxTokens: 600,
          concurrency: 3,
          iterations: 10,
          streaming: true,
        },
        tags: { category: 'creative' },
      },
      {
        name: 'Technical Analysis',
        description: 'Structured reasoning and depth',
        config: {
          prompt:
            'Analyze the trade-offs between using gRPC vs REST for microservice communication. Consider performance, developer experience, ecosystem support, streaming capabilities, and operational complexity. Provide a recommendation framework.',
          maxTokens: 800,
          concurrency: 3,
          iterations: 10,
          streaming: true,
        },
        tags: { category: 'analysis' },
      },
      {
        name: 'Long Context Reasoning',
        description: 'Information synthesis over large inputs',
        config: {
          prompt:
            'Review the following three database migration strategies: 1) Big bang migration, 2) Dual-write pattern, 3) Event-driven migration. For each strategy, describe the implementation approach, rollback plan, data consistency guarantees, and estimated downtime. Recommend which to use for migrating a 50TB PostgreSQL database to a new schema with zero downtime.',
          maxTokens: 1500,
          concurrency: 2,
          iterations: 5,
          streaming: true,
        },
        tags: { category: 'long-context' },
      },
      {
        name: 'JSON / Structured Output',
        description: 'Schema compliance and formatting precision',
        config: {
          prompt:
            'Generate a JSON object representing a CI/CD pipeline configuration with the following fields: name (string), stages (array of objects with name, steps, and timeout), triggers (array of branch patterns), and notifications (object with slack and email configs). Output valid JSON only.',
          systemPrompt:
            'You are a DevOps configuration generator. Always respond with valid JSON. No markdown fences, no explanations — pure JSON output only.',
          maxTokens: 500,
          concurrency: 3,
          iterations: 10,
          streaming: true,
        },
        tags: { category: 'json' },
      },
    ],
    options: { stopOnFailure: false, cooldownBetweenTasks: 2000 },
  },

  // ────────────────────────────────────────────────
  // 6. Cost Efficiency Audit
  // ────────────────────────────────────────────────
  {
    name: 'Cost Efficiency Audit',
    description: 'Compare throughput-per-dollar across short, medium, and heavy workloads',
    tasks: [
      {
        name: 'Minimal Tier (50t)',
        description: 'Tiny responses — measure baseline cost per request',
        config: {
          prompt: 'What is the capital of France? Answer in one word.',
          concurrency: 5,
          iterations: 30,
          maxTokens: 50,
          streaming: true,
          warmupRuns: 0,
        },
        tags: { cost_tier: 'minimal' },
      },
      {
        name: 'Standard Tier (300t)',
        description: 'Typical production workload size',
        config: {
          prompt:
            'Explain how Kubernetes handles pod scheduling including node affinity, taints/tolerations, and resource limits. Provide 3 paragraphs.',
          concurrency: 5,
          iterations: 20,
          maxTokens: 300,
          streaming: true,
        },
        tags: { cost_tier: 'standard' },
      },
      {
        name: 'Heavy Tier (2000t)',
        description: 'Large outputs — measure cost efficiency at scale',
        config: {
          prompt:
            'Write a complete Terraform module for deploying a production-grade AWS EKS cluster with VPC, subnets, node groups, IAM roles, security groups, and a Helm release for monitoring. Include all necessary variables, outputs, and comments explaining each resource.',
          concurrency: 2,
          iterations: 10,
          maxTokens: 2000,
          streaming: true,
        },
        tags: { cost_tier: 'heavy' },
      },
    ],
    options: { stopOnFailure: false, cooldownBetweenTasks: 3000 },
  },

  // ────────────────────────────────────────────────
  // 7. API Reliability Test
  // ────────────────────────────────────────────────
  {
    name: 'API Reliability Test',
    description: 'High concurrency + high iterations to measure timeout rate, error rate, and retry behavior',
    tasks: [
      {
        name: 'Moderate Stress (10c × 50i)',
        description: 'Sustained moderate load to find steady-state error rate',
        config: {
          prompt:
            'Parse this log line and return severity, timestamp, and message as JSON: "2024-03-15T14:23:45.123Z ERROR [auth-service] Failed to validate token: expired"',
          concurrency: 10,
          iterations: 50,
          maxTokens: 100,
          streaming: true,
          warmupRuns: 0,
        },
        tags: { phase: 'moderate' },
      },
      {
        name: 'Heavy Stress (25c × 40i)',
        description: 'High concurrency to trigger rate limits',
        config: {
          prompt: 'Generate a unique 16-character alphanumeric session token and return it as JSON: {"token": "..."}',
          concurrency: 25,
          iterations: 40,
          maxTokens: 50,
          streaming: false,
        },
        tags: { phase: 'heavy' },
      },
      {
        name: 'Burst Stress (50c × 30i)',
        description: 'Maximum load to measure degradation and recovery',
        config: {
          prompt: 'Return the current response code 200 as JSON.',
          concurrency: 50,
          iterations: 30,
          maxTokens: 20,
          streaming: false,
          requestInterval: 50,
        },
        tags: { phase: 'burst' },
      },
    ],
    options: { stopOnFailure: false, cooldownBetweenTasks: 5000 },
  },

  // ────────────────────────────────────────────────
  // 8. Real-World Simulation
  // ────────────────────────────────────────────────
  {
    name: 'Real-World Simulation',
    description: 'Mixed prompt types with randomized intervals to simulate actual user traffic',
    tasks: [
      {
        name: 'Quick Q&A Burst',
        description: 'Short, rapid-fire questions simulating a chat interface',
        config: {
          prompt: 'What are the top 3 benefits of using TypeScript over JavaScript?',
          maxTokens: 200,
          concurrency: 8,
          iterations: 25,
          streaming: true,
          warmupRuns: 0,
          requestInterval: 200,
          randomizeInterval: true,
        },
        tags: { type: 'qa', behavior: 'burst' },
      },
      {
        name: 'Code Review Request',
        description: 'Simulated code review with medium-length response',
        config: {
          prompt:
            'Review this function for bugs, performance issues, and style: def get_user(id): user = db.query("SELECT * FROM users WHERE id=" + id); return user',
          maxTokens: 500,
          concurrency: 5,
          iterations: 15,
          streaming: true,
          requestInterval: 500,
          randomizeInterval: true,
        },
        tags: { type: 'code-review', behavior: 'moderate' },
      },
      {
        name: 'Document Generation',
        description: 'Long-form output simulating report generation',
        config: {
          prompt:
            'Generate a project post-mortem report for a failed database migration. Include executive summary, timeline, root cause analysis, lessons learned, and action items.',
          maxTokens: 1500,
          concurrency: 2,
          iterations: 8,
          streaming: true,
          requestInterval: 1000,
          randomizeInterval: true,
        },
        tags: { type: 'document', behavior: 'slow' },
      },
      {
        name: 'API Schema Generation',
        description: 'Structured output simulating schema definition tasks',
        config: {
          prompt:
            'Generate an OpenAPI 3.0 specification for a blog platform with endpoints for posts, comments, authors, and categories. Include request/response schemas and error responses.',
          maxTokens: 1000,
          concurrency: 3,
          iterations: 10,
          streaming: true,
          requestInterval: 800,
          randomizeInterval: true,
        },
        tags: { type: 'schema', behavior: 'moderate' },
      },
    ],
    options: { stopOnFailure: false, cooldownBetweenTasks: 3000 },
  },

  // ────────────────────────────────────────────────
  // 9. Tool Calling & Structured Output
  // ────────────────────────────────────────────────
  {
    name: 'Tool Calling & Structured Output',
    description: 'Test function calling, JSON schema compliance, and structured output capabilities across providers',
    tasks: [
      {
        name: 'Weather API Call',
        description: 'Simulate a function call to a weather API',
        config: {
          prompt:
            'I need to know the current weather in Tokyo and New York. Call the get_weather function for both cities.',
          systemPrompt:
            'You have access to a function: get_weather(city: string, unit: "celsius"|"fahrenheit"). When the user asks about weather, respond with a JSON array of function calls: [{"function": "get_weather", "arguments": {...}}]. No other text.',
          maxTokens: 200,
          concurrency: 3,
          iterations: 15,
          streaming: true,
          warmupRuns: 0,
        },
        tags: { type: 'tool-call', domain: 'weather' },
      },
      {
        name: 'Database Query Builder',
        description: 'Convert natural language to SQL via function call',
        config: {
          prompt:
            'Find all users who signed up in the last 30 days and have placed at least 2 orders with a total value over $500.',
          systemPrompt:
            'You are a SQL query builder. Convert the user request into a function call: execute_query(sql: string, database: string). Respond with JSON: {"function": "execute_query", "arguments": {"sql": "...", "database": "..."}}. No other text.',
          maxTokens: 300,
          concurrency: 3,
          iterations: 15,
          streaming: true,
        },
        tags: { type: 'tool-call', domain: 'database' },
      },
      {
        name: 'Email Parser',
        description: 'Extract structured data from unstructured email text',
        config: {
          prompt:
            'Parse this email: "From: john.doe@acme.com\nTo: support@saas.io\nSubject: Urgent: Server down since 3am\nHi team, Production server web-03 has been unresponsive since 3:00 AM EST. CPU was at 98% before it stopped responding. Please escalate immediately. — John, DevOps Lead"',
          systemPrompt:
            'Extract structured data from emails. Always respond with valid JSON: {"sender": {"email": "", "name": ""}, "recipient": {"email": ""}, "subject": "", "priority": "low"|"medium"|"high"|"critical", "category": "", "summary": "", "action_items": [], "mentioned_systems": []}. No markdown, no explanations.',
          maxTokens: 300,
          concurrency: 3,
          iterations: 15,
          streaming: true,
        },
        tags: { type: 'structured-output', domain: 'email' },
      },
      {
        name: 'API Response Schema',
        description: 'Generate conformant JSON schema from requirements',
        config: {
          prompt:
            'Create a product listing API response that includes 2 products, each with id, name, price, inventory count, categories (array), and a nested availability object with inStock boolean and restockDate.',
          systemPrompt:
            'You are an API mock data generator. Always respond with valid JSON matching the requested schema. No markdown fences, no commentary — pure JSON only.',
          maxTokens: 400,
          concurrency: 3,
          iterations: 15,
          streaming: true,
        },
        tags: { type: 'structured-output', domain: 'api' },
      },
    ],
    options: { stopOnFailure: false, cooldownBetweenTasks: 2000 },
  },

  // ────────────────────────────────────────────────
  // 10. Vision Benchmark
  // ────────────────────────────────────────────────
  {
    name: 'Vision Benchmark',
    description:
      'Test vision/image understanding capabilities — models receive a screenshot and must describe its content',
    tasks: [
      {
        name: 'Image Description',
        description: 'Describe the contents of the provided screenshot',
        config: {
          prompt:
            'Describe the user interface shown in this screenshot in detail. What are the main sections, components, and features visible?',
          maxTokens: 500,
          concurrency: 3,
          iterations: 10,
          streaming: true,
          warmupRuns: 0,
          images: builtinImage ? [builtinImage] : undefined,
        },
        tags: { type: 'vision', task: 'description' },
      },
      {
        name: 'OCR / Text Extraction',
        description: 'Extract all visible text from the screenshot',
        config: {
          prompt:
            'Extract all visible text and labels from this screenshot. List them in the order they appear, organized by section.',
          maxTokens: 300,
          concurrency: 3,
          iterations: 10,
          streaming: true,
          images: builtinImage ? [builtinImage] : undefined,
        },
        tags: { type: 'vision', task: 'ocr' },
      },
      {
        name: 'UI Analysis',
        description: 'Analyze the UI layout, design patterns, and usability',
        config: {
          prompt:
            'Analyze the UI/UX design of this application screenshot. Comment on the layout structure, color scheme, navigation pattern, and overall usability. Provide specific, actionable feedback.',
          systemPrompt: 'You are a senior UX designer providing a heuristic evaluation of a web application interface.',
          maxTokens: 800,
          concurrency: 2,
          iterations: 5,
          streaming: true,
          images: builtinImage ? [builtinImage] : undefined,
        },
        tags: { type: 'vision', task: 'analysis' },
      },
    ],
    options: { stopOnFailure: false, cooldownBetweenTasks: 3000 },
  },
];
