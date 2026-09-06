#!/usr/bin/env bash
set -e

# ==============================================================================
# Gepis Dados Abertos - Setup Script para Fedora Linux
# ==============================================================================

echo "======================================================================"
echo "  Configurando ambiente de desenvolvimento no Fedora Linux"
echo "======================================================================"

# 1. Instalar dependências nativas do sistema (Tauri v2 + GTK + WebKit)
echo ""
echo "[1/4] Instalando dependências de compilação do sistema (sudo DNF)..."
sudo dnf install -y \
    glib2-devel \
    gtk3-devel \
    webkit2gtk4.1-devel \
    libsoup3-devel \
    openssl-devel \
    libxdo-devel \
    gcc \
    gcc-c++ \
    pkg-config

# 2. Instalar dependências Node da raiz
echo ""
echo "[2/4] Instalando dependências Node da raiz do projeto..."
npm install

# 3. Instalar dependências do Frontend Angular
echo ""
echo "[3/4] Instalando dependências do Angular UI..."
cd angular-ui
npm install

# 4. Compilação inicial do Angular (gera www/)
echo ""
echo "[4/4] Executando build inicial do Angular..."
npm run ng-build-dev
cd ..

echo ""
echo "======================================================================"
echo "  ✅ Ambiente configurado com sucesso!"
echo "======================================================================"
echo ""
echo "Para rodar a aplicação em modo de desenvolvimento:"
echo "  cd angular-ui && npm run tauri:dev"
echo "Ou na raiz:"
echo "  npx tauri dev"
echo ""
