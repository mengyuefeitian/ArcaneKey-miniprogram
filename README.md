<h1 align="center">星枢令 · ArcaneKey（微信小程序）</h1>

<p align="center">
  <img src="images/logo.png" width="120" height="120" alt="星枢令"/>
</p>

<p align="center">
  <b>你的验证码，只属于你自己</b><br/>
  一款纯本地、零上传的双因素身份验证器
</p>

<p align="center">
  <img src="https://img.shields.io/badge/微信-小程序-07C160" alt="WeChat"/>
  <img src="https://img.shields.io/badge/密钥存储-仅本地-critical" alt="Local Only"/>
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="license"/>
</p>

<p align="center">
  <img src="image/miniprogram-qrcode.jpg" width="200" alt="星枢令微信小程序二维码"/>
  <br/>
  <sub>微信扫码直接使用小程序</sub>
</p>

---

## 为什么是星枢令

登录 Gmail、GitHub、支付宝这类账号时，很多人用短信验证码——慢、依赖信号、还可能被劫持。更安全的做法是用 TOTP 动态验证码，但市面上的验证器 App 大多要你注册账号、把密钥同步到云端。

**星枢令不这么做。** 你的每一个验证密钥只存在你自己的设备上，不会被上传到任何服务器，也不需要账号才能用。开发者看不到、拿不走。

## 特性一览

- 🔑 **标准 TOTP** — 兼容 Google Authenticator 协议，支持 Gmail、GitHub、Microsoft、支付宝等所有主流平台
- 📷 **扫码即加** — 摄像头扫码或识别相册二维码，一步导入，不用手敲密钥
- 🎨 **10 款主题** — 海洋蓝、皇室紫、极光绿……换个心情换个色
- 💾 **备份无忧** — 加密导出 / 导入，换手机不丢账号
- 🔒 **本地优先** — 没有服务器能看到你的密钥，这不是承诺，是架构决定的

## 立即体验

**微信小程序**：扫描上方二维码，打开即用，无需下载安装。

## 隐私

星枢令不会、也无法把你的密钥上传到任何服务器——详见 [隐私政策](https://www.xiaoanhome.xyz/arcanekey/privacy-policy)。

## 许可证

MIT License © 2026 ArcaneKey
