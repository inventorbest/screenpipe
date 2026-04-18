// app/api/browse-folder/route.ts
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET: 列出指定路径下的直接子目录（供前端文件夹浏览器使用）
 * POST: 验证路径是否存在并返回子目录列表
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { dirPath } = body;

    if (!dirPath) {
      // 返回一些常用的根路径
      const roots = getDefaultRoots();
      return NextResponse.json({ entries: roots, currentPath: "" });
    }

    // 验证路径是否存在
    try {
      const stat = await fs.promises.stat(dirPath);
      if (!stat.isDirectory()) {
        return NextResponse.json(
          { error: "路径不是一个目录" },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "路径不存在或无法访问" },
        { status: 400 }
      );
    }

    // 列出子目录
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => {
        if (!entry.isDirectory()) return false;
        // 跳过隐藏目录和常见不需要的目录
        if (entry.name.startsWith('.') && entry.name !== '.git') return false;
        if (['node_modules', '__pycache__', '.next', 'dist', 'build', 'target'].includes(entry.name)) return false;
        return true;
      })
      .map((entry) => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        hasGit: fs.existsSync(path.join(dirPath, entry.name, '.git')),
      }))
      .sort((a, b) => {
        // git 仓库排在前面
        if (a.hasGit && !b.hasGit) return -1;
        if (!a.hasGit && b.hasGit) return 1;
        return a.name.localeCompare(b.name);
      });

    // 检查当前目录是否为 git 仓库
    const isGitRepo = fs.existsSync(path.join(dirPath, '.git'));

    return NextResponse.json({
      currentPath: dirPath,
      parentPath: path.dirname(dirPath),
      isGitRepo,
      entries: dirs,
    });
  } catch (error: any) {
    console.error("browse-folder API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function getDefaultRoots(): Array<{ name: string; path: string; hasGit: boolean }> {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const roots: Array<{ name: string; path: string; hasGit: boolean }> = [];
    // 常见 Windows 盘符
    for (const letter of ['C', 'D', 'E', 'F']) {
      const p = `${letter}:\\`;
      if (fs.existsSync(p)) {
        roots.push({ name: p, path: p, hasGit: false });
      }
    }
    // 用户目录
    const userDir = process.env.USERPROFILE;
    if (userDir && fs.existsSync(userDir)) {
      roots.push({ name: `User (${path.basename(userDir)})`, path: userDir, hasGit: false });
    }
    return roots;
  } else {
    const roots: Array<{ name: string; path: string; hasGit: boolean }> = [
      { name: "/", path: "/", hasGit: false },
    ];
    const homeDir = process.env.HOME;
    if (homeDir && fs.existsSync(homeDir)) {
      roots.push({ name: `Home (${path.basename(homeDir)})`, path: homeDir, hasGit: false });
    }
    return roots;
  }
}
