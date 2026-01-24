import { DeadlineTaskApi } from './src/services/deadlineTaskApi';

/**
 * Тестовый скрипт для проверки интеграции с API Deadline Bot
 */

const BOT_API_URL = process.env.BOT_API_URL || 'https://deadlinetaskbot.productlove.ru/api/v1';
const BOT_TOKEN = process.env.BOT_TOKEN;

async function runTests() {
  if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not set in .env file');
    process.exit(1);
  }

  console.log('🧪 Starting API integration tests...\n');
  console.log(`API URL: ${BOT_API_URL}`);
  console.log(`Token: ${BOT_TOKEN?.substring(0, 10)}...\n`);

  const api = new DeadlineTaskApi(BOT_API_URL, BOT_TOKEN);

  try {
    // Test 1: Create a test task
    console.log('📝 Test 1: Creating test task...');
    const testTask = {
      jobTitle: 'Test Task - TypeScript Development',
      description: 'This is a test task to verify API integration. Need TypeScript developer to create a small utility.',
      budgetFrom: 5000,
      budgetTo: 10000,
      tags: ['TypeScript', 'Node.js', 'API'],
      deadline: 7
    };

    try {
      const createResult = await api.createTask(testTask);
      console.log('✅ Task created:', JSON.stringify(createResult, null, 2));
      
      if (createResult.task_id) {
        const taskId = createResult.task_id;
        
        // Test 2: Get the created task
        console.log('\n📖 Test 2: Getting created task...');
        try {
          const getResult = await api.getTask(taskId);
          console.log('✅ Task retrieved:', JSON.stringify(getResult, null, 2).substring(0, 200) + '...');
        } catch (err) {
          console.error('❌ Failed to get task:', err);
        }

        // Test 3: Update the task
        console.log('\n✏️  Test 3: Updating task...');
        try {
          const updateResult = await api.updateTask(taskId, {
            jobTitle: 'Updated Test Task - TypeScript Development'
          });
          console.log('✅ Task updated:', JSON.stringify(updateResult, null, 2).substring(0, 200) + '...');
        } catch (err) {
          console.error('❌ Failed to update task:', err);
        }

        // Test 4: Delete the task
        console.log('\n🗑️  Test 4: Deleting task...');
        try {
          const deleteResult = await api.deleteTask(taskId);
          console.log('✅ Task deleted:', JSON.stringify(deleteResult, null, 2).substring(0, 200) + '...');
        } catch (err) {
          console.error('❌ Failed to delete task:', err);
        }
      }
    } catch (err) {
      console.error('❌ Failed to create task:', err);
    }

    // Test 5: Get my tasks
    console.log('\n📚 Test 5: Getting my tasks...');
    try {
      const tasksResult = await api.getMyTasks(0, 5);
      console.log('✅ Tasks retrieved:', tasksResult.tasks?.length || 0, 'tasks found');
    } catch (err) {
      console.error('❌ Failed to get tasks:', err);
    }

  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }

  console.log('\n✅ All tests completed!');
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
