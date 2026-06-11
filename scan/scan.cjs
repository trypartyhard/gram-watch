// Сканер .gram доменов: классифицирует все домены коллекции и пишет ../data.json
// Запуск: node scan.cjs  (опционально env TONCENTER_API_KEY для стабильности на CI)
const fs = require('fs');
const path = require('path');
const { Cell, Address } = require('@ton/core');

const COLLECTION = 'EQAic3zPce496ukFDhbco28FVsKKl2WUX_iJwaL87CBxSiLQ';
const ONE_YEAR = 31622400; // 366d — срок жизни домена (gJ в контракте/фронте gramcoin)
const SOON_DAYS = 30;
const BATCH = 100;
const API_KEY = process.env.TONCENTER_API_KEY || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, attempt = 0) {
  try {
    const full = API_KEY && url.includes('toncenter.com') ? url + '&api_key=' + API_KEY : url;
    const r = await fetch(full);
    if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url.slice(0, 120));
    return await r.json();
  } catch (e) {
    if (attempt > 7) throw e;
    await sleep(1500 * (attempt + 1));
    return getJson(url, attempt + 1);
  }
}

// layout стейта dns-item (форк gramcoin): index(256) collection(addr) owner(addr|none)
// auction_flag(1) last_fill_up(64); refs: [content, domain(string), auction?, grm_jetton_wallet]
// auction ref: bidder(addr) bid(coins) end(uint64) (+1 хвостовой бит)
function parseItem(dataBocB64) {
  const root = Cell.fromBase64(dataBocB64);
  const sl = root.beginParse();
  sl.loadUintBig(256);
  sl.loadAddress();
  const owner = sl.loadMaybeAddress();
  const hasAuction = sl.loadBit();
  const lastFillUp = sl.loadUint(64);
  let name = '';
  try { name = root.refs[1].beginParse().loadStringTail(); } catch (e) {}
  let auction = null;
  if (hasAuction) {
    const a = root.refs[2].beginParse();
    const bidder = a.loadAddress();
    const bid = a.loadCoins();
    auction = { bidder: bidder.toString(), bid: Number(bid) / 1e9, end: a.loadUint(64) };
  }
  return { name, owner: owner ? owner.toString() : null, lastFillUp, auction };
}

(async () => {
  const addrs = [];
  for (let offset = 0; ; offset += 1000) {
    const j = await getJson(`https://toncenter.com/api/v3/nft/items?collection_address=${COLLECTION}&limit=1000&offset=${offset}`);
    const items = j.nft_items || [];
    for (const it of items) addrs.push(it.address);
    process.stderr.write(`items: ${addrs.length}\n`);
    if (items.length < 1000) break;
    await sleep(1100);
  }

  const parsed = [];
  const failed = [];
  for (let i = 0; i < addrs.length; i += BATCH) {
    const chunk = addrs.slice(i, i + BATCH);
    let j;
    try {
      j = await getJson(`https://toncenter.com/api/v3/accountStates?address=${chunk.join(',')}&include_boc=true&limit=${BATCH}`);
    } catch (e) {
      failed.push(...chunk);
      continue;
    }
    for (const acc of j.accounts || []) {
      if (acc.status !== 'active' || !acc.data_boc) { failed.push(acc.address); continue; }
      try {
        parsed.push({ address: acc.address, ...parseItem(acc.data_boc) });
      } catch (e) {
        failed.push(acc.address);
      }
    }
    if ((i / BATCH) % 10 === 0) process.stderr.write(`states: ${Math.min(i + BATCH, addrs.length)}/${addrs.length}\n`);
    await sleep(1100);
  }

  const now = Math.floor(Date.now() / 1000);
  const out = { scannedAt: now, total: addrs.length, expired: [], expiringSoon: [], auctions: [], stuck: [], odd: [], ownedActive: 0, failed: failed.length };
  for (const p of parsed) {
    const expiry = p.lastFillUp + ONE_YEAR;
    const base = { name: p.name, address: Address.parse(p.address).toString(), owner: p.owner, lastFillUp: p.lastFillUp, expiry };
    if (p.auction) {
      const a = { ...base, bid: p.auction.bid, bidder: p.auction.bidder, end: p.auction.end };
      (p.auction.end < now ? out.stuck : out.auctions).push(a);
    } else if (!p.owner) {
      out.odd.push(base);
    } else if (expiry < now) {
      out.expired.push(base);
    } else if (expiry < now + SOON_DAYS * 86400) {
      out.expiringSoon.push(base);
    } else {
      out.ownedActive++;
    }
  }
  out.expired.sort((a, b) => a.expiry - b.expiry);
  out.expiringSoon.sort((a, b) => a.expiry - b.expiry);
  out.auctions.sort((a, b) => a.end - b.end);

  // защита от пустого/битого скана: не затираем данные, если распарсили меньше половины
  if (parsed.length < addrs.length / 2) {
    console.error(`ABORT: parsed only ${parsed.length}/${addrs.length}, keeping old data.json`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data.json'), JSON.stringify(out));
  console.log(`OK: total=${out.total} expired=${out.expired.length} soon=${out.expiringSoon.length} auctions=${out.auctions.length} stuck=${out.stuck.length} failed=${out.failed}`);
})();
