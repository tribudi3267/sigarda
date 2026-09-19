@echo off
rem Klik dua kali berkas ini untuk mencadangkan data SIGARDA dari Supabase.
cd /d "%~dp0scripts\cadangan"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang. Pasang dari https://nodejs.org lalu jalankan ulang.
  pause
  exit /b 1
)

if not exist node_modules\pg (
  echo Menyiapkan komponen untuk pertama kali, mohon tunggu...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Gagal menyiapkan komponen. Cek koneksi internet lalu coba lagi.
    pause
    exit /b 1
  )
)

node cadangkan.mjs
echo.
pause
