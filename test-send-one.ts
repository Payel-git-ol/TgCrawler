import { DeadlineTaskApi } from './src/services/deadlineTaskApi';

/**
 * Тестовый скрипт для отправки одной задачи
 */

const BOT_API_URL = process.env.BOT_API_URL || 'https://deadlinetaskbot.productlove.ru/api/v1';
const BOT_TOKEN = process.env.BOT_TOKEN;

async function testSendOneJob() {
  if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not set in .env file');
    process.exit(1);
  }

  const jobId = process.argv[2];
  if (!jobId) {
    console.error('❌ Usage: npm run test:send-one <jobId>');
    console.error('❌ Example: npm run test:send-one post_1769258057037');
    process.exit(1);
  }

  console.log('🧪 Testing single job send...');
  console.log(`Job ID: ${jobId}`);
  console.log(`API URL: ${BOT_API_URL}`);

  const api = new DeadlineTaskApi(BOT_API_URL, BOT_TOKEN);

  try {
    // Получаем список задач из data
    const fs = require('fs').promises;
    const path = require('path');

    const dataDir = path.join(process.cwd(), 'data');
    const files = await fs.readdir(dataDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let targetJob = null;
    for (const file of jsonFiles) {
      const filePath = path.join(dataDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const jobs = JSON.parse(content);

      const job = jobs.find((j: any) => j.id === jobId);
      if (job) {
        targetJob = job;
        break;
      }
    }

    if (!targetJob) {
      console.error(`❌ Job with ID ${jobId} not found in data folder`);
      process.exit(1);
    }

    console.log('📝 Found job:', {
      title: targetJob.title?.substring(0, 50),
      description: targetJob.description?.substring(0, 50)
    });

    // Структурируем задачу
    const structuredJob = {
      id: jobId,
      title: targetJob.title?.replace(/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1f926}-\u{1f937}\u{10000}-\u{10FFFF}\u{1f1f0}-\u{1f1ff}\u{1f201}-\u{1f251}📌📝💳🌐〰️#]+/gu, '').trim() || 'Нужно выполнить задачу',
      description: targetJob.description?.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1f926}-\u{1f937}\u{10000}-\u{10FFFF}\u{1f1f0}-\u{1f1ff}\u{1f201}-\u{1f251}📌📝💳🌐〰️#]/gu, '').trim() || 'Требуется выполнить задачу',
      budget_from: null,
      budget_to: null,
      tags: ['разработка'],
      deadline: 7
    };

    console.log('📦 Structured job:', {
      title: structuredJob.title.substring(0, 50),
      description: structuredJob.description.substring(0, 50),
      tags: structuredJob.tags
    });

    // Отправляем задачу
    const result = await api.createTask({
      jobTitle: structuredJob.title,
      description: structuredJob.description,
      budgetFrom: structuredJob.budget_from,
      budgetTo: structuredJob.budget_to,
      tags: structuredJob.tags,
      deadline: structuredJob.deadline
    });

    console.log('✅ Job sent successfully!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));

  } catch (error: any) {
    console.error('❌ Failed to send job:', error.message);
    console.error('📊 Full error:', error);
    process.exit(1);
  }
}

testSendOneJob().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});