import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { Row, Rows } from './interfaces';

console.log(`Starting to crawl packages`);

const currentPagePath = path.resolve('./data/current-page.json');
let page = 0;
if (fs.existsSync(currentPagePath)) {
  page = Number(JSON.parse(fs.readFileSync(currentPagePath, 'utf8'))) || 0;
}
const PAGE_LIMIT = 10000
let total_count = page * PAGE_LIMIT;
const CONCURRENCY_LIMIT = 100;
const API = 'https://replicate.npmjs.com/_all_docs';

async function eachLimit<T>(values: T[], limit: number, worker: (value: T, index: number) => Promise<void>) {
  const executing = new Set<Promise<void>>();

  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    let task: Promise<void>;
    task = worker(value, index).finally(() => {
      executing.delete(task);
    });
    executing.add(task);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

async function run() {
  while (true) {
    console.log(`Starting page ${page}`);

    fs.writeFileSync(currentPagePath, String(page), { flag: 'w' });

    console.log(`${API}?limit=${PAGE_LIMIT}&skip=${page * PAGE_LIMIT}`);

    const res = await fetch(`${API}?limit=${PAGE_LIMIT}&skip=${page * PAGE_LIMIT}`);
    const results: Rows = await res.json();
    page++;

    if (total_count === results.total_rows) {
      console.log(`DONE! page: ${page} ${total_count} of ${results.total_rows}`);
      return;
    }

    await eachLimit(results.rows, CONCURRENCY_LIMIT, async (row: Row, index: number) => {
      const key = row.key;
      console.log(`Crawling pkg ${total_count + index + 1} ${key}`);
      const res = await fetch(`http://unpkg.com/${key}/package.json`);
      const pkg = await res.text();
      if (key.includes('/')) {
        const dir = `./data/individual/${key.split('/')[0]}`;
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir);
        }
      }
      await fs.promises.writeFile(path.resolve(`./data/individual/${key}.json`), pkg, { flag: 'w' });
    });

    total_count += results.rows.length;
  }
}

run();
