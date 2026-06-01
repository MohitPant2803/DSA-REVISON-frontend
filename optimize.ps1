$reelsPath = 'C:\Users\Mohit\Desktop\DSA Reels\dsa-rev-front\app\(protected)\(tabs)\reels.tsx'

$content = [System.IO.File]::ReadAllText($reelsPath, [System.Text.Encoding]::UTF8)

# Replace React import
$content = $content.Replace(
  'import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from ''react'';',
  'import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect, lazy, Suspense } from ''react'';'
)

# Replace ReelsSettingsOverlay import
$content = $content.Replace(
  'import { ReelsSettingsOverlay } from ''@/components/SettingsOverlay'';',
  'const ReelsSettingsOverlay = lazy(() => import(''@/components/SettingsOverlay'').then(m => ({ default: m.ReelsSettingsOverlay })));'
)

# Replace PlaylistPickerModal import
$content = $content.Replace(
  'import { PlaylistPickerModal } from ''@/components/PlaylistPickerModal'';',
  'const PlaylistPickerModal = lazy(() => import(''@/components/PlaylistPickerModal'').then(m => ({ default: m.PlaylistPickerModal })));'
)

[System.IO.File]::WriteAllText($reelsPath, $content, [System.Text.Encoding]::UTF8)

Write-Host "Done"
