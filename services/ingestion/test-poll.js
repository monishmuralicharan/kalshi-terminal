import 'dotenv/config'
import { pollFeed } from './src/workers/rss-worker.js'

const testFeed = {
  id: 'bbc-world',
  url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  category: 'world',
  pollIntervalMs: 60_000
}

// 1. Create mock dependencies
const mockDeps = {
  // Always returns true so we can see the "new" articles
  dedup: {
    check: async (url) => {
      console.log(`Checking URL: ${url}`);
      return true; 
    }
  },
  // Just logs the article instead of sending it to a real database/queue
  publisher: {
    publish: async (article) => {
      console.log(`Publishing article: ${article.title}`);
    }
  }
}

// 2. Pass the mock dependencies as the second argument
const result = await pollFeed(testFeed, mockDeps)

console.log('--- Final Result ---')
console.log(JSON.stringify(result, null, 2))