# Starter Design System

通用的 H5/WebView 设计系统骨架。只含 **tokens + 字体 + 图标 + 预览页**,不含任何业务 UI。
业务项目 fork 之后,改品牌色 / 替换 logo / 扩图标,保持 tokens 文件作为唯一事实源。

---

## 目录

- `colors_and_type.css` — 所有 CSS 变量(颜色、字号、间距、圆角、阴影、动效)。业务页通过 `@import "/design-system/colors_and_type.css"` 引入。
- `SKILL.md` — 给 Agent 的切入说明。
- `fonts/` — 字体文件 + 授权说明;若无商用授权请直接替换为系统/Google Fonts 回退字体。
- `assets/icons/` — 填色 SVG 图标集。新增图标放这里。
- `assets/logo-rounded.svg` — 占位 logo,替换为项目品牌 mark。
- `preview/*.html` — 每个 token 维度的独立预览页,可直接浏览器打开肉眼校验。

---

## 可视基调(默认,可改)

- **画布**: 纯黑 `#000000` + 透明白分层(`rgba(255,255,255,α)` α ∈ {0.04, 0.06, 0.08, 0.10, 0.14, 0.20}),无灰阶中间色。
- **主色对**: 双胶囊色对(olive + butter / teal + cyan),承载主/次 CTA。业务项目按品牌重写即可。
- **字体**: 标题 Alimama ShuHeiTi(回退 Noto Sans SC 900);正文 PingFang SC;数字 Montserrat。
- **图标**: 填色、单色(白)、24×24 viewBox。深色背景直接用,浅色背景加 `filter: invert(1)`。
- **圆角刻度**: 4 / 6 / 12 / 16 / 24 / 32 / 999(pill)。
- **动效**: 统一 `cubic-bezier(0.22, 1, 0.36, 1)`,常用时长 120 / 180 / 220 / 260ms,尊重 `prefers-reduced-motion`。

---

## 扩展约定

1. **唯一事实源**: 所有颜色/字号/间距放在 `colors_and_type.css`。业务页禁止在 `web/*.css` 里硬编码色值,必须通过 token 引用。
2. **新图标**: 加到 `assets/icons/`,保持白色填充 + 24×24 viewBox。需要选中态时用独立文件(例如 `foo.svg` + `foo-active.svg`),不要靠 CSS 变色。
3. **品牌改造流程**:
   - 改 `colors_and_type.css` 里的 token 值。
   - 替换 `assets/logo-rounded.svg` + `fonts/` 下的显示字体。
   - 更新 `SKILL.md` 的品牌描述 + `name` 字段。
4. **预览页**: 改完 token 后,打开 `/design-system/preview/` 里对应页面肉眼核对。若新增了一类 token,在 `preview/` 加一张对应特写页。

---

## 与后端/前端的关系

- 后端 `server/index.js` 以 `/design-system` 路径静态暴露这个目录(含 Cache-Control 非缓存头,便于迭代)。
- 前端任何页面只需要 `<link rel="stylesheet" href="/design-system/colors_and_type.css" />`,无需打包。
- 字体通过 `@font-face` 从 `/design-system/fonts/*.otf` 加载,同源无 CORS 问题。

---

## Caveats

- `AlimamaShuHeiTi-Bold.otf` 的商用授权需自行确认(见 `fonts/README.md`);如无权使用,删除该 `@font-face` 块,由 `Noto Sans SC` 回退即可。
- 颜色对、图标风格只是默认值 — 业务项目如果品牌调性不同,应尽早分叉这套 tokens,而不是在上面叠加覆盖。
