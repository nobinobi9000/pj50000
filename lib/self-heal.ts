// Self-healing パイプライン
// エラーログ + 関連ソースファイルを Claude API に渡し、
// 修正内容を GitHub PR として自動作成する

import Anthropic from '@anthropic-ai/sdk'
import type { ErrorLog } from '@/types/index'

const CLAUDE_MODEL = 'claude-sonnet-4-6'

// ----------------------------------------------------------------
// 型定義
// ----------------------------------------------------------------

type GitHubFileContent = {
  content: string  // base64 エンコード済みファイル内容
  sha: string      // 現在のファイル SHA（更新時に必要）
}

type SelfHealResult =
  | { ok: true; prUrl: string }
  | { ok: false; reason: string }

// ----------------------------------------------------------------
// GitHub API ヘルパー
// ----------------------------------------------------------------

function githubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN が設定されていません')
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  }
}

function githubApiBase(): string {
  const owner = process.env.GITHUB_REPO_OWNER
  const repo = process.env.GITHUB_REPO_NAME
  if (!owner || !repo) throw new Error('GITHUB_REPO_OWNER / GITHUB_REPO_NAME が設定されていません')
  return `https://api.github.com/repos/${owner}/${repo}`
}

/** main ブランチの最新コミット SHA を取得 */
async function getMainSha(): Promise<string> {
  const res = await fetch(`${githubApiBase()}/git/ref/heads/main`, {
    headers: githubHeaders(),
  })
  if (!res.ok) throw new Error(`GitHub: main SHA 取得失敗 ${res.status}`)
  const data = (await res.json()) as { object: { sha: string } }
  return data.object.sha
}

/** 指定パスのファイル内容と SHA を取得 */
async function getFileContent(filePath: string): Promise<GitHubFileContent> {
  const res = await fetch(`${githubApiBase()}/contents/${filePath}`, {
    headers: githubHeaders(),
  })
  if (!res.ok) throw new Error(`GitHub: ファイル取得失敗 ${filePath} (${res.status})`)
  const data = (await res.json()) as GitHubFileContent
  return data
}

/** 新しいブランチを作成 */
async function createBranch(branchName: string, fromSha: string): Promise<void> {
  const res = await fetch(`${githubApiBase()}/git/refs`, {
    method: 'POST',
    headers: githubHeaders(),
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: fromSha }),
  })
  if (!res.ok) throw new Error(`GitHub: ブランチ作成失敗 ${branchName} (${res.status})`)
}

/** ブランチ上のファイルを更新してコミット */
async function commitFix(
  branchName: string,
  filePath: string,
  fixedContent: string,
  currentSha: string,
  commitMessage: string,
): Promise<void> {
  // GitHub API はファイル内容を base64 で受け取る
  const encodedContent = Buffer.from(fixedContent).toString('base64')

  const res = await fetch(`${githubApiBase()}/contents/${filePath}`, {
    method: 'PUT',
    headers: githubHeaders(),
    body: JSON.stringify({
      message: commitMessage,
      content: encodedContent,
      sha: currentSha,
      branch: branchName,
    }),
  })
  if (!res.ok) throw new Error(`GitHub: コミット失敗 (${res.status}) ${await res.text()}`)
}

/** プルリクエストを作成して URL を返す */
async function createPullRequest(
  branchName: string,
  title: string,
  body: string,
): Promise<string> {
  const res = await fetch(`${githubApiBase()}/pulls`, {
    method: 'POST',
    headers: githubHeaders(),
    body: JSON.stringify({
      title,
      head: branchName,
      base: 'main',
      body,
    }),
  })
  if (!res.ok) throw new Error(`GitHub: PR 作成失敗 (${res.status}) ${await res.text()}`)
  const data = (await res.json()) as { html_url: string }
  return data.html_url
}

/** GitHub Issue を作成して URL を返す */
export async function createGitHubIssue(errorLog: ErrorLog): Promise<string> {
  const body = [
    '## 概要',
    `ルート \`${errorLog.route}\` でエラーが閾値を超過しました。`,
    '',
    '## エラー詳細',
    `- **メッセージ**: ${errorLog.error_message}`,
    `- **発生回数**: ${errorLog.count}`,
    `- **重大度**: ${errorLog.severity}`,
    `- **対象ファイル**: \`${errorLog.source_file ?? '不明'}\``,
    '',
    '## スタックトレース',
    errorLog.stack_trace ? `\`\`\`\n${errorLog.stack_trace}\n\`\`\`` : '（なし）',
    '',
    `---\n*自動起票: health-check cron (${new Date().toISOString()})*`,
  ].join('\n')

  const res = await fetch(`${githubApiBase()}/issues`, {
    method: 'POST',
    headers: githubHeaders(),
    body: JSON.stringify({
      title: `[自動起票] ${errorLog.route} でエラー閾値超過 (count=${errorLog.count})`,
      body,
      labels: ['bug', 'auto-generated'],
    }),
  })
  if (!res.ok) throw new Error(`GitHub: Issue 作成失敗 (${res.status})`)
  const data = (await res.json()) as { html_url: string }
  return data.html_url
}

// ----------------------------------------------------------------
// Claude API で修正内容を生成
// ----------------------------------------------------------------

const HEAL_SYSTEM_PROMPT = `あなたは TypeScript / Next.js のエキスパートエンジニアです。
与えられたエラー情報とソースファイルを分析し、修正済みの完全なファイル内容を返してください。

## 出力規則
- 修正済みのファイルコード "のみ" を返す
- コードブロック記法（\`\`\`）は不要
- コメント・説明文は不要
- ファイル全体を出力すること（部分的な差分は不可）
- TypeScript strict mode に違反しないこと`

async function generateFix(
  errorLog: ErrorLog,
  fileContent: string,
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userPrompt = [
    '## エラー情報',
    `- ルート: ${errorLog.route}`,
    `- エラーメッセージ: ${errorLog.error_message}`,
    `- 重大度: ${errorLog.severity}`,
    '',
    '## スタックトレース',
    errorLog.stack_trace ?? '（なし）',
    '',
    `## 修正対象ファイル: ${errorLog.source_file}`,
    '```typescript',
    fileContent,
    '```',
    '',
    '修正済みの完全なファイル内容を返してください。',
  ].join('\n')

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    system: [
      {
        type: 'text',
        text: HEAL_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const firstContent = message.content[0]
  if (firstContent?.type !== 'text') {
    throw new Error('Claude API から予期しないレスポンス形式')
  }

  // コードブロック記法が含まれる場合は除去
  return firstContent.text
    .replace(/^```(?:typescript|ts|javascript|js)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

// ----------------------------------------------------------------
// メインエクスポート: Self-heal を実行して PR URL を返す
// ----------------------------------------------------------------

/**
 * エラーログを受け取り、Claude で修正 → GitHub PR を作成する
 * source_file が未設定の場合や GitHub 設定が不足している場合は失敗を返す
 */
export async function triggerSelfHeal(errorLog: ErrorLog): Promise<SelfHealResult> {
  if (!errorLog.source_file) {
    return { ok: false, reason: 'source_file が設定されていません' }
  }

  // GitHub 設定チェック
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO_OWNER || !process.env.GITHUB_REPO_NAME) {
    return { ok: false, reason: 'GitHub 環境変数が設定されていません' }
  }

  try {
    // 1. 現在のファイル内容を GitHub から取得
    const fileData = await getFileContent(errorLog.source_file)
    const fileContent = Buffer.from(fileData.content, 'base64').toString('utf-8')

    // 2. Claude API で修正内容を生成
    const fixedContent = await generateFix(errorLog, fileContent)

    // 3. 新しいブランチを作成
    const mainSha = await getMainSha()
    const timestamp = Date.now()
    const branchName = `fix/auto-heal-${timestamp}`
    await createBranch(branchName, mainSha)

    // 4. 修正内容をコミット
    const commitMessage = `fix: [自動修正] ${errorLog.route} の ${errorLog.severity} エラーを解消`
    await commitFix(branchName, errorLog.source_file, fixedContent, fileData.sha, commitMessage)

    // 5. PR を作成
    const prBody = [
      '## 自動修正 PR',
      '',
      '> ⚠️ このPRはSelf-healingシステムにより自動生成されました。',
      '> マージ前に必ず内容をレビューしてください。',
      '',
      '## 対象エラー',
      `- **ルート**: \`${errorLog.route}\``,
      `- **エラー**: ${errorLog.error_message}`,
      `- **発生回数**: ${errorLog.count}`,
      '',
      '## 修正ファイル',
      `- \`${errorLog.source_file}\``,
    ].join('\n')

    const prUrl = await createPullRequest(
      branchName,
      `fix: [Auto-heal] ${errorLog.route}`,
      prBody,
    )

    return { ok: true, prUrl }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error('[self-heal] 失敗:', reason)
    return { ok: false, reason }
  }
}
