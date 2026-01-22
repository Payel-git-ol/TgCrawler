import { Hono } from "hono";
import { chromium } from "playwright";
import * as http from "http";

import { TelegramCrawler } from "./crawler/crawler";
import { DataStorage, JobPost } from "./storage";
import { CONFIG } from "./config/config";
import { Logger } from "./log/logger";
import { ServiceFactory } from "./services/factory";
import { TaskManager, TaskRequest } from "./services/tasks/taskManager";
import { TelegramTaskPublisher } from "./services/tasks/telegramTaskPublisher";

// Utility function to shuffle array (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const app = new Hono();
const storage = new DataStorage(CONFIG.DATA_DIR);
const crawler = new TelegramCrawler();
const taskManager = new TaskManager(CONFIG.DATA_DIR);

// Routes

app.get("/", (c) => {
  return c.json({
    name: "Telegram Web Crawler",
    version: "1.0.0",
    endpoints: {
      "Jobs API": {
        "GET /api/jobs": "Get all posts from all files (shuffled)",
        "GET /api/files": "List all data files",
        "GET /api/file/:filename": "Get posts from specific file",
        "GET /api/jobs/:id": "Get post by ID",
        "GET /api/jobs/filter/type/:type": "Filter by work type",
        "POST /api/crawl": "Start crawler",
        "GET /api/stats": "Get statistics",
      },
      "Task Management": {
        "POST /api/tasks": "Create new task",
        "GET /api/tasks": "Get all tasks",
        "GET /api/tasks/:id": "Get task by ID",
        "PUT /api/tasks/:id": "Update task",
        "DELETE /api/tasks/:id": "Delete task",
        "GET /api/tasks/status/:status": "Get tasks by status (pending|assigned|completed|failed)",
      },
    },
  });
});

app.get("/api/jobs", async (c) => {
  try {
    const jobs = await storage.loadAllJobs();
    const shuffled = shuffleArray(jobs);
    return c.json({ success: true, count: shuffled.length, jobs: shuffled });
  } catch (error) {
    Logger.error("Failed to load jobs", error);
    return c.json({ success: false, error: "Failed to load jobs" }, 500);
  }
});

app.get("/api/files", async (c) => {
  try {
    const files = await storage.listJsonFilesPublic();
    return c.json({ success: true, count: files.length, files });
  } catch (error) {
    Logger.error("Failed to load files list", error);
    return c.json({ success: false, error: "Failed to load files" }, 500);
  }
});

app.get("/api/file/:filename", async (c) => {
  try {
    const filename = c.req.param("filename");
    const jobs = await storage.loadJobs(filename);
    const shuffled = shuffleArray(jobs);
    return c.json({ success: true, filename, count: shuffled.length, jobs: shuffled });
  } catch (error) {
    Logger.error("Failed to load file", error);
    return c.json({ success: false, error: "Failed to load file" }, 500);
  }
});

app.get("/api/jobs/:id", async (c) => {
  try {
    const jobs = await storage.loadJobs();
    const job = jobs.find((j) => j.id === c.req.param("id"));

    if (!job) {
      return c.json({ success: false, error: "Post not found" }, 404);
    }

    return c.json({ success: true, job });
  } catch (error) {
    Logger.error("Failed to load post", error);
    return c.json({ success: false, error: "Failed to load post" }, 500);
  }
});

app.get("/api/jobs/filter/type/:type", async (c) => {
  try {
    const jobs = await storage.loadAllJobs();
    const type = c.req.param("type").toLowerCase();
    const filtered = jobs.filter((j) =>
      j.workType.toLowerCase().includes(type)
    );

    return c.json({ success: true, count: filtered.length, jobs: filtered });
  } catch (error) {
    Logger.error("Failed to filter jobs", error);
    return c.json({ success: false, error: "Failed to filter" }, 500);
  }
});

app.post("/api/crawl", async (c) => {
  const browser = await chromium.launch();
  const scraper = ServiceFactory.createScraper();
  const allCollected: JobPost[] = [];
  let totalDuplicates = 0;

  try {
    Logger.info(`Starting crawl of ${CONFIG.TELEGRAM_URLS.length} channels`);

    const existingIds = await storage.getExistingIds();
    const existingContent = await storage.getExistingContent();
    Logger.info(`Database: ${existingIds.size} posts`);

    for (const url of CONFIG.TELEGRAM_URLS) {
      Logger.info(`Crawling: ${url}`);
      const page = await browser.newPage();

      try {
        const allPosts = await scraper.scrape(page, url);

        const newPosts = allPosts.filter((p) => {
          const contentHash = `${p.title}|${p.description}`;
          return !existingIds.has(p.id) && !existingContent.has(contentHash);
        });

        if (newPosts.length === 0) {
          Logger.warn(`  No new posts from ${url}`);
          continue;
        }

        const result = await storage.saveNewJobs(newPosts);

        Logger.info(`  Saved: ${result.saved.length}, Duplicates: ${result.skipped}`);

        allCollected.push(...result.saved);
        totalDuplicates += result.skipped;

        // Update existing for next channel
        result.saved.forEach((p) => {
          existingIds.add(p.id);
          existingContent.add(`${p.title}|${p.description}`);
        });
      } finally {
        await page.close();
      }
    }

    if (allCollected.length === 0) {
      return c.json({
        success: true,
        message: "No new posts found",
        posts: [],
      });
    }

    return c.json({
      success: true,
      message: `Collected ${allCollected.length} new posts from ${CONFIG.TELEGRAM_URLS.length} channels`,
      posts: allCollected,
    });
  } catch (error) {
    Logger.error("Crawl failed", error);
    return c.json(
      { success: false, error: `Crawl failed: ${String(error)}` },
      500
    );
  } finally {
    await browser.close();
  }
});

app.get("/api/stats", async (c) => {
  try {
    const jobs = await storage.loadAllJobs();

    const stats = {
      totalPosts: jobs.length,
      workTypes: {} as Record<string, number>,
      paymentTypes: {} as Record<string, number>,
    };

    jobs.forEach((job) => {
      stats.workTypes[job.workType] =
        (stats.workTypes[job.workType] || 0) + 1;
      stats.paymentTypes[job.payment] =
        (stats.paymentTypes[job.payment] || 0) + 1;
    });

    return c.json({ success: true, stats });
  } catch (error) {
    Logger.error("Failed to get stats", error);
    return c.json({ success: false, error: "Failed to get stats" }, 500);
  }
});

// Task Management Endpoints

app.post("/api/tasks", async (c) => {
  try {
    const data = await c.req.json() as TaskRequest;

    if (!data.jobId || !data.jobTitle) {
      return c.json(
        { success: false, error: "jobId and jobTitle are required" },
        400
      );
    }

    const task = await taskManager.createTask(data);
    return c.json({ success: true, task }, 201);
  } catch (error) {
    Logger.error("Failed to create task", error);
    return c.json({ success: false, error: "Failed to create task" }, 500);
  }
});

app.get("/api/tasks", async (c) => {
  try {
    const tasks = await taskManager.getAllTasks();
    return c.json({ success: true, count: tasks.length, tasks });
  } catch (error) {
    Logger.error("Failed to get tasks", error);
    return c.json({ success: false, error: "Failed to get tasks" }, 500);
  }
});

app.get("/api/tasks/:id", async (c) => {
  try {
    const taskId = c.req.param("id");
    const task = await taskManager.getTask(taskId);

    if (!task) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    return c.json({ success: true, task });
  } catch (error) {
    Logger.error("Failed to get task", error);
    return c.json({ success: false, error: "Failed to get task" }, 500);
  }
});

app.put("/api/tasks/:id", async (c) => {
  try {
    const taskId = c.req.param("id");
    const data = await c.req.json() as Partial<TaskRequest> & { status?: string };

    const updated = await taskManager.updateTask(taskId, {
      jobTitle: data.jobTitle,
      deadline: data.deadline,
      assignee: data.assignee,
      notes: data.notes,
      status: (data.status as any) || undefined,
    });

    if (!updated) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    return c.json({ success: true, task: updated });
  } catch (error) {
    Logger.error("Failed to update task", error);
    return c.json({ success: false, error: "Failed to update task" }, 500);
  }
});

app.delete("/api/tasks/:id", async (c) => {
  try {
    const taskId = c.req.param("id");
    const deleted = await taskManager.deleteTask(taskId);

    if (!deleted) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    return c.json({ success: true, message: "Task deleted" });
  } catch (error) {
    Logger.error("Failed to delete task", error);
    return c.json({ success: false, error: "Failed to delete task" }, 500);
  }
});

app.get("/api/tasks/status/:status", async (c) => {
  try {
    const status = c.req.param("status");
    const tasks = await taskManager.getTasksByStatus(
      status as any
    );

    return c.json({ success: true, count: tasks.length, tasks });
  } catch (error) {
    Logger.error("Failed to get tasks by status", error);
    return c.json(
      { success: false, error: "Failed to get tasks" },
      500
    );
  }
});

// Task Workflow Endpoints

app.post("/api/tasks/:id/validate", async (c) => {
  try {
    const taskId = c.req.param("id");
    const task = await taskManager.validateTask(taskId);

    if (!task) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    return c.json({ 
      success: true, 
      message: `Task ${task.isSuitable ? "is suitable" : "rejected"}`,
      task 
    });
  } catch (error) {
    Logger.error("Failed to validate task", error);
    return c.json({ success: false, error: "Validation failed" }, 500);
  }
});

app.post("/api/tasks/:id/select-agent", async (c) => {
  try {
    const taskId = c.req.param("id");
    const task = await taskManager.selectAgent(taskId);

    if (!task) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    return c.json({ 
      success: true, 
      message: `Selected AI agent: ${task.selectedAgent}`,
      task 
    });
  } catch (error) {
    Logger.error("Failed to select agent", error);
    return c.json({ success: false, error: "Agent selection failed" }, 500);
  }
});

app.post("/api/tasks/:id/process", async (c) => {
  try {
    const taskId = c.req.param("id");
    const data = await c.req.json() as { actualCost?: number };
    const actualCost = data.actualCost || 0;

    const task = await taskManager.processTask(taskId, actualCost);

    if (!task) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    const projectedValue = task.projectedValue || 100;
    const budgetLimit = projectedValue * 0.2;
    const withinBudget = actualCost <= budgetLimit;

    return c.json({ 
      success: true, 
      message: withinBudget 
        ? "Task completed within budget" 
        : "Cost exceeded budget, using replacement",
      task,
      budgetInfo: {
        projectedValue,
        budgetLimit,
        actualCost,
        withinBudget,
      }
    });
  } catch (error) {
    Logger.error("Failed to process task", error);
    return c.json({ success: false, error: "Processing failed" }, 500);
  }
});

app.get("/api/tasks/workflow/:id", async (c) => {
  try {
    const taskId = c.req.param("id");
    const task = await taskManager.getTask(taskId);

    if (!task) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    const getCurrentStep = (t: any) => {
      if (t.status === "rejected") return "Rejected";
      if (t.status === "validating" || t.isSuitable === undefined) return "1_Validating_Suitability";
      if (!t.isSuitable) return "Rejected";
      if (t.status === "selecting_agent" || !t.selectedAgent) return "2_Selecting_Agent";
      if (t.status === "processing" || t.actualCost === undefined) return "3_Processing";
      if (t.actualCost > (t.projectedValue || 100) * 0.2) return "3_Finding_Replacement";
      return "4_Completed";
    };

    const workflow = {
      taskId: task.id,
      status: task.status,
      steps: {
        "1_suitable": task.isSuitable !== undefined ? task.isSuitable : "pending",
        "2_customer_capable": task.customerCapable !== undefined ? task.customerCapable : "pending",
        "3_selected_agent": task.selectedAgent || "pending",
        "4_budget_check": task.actualCost !== undefined ? (task.actualCost <= (task.projectedValue || 100) * 0.2) : "pending",
      },
      currentStep: getCurrentStep(task),
    };

    return c.json({ success: true, workflow });
  } catch (error) {
    Logger.error("Failed to get workflow", error);
    return c.json({ success: false, error: "Failed to get workflow" }, 500);
  }
});

// Telegram Publishing Endpoints

app.post("/api/tasks/:id/publish", async (c) => {
  try {
    const taskId = c.req.param("id");
    const data = await c.req.json() as { botToken?: string; botName?: string };

    const task = await taskManager.getTask(taskId);
    if (!task) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

    // Use provided token or default
    const botToken = data.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
    const botName = data.botName || "doindeadlinebot";

    if (!botToken) {
      return c.json(
        { success: false, error: "Bot token not provided" },
        400
      );
    }

    const publisher = new TelegramTaskPublisher(botToken, botName);
    const published = await publisher.publishTask(task);

    if (!published) {
      return c.json(
        { success: false, error: "Failed to publish task" },
        500
      );
    }

    // Update task status to published
    await taskManager.updateTask(taskId, { status: "completed" });

    return c.json({
      success: true,
      message: `Task published to @${botName}`,
      task,
    });
  } catch (error) {
    Logger.error("Failed to publish task", error);
    return c.json({ success: false, error: "Publishing failed" }, 500);
  }
});

const PORT = 3000;

// Создаем HTTP сервер с Hono app
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(`http://${req.headers.host}${req.url}`);
    
    let body: any = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks).toString();
    }

    const request = new Request(url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body,
    });

    const response = await app.fetch(request);
    const responseHeaders = Object.fromEntries(response.headers);

    res.writeHead(response.status, responseHeaders);
    const responseBody = await response.arrayBuffer();
    res.end(Buffer.from(responseBody));
  } catch (error) {
    Logger.error("Server error", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal Server Error" }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  Logger.success(`Server running on http://localhost:${PORT}`);
});
