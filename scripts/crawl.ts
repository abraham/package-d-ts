import async from 'async';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { Row, Rows } from './interfaces';
import currentPage from '../data/current-page.json';

console.log(`Starting to crawl packages`);

let page = currentPage || 0;
const PAGE_LIMIT = 10000
let total_count = page * PAGE_LIMIT;
const CONCURRENCY_LIMIT = 100;
const API = 'https://replicate.npmjs.com/_all_docs';

async function run() {
  console.log(`Starting page ${page}`);

  fs.writeFileSync(path.resolve(`./data/current-page.json`), page, { flag: 'w' });

  console.log(`${API}?limit=${PAGE_LIMIT}&skip=${page * PAGE_LIMIT}`);

  const res = await fetch(`${API}?limit=${PAGE_LIMIT}&skip=${page * PAGE_LIMIT}`);
  const results: Rows = await res.json();
  page++;

  if (total_count === results.total_rows) {
    console.log(`DONE! page: ${page} ${total_count} of ${results.total_rows}`);
    return;
  }

  await async.eachLimit(results.rows, CONCURRENCY_LIMIT, async (row: Row) => {
    const key = row.key;
    console.log(`Crawling pkg ${total_count + 1} ${key}`);
    const res = await fetch(`http://unpkg.com/${key}/package.json`);
    const pkg = await res.text();
    total_count++;
    if (key.includes('/')) {
      const dir = `./data/individual/${key.split('/')[0]}`;
      if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
      }
    }
    fs.writeFile(path.resolve(`./data/individual/${key}.json`), pkg, { flag: 'w' }, (error) => {
      if (error) { console.log({ key, error }); }
    });
    return row.key;
  }, () => {
    run();
  });
}

run();
