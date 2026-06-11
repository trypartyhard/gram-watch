# Gram Watch

Telegram Mini App: истёкшие (не продлённые) `.gram` домены коллекции
[Gram DNS Domains](https://tonviewer.com/EQAic3zPce496ukFDhbco28FVsKKl2WUX_iJwaL87CBxSiLQ) —
с кнопкой запуска аукциона через TON Connect.

**Мини-апка:** https://trypartyhard.github.io/gram-watch/

## Как устроено

- `index.html` — вся апка (статика, без бэкенда). TON Connect для кошелька,
  TonWeb для сборки jetton-transfer тела. Запуск аукциона = GRM-перевод на контракт
  домена с forward-payload op `0x4ED14B65`, forward 1.25 TON, attach 1.35 TON.
- `scan/scan.cjs` — сканер коллекции (~5 мин): toncenter v3 (батчи accountStates×100),
  парсит data-ячейки контрактов напрямую. Пишет `data.json`.
- `.github/workflows/scan.yml` — крон каждые 6 часов: пересканирует и коммитит
  `data.json`; GitHub Pages автоматически редеплоит.
- Истечение домена = `last_fill_up_time` + 366 дней. Минимальная стартовая ставка
  зависит от длины имени (сейчас на полу: 3 симв. — 5 000 GRM, 5 — 100, 10+ — 10).

## Локально

```
cd scan && npm i && node scan.cjs   # обновить data.json
```

Опционально: секрет `TONCENTER_API_KEY` в репо — если публичный toncenter
начнёт душить раннеры GitHub по rate-limit.
