# Fonts

The product references three font families but ships **no font files**. System fallbacks do most of the work.

## Required

| Family | Usage | Source |
| --- | --- | --- |
| **Alimama ShuHeiTi** (阿里妈妈数黑体) | Display — pill labels, brand wordmark, vote buttons | Free commercial release by 阿里妈妈 / 天猫淘宝. Download: https://alimama.alibaba.com/platform/pages/designer/ShuHeiTi |
| **PingFang SC** | UI body text | System font on iOS / macOS. On Web/Android, fall back to Noto Sans SC. |
| **Montserrat** | All numerals | Google Fonts — `https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&display=swap` |

## Shipped here

- **`AlimamaShuHeiTi-Bold.otf`** — licensed file provided by the user. Wired into `colors_and_type.css` via `@font-face`. This is the real brand display face; no longer substituting Noto Sans SC.

## Still missing

- `PingFang SC` — remains a system-font reliance. On macOS/iOS the real face loads natively. On Web / Android / Windows we fall back to `Noto Sans SC` (link the Google Fonts import in any host HTML).
- `Montserrat` — still loaded from Google Fonts (free, no license concerns).
