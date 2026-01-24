import { Logger } from "../log/logger";

export interface DeadlineTask {
  id?: string;
  jobId?: string;
  jobTitle: string;
  description: string;
  budgetFrom?: number | null;
  budgetTo?: number | null;
  tags?: string[];
  deadline?: number;
  url?: string;
  channelUrl?: string;
  metadata?: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  task?: T;
  task_id?: string;
  detail?: string;
  error?: string;
  message?: string;
}

export class DeadlineTaskApi {
  private baseURL: string;
  private token: string;

  constructor(baseURL: string, token: string) {
    this.baseURL = baseURL.replace(/\/$/, ''); // Удаляем trailing slash
    this.token = token;
    Logger.info(`🔧 DeadlineTaskApi initialized with baseURL: ${this.baseURL}`);
  }

  private getQueryParams(): string {
    return `?token=${encodeURIComponent(this.token)}`;
  }

  private async handleResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type');
    let data;

    try {
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
    } catch (error) {
      Logger.error("Failed to parse response body", error);
      data = {};
    }

    if (!response.ok) {
      const errorMessage = data.detail || data.error || data.message || `HTTP ${response.status}`;
      Logger.error(`API Error: ${errorMessage}`, { status: response.status, data });
      throw new Error(`API Error: ${errorMessage}`);
    }

    return data;
  }

  async createTask(task: DeadlineTask): Promise<any> {
    // Use GET /tasks/client/newhardtask endpoint as per API documentation
    const params = new URLSearchParams();
    params.append('token', this.token);
    params.append('title', task.jobTitle || 'Задача');
    if (task.description) params.append('description', task.description);
    if (task.budgetFrom) params.append('budget_from', String(task.budgetFrom));
    if (task.budgetTo) params.append('budget_to', String(task.budgetTo));
    if (task.deadline) params.append('deadline', String(task.deadline));
    if (task.tags && task.tags.length > 0) {
      params.append('tags', task.tags.join(','));
    }
    params.append('importance', '5');
    
    const url = `${this.baseURL}/tasks/client/newhardtask?${params.toString()}`;
    
    Logger.info(`📤 Creating task: ${task.jobTitle?.substring(0, 50)}...`);
    Logger.debug(`🔗 URL: ${url.replace(this.token, '***')}`);
    Logger.debug(`📦 Task data`, { 
      title: task.jobTitle,
      budget_from: task.budgetFrom,
      budget_to: task.budgetTo,
      deadline: task.deadline,
      tags: task.tags
    });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      const result = await this.handleResponse(response);
      const taskId = result.task_id || result.data?.id || result.task?.id || result.id || result;
      
      Logger.success(`✅ Task created successfully. ID: ${taskId}`);
      return { success: true, task_id: taskId, data: result };
    } catch (error) {
      Logger.error(`Failed to create task`, error);
      throw error;
    }
  }

  async deleteTask(taskId: string): Promise<any> {
    const url = `${this.baseURL}/tasks/client/${taskId}${this.getQueryParams()}`;
    
    Logger.info(`🗑️  Deleting task: ${taskId}`);
    Logger.debug(`🔗 URL: ${url}`, { url });

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const result = await this.handleResponse(response);
      Logger.success(`✅ Task ${taskId} deleted successfully`);
      return { success: true, task_id: taskId, data: result };
    } catch (error) {
      Logger.error(`Failed to delete task ${taskId}`, error);
      throw error;
    }
  }

  async deleteAllCancelledTasks(): Promise<any> {
    const url = `${this.baseURL}/tasks/client/cancelled${this.getQueryParams()}`;
    
    Logger.info(`🗑️  Deleting all cancelled tasks`);
    Logger.debug(`🔗 URL: ${url}`, { url });

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const result = await this.handleResponse(response);
      Logger.success(`✅ All cancelled tasks deleted successfully`);
      return { success: true, data: result };
    } catch (error) {
      Logger.error(`Failed to delete all cancelled tasks`, error);
      throw error;
    }
  }

  async getMyTasks(offset: number = 0, limit: number = 50): Promise<any> {
    const url = `${this.baseURL}/tasks/client${this.getQueryParams()}&offset=${offset}&limit=${limit}`;
    
    Logger.info(`📖 Getting my tasks (offset: ${offset}, limit: ${limit})`);
    Logger.debug(`🔗 URL: ${url}`, { url });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const result = await this.handleResponse(response);
      const tasksCount = Array.isArray(result) ? result.length : result.data?.length || 0;
      Logger.success(`✅ Retrieved ${tasksCount} tasks`);
      return { success: true, tasks: Array.isArray(result) ? result : result.data, data: result };
    } catch (error) {
      Logger.error(`Failed to get my tasks`, error);
      throw error;
    }
  }

  async getTask(taskId: string): Promise<any> {
    const url = `${this.baseURL}/tasks/client/${taskId}${this.getQueryParams()}`;
    
    Logger.info(`📖 Getting task: ${taskId}`);
    Logger.debug(`🔗 URL: ${url}`, { url });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const result = await this.handleResponse(response);
      Logger.success(`✅ Task ${taskId} retrieved successfully`);
      return { success: true, task: result, data: result };
    } catch (error) {
      Logger.error(`Failed to get task ${taskId}`, error);
      throw error;
    }
  }

  async updateTask(taskId: string, updates: Partial<DeadlineTask>): Promise<any> {
    const url = `${this.baseURL}/tasks/client/${taskId}${this.getQueryParams()}`;
    
    Logger.info(`✏️  Updating task: ${taskId}`);
    Logger.debug(`🔗 URL: ${url}`, { url });
    Logger.debug(`📦 Updates`, { updates });

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      const result = await this.handleResponse(response);
      Logger.success(`✅ Task ${taskId} updated successfully`);
      return { success: true, task_id: taskId, data: result };
    } catch (error) {
      Logger.error(`Failed to update task ${taskId}`, error);
      throw error;
    }
  }

  async publishTask(taskId: string): Promise<any> {
    const url = `${this.baseURL}/tasks/client/${taskId}/republish${this.getQueryParams()}`;
    
    Logger.info(`📢 Publishing task: ${taskId}`);
    Logger.debug(`🔗 URL: ${url}`, { url });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      const result = await this.handleResponse(response);
      Logger.success(`✅ Task ${taskId} published successfully`);
      return { success: true, task_id: taskId, data: result };
    } catch (error) {
      Logger.error(`Failed to publish task ${taskId}`, error);
      throw error;
    }
  }
}
