// shadcn/ui が必要とするユーティリティ関数

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Tailwind CSS クラス名を安全にマージする
 * clsx で条件分岐を処理し、tailwind-merge で競合クラスを解決する
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
