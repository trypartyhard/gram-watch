const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');
const { Cell, Dictionary } = require('@ton/core');

const PAGE = 'set-sz8p-lottie.html';
const BOC_PATH = 'assets/sz8p-lottie-edit-content.boc';
const FALLBACK_PATH = 'assets/sz8p-sharp-512.webp';
const HIRES_PATH = 'assets/sz8p-sharp-1254-q95.webp';
const LOTTIE_PATH = 'assets/sz8p-sharp-v3.lottie.json';
const METADATA_PATH = 'assets/sz8p-sharp-v3.metadata.json';
const EXPECTED_PAYLOAD_HASH = 'b1dda7cfb174d1e4b104e003bcb8c35897a32a5afb538a49612b426d07097363';
const EXPECTED_HIRES_HASH = '582790a59ba67f6721412d05b81e08cd53391db9b3c1b56324560949554a8d2a';
const EXPECTED_LOTTIE_HASH = '6670b53f0a1c0b34d1fbf1bcd7dbd9655158edef6f6274866ea338511efa97f2';
const IMAGE_URL = 'https://trypartyhard.github.io/gram-watch/assets/sz8p-sharp-1254-q95.webp';
const METADATA_URL = 'https://trypartyhard.github.io/gram-watch/assets/sz8p-sharp-v3.metadata.json';
const LOTTIE_URL = 'https://trypartyhard.github.io/gram-watch/assets/sz8p-sharp-v3.lottie.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function metadataKey(name) {
  return BigInt(`0x${sha256(Buffer.from(name))}`);
}

function rawSnake(cell) {
  const parts = [];
  let current = cell;
  while (current) {
    const slice = current.beginParse();
    assert.equal(slice.remainingBits % 8, 0, 'SnakeData must be byte-aligned');
    parts.push(slice.loadBuffer(slice.remainingBits / 8));
    current = slice.remainingRefs ? slice.loadRef() : null;
  }
  return Buffer.concat(parts);
}

function contentBytes(cell) {
  const slice = cell.beginParse();
  const prefix = slice.loadUint(8);
  if (prefix === 0) {
    const parts = [slice.loadBuffer(slice.remainingBits / 8)];
    if (slice.remainingRefs) parts.push(rawSnake(slice.loadRef()));
    return Buffer.concat(parts);
  }
  assert.equal(prefix, 1, 'ContentData must be SnakeData or ChunkedData');
  const chunks = slice.loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.Cell());
  return Buffer.concat([...chunks.keys()].sort((a, b) => a - b).map((index) => rawSnake(chunks.get(index))));
}

for (const file of [PAGE, BOC_PATH, HIRES_PATH, LOTTIE_PATH, METADATA_PATH]) {
  assert.ok(fs.existsSync(file), `${file} must exist`);
}

const boc = fs.readFileSync(BOC_PATH);
const fallback = fs.readFileSync(FALLBACK_PATH);
const hires = fs.readFileSync(HIRES_PATH);
assert.equal(sha256(boc), EXPECTED_PAYLOAD_HASH, 'payload BOC hash must match reviewed transaction');
assert.equal(sha256(hires), EXPECTED_HIRES_HASH, 'high-resolution cover must match reviewed 1254px asset');

const body = Cell.fromBoc(boc)[0].beginParse();
assert.equal(body.loadUint(32), 0x1a0b9d51, 'payload must use owner edit_content opcode');
assert.equal(body.loadUintBig(64), 0n, 'query id must be zero');
const content = body.loadRef().beginParse();
assert.equal(content.loadUint(8), 0, 'metadata must use on-chain dictionary prefix');
const dict = content.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
const getText = (key) => contentBytes(dict.get(metadataKey(key))).toString('utf8');
assert.equal(getText('image'), IMAGE_URL);
assert.equal(getText('uri'), METADATA_URL);
assert.equal(getText('lottie'), LOTTIE_URL);
assert.deepEqual(contentBytes(dict.get(metadataKey('image_data'))), fallback, '512px on-chain fallback must not change');

const lottieBytes = fs.readFileSync(LOTTIE_PATH);
assert.equal(sha256(lottieBytes), EXPECTED_LOTTIE_HASH, 'Lottie hash must match reviewed artifact');
const lottie = JSON.parse(lottieBytes);
assert.equal(lottie.w, 1254);
assert.equal(lottie.h, 1254);
assert.equal(lottie.assets[0].w, 1254);
assert.equal(lottie.assets[0].h, 1254);
const embedded = Buffer.from(lottie.assets[0].p.split(',')[1], 'base64');
assert.deepEqual(embedded, hires, 'Lottie must embed the exact 1254px cover');

const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
assert.equal(metadata.name, 'sz8p.gram');
assert.equal(metadata.image, IMAGE_URL);
assert.equal(metadata.lottie, LOTTIE_URL);

const html = fs.readFileSync(PAGE, 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .find((source) => source.includes("const ITEM = 'EQAdOW"));
assert.ok(script, 'inline transaction script must exist');
assert.match(script, new RegExp(EXPECTED_PAYLOAD_HASH));

const elements = {
  send: {
    disabled: true,
    addEventListener(type, listener) {
      if (type === 'click') this.click = listener;
    },
  },
  status: { className: '', textContent: '' },
};
let tonConnect;
let sentTransaction;

class MockTonConnectUI {
  constructor() {
    this.account = null;
    tonConnect = this;
  }

  onStatusChange(callback) {
    this.statusCallback = callback;
  }

  emit(wallet) {
    this.account = wallet?.account || null;
    this.statusCallback(wallet);
  }

  async sendTransaction(transaction) {
    sentTransaction = transaction;
    return { boc: 'signed' };
  }
}

class MockAddress {
  constructor(address) {
    if (!address) throw new Error('wallet address is missing');
    this.address = address;
  }

  toString(isUserFriendly = false) {
    if (!isUserFriendly && (this.address === '0:46318bcd44755930daaf537cc5613311337b2f73f29838e05b754ac10bf02819'
        || this.address === 'UQBGMYvNRHVZMNqvU3zFYTMRM3svc_KYOOBbdUrBC_AoGdmk')) {
      return '0:46318bcd44755930daaf537cc5613311337b2f73f29838e05b754ac10bf02819';
    }
    return this.address;
  }
}

const context = vm.createContext({
  TON_CONNECT_UI: { TonConnectUI: MockTonConnectUI },
  TonWeb: { utils: { Address: MockAddress } },
  document: { getElementById: (id) => elements[id] || {} },
  fetch: async () => ({ ok: true, arrayBuffer: async () => boc }),
  crypto: webcrypto,
  btoa,
  console,
  Math,
  String,
  Uint8Array,
});

vm.runInContext(script, context);

async function main() {
  for (let attempt = 0; attempt < 50 && !/Транзакция проверена/.test(elements.status.textContent); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  tonConnect.emit({ account: { address: 'UQBGMYvNRHVZMNqvU3zFYTMRM3svc_KYOOBbdUrBC_AoGdmk' } });
  assert.equal(elements.send.disabled, false, 'non-bounceable owner address must enable the send button');
  await elements.send.click();
  assert.ok(sentTransaction, 'button must request a TonConnect transaction');
  assert.equal(sentTransaction.messages.length, 1);
  assert.equal(sentTransaction.messages[0].address, 'EQAdOWKXM-kCj_Q8ew1gEfbv7qqmuZ26JpLcLPjUZw1fRF7m');
  assert.equal(sentTransaction.messages[0].amount, '60000000');
  const rpcPayload = JSON.stringify({
    from: '0:46318bcd44755930daaf537cc5613311337b2f73f29838e05b754ac10bf02819',
    network: '-239',
    valid_until: sentTransaction.validUntil,
    messages: sentTransaction.messages,
  });
  const rpcRequest = JSON.stringify({ method: 'sendTransaction', params: [rpcPayload], id: '2905' });
  const encryptedRequestBytes = Buffer.byteLength(rpcRequest) + 40;
  assert.ok(encryptedRequestBytes <= 65_536, `TonConnect request is too large: ${encryptedRequestBytes}`);
  console.log(JSON.stringify({
    result: 'PASS',
    payloadBytes: boc.length,
    lottieBytes: lottieBytes.length,
    embeddedImageBytes: hires.length,
    lottieDimensions: `${lottie.w}x${lottie.h}`,
    encryptedRequestBytes,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
