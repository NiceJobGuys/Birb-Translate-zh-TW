# 維護與重建

維護與測試請先從 GitHub clone 原始碼；Release ZIP 只包含安裝所需檔案，沒有測試程式與開發依賴。

1. 修改前先 `git pull --ff-only`，核對遊戲版本與 SHA-256；目前僅接受 `manifest.json` 的 0.12.0 原檔。
2. 語言表補充放在 `translations/zh-tw-supplement.json`；獨立文字表及畫面文字放在 `ui-zh-tw.json`，由 `src/ui-patch.cjs` 接到實際呈現函式。不要僅憑主語言表的筆數宣稱所有畫面都已中文化。保留 `{placeholder}`、HTML 標籤、遊戲數值與用作邏輯辨識的英文物品名稱。
3. 開發測試需要 Acorn（`package.json` 的 devDependencies，`npm install --ignore-scripts`）；安裝補丁本身沒有額外 npm 依賴。在專案的 `Artifacts` 下建立隔離輸出並執行驗證：

```powershell
node .\tests\translation.cjs 'D:\備份位置\birb.exe.original'
node .\tests\audit-ui.cjs 'D:\備份位置\birb.exe.original' '.\Artifacts\ui-audit'
pwsh -NoProfile -File .\tests\install.ps1 -Original 'D:\備份位置\birb.exe.original' -WorkDir '.\Artifacts\install-test'
node .\src\patch.cjs 'D:\備份位置\birb.exe.original' '.\Artifacts\build\birb.exe'
```

`WorkDir` 必須尚不存在，避免測試覆寫既有檔案。測試會保留自己的隔離檔案，驗證後可清理；不要刪除正式安裝的原版備份。

4. 更新 `manifest.json` 的補丁版本、筆數及參考建置 hash。變更語言載入策略時，重新檢查所有補充的最終值與其他語言。
5. Release 只打包 `Install.ps1`、`manifest.json`、`README.md`、`MAINTAINING.md`、`AUDIT.md`、`src/`、`translations/`，命名 `Birb-zhTW-<版本>.zip`，tag `v<版本>`，附 `.sha256`。不要打包 `Artifacts`、`backups`、遊戲 EXE、測試依賴或擷取資源。
6. `git status` 檢查後 commit、push；上傳 Release 並下載校驗。實際進遊戲驗收需另行確認，勿將靜態驗證描述為畫面實測。

## 技術參考

遊戲使用 [Tauri 2.11.2 內嵌壓縮資源](https://github.com/tauri-apps/tauri/blob/tauri-v2.11.2/crates/tauri-codegen/src/embedded_assets.rs)。補丁保留 PE 配置，只替換既有 Brotli 空間及其長度欄位；譯文以 JSON 插入原廠語言補充函式。
