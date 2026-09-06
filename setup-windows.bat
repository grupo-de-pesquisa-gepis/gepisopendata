@echo off
setlocal enabledelayedexpansion

echo ======================================================================
echo   Configurando ambiente de desenvolvimento no Windows
echo ======================================================================

:: 1. Verificar Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no PATH.
    echo Por favor, instale o Node.js v20+ em https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Verificar Cargo / Rust
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Rust/Cargo nao foi encontrado no PATH.
    echo Por favor, instale o Rust em https://rustup.rs/
    pause
    exit /b 1
)

:: 3. Instalar dependências Node da raiz
echo.
echo [1/3] Instalando dependencias Node na raiz...
call npm install
if %errorlevel% neq 0 (
    echo [ERRO] Falha no npm install da raiz.
    pause
    exit /b 1
)

:: 4. Instalar dependências do Frontend Angular
echo.
echo [2/3] Instalando dependencias do Angular UI...
cd angular-ui
call npm install
if %errorlevel% neq 0 (
    echo [ERRO] Falha no npm install do angular-ui.
    cd ..
    pause
    exit /b 1
)

:: 5. Compilação inicial do Angular (gera www/)
echo.
echo [3/3] Executando build inicial do Angular...
call npm run ng-build-dev
if %errorlevel% neq 0 (
    echo [ERRO] Falha no build inicial do Angular.
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo ======================================================================
echo   [OK] Ambiente Windows configurado com sucesso!
echo ======================================================================
echo.
echo Para rodar a aplicacao em modo de desenvolvimento:
echo   cd angular-ui ^&^& npm run tauri:dev
echo Ou na raiz:
echo   npx tauri dev
echo.
pause
