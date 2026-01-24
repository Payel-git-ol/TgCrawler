import fs from 'fs/promises';
import path from 'path';

export async function deleteFolderContents(folderPath: string): Promise<void> {
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