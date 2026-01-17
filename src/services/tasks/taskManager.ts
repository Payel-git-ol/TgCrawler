import * as fs from "fs";
import * as path from "path";
import { Logger } from "../../log/logger";

export interface Task {
  id: string;
  jobId: string;
  jobTitle: string;
  deadline: string;
  status: "pending" | "assigned" | "completed" | "failed";
  assignee?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRequest {
  jobId: string;
  jobTitle: string;
  deadline?: string;
  assignee?: string;
  notes?: string;
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
      status: "pending",
      assignee: request.assignee || "",
      notes: request.notes || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    tasks.push(task);
    this.saveTasks(tasks);
    Logger.success(`Task created: ${task.id}`);

    return task;
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
