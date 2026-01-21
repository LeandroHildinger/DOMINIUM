@echo off
setlocal
cd /d "%~dp0"
set "PORT=8000"
echo.
echo ========================================
echo    DOMINIUM v2.0 - SPA JavaScript
echo    Verificador de Vigas de Rolamento
echo ========================================
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  set "PY_CMD=py -3"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set "PY_CMD=python"
  ) else (
    echo Python nao encontrado. Instale o Python ou ajuste o PATH.
    pause
    exit /b 1
  )
)
echo Iniciando servidor local...
start "" /min %PY_CMD% -m http.server %PORT%
timeout /t 1 >nul
echo Abrindo aplicacao no navegador...
start "" "http://localhost:%PORT%/app/index.html"
echo.
echo Servidor rodando em http://localhost:%PORT%
echo Para encerrar, feche a janela do servidor Python.
echo.
