// 重大エラー通知モジュール
// LINE Notify または Slack Webhook にメッセージを送信する
// 設定されている通知先にのみ送信（どちらも未設定の場合はスキップ）

import type { ErrorLog } from '@/types/index'

// 通知対象の severity しきい値（これ以上の深刻度のみ通知）
const NOTIFY_SEVERITIES: ErrorLog['severity'][] = ['critical']

/**
 * エラーが通知対象かどうか判定する
 * 'critical' のみ通知し、'warning' / 'error' はノイズとして除外
 */
function shouldNotify(severity: ErrorLog['severity']): boolean {
  return NOTIFY_SEVERITIES.includes(severity)
}

// ----------------------------------------------------------------
// LINE Notify
// ----------------------------------------------------------------

async function notifyLine(message: string): Promise<void> {
  const token = process.env.LINE_NOTIFY_TOKEN
  if (!token) return

  const res = await fetch('https://notify-api.line.me/api/notify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ message }),
  })

  if (!res.ok) {
    console.error('[notify] LINE Notify 送信失敗:', res.status, await res.text())
  }
}

// ----------------------------------------------------------------
// Slack Webhook
// ----------------------------------------------------------------

async function notifySlack(message: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  })

  if (!res.ok) {
    console.error('[notify] Slack Webhook 送信失敗:', res.status, await res.text())
  }
}

// ----------------------------------------------------------------
// メインエクスポート
// ----------------------------------------------------------------

/**
 * 重大エラーを全設定済み通知先に送信する
 * severity が 'critical' でない場合はノイズ削減のためスキップ
 */
export async function notifyCriticalError(errorLog: ErrorLog): Promise<void> {
  if (!shouldNotify(errorLog.severity)) return

  const message = [
    `🚨 [CRITICAL] pj5000 エラー検知`,
    `ルート: ${errorLog.route}`,
    `エラー: ${errorLog.error_message}`,
    `発生回数: ${errorLog.count}`,
    `ファイル: ${errorLog.source_file ?? '不明'}`,
    errorLog.heal_pr_url ? `PR: ${errorLog.heal_pr_url}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  // 両方の通知先に並行送信（どちらかが失敗しても継続）
  await Promise.allSettled([notifyLine(message), notifySlack(message)])
}
