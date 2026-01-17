import * as fs from "fs";
import * as path from "path";
import { Logger } from "../../log/logger";

export type TaskStatus = 
  | "pending" 
  | "validating" 
  | "selecting_agent" 
  | "processing" 
  | "completed" 
  | "failed" 
  | "rejected";

export type AIAgent = 
  | "gpt-4" 
  | "claude" 
  | "open-source" 
  | "free-model" 
  | "replacement";

export interface Task {
  id: string;
  jobId: string;
  jobTitle: string;
  deadline: string;
  status: TaskStatus;
  // Workflow fields
  isSuitable?: boolean;
  customerCapable?: boolean;
  selectedAgent?: AIAgent;
  budgetLimit?: number;
  projectedValue?: number;
  actualCost?: number;
  // Metadata
  assignee?: string;
  notes?: string;
  retries?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRequest {
  jobId: string;
  jobTitle: string;
  deadline?: string;
  assignee?: string;
  notes?: string;
  projectedValue?: number;
}

export class TaskManager {
  private tasksPath: string;

  constructor(dataDir: string = "./data") {
    this.tasksPath = path.join(dataDir, "tasks.json");
    this.ensureFile();
  }

  private ensureFile(): void {
    if (!fs.existsSync(this.tasksPath)) {
      fs.writeFileSync(this.tasksPath, JSON.stringify([], null, 2));
    }
  }

  async createTask(request: TaskRequest): Promise<Task> {
    const tasks = this.loadTasks();
    
    const task: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      jobId: request.jobId,
      jobTitle: request.jobTitle,
      deadline: request.deadline || "",
      status: "validating",
      assignee: request.assignee || "",
      notes: request.notes || "",
      projectedValue: request.projectedValue || 100,
      retries: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    tasks.push(task);
    this.saveTasks(tasks);
    Logger.success(`Task created: ${task.id} (status: validating)`);

    return task;
  }

  async validateTask(taskId: string): Promise<Task | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;

    // Check if task is suitable for AI processing
    const isSuitable = this.checkTaskSuitability(task.jobTitle);
    
    const updated = await this.updateTask(taskId, {
      isSuitable,
      status: isSuitable ? "selecting_agent" : "rejected",
    });

    if (isSuitable) {
      Logger.success(`Task ${taskId} validated - selecting AI agent`);
    } else {
      Logger.warn(`Task ${taskId} rejected - not suitable for AI processing`);
    }

    return updated;
  }

  async selectAgent(taskId: string): Promise<Task | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;

    // Determine if customer can pay for premium models
    const customerCapable = this.checkCustomerCapability(task.jobTitle);
    
    // Select appropriate AI agent based on budget and complexity
    const agent = this.selectBestAgent(
      task.jobTitle,
      customerCapable,
      task.projectedValue || 100
    );

    const updated = await this.updateTask(taskId, {
      customerCapable,
      selectedAgent: agent,
      status: "processing",
    });

    Logger.success(`Task ${taskId} - Selected agent: ${agent}`);
    return updated;
  }

  async processTask(taskId: string, actualCost: number): Promise<Task | null> {
    const task = await this.getTask(taskId);
    if (!task) return null;

    const projectedValue = task.projectedValue || 100;
    const budgetLimit = projectedValue * 0.2; // Max 20% of projected value

    if (actualCost > budgetLimit) {
      // Try to find replacement with lower cost
      Logger.warn(
        `Task ${taskId} - Cost ${actualCost} exceeds budget ${budgetLimit}, finding replacement...`
      );

      const updated = await this.updateTask(taskId, {
        selectedAgent: "replacement",
        status: "processing",
        actualCost,
      });

      return updated;
    }

    const updated = await this.updateTask(taskId, {
      actualCost,
      status: "completed",
    });

    Logger.success(`Task ${taskId} - Completed with cost: ${actualCost}`);
    return updated;
  }

  private checkTaskSuitability(jobTitle: string): boolean {
    // Simple heuristic: if title contains keywords, it's suitable
    const keywords = [
      "develop",
      "write",
      "create",
      "design",
      "analyze",
      "code",
      "implement",
      "build",
      "script",
      "configure",
    ];
    const lowerTitle = jobTitle.toLowerCase();
    return keywords.some((kw) => lowerTitle.includes(kw));
  }

  private checkCustomerCapability(jobTitle: string): boolean {
    // Check if task requires premium models (complex tasks)
    const complexKeywords = [
      "senior",
      "advanced",
      "complex",
      "enterprise",
      "production",
      "critical",
      "urgent",
    ];
    const lowerTitle = jobTitle.toLowerCase();
    return complexKeywords.some((kw) => lowerTitle.includes(kw));
  }

  private selectBestAgent(
    jobTitle: string,
    customerCapable: boolean,
    projectedValue: number
  ): AIAgent {
    // If customer can afford premium and task is complex, use GPT-4
    if (customerCapable && projectedValue > 200) {
      return "gpt-4";
    }
    // If customer can afford and task is medium complexity
    if (customerCapable && projectedValue > 100) {
      return "claude";
    }
    // If budget is limited, use free/open-source models
    if (projectedValue <= 100) {
      return "free-model";
    }
    // Default to open-source
    return "open-source";
  }

  async updateTask(
    taskId: string,
    updates: Partial<Task>
  ): Promise<Task | null> {
    const tasks = this.loadTasks();
    const index = tasks.findIndex((t) => t.id === taskId);

    if (index === -1) {
      return null;
    }

    const updated: Task = {
      ...tasks[index],
      ...updates,
      id: tasks[index].id,
      createdAt: tasks[index].createdAt,
      updatedAt: new Date().toISOString(),
    };

    tasks[index] = updated;
    this.saveTasks(tasks);
    Logger.success(`Task updated: ${taskId}`);

    return updated;
  }

  async getTask(taskId: string): Promise<Task | null> {
    const tasks = this.loadTasks();
    return tasks.find((t) => t.id === taskId) || null;
  }

  async getAllTasks(): Promise<Task[]> {
    return this.loadTasks();
  }

  async getTasksByStatus(status: Task["status"]): Promise<Task[]> {
    const tasks = this.loadTasks();
    return tasks.filter((t) => t.status === status);
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const tasks = this.loadTasks();
    const filtered = tasks.filter((t) => t.id !== taskId);

    if (filtered.length === tasks.length) {
      return false;
    }

    this.saveTasks(filtered);
    Logger.success(`Task deleted: ${taskId}`);
    return true;
  }

  private loadTasks(): Task[] {
    try {
      const content = fs.readFileSync(this.tasksPath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      Logger.warn("Failed to load tasks, returning empty array");
      return [];
    }
  }

  private saveTasks(tasks: Task[]): void {
    fs.writeFileSync(this.tasksPath, JSON.stringify(tasks, null, 2));
  }
}
