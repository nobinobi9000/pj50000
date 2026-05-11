// エラー監視 + Self-healing Cron Route
// Vercel Cron により毎時30分に実行（例: 00:30, 01:30, ...）
//
// 処理フロー:
//   1. error_logs テーブルを直近1時間で集計
//   2. count > ERROR_THRESHOLD → GitHub Issue を自動起票
//   3. severity = 'critical' AND count > CRITICAL_THRESHOLD → Self-heal PR + 通知

import { createAdminClient } from '@/lib/supabase-admin'
import { createGitHubIssue, triggerSelfHeal } from '@/lib/self-heal'
import { notifyCriticalError } from '@/lib/notify'
import { limitCron, getClientIp } from '@/lib/rate-limit'
import type { ErrorLog } from '@/types/index'

// ----------------------------------------------------------------
// 閾値設定
// ----------------------------------------------------------------
const ERROR_THRESHOLD = 3     // この回数を超えたら GitHub Issue を起票
const CRITICAL_THRESHOLD = 5  // この回数を超えた critical エラーは Self-heal を実行

// ----------------------------------------------------------------
// エラー集計クエリ
// ----------------------------------------------------------------

async function fetchActiveErrors(): Promise<ErrorLog[]> {
  const supabase = createAdminClient()

  // 直近1時間 & 未解決 & 閾値超過のエラーを取得
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('error_logs')
    .select('*')
    .eq('resolved', false)
    .gte('created_at', oneHourAgo)
    .gte('count', ERROR_THRESHOLD)
    .order('count', { ascending: false })

  if (error) throw new Error(`error_logs 取得失敗: ${error.message}`)
  return (data ?? []) as ErrorLog[]
}

// ----------------------------------------------------------------
// Cron エンドポイント本体
// ----------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  // ----------------------------------------------------------------
  // 1. Cron Secret 認証
  // ----------------------------------------------------------------
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ----------------------------------------------------------------
  // 2. Rate limiting（1時間に1回のみ実行）
  // ----------------------------------------------------------------
  const ip = getClientIp(request)
  const { success } = await limitCron(`health-check:${ip}`)
  if (!success) {
    return Response.json({ message: '実行済み: レート制限により今回はスキップ' })
  }

  // ----------------------------------------------------------------
  // 3. エラーログを取得
  // ----------------------------------------------------------------
  let errors: ErrorLog[]
  try {
    errors = await fetchActiveErrors()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: `エラーログ取得失敗: ${msg}` }, { status: 500 })
  }

  if (errors.length === 0) {
    return Response.json({ ok: true, message: '監視中: アクティブなエラーなし' })
  }

  // ----------------------------------------------------------------
  // 4. 各エラーを処理
  // ----------------------------------------------------------------
  const results: { id: string; actions: string[] }[] = []
  const supabase = createAdminClient()

  for (const errorLog of errors) {
    const actions: string[] = []

    // ---- 4-a. GitHub Issue 起票（ERROR_THRESHOLD 超過）
    try {
      const issueUrl = await createGitHubIssue(errorLog)
      actions.push(`issue:${issueUrl}`)
      console.log('[health-check] Issue 作成:', issueUrl)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      actions.push(`issue:failed(${msg})`)
      console.error('[health-check] Issue 作成失敗:', msg)
    }

    // ---- 4-b. Self-heal（critical かつ CRITICAL_THRESHOLD 超過）
    if (errorLog.severity === 'critical' && errorLog.count >= CRITICAL_THRESHOLD) {
      const healResult = await triggerSelfHeal(errorLog)

      if (healResult.ok) {
        actions.push(`pr:${healResult.prUrl}`)

        // error_logs に PR URL を記録
        await supabase
          .from('error_logs')
          .update({ heal_pr_url: healResult.prUrl })
          .eq('id', errorLog.id)

        // 通知（PRつきのエラーログで再通知）
        await notifyCriticalError({ ...errorLog, heal_pr_url: healResult.prUrl })
      } else {
        actions.push(`pr:failed(${healResult.reason})`)
        // 通知（PR 失敗でも通知）
        await notifyCriticalError(errorLog)
      }
    } else if (errorLog.severity === 'critical') {
      // Critical だが閾値未満: 通知のみ
      await notifyCriticalError(errorLog)
      actions.push('notified')
    }

    results.push({ id: errorLog.id, actions })
  }

  return Response.json({ ok: true, processed: results.length, results })
}
