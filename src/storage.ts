import * as fs from "fs";
import * as path from "path";
import { Logger } from "./log/logger";

export interface JobPost {
  id: string;
  title: string;
  description: string;
  workType: string;
  payment: string;
  deadline: string;
  url: string;
  scrapedAt: string;
}

export class DataStorage {
  constructor(private storagePath: string = "./data") {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  async saveJobs(jobs: JobPost[]): Promise<string> {
    const filename = this.getFilename();
    fs.writeFileSync(filename, JSON.stringify(jobs, null, 2));
    Logger.success(`Saved ${jobs.length} posts to ${filename}`);
    return filename;
  }

  async loadJobs(filename?: string): Promise<JobPost[]> {
    const files = this.listJsonFiles();
    if (files.length === 0) {
      return [];
    }

    const file = filename || files[files.length - 1];
    const content = fs.readFileSync(path.join(this.storagePath, file), "utf-8");
    return JSON.parse(content);
  }

  async loadAllJobs(): Promise<JobPost[]> {
    const files = this.listJsonFiles();
    const allJobs: JobPost[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(
          path.join(this.storagePath, file),
          "utf-8"
        );
        const jobs = JSON.parse(content);
        allJobs.push(...jobs);
      } catch (error) {
        Logger.warn(`Failed to load ${file}`);
      }
    }

    return allJobs;
  }

  async getExistingIds(): Promise<Set<string>> {
    const allJobs = await this.loadAllJobs();
    return new Set(allJobs.map((job) => job.id));
  }

  async getExistingContent(): Promise<Set<string>> {
    const allJobs = await this.loadAllJobs();
    return new Set(allJobs.map((job) => this.getContentHash(job)));
  }

  private getContentHash(job: JobPost): string {
    return `${job.title}|${job.description}`;
  }

  async saveNewJobs(jobs: JobPost[]): Promise<{ saved: JobPost[]; skipped: number }> {
    const existingIds = await this.getExistingIds();
    const existingContent = await this.getExistingContent();

    const newJobs = jobs.filter((job) => {
      const contentHash = this.getContentHash(job);
      return !existingIds.has(job.id) && !existingContent.has(contentHash);
    });

    if (newJobs.length === 0) {
      Logger.warn("No new jobs found, skipping save");
      return { saved: [], skipped: jobs.length };
    }

    const filename = this.getFilename();
    fs.writeFileSync(filename, JSON.stringify(newJobs, null, 2));
    Logger.success(
      `Saved ${newJobs.length} new posts (${jobs.length - newJobs.length} duplicates skipped)`
    );

    return { saved: newJobs, skipped: jobs.length - newJobs.length };
  }

  private getFilename(): string {
    const date = new Date().toISOString().split("T")[0];
    const time = new Date().toISOString().split("T")[1].split(".")[0].replace(/:/g, "-");
    return path.join(this.storagePath, `jobs_${date}_${time}.json`);
  }

  private listJsonFiles(): string[] {
    return fs
      .readdirSync(this.storagePath)
      .filter((f) => f.endsWith(".json"))
      .sort();
  }
}
