"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, FolderOpen, GitBranch, User, Calendar, ChevronRight, Home, X, Clock } from "lucide-react";
import { useToast } from "@/lib/use-toast";
import { MultiSelectCombobox, type BaseOption } from "@/components/ui/multi-select-combobox";
import localforage from "localforage";

const RECENT_PATHS_KEY = "searchWithGit-recent-paths";
const MAX_RECENT_PATHS = 10;
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GitCommit {
  id?: string;
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  repo: string;
  repoPath?: string;
}

interface GitRepo {
  name: string;
  path: string;
}

interface GitContextPanelProps {
  onCommitsSelected: (commits: GitCommit[]) => void;
  selectedCommits: Set<string>;
}

export function GitContextPanel({
  onCommitsSelected,
  selectedCommits,
}: GitContextPanelProps) {
  const { toast } = useToast();
  const [rootPath, setRootPath] = useState("");
  const [author, setAuthor] = useState("");
  const [since, setSince] = useState<Date>(new Date(Date.now() - 7 * 24 * 3600000)); // 7天前
  const [until, setUntil] = useState<Date>(new Date());
  const [limit, setLimit] = useState(50);
  
  const [isLoading, setIsLoading] = useState(false);
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  
  // 文件夹浏览器状态
  const [showBrowser, setShowBrowser] = useState(false);
  const [currentBrowsePath, setCurrentBrowsePath] = useState("");
  const [browserEntries, setBrowserEntries] = useState<Array<{name: string; path: string; hasGit: boolean}>>([]);
  const [isBrowsing, setIsBrowsing] = useState(false);
  
  // 最近使用的路径
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [showRecentPaths, setShowRecentPaths] = useState(false);

  const getCommitId = (commit: GitCommit) =>
    commit.id ?? `${commit.repoPath ?? commit.repo}:${commit.hash}`;

  // 加载最近使用的路径
  useEffect(() => {
    const loadRecentPaths = async () => {
      try {
        const paths = await localforage.getItem<string[]>(RECENT_PATHS_KEY);
        if (paths && Array.isArray(paths)) {
          setRecentPaths(paths);
          // 如果当前路径为空且有历史记录，自动填充最近使用的路径
          if (!rootPath && paths.length > 0) {
            setRootPath(paths[0]);
          }
        }
      } catch (error) {
        console.error("Failed to load recent paths:", error);
      }
    };
    loadRecentPaths();
  }, []);

  // 保存路径到最近使用列表
  const saveToRecentPaths = async (path: string) => {
    if (!path.trim()) return;
    
    try {
      const trimmedPath = path.trim();
      // 移除重复项并将新路径添加到开头
      const updatedPaths = [
        trimmedPath,
        ...recentPaths.filter((p) => p !== trimmedPath),
      ].slice(0, MAX_RECENT_PATHS);
      
      await localforage.setItem(RECENT_PATHS_KEY, updatedPaths);
      setRecentPaths(updatedPaths);
    } catch (error) {
      console.error("Failed to save recent path:", error);
    }
  };

  // 删除最近使用的路径
  const removeRecentPath = async (pathToRemove: string) => {
    try {
      const updatedPaths = recentPaths.filter((p) => p !== pathToRemove);
      await localforage.setItem(RECENT_PATHS_KEY, updatedPaths);
      setRecentPaths(updatedPaths);
    } catch (error) {
      console.error("Failed to remove recent path:", error);
    }
  };
  
  // 获取唯一作者列表
  const uniqueAuthors = Array.from(
    new Set(commits.map((c) => c.author))
  ).map((author) => ({
    label: author,
    value: author,
  }));

  const handleSearch = async () => {
    if (!rootPath.trim()) {
      toast({
        title: "错误",
        description: "请输入 git 仓库根路径",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/git-commits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rootPath: rootPath.trim(),
          author: author.trim() || undefined,
          since: since.toISOString(),
          until: until.toISOString(),
          limit,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch git commits");
      }

      const data = await response.json();
      setRepos(data.repos || []);
      setCommits(data.commits || []);
      
      // 搜索成功后保存路径到最近使用列表
      await saveToRecentPaths(rootPath.trim());
      
      toast({
        title: "成功",
        description: `找到 ${data.repos.length} 个仓库，${data.commits.length} 条提交记录`,
      });
    } catch (error: any) {
      console.error("Error fetching git commits:", error);
      toast({
        title: "错误",
        description: error.message || "获取 git 提交记录失败",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommitToggle = (commitId: string) => {
    const commit = commits.find((c) => getCommitId(c) === commitId);
    if (!commit) return;

    const newSelected = new Set(selectedCommits);
    if (newSelected.has(commitId)) {
      newSelected.delete(commitId);
    } else {
      newSelected.add(commitId);
    }

    const selectedCommitsList = commits.filter((c) => newSelected.has(getCommitId(c)));
    onCommitsSelected(selectedCommitsList);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onCommitsSelected(filteredCommits);
    } else {
      onCommitsSelected([]);
    }
  };

  // 过滤提交记录
  const filteredCommits = commits.filter((commit) => {
    if (selectedRepos.length > 0 && !selectedRepos.includes(commit.repo)) {
      return false;
    }
    if (selectedAuthors.length > 0 && !selectedAuthors.includes(commit.author)) {
      return false;
    }
    return true;
  });

  // 通过后端 API 浏览文件夹
  const browsePath = async (dirPath: string) => {
    setIsBrowsing(true);
    try {
      const res = await fetch("/api/browse-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dirPath: dirPath || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "无法浏览目录");
      }
      const data = await res.json();
      setCurrentBrowsePath(data.currentPath || "");
      setBrowserEntries(data.entries || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "浏览失败",
        description: error.message,
      });
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleOpenFolderBrowser = () => {
    setShowBrowser(true);
    browsePath(rootPath || "");
  };

  const handleBrowseSelect = (selectedPath: string) => {
    setRootPath(selectedPath);
    setShowBrowser(false);
    saveToRecentPaths(selectedPath);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Git 提交记录搜索
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 根路径输入 */}
        <div className="space-y-2">
          <Label htmlFor="git-root-path">Git 仓库根路径</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="git-root-path"
                placeholder="例如: D:\Projects 或 /home/user/projects"
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                onFocus={() => {
                  if (recentPaths.length > 0) setShowRecentPaths(true);
                }}
                onBlur={() => {
                  // 延迟隐藏，让点击事件先触发
                  setTimeout(() => setShowRecentPaths(false), 200);
                }}
                className="flex-1 w-full"
              />
              {/* 最近使用的路径下拉列表 */}
              {showRecentPaths && recentPaths.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                  <div className="px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1 border-b">
                    <Clock className="h-3 w-3" />
                    最近使用的路径
                  </div>
                  {recentPaths.map((recentPath) => (
                    <div
                      key={recentPath}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer group text-sm"
                      onMouseDown={(e) => {
                        e.preventDefault(); // 阻止 blur 事件
                        setRootPath(recentPath);
                        setShowRecentPaths(false);
                      }}
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{recentPath}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 shrink-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeRecentPath(recentPath);
                        }}
                        title="移除此路径"
                      >
                        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleOpenFolderBrowser}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>浏览并选择文件夹</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-xs text-muted-foreground">
            直接输入路径或点击右侧按钮浏览选择。{recentPaths.length > 0 ? "点击输入框查看最近使用的路径。" : ""}将递归扫描此路径下所有 git 仓库。
          </p>
        </div>

        {/* 文件夹浏览对话框 */}
        <Dialog open={showBrowser} onOpenChange={setShowBrowser}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                选择文件夹
              </DialogTitle>
              <DialogDescription>
                浏览并选择包含 git 仓库的根目录
              </DialogDescription>
            </DialogHeader>

            {/* 当前路径面包屑 */}
            <div className="flex items-center gap-1 text-sm bg-muted/50 rounded-md px-3 py-2 overflow-x-auto">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1 shrink-0"
                onClick={() => browsePath("")}
              >
                <Home className="h-3 w-3" />
              </Button>
              {currentBrowsePath && currentBrowsePath.split(/[/\\]/).filter(Boolean).map((segment, i, arr) => {
                const fullPath = arr.slice(0, i + 1).join(
                  currentBrowsePath.includes("\\") ? "\\" : "/"
                );
                // Windows：如果第一段是盘符如 "D:"，需要加上 \
                const resolvedPath = currentBrowsePath.includes("\\")
                  ? (i === 0 ? fullPath + "\\" : fullPath)
                  : "/" + fullPath;
                return (
                  <React.Fragment key={i}>
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1 text-xs shrink-0"
                      onClick={() => browsePath(resolvedPath)}
                    >
                      {segment}
                    </Button>
                  </React.Fragment>
                );
              })}
            </div>

            {/* 文件夹列表 */}
            <ScrollArea className="h-[300px] rounded-md border">
              {isBrowsing ? (
                <div className="flex items-center justify-center h-full py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : browserEntries.length === 0 ? (
                <div className="flex items-center justify-center h-full py-12 text-sm text-muted-foreground">
                  此目录下没有子文件夹
                </div>
              ) : (
                <div className="p-1">
                  {browserEntries.map((entry) => (
                    <div
                      key={entry.path}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent cursor-pointer group"
                      onDoubleClick={() => browsePath(entry.path)}
                      onClick={() => setCurrentBrowsePath(entry.path)}
                    >
                      <FolderOpen className={`h-4 w-4 shrink-0 ${entry.hasGit ? "text-green-500" : "text-muted-foreground"}`} />
                      <span className="flex-1 text-sm truncate">{entry.name}</span>
                      {entry.hasGit && (
                        <Badge variant="outline" className="text-[10px] h-5 shrink-0 text-green-600 border-green-300">
                          <GitBranch className="h-3 w-3 mr-1" />
                          git
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          browsePath(entry.path);
                        }}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* 当前选中路径 + 确认按钮 */}
            <div className="flex items-center gap-2">
              <Input
                value={currentBrowsePath}
                onChange={(e) => setCurrentBrowsePath(e.target.value)}
                placeholder="选中的路径"
                className="flex-1 text-sm"
              />
              <Button
                onClick={() => handleBrowseSelect(currentBrowsePath)}
                disabled={!currentBrowsePath}
              >
                确认选择
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 作者筛选 */}
        <div className="space-y-2">
          <Label htmlFor="git-author">提交作者（可选）</Label>
          <Input
            id="git-author"
            placeholder="例如: John Doe"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </div>

        {/* 时间范围 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>开始时间</Label>
            <DateTimePicker date={since} setDate={setSince} />
          </div>
          <div className="space-y-2">
            <Label>结束时间</Label>
            <DateTimePicker date={until} setDate={setUntil} />
          </div>
        </div>

        {/* 限制数量 */}
        <div className="space-y-2">
          <Label htmlFor="git-limit">最大提交数量</Label>
          <Input
            id="git-limit"
            type="number"
            min="1"
            max="500"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </div>

        {/* 搜索按钮 */}
        <Button
          onClick={handleSearch}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              搜索中...
            </>
          ) : (
            <>
              <GitBranch className="mr-2 h-4 w-4" />
              搜索 Git 提交
            </>
          )}
        </Button>

        {/* 仓库和作者过滤 */}
        {commits.length > 0 && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>按仓库过滤</Label>
              <MultiSelectCombobox
                label="仓库"
                options={repos.map((r) => ({ label: r.name, value: r.name }))}
                value={selectedRepos}
                onChange={setSelectedRepos}
                placeholder="选择仓库..."
                renderItem={(option) => <span>{option.label}</span>}
                renderSelectedItem={(values) => (
                  <div className="flex gap-1 flex-wrap">
                    {values.length === 0 ? (
                      <span>所有仓库</span>
                    ) : (
                      values.map((v) => (
                        <Badge key={v} variant="secondary">
                          {v}
                        </Badge>
                      ))
                    )}
                  </div>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>按作者过滤</Label>
              <MultiSelectCombobox
                label="作者"
                options={uniqueAuthors}
                value={selectedAuthors}
                onChange={setSelectedAuthors}
                placeholder="选择作者..."
                renderItem={(option) => <span>{option.label}</span>}
                renderSelectedItem={(values) => (
                  <div className="flex gap-1 flex-wrap">
                    {values.length === 0 ? (
                      <span>所有作者</span>
                    ) : (
                      values.map((v) => (
                        <Badge key={v} variant="secondary">
                          {v}
                        </Badge>
                      ))
                    )}
                  </div>
                )}
              />
            </div>
          </div>
        )}

        {/* 提交记录列表 */}
        {filteredCommits.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center justify-between">
              <Label>提交记录 ({filteredCommits.length})</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all-commits"
                  checked={filteredCommits.every((c) => selectedCommits.has(getCommitId(c)))}
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="select-all-commits" className="text-sm">
                  全选
                </Label>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto space-y-2">
              {filteredCommits.map((commit) => {
                const commitId = getCommitId(commit);

                return (
                <Card
                  key={commitId}
                  className={`cursor-pointer transition-colors ${
                    selectedCommits.has(commitId)
                      ? "border-primary bg-primary/5"
                      : ""
                  }`}
                  onClick={() => handleCommitToggle(commitId)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={selectedCommits.has(commitId)}
                        onCheckedChange={() => handleCommitToggle(commitId)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {commit.repo}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {commit.hash.substring(0, 7)}
                          </span>
                        </div>
                        <p className="text-sm font-medium">{commit.message}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {commit.author}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(commit.date).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
