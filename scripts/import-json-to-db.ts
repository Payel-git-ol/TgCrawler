import { config } from "dotenv";
import fs from "fs/promises";
import path from "path";
import { TaskService, TaskData } from "../src/services/database/task";
import { Logger } from "../src/log/logger";

config();

interface JsonJob {
  id: string;
  title: string;
  description: string;
  workType: string;
  payment: string;
  deadline: string;
  url: string;
  channelUrl?: string;
  scrapedAt: string;
  timestamp: string;
}

async function loadJsonFiles(dataDir: string): Promise<JsonJob[]> {
  const allJobs: JsonJob[] = [];

  try {
    const files = await fs.readdir(dataDir);

    for (const file of files) {
      if (file === "tasks.json" || !file.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(dataDir, file);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const jsonData = JSON.parse(content);

        let jobs: JsonJob[] = [];

        if (Array.isArray(jsonData)) {
          jobs = jsonData;
        } else if (jsonData.posts && Array.isArray(jsonData.posts)) {
          jobs = jsonData.posts;
        } else if (jsonData.jobs && Array.isArray(jsonData.jobs)) {
          jobs = jsonData.jobs;
        } else {
          jobs = [jsonData];
        }

        jobs.forEach((job) => {
          allJobs.push({
            id: job.id || `job_${Date.now()}_${Math.random()}`,
            title: job.title || "",
            description: job.description || "",
            workType: job.workType || "",
            payment: job.payment || "",
            deadline: job.deadline || "",
            url: job.url || "",
            channelUrl: job.channelUrl || "",
            scrapedAt: job.scrapedAt || new Date().toISOString(),
            timestamp: job.timestamp || job.scrapedAt || new Date().toISOString(),
          });
        });

        Logger.info(`Loaded ${jobs.length} jobs from ${file}`);
      } catch (error) {
        Logger.error(`Failed to read ${file}`, error);
      }
    }
  } catch (error) {
    Logger.error("Failed to read data directory", error);
  }

  return allJobs;
}

async function importJsonToDb() {
  const taskService = new TaskService();
  const dataDir = path.join(process.cwd(), "data");

  try {
    Logger.info("Starting JSON to DB import...");

    // Загружаем все задачи из JSON файлов
    const jsonJobs = await loadJsonFiles(dataDir);
    Logger.info(`Loaded ${jsonJobs.length} jobs from JSON files`);

    if (jsonJobs.length === 0) {
      Logger.warn("No jobs found in JSON files");
      return;
    }

    // Получаем существующие ID постов
    const existingPostIds = await taskService.getExistingPostIds();
    Logger.info(`Found ${existingPostIds.size} existing tasks in database`);

    // Фильтруем новые задачи
    const newJobs = jsonJobs.filter((job) => !existingPostIds.has(job.id));

    if (newJobs.length === 0) {
      Logger.warn("All jobs already exist in database");
      return;
    }

    Logger.info(`Importing ${newJobs.length} new jobs...`);

    // Преобразуем в формат БД
    const tasksToImport: TaskData[] = newJobs.map((job) => ({
      id_post: job.id,
      title: job.title,
      description: job.description,
      workType: job.workType,
      payment: job.payment,
      deadline: job.deadline,
      url: job.url,
      channelUrl: job.channelUrl || "",
      scrapedAt: job.scrapedAt,
      timestamp: job.timestamp,
    }));

    // Импортируем батчами по 100
    const batchSize = 100;
    let imported = 0;

    for (let i = 0; i < tasksToImport.length; i += batchSize) {
      const batch = tasksToImport.slice(i, i + batchSize);
      const result = await taskService.createManyTasks(batch);
      imported += result.count;
      Logger.info(
        `Imported batch ${Math.floor(i / batchSize) + 1}: ${result.count} tasks (total: ${imported}/${tasksToImport.length})`
      );
    }

    Logger.success(
      `Import completed! Imported ${imported} new tasks, skipped ${jsonJobs.length - imported} duplicates`
    );
  } catch (error) {
    Logger.error("Import failed", error);
    throw error;
  } finally {
    await taskService.disconnect();
  }
}

// Запускаем импорт
importJsonToDb()
  .then(() => {
    Logger.success("Import script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    Logger.error("Import script failed", error);
    process.exit(1);
  });
