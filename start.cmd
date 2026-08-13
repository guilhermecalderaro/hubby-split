@echo off
echo Iniciando Splitwise App...
set NODE_OPTIONS=--experimental-sqlite

start "Splitwise Server" cmd /k "cd /d %~dp0packages\server && ..\\..\node_modules\\.bin\\tsx.cmd src/index.ts"
timeout /t 2 /nobreak >nul
start "Splitwise Web" cmd /k "cd /d %~dp0packages\web && ..\\..\node_modules\\.bin\\vite.cmd"

echo.
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5173
echo.
timeout /t 3 /nobreak >nul
start http://localhost:5173
