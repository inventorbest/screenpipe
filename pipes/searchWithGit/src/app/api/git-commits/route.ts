// app/api/git-commits/route.ts
import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

// Force Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  repo: string;
}

interface GitRepo {
  path: string;
  name: string;
}

/**
 * 递归查找目录下所有 .git 文件夹
 */
async function findGitRepos(rootPath: string): Promise<GitRepo[]> {
  const repos: GitRepo[] = [];
  
  async function scan(dir: string, depth: number = 0) {
    // 限制递归深度，避免扫描过深
    if (depth > 5) return;
    
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // 跳过常见的不需要扫描的目录
        if (entry.name === 'node_modules' || 
            entry.name === '.next' || 
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === 'target' ||
            entry.name === '.venv' ||
            entry.name === 'venv') {
          continue;
        }
        
        if (entry.isDirectory()) {
          if (entry.name === '.git') {
            // 找到 git 仓库
            repos.push({
              path: dir,
              name: path.basename(dir),
            });
          } else {
            // 继续递归
            await scan(fullPath, depth + 1);
          }
        }
      }
    } catch (error) {
      // 忽略权限错误等
      console.warn(`无法扫描目录 ${dir}:`, error);
    }
  }
  
  await scan(rootPath);
  return repos;
}

/**
 * 获取指定 git 仓库的提交记录
 */
async function getGitCommits(
  repoPath: string,
  options: {
    author?: string;
    since?: string;
    until?: string;
    limit?: number;
  }
): Promise<GitCommit[]> {
  const { author, since, until, limit = 100 } = options;
  
  // 构建 git log 命令
  let cmd = `git log --pretty=format:"%H|%an|%ae|%ai|%s" -n ${limit}`;
  
  if (author) {
    cmd += ` --author="${author}"`;
  }
  
  if (since) {
    cmd += ` --since="${since}"`;
  }
  
  if (until) {
    cmd += ` --until="${until}"`;
  }
  
  try {
    const { stdout } = await execAsync(cmd, {
      cwd: repoPath,
      maxBuffer: 1024 * 1024 * 10, // 10MB
    });
    
    if (!stdout.trim()) {
      return [];
    }
    
    const lines = stdout.trim().split('\n');
    const commits: GitCommit[] = [];
    
    for (const line of lines) {
      const [hash, authorName, email, date, ...messageParts] = line.split('|');
      commits.push({
        hash,
        author: authorName,
        email,
        date,
        message: messageParts.join('|'), // 防止 message 中有 |
        repo: path.basename(repoPath),
      });
    }
    
    return commits;
  } catch (error: any) {
    console.error(`获取 ${repoPath} 的 git log 失败:`, error.message);
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      rootPath,
      author,
      since,
      until,
      limit = 100,
    } = body;
    
    if (!rootPath) {
      return NextResponse.json(
        { error: "rootPath is required" },
        { status: 400 }
      );
    }
    
    // 检查路径是否存在
    try {
      await fs.promises.access(rootPath);
    } catch {
      return NextResponse.json(
        { error: "rootPath does not exist or is not accessible" },
        { status: 400 }
      );
    }
    
    // 1. 递归查找所有 git 仓库
    const repos = await findGitRepos(rootPath);
    
    if (repos.length === 0) {
      return NextResponse.json({
        repos: [],
        commits: [],
        total: 0,
      });
    }
    
    // 2. 并行获取所有仓库的提交记录
    const allCommitsPromises = repos.map((repo) =>
      getGitCommits(repo.path, { author, since, until, limit })
    );
    
    const allCommitsArrays = await Promise.all(allCommitsPromises);
    const allCommits = allCommitsArrays.flat();
    
    // 3. 按时间排序（最新的在前）
    allCommits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // 4. 限制总数
    const limitedCommits = allCommits.slice(0, limit);
    
    return NextResponse.json({
      repos: repos.map(r => ({ name: r.name, path: r.path })),
      commits: limitedCommits,
      total: limitedCommits.length,
    });
  } catch (error: any) {
    console.error("git-commits API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
