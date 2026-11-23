# らくがきランナー オンラインランキング用サーバー

ゲーム本体（GitHub Pages）とは別に、オンラインランキングの記録を集めるための
Cloudflare Worker + D1 です。

- Worker 名: `rakugaki-runner-ranking`
- 公開URL（予定）: https://rakugaki-runner-ranking.t-t14.workers.dev
- API: `GET /ranking?mode=&uuid=` / `POST /scores`
- 部門: モード別（0=ノーマル／1=ハード／2=インク拾い）。1人（端末）につき各モード1件、ベストスコアのみ保持

## セットアップ手順（Cloudflare ダッシュボード）

1. **D1 データベースを作成**
   - Cloudflare ダッシュボード → Storage & Databases → D1 → Create database
   - 名前: `rakugaki-runner-ranking-db`
   - 作成後、そのデータベースの Console で `schema.sql` の内容をすべて実行する
   - データベースの ID（database_id）を控える

2. **database_id を設定**
   - `wrangler.toml` の `database_id = "00000000-..."` を、手順1の ID に書き換える
     （ID を Muse に教えてもらえれば、こちらで書き換えて push します）

3. **Worker を作成して GitHub と連携（Workers Builds）**
   - Workers & Pages → Create → Worker → Import a repository（GitHub 連携）
   - リポジトリ: `tenkai-t/rakugaki-runner`、本番ブランチ: `main`
   - ルートディレクトリ: `ranking`
   - デプロイコマンド: `npx wrangler deploy`
   - Worker 名が `rakugaki-runner-ranking` になっていることを確認する

4. **確認**
   - https://rakugaki-runner-ranking.t-t14.workers.dev/ を開いて `ok` と表示されれば稼働中
   - ゲームの結果画面で名前を入れて登録でき、タイトル画面のランキングにみんなの記録が表示されます
