// 业务入口占位:负责启动 WebView 身份登录 → 换 token → 打开首屏。
// 业务项目在这个文件里接自己的首屏逻辑。
import Api from "./api.js";

async function boot() {
  const status = document.querySelector("[data-status]");
  const setStatus = (text, level = "info") => {
    if (!status) return;
    status.textContent = text;
    status.dataset.level = level;
  };

  try {
    // 1) 已有 token 直接验一下
    const me = await Api.getMe();
    if (me?.userId) {
      setStatus(`已登录:userId=${me.userId}(via=${me.via})`, "ok");
      return;
    }

    // 2) 尝试 WebView 桥接登录
    if (window.WebviewIdentity) {
      try {
        const result = await window.WebviewIdentity.bootIdentity({
          requireIdentity: false,
          timeoutMs: 1200,
        });
        if (result?.token) {
          Api.setAuthToken(result.token);
          setStatus(`WebView 登录成功:userId=${result.userId}`, "ok");
          return;
        }
      } catch (err) {
        console.warn("WebView 身份登录失败", err);
      }
    }

    setStatus("未登录。调用 Api.requestSmsCode + Api.verifySmsCode 或打开 /im-playground.html 测试。", "warn");
  } catch (err) {
    setStatus(`启动失败:${err?.message || err}`, "error");
  }
}

document.addEventListener("DOMContentLoaded", boot);
