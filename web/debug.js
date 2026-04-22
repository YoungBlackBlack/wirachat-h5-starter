// vConsole 调试开关:多重入口,默认不打扰生产用户。
//
// 开启方式(任一即可):
//   1. URL 加 ?vconsole
//   2. localStorage.setItem('__vconsole','1') 后刷新(持久,推荐 WebView 使用)
//   3. 访问 localhost / 局域网 IP / 含 "test"/"dev" 的域名自动开启
//
// 快速开关(控制台输入):
//   __vconsoleOn()   // 打开并持久化
//   __vconsoleOff()  // 关闭并清除标记
//
// 生产环境默认不会加载任何脚本,零性能影响。
(function () {
  if (typeof window === "undefined") return;

  var qs = new URLSearchParams(window.location.search);
  var host = window.location.hostname || "";

  var enabled =
    qs.has("vconsole") ||
    (function () {
      try {
        return localStorage.getItem("__vconsole") === "1";
      } catch (_) {
        return false;
      }
    })() ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    /\btest\b|\bdev\b/.test(host);

  window.__vconsoleOn = function () {
    try {
      localStorage.setItem("__vconsole", "1");
    } catch (_) {}
    window.location.reload();
  };
  window.__vconsoleOff = function () {
    try {
      localStorage.removeItem("__vconsole");
    } catch (_) {}
    window.location.reload();
  };

  if (!enabled) return;

  if (qs.has("vconsole")) {
    try {
      localStorage.setItem("__vconsole", "1");
    } catch (_) {}
  }

  var s = document.createElement("script");
  // 同源自托管:服务端 CSP 是 script-src 'self' 'unsafe-inline',
  // 外域 CDN 会被拦;版本锁在 /assets/vconsole.min.js,升级时替换文件 + 改 ?v=。
  s.src = "/assets/vconsole.min.js?v=3.15.1";
  s.async = true;
  s.onload = function () {
    if (typeof window.VConsole !== "function") return;
    try {
      window.__vc = new window.VConsole({
        theme: "dark",
        maxLogNumber: 2000,
        onReady: function () {
          var ua = navigator.userAgent || "";
          var conn = navigator.connection || {};
          console.log(
            "[DEBUG] vConsole ready",
            "\n  host:", host,
            "\n  href:", window.location.href,
            "\n  UA:", ua,
            "\n  network:", conn.effectiveType || "unknown",
            "downlink=", conn.downlink, "rtt=", conn.rtt,
            "\n  build:", (document.querySelector('meta[name="build-version"]') || {}).content || "n/a"
          );
        },
      });
    } catch (e) {
      console.warn("[DEBUG] vConsole init failed:", e);
    }
  };
  s.onerror = function () {
    console.warn("[DEBUG] vConsole script load failed");
  };
  document.head.appendChild(s);
})();
