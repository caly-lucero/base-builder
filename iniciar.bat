@echo off
rem Inicia Base Builder: arranca el servidor y abre el juego en el navegador.
rem Uso: doble clic. Para apagarlo, cierra esta ventana (o presiona Ctrl+C).
rem Opcional: "iniciar.bat sin-navegador" arranca sin abrir el navegador.
title Base Builder
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org y vuelve a intentar.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Primera vez: instalando dependencias, esto tarda un momento...
  call npm.cmd install
  if errorlevel 1 (
    echo La instalacion fallo. Revisa tu conexion a Internet.
    pause
    exit /b 1
  )
)

echo.
echo Iniciando Base Builder...
echo El juego se abre en el navegador. Para apagarlo, cierra esta ventana.
echo.

if /i "%~1"=="sin-navegador" (
  call npm.cmd run dev
) else (
  call npm.cmd run dev -- --open
)

echo.
echo El servidor se detuvo.
pause
