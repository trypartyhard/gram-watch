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
      address: 'UQBGMYvNRHVZMNqvU3zFYTMRM3svc_KYOOBbdUrBC_AoGdmk',
    },
  });
  assert.equal(elements.send.disabled, false, 'non-bounceable owner address must enable the send button');
  assert.match(elements.status.textContent, /Можно подписывать/);
  await elements.send.click();
  assert.ok(sentTransaction, 'clicking the enabled button must request a transaction');
  assert.ok(
    BigInt(sentTransaction.messages[0].amount) >= 50_000_000n,
    'sharp 512px payload must attach at least 0.05 TON so Tonkeeper emulation can forward it',
  );
  const rpcPayload = JSON.stringify({
    from: '0:46318bcd44755930daaf537cc5613311337b2f73f29838e05b754ac10bf02819',
    network: '-239',
    valid_until: sentTransaction.validUntil,
    messages: sentTransaction.messages,
  });
  const rpcRequest = JSON.stringify({
    method: 'sendTransaction',
    params: [rpcPayload],
    id: '2905',
  });
  const encryptedRequestBytes = Buffer.byteLength(rpcRequest) + 40;
  assert.ok(
    encryptedRequestBytes <= 65_536,
    `encrypted TonConnect request must fit Tonkeeper bridge (got ${encryptedRequestBytes} bytes)`,
  );
  console.log('PASS: owner transaction fits Tonkeeper bridge and has enough TON');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
