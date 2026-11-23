import { collectNews } from '../dist/_worker.js';
import { writeFile } from 'node:fs/promises';
const news=await collectNews();
if(!news.items.length)throw new Error('All RSS sources failed; existing snapshot retained.');
await writeFile(new URL('../dist/news-snapshot.json',import.meta.url),JSON.stringify(news,null,2));
console.log(JSON.stringify({count:news.items.length,sources:news.sources,latest:news.items.slice(0,3).map(x=>({title:x.title,date:x.publishedAt}))}));
