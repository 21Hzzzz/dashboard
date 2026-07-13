# Price Alert

Binance 现货价格监控面板，支持 Telegram 与 FwAlert 电话通知。

## VPS 部署（Ubuntu/Debian root）

部署前，请先将一个域名的 A/AAAA 记录指向 VPS，并确保 80、443 端口未被其他服务占用。Caddy 会自动申请并续期 HTTPS 证书。

将 `<owner>/<repo>`、GitHub 仓库 URL 和域名替换为实际值后，以 root 执行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/master/scripts/deploy.sh) \
  install --repo https://github.com/<owner>/<repo>.git --domain alert.example.com
```

脚本会隐藏输入面板密码、安装 Docker（如需要）、生成加密及会话密钥，并将应用部署到 `/opt/price-alert`。

更新应用（保留 `.env`、`data/` 与 `caddy/`）：

```bash
bash /opt/price-alert/scripts/deploy.sh update
```

卸载容器但保留所有数据：

```bash
bash /opt/price-alert/scripts/deploy.sh uninstall
```

彻底卸载并删除数据、配置和证书：

```bash
bash /opt/price-alert/scripts/deploy.sh uninstall --purge-data
```

## 本地开发

```bash
bun install
bun run dev
```

本地开发默认未启用面板认证；生产 Compose 部署会生成并启用认证配置。SQLite 默认保存到 `./data/price-alert.sqlite`。

## 验证

```bash
bun run typecheck
bun test
bun run build
```
