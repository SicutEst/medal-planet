// 通过 GitHub REST API（Git Data）逐 commit 推送 —— 用于本机无法直连
// github.com（HTTPS 被 reset）、ghproxy 不支持 push 的环境。
// 前提：gh auth token 有效且有 repo 权限（api.github.com 可达）。
// 用法：node scripts/push-via-api.mjs        （增量：按远端最新 commit 信息对齐，只补新的）
//       FULL=1 node scripts/push-via-api.mjs （全量重建：忽略远端历史，从根重推）
//       GH_REPO=xxx/yyy node scripts/push-via-api.mjs

import { execSync } from 'child_process';

const REPO = process.env.GH_REPO || 'SicutEst/medal-planet';
const API = `https://api.github.com/repos/${REPO}`;
const TOKEN = execSync('gh auth token', { encoding: 'utf8' }).trim();

async function gh(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'medal-planet-push',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

const git = (cmd) => execSync(cmd, { maxBuffer: 64 * 1024 * 1024 });

const all = git('git log --reverse --format=%H').toString().trim().split('\n');
const localMsg = (i) => git(`git log --format=%B -1 ${all[i]}`).toString().trim();

const FULL = process.env.FULL === '1';
// 增量判定：API 生成的远端 commit SHA 与本地不同（作者/时间戳由 API 决定），
// 因此按「远端最新一条 commit message 在本地历史中的位置」对齐；FULL=1 时全量重建
let startIdx = 0;
if (!FULL) {
  try {
    const remoteCommits = await gh('GET', '/commits?per_page=100');
    if (remoteCommits.length > 0) {
      const remoteHeadMsg = remoteCommits[0].commit.message.trim();
      for (let i = Math.min(remoteCommits.length, all.length) - 1; i >= 0; i--) {
        if (localMsg(i) === remoteHeadMsg) { startIdx = i + 1; break; }
      }
    }
  } catch { /* 远端查询失败则全量推送 */ }
}
const commits = all.slice(startIdx);
console.log(`待推送 ${commits.length} 个 commit（本地共 ${all.length} 个，远端已有 ${startIdx} 个），开始重建…`);

// 空仓库无法用 Git Data API：先用 Contents API 建占位提交，之后 force 覆盖为真实历史
// FULL=1 强制全量重建（忽略远端已有历史，从根重建）
let refExists = false;
let remoteHeadSha = null;
try {
  const ref = await gh('GET', '/git/refs/heads/main');
  refExists = true;
  remoteHeadSha = ref.object.sha;
} catch (e) {
  const headReadme = git('git show HEAD:README.md');
  await gh('PUT', '/contents/README.md', {
    message: 'bootstrap',
    content: headReadme.toString('base64'),
  });
  console.log('（空仓库：已建占位提交，最后会 force 覆盖为真实历史）');
}

const uploadedBlobs = new Map(); // 本地 blob sha -> 远端 blob sha
// 增量推送时，第一条新 commit 的父节点必须是远端当前 HEAD，否则会把历史截断
let parentCommit = FULL ? null : (refExists ? remoteHeadSha : null);

for (let i = 0; i < commits.length; i++) {
  const sha = commits[i];
  const message = git(`git log -1 --format=%B ${sha}`).toString();
  const treeLines = git(`git ls-tree -r ${sha}`).toString().trim().split('\n');
  // 行格式：<mode> blob <sha>\t<path>
  const files = treeLines.map((line) => {
    const [meta, path] = line.split('\t');
    const blobSha = meta.split(' ')[2];
    return { mode: '100644', path, blobSha };
  });

  const treeEntries = [];
  for (const f of files) {
    if (!uploadedBlobs.has(f.blobSha)) {
      const content = git(`git cat-file blob ${f.blobSha}`);
      const created = await gh('POST', '/git/blobs', {
        content: content.toString('base64'),
        encoding: 'base64',
      });
      uploadedBlobs.set(f.blobSha, created.sha);
      process.stdout.write(`  blob ${f.path} (${content.length}B)\n`);
    }
    treeEntries.push({ path: f.path, mode: f.mode, type: 'blob', sha: uploadedBlobs.get(f.blobSha) });
  }

  const tree = await gh('POST', '/git/trees', {
    tree: treeEntries,
  });

  const commit = await gh('POST', '/git/commits', {
    message: message.trimEnd(),
    tree: tree.sha,
    parents: parentCommit ? [parentCommit] : [],
  });

  if (!refExists) {
    try {
      await gh('POST', '/git/refs', { ref: 'refs/heads/main', sha: commit.sha });
    } catch (e) {
      // 占位提交已创建引用时降级为 force 更新
      await gh('PATCH', '/git/refs/heads/main', { sha: commit.sha, force: true });
    }
    refExists = true;
  } else {
    await gh('PATCH', '/git/refs/heads/main', { sha: commit.sha, force: true });
  }

  parentCommit = commit.sha;
  console.log(`[${i + 1}/${commits.length}] ${message.trimEnd().split('\n')[0]} -> ${commit.sha.slice(0, 7)}`);
}

console.log(`\n完成：本次推送 ${commits.length} 个 commit 到 ${REPO} 的 main 分支`);
