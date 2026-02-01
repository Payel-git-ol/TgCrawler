import { PrismaClient } from "../../generated/prisma/client";
import { Logger } from "../../log/logger";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

export interface TaskData {
  id_post: string;
  title: string;
  description: string;
  workType: string;
  payment: string;
  deadline: string;
  url: string;
  channelUrl: string;
  scrapedAt: string;
  timestamp: string;
}

export class TaskService {
  private prisma: PrismaClient;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    
    this.prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  async createTask(data: TaskData) {
    try {
      const task = await this.prisma.task.create({
        data: {
          id_post: data.id_post,
          title: data.title,
          description: data.description,
          workType: data.workType,
          payment: data.payment,
          deadline: data.deadline,
          url: data.url,
          channelUrl: data.channelUrl,
          scrapedAt: data.scrapedAt,
          timestamp: data.timestamp,
        },
      });
      return task;
    } catch (error) {
      Logger.error("Failed to create task", error);
      throw error;
    }
  }

  async createManyTasks(tasks: TaskData[]) {
    try {
      if (tasks.length === 0) {
        Logger.warn("No tasks to save");
        return { count: 0 };
      }

      Logger.info(`Attempting to save ${tasks.length} tasks to database...`);
      
      const result = await this.prisma.task.createMany({
        data: tasks,
        skipDuplicates: true,
      });
      
      Logger.success(`Successfully saved ${result.count} tasks to database`);
      
      if (result.count === 0 && tasks.length > 0) {
        Logger.warn(`All ${tasks.length} tasks were duplicates and skipped`);
      }
      
      return result;
    } catch (error) {
      Logger.error("Failed to create many tasks", error);
      console.error("Database error details:", error);
      throw error;
    }
  }

  async getAllTasks() {
    try {
      return await this.prisma.task.findMany({
        orderBy: {
          scrapedAt: "desc",
        },
      });
    } catch (error) {
      Logger.error("Failed to get all tasks", error);
      throw error;
    }
  }

  async getTaskById(id: number) {
    try {
      return await this.prisma.task.findUnique({
        where: { id },
      });
    } catch (error) {
      Logger.error("Failed to get task by id", error);
      throw error;
    }
  }

  async getTaskByPostId(id_post: string) {
    try {
      return await this.prisma.task.findFirst({
        where: { id_post },
      });
    } catch (error) {
      Logger.error("Failed to get task by post id", error);
      throw error;
    }
  }

  async getExistingPostIds(): Promise<Set<string>> {
    try {
      const tasks = await this.prisma.task.findMany({
        select: { id_post: true },
      });
      return new Set(tasks.map((t) => t.id_post));
    } catch (error) {
      Logger.error("Failed to get existing post ids", error);
      throw error;
    }
  }

  async getExistingContentHashes(): Promise<Set<string>> {
    try {
      const tasks = await this.prisma.task.findMany({
        select: { title: true, description: true },
      });
      return new Set(
        tasks.map((t) => `${t.title}|${t.description}`.toLowerCase().trim())
      );
    } catch (error) {
      Logger.error("Failed to get existing content hashes", error);
      throw error;
    }
  }

  async deleteAllTasks() {
    try {
      const result = await this.prisma.task.deleteMany({});
      Logger.success(`Deleted ${result.count} tasks from database`);
      return result;
    } catch (error) {
      Logger.error("Failed to delete all tasks", error);
      throw error;
    }
  }

  async deleteTaskById(id: number) {
    try {
      return await this.prisma.task.delete({
        where: { id },
      });
    } catch (error) {
      Logger.error("Failed to delete task", error);
      throw error;
    }
  }

  async countTasks(): Promise<number> {
    try {
      return await this.prisma.task.count();
    } catch (error) {
      Logger.error("Failed to count tasks", error);
      throw error;
    }
  }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}
