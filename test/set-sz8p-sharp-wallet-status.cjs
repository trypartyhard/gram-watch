const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const html = fs.readFileSync('set-sz8p-sharp.html', 'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .find((source) => source.includes("const ITEM = 'EQAdOW"));
assert.ok(script, 'inline transaction script must exist');

const elements = {
  send: { disabled: true, addEventListener() {} },
  status: { className: '', textContent: '' },
};
let tonConnect;

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
}

class MockAddress {
  constructor(address) {
    if (!address) throw new Error('wallet address is missing');
    this.address = address;
  }

  toString() {
    return this.address === '0:46318bcd44755930daaf537cc5613311337b2f73f29838e05b754ac10bf02819'
      ? 'EQBGMYvNRHVZMNqvU3zFYTMRM3svc_KYOOBbdUrBC_AoGYRh'
      : this.address;
  }
}

const payload = fs.readFileSync('assets/sz8p-sharp-512-edit-content.boc');
const context = vm.createContext({
  TON_CONNECT_UI: { TonConnectUI: MockTonConnectUI },
  TonWeb: { utils: { Address: MockAddress } },
  document: { getElementById: (id) => elements[id] || {} },
  fetch: async () => ({ ok: true, arrayBuffer: async () => payload }),
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
  tonConnect.emit({
    account: {
      address: '0:46318bcd44755930daaf537cc5613311337b2f73f29838e05b754ac10bf02819',
    },
  });
  assert.equal(elements.send.disabled, false, 'owner wallet must enable the send button');
  assert.match(elements.status.textContent, /Можно подписывать/);
  console.log('PASS: owner Wallet object enables the send button');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
