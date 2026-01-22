import { Task } from "./taskManager";
import { Logger } from "../../log/logger";

export class TelegramTaskPublisher {
  constructor(
    private botToken: string,
    private botName: string = "doindeadlinebot"
  ) {}

  async publishTask(task: Task): Promise<boolean> {
    try {
      const message = this.formatTaskMessage(task);
      await this.sendToBot(message);
      Logger.success(`Task ${task.id} published to @${this.botName}`);
      return true;
    } catch (error) {
      Logger.error("Failed to publish task to Telegram", error);
      return false;
    }
  }

  private formatTaskMessage(task: Task): string {
    const status = this.getStatusEmoji(task.status);
    const agent = task.selectedAgent ? `🤖 Agent: ${task.selectedAgent}` : "";
    const cost = task.actualCost ? `💰 Cost: $${task.actualCost}` : "";
    const budget =
      task.projectedValue && task.actualCost
        ? `📊 Budget: ${((task.actualCost / task.projectedValue) * 100).toFixed(1)}%`
        : "";

    return `${status} <b>${task.jobTitle}</b>

📌 Task ID: <code>${task.id}</code>
🔗 Job ID: <code>${task.jobId}</code>
${task.deadline ? `⏰ Deadline: ${task.deadline}` : ""}

<b>Workflow Status:</b>
${task.isSuitable !== undefined ? `✓ Suitable for AI: ${task.isSuitable ? "Yes" : "No"}` : "⏳ Pending validation"}
${task.customerCapable !== undefined ? `✓ Customer Capable: ${task.customerCapable ? "Premium" : "Budget"}` : ""}
${agent}
${cost}
${budget}

<b>Notes:</b> ${task.notes || "No notes"}`;
  }

  private getStatusEmoji(status: string): string {
    const statusMap: Record<string, string> = {
      pending: "⏳",
      validating: "🔍",
      selecting_agent: "🤖",
      processing: "⚙️",
      completed: "✅",
      failed: "❌",
      rejected: "⛔",
    };
    return statusMap[status] || "❓";
  }

  private async sendToBot(message: string): Promise<void> {

    const payload = {
      token: this.botToken,
      bot: this.botName,
      message,
      timestamp: new Date().toISOString(),
    };

    Logger.info(`Task message ready for @${this.botName}:`);
    Logger.info(message);

    console.log("\n📤 Telegram message payload:");
    console.log(JSON.stringify(payload, null, 2));
  }
}
