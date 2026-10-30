# Birb 繁體中文化

適用 Windows Steam 版 **Birb 0.12.0／Build 26307870**。補齊原廠繁中遺漏的英文與混用簡體字，共 **484 筆譯文**：329 筆語言表補充及 155 筆獨立介面文字，另將礦坑池塘名稱中文化。以玩家持有的原版遊戲為來源，保留原廠其他翻譯。

**0.12.0.2 修正上一版漏查的獨立介面文字**，包括深淵工坊、魚鉤記憶、女巫屋、家具加成、帳號連結、存檔匯出及注能等畫面。Steam 更新會取代修改後的執行檔；同樣顯示 0.12.0，也可能是不同 Build，安裝前會核對完整檔案 SHA-256。

遊戲連結：[Birb — Steam 商店](https://store.steampowered.com/app/4364930/)。

## 下載與安裝

1. 從[最新版本](https://github.com/NiceJobGuys/Birb-Translate-zh-TW/releases/latest)下載 `Birb-zhTW-0.12.0.2.zip`，完整解壓。
2. 備妥 **PowerShell 7** 與 **Node.js 22 或更新版本**，正常離開遊戲。
3. 在解壓後的目錄執行，依實際安裝位置調整路徑：

```powershell
pwsh -NoProfile -File .\Install.ps1 -GameDir 'D:\Games\Steam\steamapps\common\Birb'
```

工具會先檢查原版 SHA-256，再備份 `birb.exe` 到安裝包的 `backups/26307870`，從自己的原檔產生並套用繁中補丁。不同 Build 的備份分開保留。請保留安裝包與備份。安裝包不含原版或修改後的完整遊戲執行檔，不會自動下載 Node.js。

4. 自行啟動遊戲，在語言設定選擇「繁體中文」。

## 還原與更新

先正常離開遊戲，再執行：

```powershell
pwsh -NoProfile -File .\Install.ps1 -GameDir 'D:\Games\Steam\steamapps\common\Birb' -Restore
```

本版只支援 `manifest.json` 列出的原版 SHA-256。Steam 更新或驗證遊戲檔案可能覆蓋補丁；遇到不同版本會停止，不會強制套用。安裝與還原均不修改存檔。

## 原始碼與翻譯

- `translations/manual-zh-tw.json`：144 筆人工補譯。
- `translations/zh-tw-supplement.json`：329 筆語言表補充，包含繁體字與術語修正。
- `translations/ui-zh-tw.json`：155 筆獨立介面譯文。
- `src/assets.cjs`：辨識內嵌資源的 PE 資料。
- `src/patch.cjs`：版本檢查、語言載入後補充、壓縮及資源範圍驗證。
- `src/ui-patch.cjs`：修正獨立語言選擇函式及畫面模板，限繁中生效。
- `Install.ps1`：原檔備份、建置、套用、校驗與還原。
- `manifest.json`：相容版本與原檔 SHA-256；參考補丁 hash 由 Node.js 24.19.0 產生。
- `tests/`：語言載入、實際介面產生函式、靜態掃描及隔離安裝驗證。測試用 Acorn，安裝補丁不需要額外 npm 套件。

從自己的相容原檔重新建置，不安裝到遊戲目錄：

```powershell
node .\src\patch.cjs '.\backups\26307870\birb.exe.original' '.\Artifacts\build\birb.exe'
```

不同 Node.js／Brotli 版本產出的壓縮資料可能不同；安裝工具會記錄當次建置的 SHA-256，作為重複套用及還原的判斷依據。詳細維護方式見 [MAINTAINING.md](MAINTAINING.md)。

## 驗證與已知限制

已驗證原廠實際語言載入流程共 5,451 個最終文字路徑、329 筆語言表補充與獨立介面文字。測試直接執行原廠深淵工坊的標題與內容產生函式，涵蓋未選魚、已選魚、透鏡、工作臺、製作完成及未解鎖狀態；另執行 Steam／錯誤對話框的文字輸出。

三個內嵌程式資源包含本次文字修正，其他 320 個資源逐一比較相同；插值參數、原本英文與其他語言維持原值。套用、重複套用、還原、不相容版本拒絕及不同 Build 備份分離測試通過。掃描範圍及已知限制見 [AUDIT.md](AUDIT.md)。

補丁已在本機套用並通過檔案 SHA-256 驗證。上述介面測試使用隔離資料與 DOM 替身，**尚未啟動遊戲實測畫面、字型或所有進度階段**，不代表整個遊戲已逐畫面驗收。Steam、Discord、Birb、MUAD'BIRB、字型名稱、快捷縮寫與管理員確認字串等保留原文。

本專案與發布包不含遊戲本體、擷取的完整原始資源、字型、存檔或原版備份。遊戲與原始翻譯的權利屬原權利人，本專案為非官方中文化補充。
