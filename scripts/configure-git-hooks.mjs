import { execFileSync } from 'node:child_process';

try {
  const insideWorkTree = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (insideWorkTree === 'true') {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  }
} catch {
  // 发布源码包不含 .git；依赖安装和可复现构建不依赖本地 Git hooks。
}
