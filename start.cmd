@echo off
setlocal
title Splitwise App
cd /d "%~dp0"

set "APP_URL=http://localhost:5173"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

rem Se o app ja estiver rodando, so abre o navegador
curl -s -o nul "%APP_URL%" >nul 2>&1
if not errorlevel 1 (
  echo App ja esta rodando. Abrindo navegador...
  start "" "%APP_URL%"
  exit /b 0
)

if not exist "node_modules" (
  echo Instalando dependencias pela primeira vez...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)

echo Iniciando Splitwise App...
start "Splitwise App (servidor)" /min cmd /k "npm run dev"

echo Aguardando o app ficar pronto...
set /a tries=0
:wait
set /a tries+=1
if %tries% gtr 60 (
  echo [ERRO] O app nao respondeu em 60s. Veja a janela "Splitwise App (servidor)".
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
curl -s -o nul "%APP_URL%" >nul 2>&1
if errorlevel 1 goto wait

curl -s -o nul "http://127.0.0.1:3001" >nul 2>&1
if errorlevel 1 if %tries% lss 60 goto wait

echo.
echo Frontend: %APP_URL%
echo Backend:  http://127.0.0.1:3001
echo Para encerrar, feche a janela "Splitwise App (servidor)".
start "" "%APP_URL%"
timeout /t 3 /nobreak >nul
exit /b 0
