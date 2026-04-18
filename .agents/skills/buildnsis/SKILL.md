---
name: buildnsis
description: 本文档详细描述如何在 Windows 平台上从源码构建 Screenpipe 的 NSIS 安装包。
---

# Screenpipe Windows NSIS 安装包构建指南

本文档详细描述如何在 Windows 平台上从源码构建 Screenpipe 的 NSIS 安装包。

## 前置要求

### 系统要求
- Windows 10/11 64-bit
- 至少 16GB RAM（推荐 32GB）
- 至少 50GB 可用磁盘空间

### 必需软件
1. **Rust** (1.84+)
   ```powershell
   # 安装 rustup
   winget install Rustlang.Rustup
   # 或从 https://rustup.rs 下载
   ```

2. **Node.js** (18+)
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

3. **Bun** (可选，用于 Pipes)
   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```

4. **Visual Studio Build Tools** (含 MSVC)
   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools
   ```

5. **LLVM/Clang**
   ```powershell
   winget install LLVM.LLVM
   ```

## 构建步骤

### 1. 克隆仓库
```powershell
git clone https://github.com/mediar-ai/screenpipe.git
cd screenpipe
```

### 2. 准备外部依赖

#### 2.1 复制 Bun 二进制文件
```powershell
$bunPath = "$env:USERPROFILE\.bun\bin\bun.exe"
$destPath = "screenpipe-app-tauri\src-tauri\bun-x86_64-pc-windows-msvc.exe"
Copy-Item $bunPath -Destination $destPath -Force
```

#### 2.2 准备 vcredist DLLs
```powershell
$vcredistDir = "screenpipe-app-tauri\src-tauri\vcredist"
New-Item -ItemType Directory -Path $vcredistDir -Force

Copy-Item "C:\Windows\System32\vcruntime140.dll" -Destination $vcredistDir -Force
Copy-Item "C:\Windows\System32\vcruntime140_1.dll" -Destination $vcredistDir -Force
Copy-Item "C:\Windows\System32\msvcp140.dll" -Destination $vcredistDir -Force
```

#### 2.3 准备 MKL DLLs (Intel Math Kernel Library)
```powershell
cd screenpipe-app-tauri\src-tauri

# 使用 pip 下载 MKL
pip download mkl -d mkl_temp --only-binary=:all: --platform win_amd64

# 解压 whl 文件（本质是 zip）
Copy-Item "mkl_temp\mkl-*.whl" "mkl_temp\mkl.zip"
Expand-Archive -Path "mkl_temp\mkl.zip" -DestinationPath "mkl_extracted" -Force

# 复制 DLLs
New-Item -ItemType Directory -Path "mkl" -Force
Get-ChildItem -Path "mkl_extracted" -Recurse -Filter "*.dll" | Copy-Item -Destination "mkl\" -Force

# 清理
Remove-Item -Recurse -Force mkl_temp, mkl_extracted

cd ..\..
```

#### 2.4 FFmpeg 和 ONNX Runtime
这些会通过 `pre_build.js` 自动下载，或者可以手动准备：
- FFmpeg: 放置在 `screenpipe-app-tauri/src-tauri/ffmpeg/`
- ONNX Runtime: 放置在 `screenpipe-app-tauri/src-tauri/onnxruntime-win-x64-gpu-1.19.2/`

### 3. 构建 Rust 后端
```powershell
# 不带 CUDA 支持
cargo build --release

# 带 CUDA 支持（需要 CUDA Toolkit 12.x，不支持 13.0）
cargo build --release --features cuda
```

### 4. 安装前端依赖
```powershell
cd screenpipe-app-tauri

# 使用 npm（推荐，避免 bun 的长路径问题）
npm install --legacy-peer-deps

# 如果遇到 React 版本问题
npm install react-dom@18.3.1 --legacy-peer-deps
```

### 5. 构建前端
```powershell
npm run build
```

### 6. 修复 Tauri 版本不匹配（如果需要）
```powershell
# 检查版本
npm list @tauri-apps/api
cargo tree -p tauri --depth 0

# 同步版本（以 Rust crate 版本为准）
npm install @tauri-apps/api@2.8.0 --legacy-peer-deps
```

### 7. 构建 Tauri NSIS 安装包
```powershell
npx tauri build
```

### 8. 获取安装包
构建完成后，安装包位于：
```
screenpipe-app-tauri\src-tauri\target\release\bundle\nsis\screenpipe_<version>_x64-setup.exe
```

## 常见问题

### Q: 构建失败：`glob pattern vcredist\*.dll path not found`
**A**: vcredist 目录为空。按照步骤 2.2 复制必要的 DLL 文件。

### Q: 构建失败：`glob pattern mkl\*.dll path not found`
**A**: mkl 目录为空。按照步骤 2.3 下载并准备 MKL DLLs。

### Q: Tauri 版本不匹配错误
**A**: 运行 `npm install @tauri-apps/api@<version> --legacy-peer-deps`，版本需与 Rust crate 匹配。

### Q: CUDA 13.0 不支持
**A**: cudarc 库目前不支持 CUDA 13.0。使用 CUDA 12.x 或不使用 `--features cuda`。

### Q: npm install 失败 ERESOLVE
**A**: 使用 `npm install --legacy-peer-deps` 忽略对等依赖冲突。

### Q: bun install 失败 EPERM/长路径问题
**A**: 使用 npm 替代 bun，或启用 Windows 长路径支持：
```powershell
# 以管理员身份运行
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

### Q: 签名警告 `TAURI_SIGNING_PRIVATE_KEY`
**A**: 这只影响自动更新功能，离线安装包可忽略此警告。

## 目录结构参考

```
screenpipe-app-tauri/src-tauri/
├── assets/                    # NSIS 安装程序图像
├── ffmpeg/                    # FFmpeg 二进制和库
│   ├── bin/
│   │   ├── ffmpeg.exe
│   │   ├── ffprobe.exe
│   │   └── *.dll
│   └── lib/
├── mkl/                       # Intel MKL DLLs
│   └── *.dll
├── onnxruntime-win-x64-gpu-*/ # ONNX Runtime
│   └── lib/
│       └── *.dll
├── vcredist/                  # Visual C++ Runtime
│   ├── msvcp140.dll
│   ├── vcruntime140.dll
│   └── vcruntime140_1.dll
├── bun-x86_64-pc-windows-msvc.exe
├── screenpipe-x86_64-pc-windows-msvc.exe
├── tauri.conf.json
└── tauri.windows.conf.json
```

## 配置文件说明

### tauri.windows.conf.json
定义 Windows 特定的打包配置：
- `bundle.externalBin`: 外部二进制文件（screenpipe, bun）
- `bundle.resources`: 需要打包的资源文件
- `bundle.windows.nsis`: NSIS 安装程序配置

## 自动化脚本

可以将整个过程封装为 PowerShell 脚本：

```powershell
# build-windows.ps1
param(
    [switch]$WithCuda = $false
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

Write-Host "=== Screenpipe Windows Build ===" -ForegroundColor Cyan

# Step 1: Prepare dependencies
Write-Host "Preparing dependencies..." -ForegroundColor Yellow
$srcTauri = Join-Path $projectRoot "screenpipe-app-tauri\src-tauri"

# Copy bun
$bunSrc = "$env:USERPROFILE\.bun\bin\bun.exe"
$bunDst = Join-Path $srcTauri "bun-x86_64-pc-windows-msvc.exe"
if (Test-Path $bunSrc) {
    Copy-Item $bunSrc -Destination $bunDst -Force
    Write-Host "  Bun copied" -ForegroundColor Green
}

# Copy vcredist
$vcredistDir = Join-Path $srcTauri "vcredist"
New-Item -ItemType Directory -Path $vcredistDir -Force | Out-Null
Copy-Item "C:\Windows\System32\vcruntime140.dll" -Destination $vcredistDir -Force
Copy-Item "C:\Windows\System32\vcruntime140_1.dll" -Destination $vcredistDir -Force
Copy-Item "C:\Windows\System32\msvcp140.dll" -Destination $vcredistDir -Force
Write-Host "  vcredist copied" -ForegroundColor Green

# Step 2: Build Rust backend
Write-Host "Building Rust backend..." -ForegroundColor Yellow
if ($WithCuda) {
    cargo build --release --features cuda
} else {
    cargo build --release
}
if ($LASTEXITCODE -ne 0) { throw "Rust build failed" }
Write-Host "  Rust build completed" -ForegroundColor Green

# Step 3: Install frontend dependencies
Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location (Join-Path $projectRoot "screenpipe-app-tauri")
npm install --legacy-peer-deps
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
Write-Host "  Frontend dependencies installed" -ForegroundColor Green

# Step 4: Build Tauri app
Write-Host "Building Tauri app..." -ForegroundColor Yellow
npx tauri build
Write-Host "  Tauri build completed" -ForegroundColor Green

# Output location
$installer = Get-ChildItem -Path "src-tauri\target\release\bundle\nsis\*.exe" | Select-Object -First 1
Write-Host "`n=== Build Complete ===" -ForegroundColor Cyan
Write-Host "Installer: $($installer.FullName)" -ForegroundColor Green
Write-Host "Size: $([math]::Round($installer.Length / 1MB, 2)) MB" -ForegroundColor Green
```

## 版本信息
- 文档版本: 1.0
- 适用于: Screenpipe v0.44.x
- 最后更新: 2026-01-27

