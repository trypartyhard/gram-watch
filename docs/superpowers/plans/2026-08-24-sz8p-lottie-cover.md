# sz8p.gram Getgems Lottie Cover Implementation Plan

**Goal:** Publish a mobile TonConnect transaction that preserves the current on-chain 512×512 fallback and adds a versioned 1254×1254 Lottie cover so Getgems receives a new media URL/cache key.

**Architecture:** The DNS item keeps its current TEP-64 `image_data` bytes as a fallback. The owner-only `edit_content` payload also stores a versioned `lottie` URL and a standard semi-chain `uri`; both point to immutable GitHub Pages assets. The Lottie JSON embeds the original 1254×1254 artwork, avoiding a secondary mutable image URL.

**Tech Stack:** Static HTML, TON Connect UI 3.0.0, TonWeb address normalization, `@ton/core` payload construction/decoding, GitHub Pages.

---

### Task 1: Specify the signed transaction

**Files:**
- Create: `test/set-sz8p-lottie-wallet-status.cjs`
- Create: `assets/sz8p-sharp-v3.metadata.json`
- Create: `assets/sz8p-sharp-v3.lottie.json`
- Create: `assets/sz8p-lottie-edit-content.boc`

1. Add a regression test that requires the new signer page, exact NFT/owner addresses, 0.06 TON funding, the expected payload checksum, and a TonConnect request below 65,536 encrypted bytes.
2. Run the test and confirm it fails because the new page and payload do not exist.
3. Generate a self-contained Lottie from the original 1254×1254 artwork and a TEP-64 payload containing `uri`, `lottie`, and the already-live 512×512 `image_data` fallback.
4. Decode the payload in the test and verify the opcode, media URLs, embedded fallback bytes, dimensions, and hashes.

### Task 2: Publish the mobile signing page

**Files:**
- Create: `set-sz8p-lottie.html`

1. Add a mobile-friendly TonConnect page that downloads and SHA-256-checks the exact BOC before enabling signing.
2. Normalize bounceable and non-bounceable wallet formats to the same raw owner address.
3. Send exactly one message to the DNS NFT with 0.06 TON and the checked payload.

### Task 3: Verify and deploy

**Files:**
- Modify: `C:\Users\Honor\Desktop\ton-brain\protocols\gram-dns.md`
- Modify: `C:\Users\Honor\Desktop\ton-brain\log.md`

1. Run the old and new regression tests, image/Lottie integrity checks, payload decoding, exact-state sandbox, and TonAPI wallet emulation.
2. Inspect the rendered signing page and confirm the wallet button/status flow.
3. Commit and push the static assets and page to `main` for GitHub Pages.
4. Fetch each public URL with a cache-buster, compare hashes/content types, and return the mobile signing link.
5. Record the final payload facts and live URL in TON Brain.
