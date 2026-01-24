// log/logger.ts
export class Logger {
  static info(message: string, data?: any): void {
    if (data) {
      console.log(`ℹ️  ${message}`, data);
    } else {
      console.log(`ℹ️  ${message}`);
    }
  }

  static success(message: string): void {
    console.log(`✅ ${message}`);
  }

  static error(message: string, error?: any): void {
    if (error) {
      console.error(`❌ ${message}`, error);
    } else {
      console.error(`❌ ${message}`);
    }
  }

  static warn(message: string): void {
    console.warn(`⚠️  ${message}`);
  }

  static debug(message: string, data?: any): void {
    if (process.env.DEBUG) {
      if (data) {
        console.log(`🔍 ${message}`, data);
      } else {
        console.log(`🔍 ${message}`);
      }
    }
  }
}