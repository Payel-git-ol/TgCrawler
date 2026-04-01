import { Hono } from "hono";
import * as http from "http";
import fs from 'fs/promises';
import path from 'path';
import { DataStorage, JobPost } from "./storage";
import { CONFIG } from "./config/config";
import { Logger } from "./log/logger";
import { ServiceFactory } from "./services/factory";
import { TaskManager, TaskRequest } from "./services/tasks/taskManager";
import { TelegramTaskPublisher } from "./services/tasks/telegramTaskPublisher";
import { launchBrowser } from "./launchBrowser";
import { DeadlineTaskApi } from "./services/deadlineTaskApi";
import { TaskService } from "./services/database/task";
import { config } from 'dotenv';

config();

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function deleteFolderContents(folderPath: string) {
  const items = await fs.readdir(folderPath);
  
  for (const item of items) {
    const itemPath = path.join(folderPath, item);
    const stat = await fs.stat(itemPath);
    
    if (stat.isDirectory()) {
      await deleteFolderContents(itemPath);
      await fs.rmdir(itemPath);
    } else {
      await fs.unlink(itemPath);
    }
  }
}

function parseChannelUrl(url: string): string | null {
  if (!url || url.trim() === '') {
    return null;
  }
  
  const match = url.match(/https?:\/\/t\.me\/([^/?]+)/);
  if (match) {
    return `https://t.me/${match[1]}`;
  }
  
  return url;
}

function getCleanTitle(rawTitle: string, rawDescription: string): string {
  const titleIsEmpty = !rawTitle || rawTitle.trim() === '' || rawTitle.toLowerCase().includes('без названия');
  
  let cleanTitle = rawTitle;
  
  if (!titleIsEmpty) {
    cleanTitle = rawTitle
      .replace(/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1f926}-\u{1f937}\u{10000}-\u{10FFFF}\u{1f1f0}-\u{1f1ff}\u{1f201}-\u{1f251}📌📝💳🌐〰️#]+/gu, '')
      .replace(/^\s*[📌📝💳🌐〰️#]+\s*/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*:\s*/g, ': ')
      .trim();
  }

  if (titleIsEmpty || !cleanTitle || cleanTitle.length < 5) {
    if (rawDescription && rawDescription.length > 20) {
      cleanTitle = rawDescription
        .replace(/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1f926}-\u{1f937}\u{10000}-\u{10FFFF}\u{1f1f0}-\u{1f1ff}\u{1f201}-\u{1f251}📌📝💳🌐〰️#]+/gu, '')
        .replace(/^\s*[📌📝💳🌐〰️#]+\s*/g, '')
        .substring(0, 100)
        .trim();
    }
  }

  if (cleanTitle.length > 80) {
    const colonIndex = cleanTitle.indexOf(':');
    const dashIndex = cleanTitle.indexOf('-');
    const cutIndex = Math.max(colonIndex, dashIndex);

    if (cutIndex > 20 && cutIndex < 60) {
      cleanTitle = cleanTitle.substring(0, cutIndex).trim();
    } else {
      cleanTitle = cleanTitle.substring(0, 77) + '...';
    }
  }

  const allText = (cleanTitle + " " + (rawDescription || '')).toLowerCase();
  
  let tech = "";
  if (allText.includes('python') || allText.includes('питон')) {
    tech = "Python";
  } else if (allText.includes('javascript') || allText.includes('js')) {
    tech = "JavaScript";
  } else if (allText.includes('php')) {
    tech = "PHP";
  } else if (allText.includes('c#') || allText.includes('.net')) {
    tech = "C#";
  } else if (allText.includes('java') && !allText.includes('javascript')) {
    tech = "Java";
  } else if (allText.includes('figma')) {
    tech = "Figma";
  } else if (allText.includes('react')) {
    tech = "React";
  } else if (allText.includes('vue')) {
    tech = "Vue";
  } else if (allText.includes('angular')) {
    tech = "Angular";
  } else if (allText.includes('html') || allText.includes('css')) {
    tech = "HTML/CSS";
  }
  
  let taskType = "";
  if (allText.includes('дизайн') || allText.includes('design') || allText.includes('figma')) {
    taskType = "дизайн";
  } else if (allText.includes('сайт') || allText.includes('веб') || allText.includes('web') || allText.includes('landing')) {
    taskType = "сайт";
  } else if (allText.includes('бот') || allText.includes('bot') || allText.includes('telegram')) {
    taskType = "бота";
  } else if (allText.includes('интерфейс') || allText.includes('ui') || allText.includes('ux')) {
    taskType = "интерфейс";
  } else if (allText.includes('приложен') || allText.includes('app') || allText.includes('мобильн')) {
    taskType = "приложение";
  } else if (allText.includes('парс') || allText.includes('scrap') || allText.includes('краул')) {
    taskType = "парсер";
  } else if (allText.includes('api') || allText.includes('интеграц')) {
    taskType = "API";
  } else if (allText.includes('карт') || allText.includes('гео') || allText.includes('map')) {
    taskType = "карты";
  }
  
  if (tech && taskType) {
    return `Нужен ${tech} разработчик для ${taskType}`;
  } 
  else if (tech) {
    return `Требуется ${tech} разработчик`;
  }
  else if (taskType) {
    return `Требуется ${taskType}`;
  }
  else {
    return cleanTitle || "Нужно выполнить задачу";
  }
}

function extractBudget(text: string): { from: number | null; to: number | null } {
  if (!text) return { from: null, to: null };
  
  // Проверяем на плохие значения
  const badValues = ['договорная', 'договорная цена', '??', '?', 'не указано', 'не указана', 
                     'unknown', 'n/a', 'none', 'не известна', 'не известно'];
  const lowerText = text.toLowerCase().trim();
  if (badValues.includes(lowerText)) {
    return { from: null, to: null };
  }
  
  const patterns = [
    /от\s*(\d+[\s.,]?\d*)\s*до\s*(\d+[\s.,]?\d*)/gi,
    /(\d+[\s.,]?\d*)\s*[-–—]\s*(\d+[\s.,]?\d*)/g,
    /budget[:\s]*(\d+[\s.,]?\d*)\s*[-–—]\s*(\d+[\s.,]?\d*)/gi,
    /цена[:\s]*(\d+[\s.,]?\d*)\s*[-–—]\s*(\d+[\s.,]?\d*)/gi,
    /оплат[аиы]?[:\s]*(\d+[\s.,]?\d*)\s*[-–—]\s*(\d+[\s.,]?\d*)/gi,
    /стоимость[:\s]*(\d+[\s.,]?\d*)\s*[-–—]\s*(\d+[\s.,]?\d*)/gi,
    /(\d+[\s.,]?\d*)\s*(?:руб|р\.|usd|\$|€|₽)/gi
  ];
  
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      try {
        const num1 = parseFloat(match[1].replace(/[^\d.,]/g, '').replace(',', '.'));
        const num2 = match[2] ? parseFloat(match[2].replace(/[^\d.,]/g, '').replace(',', '.')) : num1;
        
        if (!isNaN(num1)) {
          return { 
            from: num1 < num2 ? num1 : num2, 
            to: num1 < num2 ? num2 : num1 
          };
        }
      } catch {
        continue;
      }
    }
  }
  
  return { from: null, to: null };
}

function isValidJob(structuredJob: any): { valid: boolean; reason?: string } {
  // Минимальная проверка: должен быть вменяемый заголовок и описание
  if (!structuredJob.title || String(structuredJob.title).trim().length < 5) {
    return { valid: false, reason: "Title too short or missing" };
  }

  if (!structuredJob.description || String(structuredJob.description).trim().length < 20) {
    return { valid: false, reason: "Description too short or missing" };
  }

  // Если бюджет указан, он должен быть разумным (больше чем 100 рублей)
  if (structuredJob.budget_from && structuredJob.budget_from < 100) {
    return { valid: false, reason: `Budget too low: ${structuredJob.budget_from}` };
  }

  return { valid: true };
}

function getCleanDescription(cleanTitle: string, description: string): string {
  if (!description || description.trim() === '') {
    return `Задача: ${cleanTitle}. Требуется выполнить в кратчайшие сроки.`;
  }

  let cleanDesc = description
    // Удаляем эмодзи и специальные символы
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1f926}-\u{1f937}\u{10000}-\u{10FFFF}\u{1f1f0}-\u{1f1ff}\u{1f201}-\u{1f251}📌📝💳🌐〰️#]/gu, '')
    // Удаляем множественные пробелы и переносы
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  // Если после очистки описание слишком короткое, добавляем контекст
  if (cleanDesc.length < 20) {
    cleanDesc = `Задача: ${cleanTitle}. ${cleanDesc}`;
  }

  if (cleanDesc.length > 1000) {
    cleanDesc = cleanDesc.substring(0, 997) + '...';
  }

  return cleanDesc;
}

function getIntelligentTags(cleanTitle: string, cleanDesc: string): string[] {
  const allText = (cleanTitle + " " + cleanDesc).toLowerCase();
  const tags = new Set<string>();
  
  // Извлекаем теги из самого текста
  const words = allText.split(/\s+/);
  const techKeywords = ['python', 'javascript', 'js', 'php', 'java', 'c#', 'react', 'vue', 'angular', 'node', 'django', 'flask', 'laravel', 'html', 'css', 'figma', 'wordpress', 'telegram', 'бот'];
  
  words.forEach(word => {
    const cleanWord = word.replace(/[^\wа-яё#]/gi, '');
    if (techKeywords.includes(cleanWord) || techKeywords.includes(cleanWord + '.js')) {
      tags.add(cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1));
    }
  });
  
  if (allText.includes('дизайн') || allText.includes('figma')) tags.add('дизайн');
  if (allText.includes('сайт') || allText.includes('веб') || allText.includes('landing')) tags.add('веб-разработка');
  if (allText.includes('бот') || allText.includes('telegram')) tags.add('бот');
  if (allText.includes('интерфейс') || allText.includes('ui') || allText.includes('ux')) tags.add('UI/UX');
  if (allText.includes('приложен') || allText.includes('app')) tags.add('мобильная разработка');
  if (allText.includes('парс') || allText.includes('scrap')) tags.add('парсинг');
  if (allText.includes('api')) tags.add('API');
  if (allText.includes('баз') || allText.includes('data') || allText.includes('sql')) tags.add('базы данных');
  if (allText.includes('карт') || allText.includes('гео') || allText.includes('map')) tags.add('карты');
  if (allText.includes('финтех') || allText.includes('финанс')) tags.add('финтех');
  if (allText.includes('seo')) tags.add('SEO');
  
  if (allText.includes('бюджет') || allText.includes('оплат') || allText.includes('цена') || allText.includes('стоимость')) {
    tags.add('оплачиваемая');
  }
  
  return Array.from(tags);
}

function estimateDeadline(description: string): number {
  const desc = description.toLowerCase();
  let days = 7; 
  
  if (desc.includes('срочн') || desc.includes('urgent') || desc.includes('быстр')) {
    days = 1;
  } else if (desc.includes('скоро') || desc.includes('в течение') || desc.match(/\d+\s*(час|часов)/)) {
    days = 1;
  } else if (desc.includes('недел') || desc.match(/\d+\s*дн[ея]й?/)) {
    const match = desc.match(/(\d+)\s*дн[ея]й?/);
    if (match) {
      days = parseInt(match[1]);
    } else {
      days = 7;
    }
  } else if (desc.includes('месяц') || desc.match(/\d+\s*мес/)) {
    days = 30;
  } else if (desc.includes('год')) {
    days = 365;
  }
  
  return Math.min(Math.max(days, 1), 365);
}

async function convertToStructuredJob(rawJob: any): Promise<any> {
  console.log("🚀 RAW JOB DATA:", {
    title: rawJob.title?.substring(0, 100),
    description: rawJob.description?.substring(0, 100),
    budget: rawJob.budget,
    workType: rawJob.workType,
    payment: rawJob.payment
  });
  
  const originalTitle = rawJob.title || rawJob.jobTitle || '';
  let originalDescription = rawJob.description || rawJob.content || rawJob.text || '';
  
  // Удаляем конкретную строку про оплату, если она попала в текст
  if (originalDescription) {
    originalDescription = originalDescription
      .replace(/Оплата:\s*от\s*65\s*250\s*до\s*130\s*000\s*рублей/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  const originalBudget = rawJob.budget || rawJob.payment || rawJob.price || '';
  const originalWorkType = rawJob.workType || rawJob.type || '';
  const originalTags = rawJob.tags || rawJob.skills || [];
  
  const cleanTitle = getCleanTitle(originalTitle, originalDescription);
  const cleanDesc = getCleanDescription(cleanTitle, originalDescription);
  
  console.log("🔍 Cleaned title:", cleanTitle);
  console.log("🔍 Cleaned description (first 100 chars):", cleanDesc.substring(0, 100));
  
  let budget = { from: null, to: null };
  if (originalBudget && typeof originalBudget === 'string') {
    budget = extractBudget(originalBudget);
  }
  if (budget.from === null && originalDescription) {
    budget = extractBudget(originalDescription);
  }
  
  console.log("💰 Extracted budget:", budget);
  
  const autoTags = getIntelligentTags(cleanTitle, cleanDesc);
  const allTags = [...new Set([...autoTags, ...originalTags])];
  
  console.log("🏷️ Tags:", allTags);
  
  const deadline = estimateDeadline(originalDescription);
  
  const channelUrl = parseChannelUrl(rawJob.channelUrl || rawJob.source || '');
  
  return {
    id: rawJob.id || rawJob.originalId || `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title: cleanTitle,
    description: cleanDesc,
    budget_from: budget.from,
    budget_to: budget.to,
    tags: allTags,
    deadline: deadline,
    url: rawJob.url || rawJob.link || '',
    channelUrl: channelUrl,
    scrapedAt: rawJob.scrapedAt || new Date().toISOString(),
    processed_at: new Date().toISOString(),
    original_data: {
      title: originalTitle,
      description: originalDescription.substring(0, 200) + '...',
      budget: originalBudget,
      workType: originalWorkType,
      source_file: rawJob.filename
    }
  };
}

interface SentJobRecord {
  task_id: string;
  sent_date: string;
  status: string;
  original_title?: string;  
  structured_title?: string;
  budget?: string;
  original_budget?: string;
  discounted_budget?: string;
  chat_id?: number;
  message_id?: number;
  bot_response?: any;  
}

interface LogData {
  id?: any;
  title?: any;
  description?: string;
  workType?: any;
  payment?: any;
  budget?: any;
  hasBudget?: boolean;
  keys?: string[];
  [key: string]: any;
}


async function loadSentJobsDB(): Promise<Record<string, SentJobRecord>> {
  const dbPath = path.join(process.cwd(), 'sent_jobs_database.json');
  try {
    const content = await fs.readFile(dbPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveSentJobsDB(db: Record<string, SentJobRecord>): Promise<void> {
  const dbPath = path.join(process.cwd(), 'sent_jobs_database.json');
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf-8');
}

async function loadJobsFromDataFolder(): Promise<any[]> {
  try {
    // Загружаем задачи из БД
    const tasks = await taskService.getAllTasks();
    
    console.log(`ℹ️  Total jobs loaded from database: ${tasks.length}`);
    
    // Преобразуем задачи из БД в формат, ожидаемый остальным кодом
    const jobs = tasks.map((task) => ({
      id: task.id_post,
      originalId: task.id_post,
      title: task.title,
      description: task.description,
      workType: task.workType,
      payment: task.payment,
      deadline: task.deadline,
      url: task.url,
      channelUrl: task.channelUrl,
      scrapedAt: task.scrapedAt,
      timestamp: task.timestamp,
    }));
    
    if (jobs.length > 0) {
      console.log("\n🔍 DETAILED ANALYSIS OF FIRST 3 JOBS:");
      jobs.slice(0, 3).forEach((job, i) => {
        console.log(`\nJob ${i + 1}:`);
        console.log(`  ID: ${job.id}`);
        console.log(`  Title: ${job.title}`);
        console.log(`  Title length: ${job.title?.length || 0} chars`);
        console.log(`  Description: ${job.description?.substring(0, 100)}${job.description?.length > 100 ? '...' : ''}`);
        console.log(`  Description length: ${job.description?.length || 0} chars`);
        console.log(`  Work type: ${job.workType}`);
        console.log(`  Payment: ${job.payment}`);
      });
    }
    
    return jobs;
  } catch (error) {
    console.error(`❌ Error loading jobs from database:`, error);
    return [];
  }
}

async function mockSendToAPI(structuredJob: any) {
  const delay = Math.floor(
    Math.random() * 
    (Number(process.env.MOCK_DELAY_MAX || 100) - Number(process.env.MOCK_DELAY_MIN || 50)) + 
    Number(process.env.MOCK_DELAY_MIN || 50)
  );
  await new Promise(r => setTimeout(r, delay));

  const taskId = `task_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
  return {
    success: true,
    task: { id: taskId },
    message: "Задача успешно создана (MOCK)"
  };
}

const app = new Hono();
const storage = new DataStorage(CONFIG.DATA_DIR);
const taskManager = new TaskManager(CONFIG.DATA_DIR);
const taskService = new TaskService();

// Ensure database tables exist (fallback for when Prisma migrations don't run)
taskService.ensureTablesExist().catch((err) => {
  Logger.error("Failed to ensure database tables exist:", err);
});

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
        "POST /api/crawl": "Start crawler (optional body: {date: 'YYYY-MM-DD'} to crawl since a specific date)",
        "GET /api/stats": "Get statistics",
      },
      "Task Management": {
        "POST /api/tasks": "Create new task",
        "GET /api/tasks": "Get all tasks",
        "GET /api/tasks/:id": "Get task by ID",
        "PUT /api/tasks/:id": "Update task",
        "DELETE /api/tasks/:id": "Delete task",
        "DELETE /tasks/delete": "Delete all file tasks",
        "GET /api/tasks/status/:status": "Get tasks by status (pending|assigned|completed|failed)",
      },
    },
  });
});

app.get("/api/jobs", async (c) => {
  try {
    const tasks = await taskService.getAllTasks();
    const jobs = tasks.map((task) => ({
      id: task.id_post,
      title: task.title,
      description: task.description,
      workType: task.workType,
      payment: task.payment,
      deadline: task.deadline,
      url: task.url,
      channelUrl: task.channelUrl,
      scrapedAt: task.scrapedAt,
      timestamp: task.timestamp,
    }));
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
    const postId = c.req.param("id");
    const task = await taskService.getTaskByPostId(postId);

    if (!task) {
      return c.json({ success: false, error: "Post not found" }, 404);
    }

    const job = {
      id: task.id_post,
      title: task.title,
      description: task.description,
      workType: task.workType,
      payment: task.payment,
      deadline: task.deadline,
      url: task.url,
      channelUrl: task.channelUrl,
      scrapedAt: task.scrapedAt,
      timestamp: task.timestamp,
    };

    return c.json({ success: true, job });
  } catch (error) {
    Logger.error("Failed to load post", error);
    return c.json({ success: false, error: "Failed to load post" }, 500);
  }
});

app.get("/api/jobs/filter/type/:type", async (c) => {
  try {
    const tasks = await taskService.getAllTasks();
    const type = c.req.param("type").toLowerCase();
    const filtered = tasks
      .filter((t) => t.workType.toLowerCase().includes(type))
      .map((task) => ({
        id: task.id_post,
        title: task.title,
        description: task.description,
        workType: task.workType,
        payment: task.payment,
        deadline: task.deadline,
        url: task.url,
        channelUrl: task.channelUrl,
        scrapedAt: task.scrapedAt,
        timestamp: task.timestamp,
      }));

    return c.json({ success: true, count: filtered.length, jobs: filtered });
  } catch (error) {
    Logger.error("Failed to filter jobs", error);
    return c.json({ success: false, error: "Failed to filter" }, 500);
  }
});

// Extracted crawl runner so it can be used by API and on-start hooks
async function runCrawlAndSave(sinceDate?: Date): Promise<{ success: boolean; message?: string; posts?: JobPost[]; error?: any }> {
  const browser = await launchBrowser();
  const scraper = ServiceFactory.createScraper();
  const allCollected: JobPost[] = [];
  let totalDbSaved = 0;
  let totalFileSaved = 0;

  try {
    Logger.info(`ℹ️  Starting crawl of ${CONFIG.TELEGRAM_URLS.length} channels`);

    // Проверяем подключение к БД
    try {
      const dbCount = await taskService.countTasks();
      Logger.info(`ℹ️  Database connection OK. Current tasks in DB: ${dbCount}`);
    } catch (dbError) {
      Logger.error(`❌ Database connection error:`, dbError);
      return { success: false, error: `Database connection failed: ${String(dbError)}` };
    }

    const existingIds = await taskService.getExistingPostIds();
    const existingContent = await taskService.getExistingContentHashes();
    Logger.info(`ℹ️  Database: ${existingIds.size} existing post IDs, ${existingContent.size} content hashes`);

    for (const url of CONFIG.TELEGRAM_URLS) {
      Logger.info(`ℹ️  Crawling: ${url}`);
      const page = await browser.newPage();

      try {
        const allPosts = await scraper.scrape(page, url, sinceDate);

        const newPosts = allPosts.filter((p) => {
          const contentHash = `${p.title}|${p.description}`.toLowerCase().trim();
          return !existingIds.has(p.id) && !existingContent.has(contentHash);
        });

        if (newPosts.length === 0) {
          Logger.warn(`⚠️   No new posts from ${url}`);
          continue;
        }

        // Сохраняем в БД
        const tasksToSave = newPosts.map((post) => ({
          id_post: post.id,
          title: post.title,
          description: post.description,
          workType: post.workType,
          payment: post.payment,
          deadline: post.deadline,
          url: post.url,
          channelUrl: post.channelUrl || "",
          scrapedAt: post.scrapedAt,
          timestamp: post.timestamp || post.scrapedAt,
        }));

        Logger.info(`📝 Attempting to save ${tasksToSave.length} tasks to database...`);

        let dbSavedCount = 0;

        try {
          const result = await taskService.createManyTasks(tasksToSave);
          dbSavedCount = result.count;
          totalDbSaved += dbSavedCount;

          Logger.success(`✅ Saved to DB: ${dbSavedCount}, Duplicates: ${newPosts.length - dbSavedCount}`);
        } catch (dbError) {
          Logger.error(`❌ Database error while saving tasks:`, dbError);
        }

        // Also save to files as backup
        try {
          const fileResult = await storage.saveNewJobs(newPosts);
          totalFileSaved += fileResult.saved.length;
          Logger.success(`✅ Saved to files: ${fileResult.saved.length}`);
        } catch (fileError) {
          Logger.error(`❌ File save error:`, fileError);
        }

        // Обновляем существующие для следующего канала
        newPosts.forEach((p) => {
          existingIds.add(p.id);
          existingContent.add(`${p.title}|${p.description}`.toLowerCase().trim());
        });

        // Include all crawled posts in response regardless of DB save result
        allCollected.push(...newPosts);
      } finally {
        await page.close();
      }
    }

    if (allCollected.length === 0) {
      return { success: true, message: "No new posts found", posts: [] };
    }

    return { success: true, message: `Collected ${allCollected.length} new posts (DB: ${totalDbSaved}, files: ${totalFileSaved})`, posts: allCollected };
  } catch (error) {
    Logger.error(`❌ Crawl failed:`, error);
    return { success: false, error };
  } finally {
    await browser.close();
  }
}

app.post("/api/crawl", async (c) => {
  let sinceDate: Date | undefined;
  try {
    const body = await c.req.json().catch(() => ({}));
    if (body.date) {
      const parsed = new Date(body.date);
      if (isNaN(parsed.getTime())) {
        return c.json({ success: false, error: "Invalid date format. Use ISO 8601 (e.g. 2025-01-15) or any Date-parseable string." }, 400);
      }
      sinceDate = parsed;
    }
  } catch {
    // No body or invalid JSON — proceed with defaults
  }

  const result = await runCrawlAndSave(sinceDate);
  if (result.success) {
    return c.json({ success: true, message: result.message, posts: result.posts });
  } else {
    return c.json({ success: false, error: result.error || result.message }, 500);
  }
});

app.get("/api/stats", async (c) => {
  try {
    const tasks = await taskService.getAllTasks();

    const stats = {
      totalPosts: tasks.length,
      workTypes: {} as Record<string, number>,
      paymentTypes: {} as Record<string, number>,
    };

    tasks.forEach((task) => {
      stats.workTypes[task.workType] =
        (stats.workTypes[task.workType] || 0) + 1;
      stats.paymentTypes[task.payment] =
        (stats.paymentTypes[task.payment] || 0) + 1;
    });

    return c.json({ success: true, stats });
  } catch (error) {
    Logger.error("Failed to get stats", error);
    return c.json({ success: false, error: "Failed to get stats" }, 500);
  }
});


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

// Helper function to transform task to API order format
interface OrderPayload {
  title: string;
  description: string;
  workType: string;
  payment: string;
  deadline: string;
  priority: number;
}

function transformTaskToOrder(task: any): OrderPayload {
  // Calculate priority based on deadline and payment
  let priority = 50; // Default priority
  
  // Higher priority for tasks with payment
  if (task.payment && task.payment !== '') {
    const payment = parseFloat(task.payment);
    if (!isNaN(payment)) {
      priority += Math.min(payment / 1000, 30); // Add up to 30 points for payment
    }
  }
  
  // Adjust priority based on deadline urgency
  if (task.deadline) {
    const deadline = new Date(task.deadline);
    const now = new Date();
    const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDeadline <= 1) {
      priority += 20;
    } else if (daysUntilDeadline <= 3) {
      priority += 10;
    } else if (daysUntilDeadline > 30) {
      priority -= 10;
    }
  }
  
  // Clamp priority between 1 and 100
  priority = Math.max(1, Math.min(100, priority));
  
  return {
    title: task.title || 'Без названия',
    description: task.description || 'Описание отсутствует',
    workType: task.workType || 'other',
    payment: task.payment || '',
    deadline: task.deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    priority: priority
  };
}

// Endpoint to send all tasks to external API
app.post("/api/tasks/send-all", async (c) => {
  try {
    const apiUrl = process.env.ORDERS_API_URL || 'http://localhost:8080/api/v1/orders';
    
    // Fetch all tasks from database
    const tasks = await taskService.getAllTasks();
    
    if (tasks.length === 0) {
      return c.json({ 
        success: false, 
        error: 'No tasks found to send' 
      }, 400);
    }
    
    console.log(`📤 Sending ${tasks.length} tasks to ${apiUrl}`);
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[]
    };
    
    // Send each task to the API
    for (const task of tasks) {
      try {
        const orderPayload = transformTaskToOrder(task);
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(orderPayload)
        });
        
        if (response.ok) {
          results.success++;
          console.log(`✅ Task ${task.id_post} sent successfully`);
        } else {
          results.failed++;
          const errorText = await response.text();
          results.errors.push(`Task ${task.id_post}: HTTP ${response.status} - ${errorText}`);
          console.error(`❌ Failed to send task ${task.id_post}: HTTP ${response.status}`);
        }
      } catch (taskError) {
        results.failed++;
        results.errors.push(`Task ${task.id_post}: ${String(taskError)}`);
        console.error(`❌ Error sending task ${task.id_post}:`, taskError);
      }
    }
    
    return c.json({
      success: results.failed === 0,
      message: `Sent ${results.success} tasks, ${results.failed} failed`,
      results: results
    });
  } catch (error) {
    Logger.error("Failed to send tasks to API", error);
    return c.json({ 
      success: false, 
      error: 'Failed to send tasks to API' 
    }, 500);
  }
});

// Endpoint to send a single task to external API
app.post("/api/tasks/:id/send", async (c) => {
  try {
    const apiUrl = process.env.ORDERS_API_URL || 'http://localhost:8080/api/v1/orders';
    const postId = c.req.param("id");
    
    const task = await taskService.getTaskByPostId(postId);
    
    if (!task) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }
    
    const orderPayload = transformTaskToOrder(task);
    
    console.log(`📤 Sending task ${postId} to ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload)
    });
    
    if (response.ok) {
      const responseData: any = await response.json();
      return c.json({
        success: true,
        message: 'Task sent successfully',
        orderId: responseData?.id || responseData?.orderId
      });
    } else {
      const errorText = await response.text();
      const status = response.status as 400 | 401 | 403 | 404 | 500 | 502 | 503;
      return c.json({
        success: false,
        error: `API returned HTTP ${response.status}: ${errorText}`
      }, status);
    }
  } catch (error) {
    Logger.error("Failed to send task to API", error);
    return c.json({ 
      success: false, 
      error: 'Failed to send task to API' 
    }, 500);
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


app.post("/api/tasks/:id/publish", async (c) => {
  try {
    const taskId = c.req.param("id");
    const data = await c.req.json() as { botToken?: string; botName?: string };

    const task = await taskManager.getTask(taskId);
    if (!task) {
      return c.json({ success: false, error: "Task not found" }, 404);
    }

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

// ==============================
// Роут для удаления задач через бота API
// ==============================
app.delete("/tasks/delete", async (c) => {
  try {
    const BOT_API_URL = process.env.BOT_API_URL || 'https://deadlinetaskbot.productlove.ru/api/v1';
    const BOT_TOKEN = process.env.BOT_TOKEN;
    
    if (!BOT_TOKEN) {
      return c.json({
        success: false,
        error: "BOT_TOKEN environment variable is required"
      }, 500);
    }
    
    console.log("🔄 Received DELETE request to /tasks/delete");
    
    let taskIds: string[] = [];
    let deleteFiles = true;
    let clearAll = false;
    let clearDatabase: boolean | undefined = undefined; 
    
    try {
      const body = await c.req.json();
      console.log("📝 Request body received");
      
      taskIds = body.taskIds || [];
      deleteFiles = body.deleteFiles !== undefined ? body.deleteFiles : true;
      clearAll = body.clearAll || false;
      clearDatabase = body.clearDatabase !== undefined ? body.clearDatabase : undefined;
      
      console.log("📊 Parsed parameters:", { 
        taskIdsCount: taskIds.length,
        deleteFiles, 
        clearAll,
        clearDatabase
      });
    } catch (jsonError) {
      console.warn("⚠️  Failed to parse JSON body:", jsonError);
    }
    
    if (clearDatabase === undefined) {
      clearDatabase = deleteFiles;
    }
    
    const dataDir = path.join(process.cwd(), 'data');
    let deletedCount = 0;
    let botDeletedCount = 0;
    let dbDeletedCount = 0;
    let errors: string[] = [];
    const botResults = [];

    if (clearAll || (taskIds && Array.isArray(taskIds) && taskIds.length > 0)) {
      console.log("🔄 Starting task deletion via bot API...");
      
      const api = new DeadlineTaskApi(BOT_API_URL, BOT_TOKEN);
      
      try {
        if (clearAll) {
          console.log("🗑️  Deleting all cancelled tasks...");
          
          try {
            const result = await api.deleteAllCancelledTasks();
            botDeletedCount++;
            botResults.push({ 
              status: 'deleted',
              type: 'all_cancelled',
              result
            });
            console.log(`✅ All cancelled tasks deleted via bot API`);
          } catch (apiError) {
            const errorMsg = `Error deleting all cancelled tasks: ${apiError}`;
            errors.push(errorMsg);
            botResults.push({ 
              status: 'failed',
              type: 'all_cancelled',
              error: errorMsg 
            });
            console.error(`❌ ${errorMsg}`);
          }
        } else if (taskIds.length > 0) {
          console.log(`🗑️  Deleting ${taskIds.length} specific tasks via bot API...`);
          
          for (const taskId of taskIds) {
            try {
              const result = await api.deleteTask(taskId);
              botDeletedCount++;
              botResults.push({ 
                taskId, 
                status: 'deleted',
                result
              });
              console.log(`✅ Deleted task ${taskId} via bot API`);
              
              const delay = Math.random() * (parseInt(process.env.API_DELAY_MAX || '100') - parseInt(process.env.API_DELAY_MIN || '50')) + parseInt(process.env.API_DELAY_MIN || '50');
              await new Promise(resolve => setTimeout(resolve, delay));
            } catch (taskError) {
              const errorMsg = `Error deleting task ${taskId}: ${taskError}`;
              errors.push(errorMsg);
              botResults.push({ 
                taskId, 
                status: 'failed', 
                error: errorMsg 
              });
              console.error(`❌ ${errorMsg}`);
            }
          }
        }
      } catch (apiError) {
        const errorMsg = `Bot API error: ${apiError}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
      
      console.log(`📊 Bot API deletion completed: ${botDeletedCount} tasks deleted`);
    }

    if (clearDatabase) {
      console.log("🗑️  Starting database cleanup...");
      
      try {
        const result = await taskService.deleteAllTasks();
        dbDeletedCount = result.count;
        console.log(`✅ Deleted ${dbDeletedCount} tasks from database`);
      } catch (dbError) {
        const errorMsg = `Failed to clear database: ${dbError}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    } else {
      console.log("ℹ️  Database cleanup skipped (clearDatabase: false)");
    }

    if (deleteFiles) {
      console.log("🗑️  Starting file deletion from data directory...");
      
      try {
        await fs.access(dataDir);
        
        const items = await fs.readdir(dataDir);
        console.log(`📁 Found ${items.length} items in data directory`);
        
        for (const item of items) {
          try {
            const itemPath = path.join(dataDir, item);
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
              console.log(`📂 Deleting directory: ${item}`);
              await deleteFolderContents(itemPath);
              await fs.rmdir(itemPath);
              deletedCount++;
              console.log(`✅ Deleted directory: ${item}`);
            } else {
              console.log(`📄 Deleting file: ${item}`);
              await fs.unlink(itemPath);
              deletedCount++;
              console.log(`✅ Deleted file: ${item}`);
            }
          } catch (error) {
            const errorMsg = `Failed to delete ${item}: ${error}`;
            errors.push(errorMsg);
            console.error(`❌ ${errorMsg}`);
          }
        }
        
        console.log(`📊 File deletion completed: ${deletedCount} files deleted from data directory`);
      } catch {
        console.log("ℹ️  Data directory doesn't exist, skipping file deletion");
      }
    } else {
      console.log("ℹ️  File deletion skipped (deleteFiles: false)");
    }

    const totalDeleted = botDeletedCount + deletedCount + dbDeletedCount;

    console.log("📊 Final statistics:", {
      botDeleted: botDeletedCount,
      dbDeleted: dbDeletedCount,
      fileDeleted: deletedCount,
      totalDeleted: totalDeleted,
      errorsCount: errors.length
    });

    if (errors.length > 0) {
      return c.json({
        success: false,
        message: `Partially deleted with ${errors.length} errors`,
        botDeleted: botDeletedCount,
        dbDeleted: dbDeletedCount,
        fileDeleted: deletedCount,
        totalDeleted: totalDeleted,
        botResults: botResults,
        errors: errors.slice(0, 10)
      }, 207);
    }

    return c.json({
      success: true,
      message: `Successfully deleted ${totalDeleted} items`,
      botDeleted: botDeletedCount,
      dbDeleted: dbDeletedCount,
      fileDeleted: deletedCount,
      totalDeleted: totalDeleted,
      botResults: botResults
    });

  } catch (error) {
    console.error("❌ Failed to delete tasks and data:", error);
    return c.json({
      success: false,
      error: "Failed to delete tasks and data",
      details: String(error)
    }, 500);
  }
});

// ==============================
// Роут для отправки одной задачи в бота API
// ==============================
app.post("/tasks/send-one", async (c) => {
  try {
    const BOT_API_URL = process.env.BOT_API_URL || 'https://deadlinetaskbot.productlove.ru/api/v1';
    const BOT_TOKEN = process.env.BOT_TOKEN;

    if (!BOT_TOKEN) {
      return c.json({
        success: false,
        error: "BOT_TOKEN environment variable is required"
      }, 400);
    }

    let body;
    try {
      const rawBody = await c.req.text();
      body = JSON.parse(rawBody);
    } catch (parseError) {
      return c.json({
        success: false,
        error: "Invalid JSON in request body",
        details: String(parseError)
      }, 400);
    }

    // Поддерживаем как jobId, так и id
    const jobId = body.jobId || body.id;

    if (!jobId) {
      return c.json({
        success: false,
        error: "jobId or id is required"
      }, 400);
    }

    console.log(`ℹ️  Sending single job: ${jobId}`);

    // Загружаем все задачи
    const jobs = await loadJobsFromDataFolder();

    // Ищем нужную задачу
    const rawJob = jobs.find(j => j.id === jobId);

    if (!rawJob) {
      return c.json({
        success: false,
        error: `Job with id ${jobId} not found`
      }, 404);
    }

    // Проверяем, не отправляли ли уже эту задачу
    const sentJobsDB = await loadSentJobsDB();
    if (sentJobsDB[jobId]) {
      return c.json({
        success: false,
        error: `Job ${jobId} already sent`,
        sentAt: sentJobsDB[jobId].sent_date
      }, 409);
    }

    // Структурируем задачу
    const structuredJob = await convertToStructuredJob({
      ...rawJob,
      id: jobId
    });

    // ВАЛИДАЦИЯ с новой функцией
    const validation = isValidJob(structuredJob);
    if (!validation.valid) {
      return c.json({
        success: false,
        error: "Job skipped: Invalid job",
        title: structuredJob.title,
        reason: validation.reason
      }, 400);
    }

    console.log(`📝 Structured job:`, {
      title: structuredJob.title.substring(0, 50),
      budget: `${structuredJob.budget_from}-${structuredJob.budget_to}`,
      tags: structuredJob.tags
    });

    // Отправляем в API
    const api = new DeadlineTaskApi(BOT_API_URL, BOT_TOKEN);

    const result = await api.createTask({
      jobTitle: structuredJob.title,
      description: structuredJob.description,
      budgetFrom: structuredJob.budget_from,
      budgetTo: structuredJob.budget_to,
      tags: structuredJob.tags,
      deadline: structuredJob.deadline
    });

    // Сохраняем в базу отправленных задач
    const sentJobRecord: SentJobRecord = {
      task_id: String(result.task_id),
      sent_date: new Date().toISOString(),
      status: "sent",
      original_title: rawJob.title || structuredJob.title,
      structured_title: structuredJob.title,
      budget: structuredJob.budget_from ?
        `${structuredJob.budget_from}-${structuredJob.budget_to}` : "нет",
      bot_response: result
    };

    sentJobsDB[jobId] = sentJobRecord;
    await saveSentJobsDB(sentJobsDB);

    console.log(`✅ Job ${jobId} sent successfully. API Task ID: ${result.task_id}`);

    return c.json({
      success: true,
      message: `Job ${jobId} sent successfully`,
      jobId,
      apiTaskId: result.task_id,
      structuredJob: {
        title: structuredJob.title,
        budget_from: structuredJob.budget_from,
        budget_to: structuredJob.budget_to,
        tags: structuredJob.tags,
        deadline: structuredJob.deadline
      }
    });

  } catch (error: any) {
    console.error(`❌ Failed to send single job:`, error);
    return c.json({
      success: false,
      error: "Failed to send job",
      details: error.message || String(error)
    }, 500);
  }
});

// ==============================
// Роут для отправки задач в бота API
// ==============================
app.post("/tasks/send", async (c) => {
  try {
    const BOT_API_URL = process.env.BOT_API_URL || 'https://deadlinetaskbot.productlove.ru/api/v1';
    const BOT_TOKEN = process.env.BOT_TOKEN;
    
    if (!BOT_TOKEN) {
      return c.json({ 
        success: false, 
        error: "BOT_TOKEN environment variable is required" 
      }, 400);
    }
    
    // Загружаем задачи из папки data
    const jobs = await loadJobsFromDataFolder();
    
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return c.json({ success: false, error: "No jobs found in data folder" }, 400);
    }
    
    console.log(`ℹ️  Total jobs loaded: ${jobs.length}`);
    
    // Настройки
    const MAX_JOBS_TO_PROCESS = process.env.MAX_JOBS_TO_PROCESS ? 
      parseInt(process.env.MAX_JOBS_TO_PROCESS) : 15;
    const jobsToProcess = jobs.slice(0, MAX_JOBS_TO_PROCESS);
    
    let sentCount = 0;
    let skippedCount = 0;
    let errors: string[] = [];
    const results: any[] = [];
    
    const sentJobsDB = await loadSentJobsDB();
    const seenHashes = new Set<string>();
    const api = new DeadlineTaskApi(BOT_API_URL, BOT_TOKEN);

    for (let i = 0; i < jobsToProcess.length; i++) {
      const rawJob = jobsToProcess[i];
      const jobId = rawJob.id || rawJob.originalId || `job_${Date.now()}_${i}`;
      const hash = (
        (rawJob.title || "") +
        "|" +
        (rawJob.description || "")
      ).toLowerCase().trim();
      
      // Пропускаем дубликаты по содержимому в текущей партии
      if (seenHashes.has(hash)) {
        skippedCount++;
        console.warn(`⚠️  Duplicate in batch, skipping job ${jobId}`);
        continue;
      }
      seenHashes.add(hash);
      
      // Проверяем, не отправляли ли уже эту задачу
      if (sentJobsDB[jobId]) {
        skippedCount++;
        console.warn(`⚠️  Job ${jobId} already sent, skipping`);
        continue;
      }

      try {
        console.log(`ℹ️  Processing job ${i + 1}/${jobsToProcess.length}: ${rawJob.title?.substring(0, 50)}...`);
        
        // Структурируем задачу
        const structuredJob = await convertToStructuredJob({
          ...rawJob,
          id: jobId
        });

        try {
          // Реальная отправка в API бота
          const result = await api.createTask({
            jobTitle: structuredJob.title,
            description: structuredJob.description,
            budgetFrom: structuredJob.budget_from,
            budgetTo: structuredJob.budget_to,
            tags: structuredJob.tags,
            deadline: structuredJob.deadline
          });
          const taskId = result.task_id;

          if (taskId) {
            // Сохраняем в базу отправленных задач
            const sentJobRecord: SentJobRecord = {
              task_id: taskId.toString(),
              sent_date: new Date().toISOString(),
              status: "sent",
              original_title: rawJob.title || structuredJob.title,
              structured_title: structuredJob.title,
              budget: structuredJob.budget_from ? 
                `${structuredJob.budget_from}-${structuredJob.budget_to}` : "нет",
              bot_response: result
            };

            sentJobsDB[jobId] = sentJobRecord;

            sentCount++;
            results.push({
              jobId,
              taskId,
              title: structuredJob.title,
              original_title: rawJob.title,
              budget: structuredJob.budget_from ? 
                `${structuredJob.budget_from}-${structuredJob.budget_to}` : "нет",
              original_budget: rawJob.budget || "нет",
              tags: structuredJob.tags,
              deadline: structuredJob.deadline,
              status: "success",
              bot_response: result
            });

            console.log(`✅ Sent job ${jobId} -> bot task ${taskId}`);
          } else {
            throw new Error('No task_id in response');
          }
          
          // Пауза между отправками
          const delay = Math.random() * (parseInt(process.env.API_DELAY_MAX || '100') - parseInt(process.env.API_DELAY_MIN || '50')) + parseInt(process.env.API_DELAY_MIN || '50');
          await new Promise(resolve => setTimeout(resolve, delay));
        } catch (apiError: any) {
          const msg = `API error for job ${jobId}: ${apiError.message || String(apiError)}`;
          errors.push(msg);
          console.error(`❌ ${msg}`);
          results.push({
            jobId,
            title: structuredJob.title,
            status: "failed",
            error: msg
          });
        }

      } catch (error: any) {
        const msg = `Processing error for job ${jobId}: ${error.message || String(error)}`;
        errors.push(msg);
        console.error(`❌ ${msg}`, error);
      }
    }

    // Сохраняем обновленную базу отправленных задач
    await saveSentJobsDB(sentJobsDB);

    const report = {
      timestamp: new Date().toISOString(),
      statistics: {
        total: jobsToProcess.length,
        sent: sentCount,
        skipped: skippedCount,
        errors: errors.length
      },
      results,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      config: {
        bot_api_url: BOT_API_URL,
        max_jobs_processed: MAX_JOBS_TO_PROCESS
      }
    };

    return c.json({
      success: true,
      message: `Processed ${jobsToProcess.length} jobs from data folder`,
      report
    });

  } catch (error: any) {
    console.error(`❌ Failed to send tasks:`, error);
    return c.json({
      success: false,
      error: "Failed to send tasks",
      details: error.message || String(error)
    }, 500);
  }
});

// ==============================
// Вспомогательная функция для форматирования Telegram сообщения
// ==============================
function formatTelegramMessage(job: any): string {
  const lines = [];
  
  // Заголовок
  lines.push(`<b>${job.title}</b>\n`);
  
  // Описание
  if (job.description) {
    const desc = job.description.length > 1500 
      ? job.description.substring(0, 1500) + '...' 
      : job.description;
    lines.push(`${desc}\n`);
  }
  
  // Бюджет
  if (job.budget_from || job.budget_to) {
    const budget = job.budget_from && job.budget_to 
      ? `${job.budget_from} - ${job.budget_to} руб.`
      : job.budget_from 
        ? `от ${job.budget_from} руб.`
        : job.budget_to 
          ? `до ${job.budget_to} руб.`
          : 'Договорная';
    lines.push(`💰 <b>Бюджет:</b> ${budget}`);
  }
  
  // Срок
  if (job.deadline) {
    lines.push(`⏰ <b>Срок:</b> ${job.deadline} дней`);
  }
  
  // Теги
  if (job.tags && job.tags.length > 0) {
    lines.push(`🏷️ <b>Теги:</b> ${job.tags.slice(0, 5).join(', ')}`);
  }
  
  // Ссылка на оригинал
  if (job.url) {
    lines.push(`\n🔗 <a href="${job.url}">Ссылка на задание</a>`);
  }
  
  // Ссылка на канал
  if (job.channelUrl) {
    lines.push(`📢 <a href="${job.channelUrl}">Канал с заданиями</a>`);
  }
  
  return lines.join('\n');
}

// ==============================
// Эндпоинт для проверки здоровья
// ==============================

app.get("/tasks/health", async (c) => {
  try {
    const dataDirExists = await fs.access(path.join(process.cwd(), 'data'))
      .then(() => true)
      .catch(() => false);
    
    const dbExists = await fs.access(path.join(process.cwd(), 'sent_jobs_database.json'))
      .then(() => true)
      .catch(() => false);
    
    return c.json({
      success: true,
      status: "operational",
      checks: {
        data_directory: dataDirExists ? "exists" : "missing",
        jobs_database: dbExists ? "exists" : "missing",
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      status: "degraded",
      error: String(error)
    }, 500);
  }
});

// ==============================
// Эндпоинт для тестирования структурирования
// ==============================

app.post("/tasks/test-structure", async (c) => {
  try {
    const { title, description, channelUrl } = await c.req.json();
    
    const testJob = {
      id: "test_job",
      title: title || "Нужен Python разработчик для создания бота",
      description: description || "Нужно создать телеграм бота на Python. Бюджет: 5000-10000 руб. Срок: 3 дня. Требуется опыт работы с aiogram.",
      channelUrl: channelUrl || "https://t.me/freelance_jobs",
      url: "https://t.me/some_post",
      scrapedAt: new Date().toISOString()
    };
    
    const structured = await convertToStructuredJob(testJob);
    
    return c.json({
      success: true,
      input: testJob,
      output: structured,
      processing: {
        title: getCleanTitle(testJob.title, testJob.description),
        description: getCleanDescription(
          getCleanTitle(testJob.title, testJob.description), 
          testJob.description
        ),
        budget: extractBudget(testJob.title + " " + testJob.description),
        tags: getIntelligentTags(
          getCleanTitle(testJob.title, testJob.description),
          getCleanDescription(
            getCleanTitle(testJob.title, testJob.description),
            testJob.description
          )
        ),
        deadline: estimateDeadline(testJob.description)
      }
    });
    
  } catch (error) {
    Logger.error("Test structure failed", error);
    return c.json({
      success: false,
      error: "Test structure failed",
      details: String(error)
    }, 500);
  }
});

const PORT = 3000;

// ==============================
// Эндпоинт для получения несправленных задач
// ==============================

app.get("/tasks/unsent", async (c) => {
  try {
    const jobs = await loadJobsFromDataFolder();
    const sentJobsDB = await loadSentJobsDB();

    const unsentJobs = jobs.filter(job => {
      const jobId = job.id || job.originalId || `job_${job.title}`;
      return !sentJobsDB[jobId];
    });

    return c.json({
      success: true,
      total_jobs: jobs.length,
      sent_jobs: Object.keys(sentJobsDB).length,
      unsent_count: unsentJobs.length,
      unsent_jobs: unsentJobs.map(job => ({
        id: job.id || job.originalId,
        title: job.title?.substring(0, 80),
        budget: job.budget,
        description: job.description?.substring(0, 100)
      }))
    });
  } catch (error) {
    Logger.error("Failed to get unsent jobs", error);
    return c.json({ success: false, error: "Failed to get unsent jobs" }, 500);
  }
});

// ==============================
// Получить все задачи с API бота
// ==============================

app.get("/api/bot/tasks", async (c) => {
  try {
    const BOT_API_URL = process.env.BOT_API_URL || 'https://deadlinetaskbot.productlove.ru/api/v1';
    const BOT_TOKEN = process.env.BOT_TOKEN;

    if (!BOT_TOKEN) {
      return c.json({ success: false, error: "BOT_TOKEN not set" }, 400);
    }

    const api = new DeadlineTaskApi(BOT_API_URL, BOT_TOKEN);
    const response = await api.getMyTasks(0, 1000);
    
    // Берем массив задач из разных возможных ключей ответа
    const tasks = Array.isArray(response) ? response : 
                  Array.isArray(response?.tasks) ? response.tasks : 
                  [];

    const taskList = tasks.map(t => ({
      id: t.id,
      title: t.title?.substring(0, 80) || 'No title',
      status: t.status,
      budget: t.budget
    }));

    return c.json({
      success: true,
      count: taskList.length,
      tasks: taskList
    });
  } catch (error: any) {
    console.error("Failed to get bot tasks:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==============================
// Удалить задачу по ID
// ==============================

app.delete("/api/bot/tasks/:id", async (c) => {
  try {
    const BOT_API_URL = process.env.BOT_API_URL || 'https://deadlinetaskbot.productlove.ru/api/v1';
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const taskId = c.req.param("id");

    if (!BOT_TOKEN) {
      return c.json({ success: false, error: "BOT_TOKEN not set" }, 400);
    }

    if (!taskId) {
      return c.json({ success: false, error: "Task ID is required" }, 400);
    }

    console.log(`🗑️  Deleting task: ${taskId}`);

    const api = new DeadlineTaskApi(BOT_API_URL, BOT_TOKEN);
    const result = await api.deleteTask(taskId);

    return c.json({
      success: true,
      message: `Task ${taskId} deleted`,
      result
    });
  } catch (error: any) {
    console.error(`Failed to delete task:`, error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==============================
// Удалить все задачи по одной
// ==============================

app.delete("/api/bot/tasks-all", async (c) => {
  try {
    const BOT_API_URL = process.env.BOT_API_URL || 'https://deadlinetaskbot.productlove.ru/api/v1';
    const BOT_TOKEN = process.env.BOT_TOKEN;

    if (!BOT_TOKEN) {
      return c.json({ success: false, error: "BOT_TOKEN not set" }, 400);
    }

    const api = new DeadlineTaskApi(BOT_API_URL, BOT_TOKEN);
    
    // Получаем все задачи
    const response = await api.getMyTasks(0, 1000);
    const tasks = Array.isArray(response) ? response : 
                  Array.isArray(response?.tasks) ? response.tasks : 
                  [];

    console.log(`🗑️  Starting to delete ${tasks.length} tasks...`);

    let deletedCount = 0;
    let failedCount = 0;
    const results: any[] = [];
    const errors: string[] = [];

    for (const task of tasks) {
      try {
        console.log(`🗑️  Deleting ${deletedCount + failedCount + 1}/${tasks.length}: ID ${task.id} - ${task.title?.substring(0, 40)}`);
        
        await api.deleteTask(String(task.id));
        deletedCount++;
        results.push({
          id: task.id,
          title: task.title?.substring(0, 50),
          status: "✅ deleted"
        });

        console.log(`✅ Deleted: ${task.id}`);

        // Задержка между удалениями
        const delay = Math.random() * 500 + 300; // 0.3-0.8 сек
        await new Promise(resolve => setTimeout(resolve, delay));

      } catch (error: any) {
        failedCount++;
        const msg = `Failed to delete task ${task.id}: ${error.message}`;
        errors.push(msg);
        results.push({
          id: task.id,
          title: task.title?.substring(0, 50),
          status: "❌ failed",
          error: error.message
        });
        console.error(`❌ ${msg}`);
      }
    }

    return c.json({
      success: deletedCount > 0,
      message: `Deleted ${deletedCount} tasks, failed ${failedCount}`,
      statistics: {
        total: tasks.length,
        deleted: deletedCount,
        failed: failedCount
      },
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error(`Failed to delete all tasks:`, error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==============================
// Эндпоинт для отправки всех несправленных задач по одной
// ==============================

app.post("/tasks/send-all-unsent", async (c) => {
  try {
    const BOT_API_URL = process.env.BOT_API_URL || 'https://deadlinetaskbot.productlove.ru/api/v1';
    const BOT_TOKEN = process.env.BOT_TOKEN;

    if (!BOT_TOKEN) {
      return c.json({ 
        success: false, 
        error: "BOT_TOKEN environment variable is required" 
      }, 400);
    }

    const jobs = await loadJobsFromDataFolder();
    const sentJobsDB = await loadSentJobsDB();
    const api = new DeadlineTaskApi(BOT_API_URL, BOT_TOKEN);

    // Удаляем все старые задачи перед отправкой новых
    console.log("🗑️  Deleting all old tasks from bot...");
    const existingTasks = await api.getMyTasks(0, 1000);
    const tasksToDelete = Array.isArray(existingTasks) ? existingTasks : 
                          Array.isArray(existingTasks?.tasks) ? existingTasks.tasks : [];
    
    for (const task of tasksToDelete) {
      try {
        await api.deleteTask(String(task.id));
        // Задержка между удалениями
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 300));
      } catch (err) {
        console.error(`Failed to delete task ${task.id}:`, err);
      }
    }
    console.log(`✅ Deleted ${tasksToDelete.length} old tasks`);

    // Фильтруем неотправленные и не-дублирующиеся задачи
    const seenTitles = new Set<string>();
    const unsentJobs = jobs.filter(job => {
      const jobId = job.id || job.originalId || `job_${job.title}`;
      const titleHash = (job.title || '').toLowerCase().trim();
      
      // Пропускаем если уже отправляли
      if (sentJobsDB[jobId]) {
        return false;
      }
      
      // Пропускаем дубликаты в текущей партии
      if (seenTitles.has(titleHash)) {
        console.log(`⚠️  Пропущен дубликат: ${job.title?.substring(0, 50)}...`);
        return false;
      }
      
      seenTitles.add(titleHash);
      return true;
    });

    if (unsentJobs.length === 0) {
      return c.json({
        success: true,
        message: "All jobs already sent",
        sent: 0
      });
    }

    console.log(`ℹ️  Starting to send ${unsentJobs.length} unsent jobs...`);

    let sentCount = 0;
    let failedCount = 0;
    const results: any[] = [];
    const errors: string[] = [];

    for (const rawJob of unsentJobs) {
      const jobId = rawJob.id || rawJob.originalId || `job_${rawJob.title}`;

      try {
        console.log(`📝 Processing: ${rawJob.title?.substring(0, 50)}...`);

        // Структурируем задачу
        const structuredJob = await convertToStructuredJob({
          ...rawJob,
          id: jobId
        });

        // ВАЛИДАЦИЯ с новой функцией
        const validation = isValidJob(structuredJob);
        if (!validation.valid) {
          failedCount++;
          errors.push(`Skipped ${jobId}: ${validation.reason} - "${structuredJob.title}"`);
          continue;
        }

        // Применяем скидку 20% на бюджет
        const discountPercent = 0.20;
        const discountedBudgetFrom = structuredJob.budget_from ? 
          Math.round(structuredJob.budget_from * (1 - discountPercent)) : null;
        const discountedBudgetTo = structuredJob.budget_to ? 
          Math.round(structuredJob.budget_to * (1 - discountPercent)) : null;
        
        console.log(`💰 Оригинальный: ${structuredJob.budget_from}-${structuredJob.budget_to}, Со скидкой 20%: ${discountedBudgetFrom}-${discountedBudgetTo}`);
        
        // Отправляем в API со скидкой
        const result = await api.createTask({
          jobTitle: structuredJob.title,
          description: structuredJob.description,
          budgetFrom: discountedBudgetFrom,
          budgetTo: discountedBudgetTo,
          tags: structuredJob.tags,
          deadline: structuredJob.deadline
        });

        // Сохраняем в базу
        sentJobsDB[jobId] = {
          task_id: String(result.task_id),
          sent_date: new Date().toISOString(),
          status: "sent",
          original_title: rawJob.title,
          structured_title: structuredJob.title,
          original_budget: structuredJob.budget_from ? 
            `${structuredJob.budget_from}-${structuredJob.budget_to}` : "нет",
          discounted_budget: discountedBudgetFrom ? 
            `${discountedBudgetFrom}-${discountedBudgetTo}` : "нет"
        };

        sentCount++;
        results.push({
          jobId,
          title: structuredJob.title,
          status: "✅ sent",
          apiTaskId: result.task_id
        });

        console.log(`✅ Sent: ${structuredJob.title.substring(0, 50)}`);

        // Задержка между отправками
        const delay = Math.random() * 1000 + 500; // 0.5-1.5 сек
        await new Promise(resolve => setTimeout(resolve, delay));

      } catch (error: any) {
        failedCount++;
        const msg = `Failed to send "${rawJob.title?.substring(0, 50)}": ${error.message}`;
        errors.push(msg);
        results.push({
          jobId,
          title: rawJob.title?.substring(0, 50),
          status: "❌ failed",
          error: error.message
        });
        console.error(`❌ ${msg}`);
      }
    }

    // Сохраняем обновленную базу
    await saveSentJobsDB(sentJobsDB);

    return c.json({
      success: true,
      message: `Sent ${sentCount} jobs, failed ${failedCount}`,
      statistics: {
        total: unsentJobs.length,
        sent: sentCount,
        failed: failedCount
      },
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error(`❌ Failed to send unsent tasks:`, error);
    return c.json({
      success: false,
      error: "Failed to send unsent tasks",
      details: error.message || String(error)
    }, 500);
  }
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(`http://${req.headers.host}${req.url}`);
    
    let body: any = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk) => {
          data += chunk;
        });
        req.on("end", () => {
          resolve(data);
        });
        req.on("error", reject);
      });
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

  // Optionally run an initial crawl on startup if requested via env
  if (process.env.START_ON_BOOT && (process.env.START_ON_BOOT === 'true' || process.env.START_ON_BOOT === '1')) {
    const attempts = Number(process.env.START_ON_BOOT_ATTEMPTS || 5);
    const delayMs = Number(process.env.START_ON_BOOT_DELAY_MS || 10000);

    (async () => {
      for (let i = 1; i <= attempts; i++) {
        try {
          Logger.info(`Attempt ${i}/${attempts} to run initial crawl...`);
          const res = await runCrawlAndSave();
          if (res.success) {
            Logger.success(`Initial crawl finished: ${res.message}`);
            break;
          } else {
            Logger.warn(`Initial crawl attempt ${i} failed: ${res.error || res.message}`);
          }
        } catch (e) {
          Logger.error(`Initial crawl attempt ${i} error:`, e);
        }
        if (i < attempts) {
          await new Promise((r) => setTimeout(r, delayMs));
        } else {
          Logger.error(`Initial crawl failed after ${attempts} attempts`);
        }
      }
    })();
  }
});