'use client'

// はんこdeハンコ・KANBEI SIGNを縦に並べて表示。表示のたびに上下をランダムに入れ替える。

import { useEffect, useState } from 'react'
import { HankoDeHankoBanner } from './hanko-de-hanko-banner'
import { KanbeiSignBanner } from './kanbei-sign-banner'

export function AdStack() {
  const [swapped, setSwapped] = useState<boolean | null>(null)

  useEffect(() => {
    setSwapped(Math.random() < 0.5)
  }, [])

  if (swapped === null) return null

  const banners = swapped
    ? [<KanbeiSignBanner key="kanbei" />, <HankoDeHankoBanner key="hanko" />]
    : [<HankoDeHankoBanner key="hanko" />, <KanbeiSignBanner key="kanbei" />]

  return (
    <div className="flex flex-col items-center gap-4">
      {banners}
    </div>
  )
}
