export class Logger {
  static info(message: string): void {
    console.log(`ℹ️  ${message}`);
  }

  static success(message: string): void {
    console.log(`✅ ${message}`);
  }

  static error(message: string, error?: unknown): void {
    console.error(`❌ ${message}`);
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    }
  }

  static warn(message: string): void {
    console.warn(`⚠️  ${message}`);
  }

  static debug(message: string, data?: unknown): void {
    if (process.env.DEBUG) {
      console.log(`🔍 ${message}`, data ?? "");
    }
  }

  static section(title: string): void {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`📌 ${title}`);
    console.log(`${"=".repeat(50)}`);
  }
}
