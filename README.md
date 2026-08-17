# dsh-file-attachments

可重新安裝的 DeepSeek Harness plugin，為 Web composer 增加常見文件附件：

- CSV、TSV、PDF
- Markdown、`.skill`、TXT
- JSON、YAML、XML、HTML、CSS
- JavaScript、TypeScript、Python、Shell、SQL、Rust、Go、Java、C/C++ 等常見文字／程式檔案

文字檔會直接放入 prompt；PDF 會在本機用 `pypdf` 抽取文字後放入 prompt。單一文件上限為 25 MB，同一則訊息的文件總量上限為 50 MB。圖片仍沿用 DSH 原本的圖片附件流程。

## 安裝

```sh
dsh plugin --profile web add https://github.com/stfbutnou/dsh-file-attachments/releases/download/v0.1.1/dsh-file-attachments-0.1.1.tgz
```

也可以直接安裝 GitHub source：

```sh
dsh plugin --profile web add github:stfbutnou/dsh-file-attachments
```

若 pnpm 顯示 `approve-builds` 或 `allowBuilds` 提示，請依它輸出的 exact package key 加入：

```text
/Users/<you>/.dsh/profiles/web/pnpm-workspace.yaml
```

再重新執行上面的安裝指令。這個 plugin 的安裝腳本會先備份 DSH 原始檔，再套用 patch；完成後請重啟 dsh：

```sh
pkill -f 'dsh.*--profile web' 2>/dev/null || true
dsh --profile web
```

若本機沒有 PDF 解析依賴：

```sh
python3 -m pip install pypdf
```

## 移除

先還原 DSH 核心檔案，再移除 bundle：

```sh
dsh-file-attachments restore
dsh plugin --profile web remove dsh-file-attachments
```

`restore` 會從 plugin 的備份還原 DSH 核心檔案；完成後同樣需要重啟 dsh。備份保留在 `$DSH_HOME/plugin-state/dsh-file-attachments/`，預設為 `~/.dsh/plugin-state/dsh-file-attachments/`，方便復原。這個明確步驟是必要的，因為部分 pnpm 設定不會執行依賴的 `postuninstall`。

## 相容性

目前 patch 針對 DSH `0.1.0-rc.6`。若 DSH 核心更新後 patch hunk 不再吻合，安裝會 fail loud，不會靜默改寫未知版本的核心檔案；請先更新 plugin 的 patch，再重新安裝。

這是 DSH plugin，不是 Codex `.codex-plugin`。它會出現在 `dsh dump-config` 的 bundle／plugin 組合中，而不是 Codex 的一般 plugin marketplace 清單。
