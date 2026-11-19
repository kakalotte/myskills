import { AGENT_ICON_DIR } from './agentIcons';
import type {
  AddCustomAgentPayload,
  Bootstrap,
  Bundle,
  BundleOutcome,
  BundlesOutcome,
  CmdError,
  CreateBundlePayload,
  CreateSkillOutcome,
  CreateSkillPayload,
  CustomAgent,
  DistributeBundleOutcome,
  ImportOutcome,
  ImportSkillPayload,
  InstallMountResult,
  InstallSkillPayload,
  InstallSkillsOutcome,
  InstallSkillsPayload,
  MountOutcome,
  PreviewSkillPayload,
  Project,
  RegisterProjectPayload,
  SaveSkillOutcome,
  SaveSkillPayload,
  ScanPayload,
  ScanResult,
  Settings,
  SkillPreview,
  ThemePreference,
  UninstallSkillPayload,
  UpdateBundlePayload,
} from './types';

const now = () => new Date().toISOString();

// Explicit overrides only; missing => default authorized when root exists/detected.
const authorizedOverrides: Record<string, boolean> = {
  'agent:cursor:global': false,
};

let theme: ThemePreference = 'system';

function effectiveAuthorized(rootId: string, exists: boolean): boolean {
  return authorizedOverrides[rootId] ?? exists;
}
const projects: Project[] = [];
const customAgents: CustomAgent[] = [];
const skillMeta: Record<string, { source: 'builtin' | 'imported' | 'external' }> = {
  'weekly-menu': { source: 'builtin' },
  'daily-standup': { source: 'external' },
  'notion-sync': { source: 'external' },
};
// `${skill}:${agentId}:${scope}:${projectId|global}`
const installs = new Set<string>();
const bundles: Bundle[] = [];

const agentDefs = [
  { id: 'workbuddy', name: 'WorkBuddy', icon: 'workbuddy', accent: 'secondary' as const },
  { id: 'claude_code', name: 'Claude Code', icon: 'claude_code', accent: 'primary' as const },
  { id: 'cursor', name: 'Cursor', icon: 'cursor', accent: 'tertiary' as const },
];

const skillBodies: Record<string, string> = {
  'weekly-menu': `---\nname: weekly-menu\ndescription: 生成一周家庭菜单并汇总采购清单，支持口味偏好与忌口。\nversion: 1.2.0\nx-owner: demo\n---\n\n# Weekly Menu\n\n根据家庭成员偏好生成周菜单。\n\n## 步骤\n\n1. 读取偏好\n2. 生成菜单\n3. 汇总采购清单\n`,
  'daily-standup': `---\nname: daily-standup\ndescription: 汇总昨日提交与今日计划，生成站会摘要。\n---\n\n# Daily Standup\n\n只读的外部技能，需纳入中央库后才能分发。\n`,
  'notion-sync': `---\nname: notion-sync\ndescription: 将本地笔记双向同步到 Notion 数据库。\nversion: 0.4.1\n---\n\n同步前会生成差异快照。\n`,
};

function rootPath(agentId: string, scope: 'global' | 'project', project?: Project | null): string {
  if (scope === 'project' && project) {
    const base = project.path.replace(/\\/g, '/');
    if (agentId === 'cursor') return `${base}/.cursor/skills`;
    if (agentId === 'claude_code') return `${base}/.claude/skills`;
    return `${base}/.${agentId}/skills`;
  }
  if (agentId === 'cursor') return '~/.cursor/skills';
  if (agentId === 'claude_code') return '~/.claude/skills';
  return `~/.${agentId}/skills`;
}

function customIconSrc(agent: CustomAgent): string | null {
  if (agent.iconKind === 'builtin') return `${AGENT_ICON_DIR}${agent.iconValue}`;
  // Demo stores the whole data URL in iconValue; the real backend stores it on disk.
  if (agent.iconKind === 'uploaded') return agent.iconValue || null;
  return null;
}

function globalRoots() {
  const builtins = agentDefs.map((agent) => {
    const exists = true;
    const id = `agent:${agent.id}:global`;
    return {
      id,
      agentId: agent.id,
      agentName: agent.name,
      scope: 'global' as const,
      projectId: null,
      projectName: null,
      path: rootPath(agent.id, 'global').replace('~', '/demo/home'),
      displayPath: rootPath(agent.id, 'global'),
      exists,
      authorized: effectiveAuthorized(id, exists),
      skillCount: 0,
      isCustom: false,
      iconSrc: null,
    };
  });
  const customs = customAgents.map((agent) => {
    const id = `agent:${agent.id}:global`;
    const exists = true;
    return {
      id,
      agentId: agent.id,
      agentName: agent.name,
      scope: 'global' as const,
      projectId: null,
      projectName: null,
      path: agent.path.replace('~', '/demo/home'),
      displayPath: agent.path,
      exists,
      authorized: effectiveAuthorized(id, exists),
      skillCount: 0,
      isCustom: true,
      iconSrc: customIconSrc(agent),
    };
  });
  return [...builtins, ...customs];
}

function projectRootsFor(project: Project) {
  return agentDefs.map((agent) => {
    const exists = agent.id === 'claude_code' || agent.id === 'cursor';
    const id = `agent:${agent.id}:project:${project.id}`;
    return {
      id,
      agentId: agent.id,
      agentName: agent.name,
      scope: 'project' as const,
      projectId: project.id,
      projectName: project.name,
      path: rootPath(agent.id, 'project', project),
      displayPath: rootPath(agent.id, 'project', project),
      exists,
      authorized: effectiveAuthorized(id, exists),
      skillCount: 0,
      isCustom: false,
      iconSrc: null,
    };
  });
}

function allRoots() {
  return [...globalRoots(), ...projects.flatMap((p) => projectRootsFor(p))];
}

function buildBootstrap(): Bootstrap {
  return {
    settings: {
      schemaVersion: 2,
      onboardingCompleted: true,
      theme,
      authorizedRoots: { ...authorizedOverrides },
      projects: [...projects],
      customAgents: [...customAgents],
      activeScope: 'global',
      activeProjectId: null,
    },
    roots: allRoots(),
    agents: [
      ...agentDefs,
      ...customAgents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        icon: agent.iconValue,
        accent: 'primary' as const,
      })),
    ],
    centralStorePath: '/demo/home/.myskills/store',
    centralStoreDisplay: '~/.myskills/store',
    appVersion: '0.1.0-demo',
  };
}

function installKey(
  skill: string,
  agentId: string,
  scope: 'global' | 'project',
  projectId?: string | null,
) {
  return `${skill}:${agentId}:${scope}:${projectId ?? 'global'}`;
}

// Demo-only same-name entries: a skill dir that exists in an Agent workspace but is
// not managed by mySkills, so mounting it needs an explicit overwrite confirmation.
const externalEntries = new Set<string>(['weekly-menu:workbuddy:global:global']);

function buildScan(payload: ScanPayload): ScanResult {
  const scope = payload.scope;
  const projectId = payload.projectId ?? null;
  const project = projectId ? (projects.find((p) => p.id === projectId) ?? null) : null;
  const roots = scope === 'global' ? globalRoots() : project ? projectRootsFor(project) : [];
  const visibleRoots = roots.filter((root) => root.authorized && root.exists);
  const visibleAgentIds = new Set(visibleRoots.map((root) => root.agentId));

  const skillNames = Object.keys(skillMeta);
  const skills = skillNames
    .filter(() => {
      if (scope === 'global') return true;
      // in demo, show central skills in project and external only if "project-only" (none by default)
      return true;
    })
    .map((name) => {
      const meta = skillMeta[name];
      const body = skillBodies[name] ?? `---\nname: ${name}\ndescription: 演示技能\n---\n`;
      const descMatch = body.match(/description:\s*(.+)/);
      const isExternal = meta.source === 'external';
      const externalOriginAgent = name === 'daily-standup' ? 'claude_code' : 'workbuddy';
      const hasExternalOccurrence =
        isExternal && scope === 'global' && visibleAgentIds.has(externalOriginAgent);
      if (scope === 'project' && isExternal) {
        // demo: no project externals
      }
      return {
        id: isExternal ? `external:${name}:${scope}:${projectId ?? 'g'}` : `central:${name}`,
        name,
        dirName: name,
        description: descMatch ? descMatch[1].trim() : '',
        version: /version:\s*([\d.]+)/.exec(body)?.[1] ?? null,
        source: meta.source,
        isExternal: isExternal && hasExternalOccurrence,
        path: isExternal
          ? `${rootPath(externalOriginAgent, scope, project)}/${name}`
          : `~/.myskills/store/${name}`,
        displayPath: isExternal
          ? `${rootPath(externalOriginAgent, scope, project)}/${name}`
          : `~/.myskills/store/${name}`,
        occurrences: [],
        badges: roots
          .filter((r) => r.authorized)
          .map((root) => {
            const installed = installs.has(installKey(name, root.agentId, scope, projectId));
            const conflict = externalEntries.has(installKey(name, root.agentId, scope, projectId));
            if (isExternal) {
              const origin = hasExternalOccurrence && root.agentId === externalOriginAgent;
              return {
                agentId: root.agentId,
                agentName: root.agentName,
                rootId: root.id,
                scope,
                state: origin ? ('origin' as const) : ('external' as const),
                mountType: null,
                targetPath: root.path,
                targetDisplay: root.displayPath,
                authorized: root.authorized,
                rootExists: root.exists,
                detail: origin ? '外部原件：先纳入中央库后才能分发' : '外部技能需先纳入中央库',
              };
            }
            if (!root.exists) {
              return {
                agentId: root.agentId,
                agentName: root.agentName,
                rootId: root.id,
                scope,
                state: 'locked' as const,
                mountType: null,
                targetPath: `${root.displayPath}/${name}`,
                targetDisplay: `${root.displayPath}/${name}`,
                authorized: root.authorized,
                rootExists: false,
                detail: '目录未检测到，已授权，待检测后可用',
              };
            }
            return {
              agentId: root.agentId,
              agentName: root.agentName,
              rootId: root.id,
              scope,
              state: conflict
                ? ('conflict' as const)
                : installed
                  ? ('installed' as const)
                  : ('available' as const),
              mountType: installed ? ('symlink' as const) : null,
              targetPath: `${root.displayPath}/${name}`,
              targetDisplay: `${root.displayPath}/${name}`,
              authorized: root.authorized,
              rootExists: root.exists,
              detail: conflict
                ? '目标目录已存在同名项，可覆盖安装'
                : installed
                  ? '符号链接安装（演示）'
                  : null,
            };
          }),
      };
    })
    .filter((s) => !(scope === 'project' && s.isExternal));

  const installedMounts = skills
    .flatMap((s) => s.badges)
    .filter((b) => b.state === 'installed').length;
  const conflictCount = skills
    .flatMap((s) => s.badges)
    .filter((b) => b.state === 'conflict').length;

  return {
    skills,
    roots: visibleRoots,
    stats: {
      skillCount: skills.length,
      externalCount: skills.filter((s) => s.isExternal).length,
      installedMounts,
      conflictCount,
      agentCount: new Set(visibleRoots.map((r) => r.agentId)).size,
      authorizedRootCount: visibleRoots.length,
      rootCount: visibleRoots.length,
    },
    diff: { firstScan: true, added: [], removed: [], changed: [] },
    centralStoreDisplay: '~/.myskills/store',
    scannedAt: now(),
    scope,
    activeProjectId: projectId,
  };
}

function reject(code: string, message: string): never {
  const err: CmdError & Error = Object.assign(new Error(message), { code, message });
  throw err;
}

export const demoApi = {
  bootstrap: async (): Promise<Bootstrap> => buildBootstrap(),
  authorizeRoot: async (rootId: string, value: boolean): Promise<Bootstrap> => {
    const root = allRoots().find((item) => item.id === rootId);
    const defaultAuthorized = root?.exists ?? false;
    if (value === defaultAuthorized) delete authorizedOverrides[rootId];
    else authorizedOverrides[rootId] = value;
    return buildBootstrap();
  },
  addCustomAgent: async (payload: AddCustomAgentPayload): Promise<Bootstrap> => {
    const name = payload.name.trim();
    if (!name) reject('INVALID_NAME', '请输入 Agent 名称');
    if (!payload.path.trim()) reject('INVALID_PATH', '请选择或输入目录路径');
    if (customAgents.some((agent) => agent.name === name))
      reject('AGENT_NAME_EXISTS', '已存在同名自定义 Agent');
    const id = `custom_${Date.now().toString(36)}`;
    customAgents.push({
      id,
      name,
      path: payload.path.trim(),
      iconKind: payload.iconKind,
      iconValue:
        payload.iconKind === 'uploaded' ? (payload.iconBase64 ?? '') : payload.iconValue.trim(),
      addedAt: now(),
    });
    if (!payload.authorized) authorizedOverrides[`agent:${id}:global`] = false;
    return buildBootstrap();
  },
  removeCustomAgent: async (id: string): Promise<Bootstrap> => {
    const index = customAgents.findIndex((agent) => agent.id === id);
    if (index === -1) reject('UNKNOWN_AGENT', '未找到该自定义 Agent');
    customAgents.splice(index, 1);
    delete authorizedOverrides[`agent:${id}:global`];
    return buildBootstrap();
  },
  setTheme: async (value: ThemePreference): Promise<Settings> => {
    theme = value;
    return buildBootstrap().settings;
  },
  registerProject: async (payload: RegisterProjectPayload): Promise<Project> => {
    const project: Project = {
      id: `proj-${Date.now()}`,
      name: payload.name ?? '未命名项目',
      path: payload.path,
      addedAt: now(),
    };
    projects.push(project);
    return project;
  },
  removeProject: async (projectId: string): Promise<Bootstrap> => {
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx >= 0) projects.splice(idx, 1);
    return buildBootstrap();
  },
  scanSkills: async (payload: ScanPayload): Promise<ScanResult> => buildScan(payload),
  previewSkill: async (payload: PreviewSkillPayload): Promise<SkillPreview> => {
    const skillName = payload.skillName;
    const meta = skillMeta[skillName];
    if (!meta) reject('SKILL_NOT_FOUND', '未找到该技能');
    const raw = skillBodies[skillName] ?? '';
    const body = raw.replace(/^---[\s\S]*?---\n?/, '');
    return {
      name: skillName,
      raw,
      body,
      frontmatter: { name: skillName },
      path: '',
      displayPath:
        meta.source === 'external'
          ? `[演示] ${skillName}`
          : `~/.myskills/store/${skillName}/SKILL.md`,
      isExternal: meta.source === 'external',
      source: meta.source,
    };
  },
  installSkill: async (payload: InstallSkillPayload): Promise<MountOutcome> => {
    if (skillMeta[payload.skillName]?.source === 'external')
      reject('NOT_CENTRAL', '外部技能需先纳入中央库');
    const key = installKey(payload.skillName, payload.agentId, payload.scope, payload.projectId);
    const rootPathStr = rootPath(
      payload.agentId,
      payload.scope,
      projects.find((p) => p.id === payload.projectId),
    );
    let replaced = false;
    if (externalEntries.has(key)) {
      if (!payload.force) reject('NAME_CONFLICT', '目标位置已存在同名内容，确认后可覆盖');
      externalEntries.delete(key);
      replaced = true;
    }
    installs.add(key);
    return {
      skillName: payload.skillName,
      agentId: payload.agentId,
      action: 'install',
      mountType: 'symlink',
      targetDisplay: `${rootPathStr}/${payload.skillName}`,
      alreadyInstalled: false,
      message: replaced ? '已覆盖同名内容并建立安装' : '演示模式：未对真实文件系统执行操作',
      replaced,
      replacedDisplay: replaced ? `${rootPathStr}/${payload.skillName}` : null,
    };
  },
  uninstallSkill: async (payload: UninstallSkillPayload): Promise<MountOutcome> => {
    installs.delete(
      installKey(payload.skillName, payload.agentId, payload.scope, payload.projectId),
    );
    const rootPathStr = rootPath(
      payload.agentId,
      payload.scope,
      projects.find((p) => p.id === payload.projectId),
    );
    return {
      skillName: payload.skillName,
      agentId: payload.agentId,
      action: 'uninstall',
      mountType: 'symlink',
      targetDisplay: `${rootPathStr}/${payload.skillName}`,
      alreadyInstalled: false,
      message: '演示模式：未对真实文件系统执行操作',
      replaced: false,
      replacedDisplay: null,
    };
  },
  importSkill: async (payload: ImportSkillPayload): Promise<ImportOutcome> => {
    const meta = skillMeta[payload.skillName];
    if (!meta || meta.source !== 'external') reject('NOT_EXTERNAL', '该技能不是外部原件');
    meta.source = 'imported';
    return {
      skillName: payload.skillName,
      targetDisplay: `~/.myskills/store/${payload.skillName}`,
      message: '演示模式：已在内存中标记为导入',
    };
  },
  installSkills: async (payload: InstallSkillsPayload): Promise<InstallSkillsOutcome> => {
    const results: InstallMountResult[] = [];
    let succeeded = 0;
    let skipped = 0;
    let failed = 0;
    let replaced = 0;
    const roots =
      payload.scope === 'global'
        ? globalRoots()
        : projectRootsFor(projects.find((p) => p.id === payload.projectId)!);

    for (const item of payload.items) {
      const meta = skillMeta[item.skillName];
      const root = roots.find((r) => r.agentId === item.agentId);
      const isAuthorized = root?.authorized === true && root?.exists === true;

      if (!meta || meta.source === 'external') {
        failed += 1;
        results.push({
          skillName: item.skillName,
          agentId: item.agentId,
          agentName: item.agentId,
          state: 'failed',
          mountType: null,
          targetDisplay: '',
          message: '仅中央库技能可分发，请先纳入中央库',
          replaced: false,
        });
        continue;
      }

      if (!isAuthorized) {
        failed += 1;
        results.push({
          skillName: item.skillName,
          agentId: item.agentId,
          agentName: item.agentId,
          state: 'failed',
          mountType: null,
          targetDisplay: '',
          message: 'Agent 目录未授权或不可用，无法分发',
          replaced: false,
        });
        continue;
      }

      const key = installKey(item.skillName, item.agentId, payload.scope, payload.projectId);
      const targetDisplay = `${root.displayPath}/${item.skillName}`;
      let wasReplaced = false;
      if (installs.has(key)) {
        skipped += 1;
        results.push({
          skillName: item.skillName,
          agentId: item.agentId,
          agentName: item.agentId,
          state: 'skipped',
          mountType: null,
          targetDisplay,
          message: '该安装已存在，无需重复安装',
          replaced: false,
        });
        continue;
      }

      if (externalEntries.has(key)) {
        if (!payload.force) {
          skipped += 1;
          results.push({
            skillName: item.skillName,
            agentId: item.agentId,
            agentName: item.agentId,
            state: 'skipped',
            mountType: null,
            targetDisplay,
            message: '目标位置已存在同名内容，确认后可覆盖',
            replaced: false,
          });
          continue;
        }
        externalEntries.delete(key);
        replaced += 1;
        wasReplaced = true;
      }

      installs.add(key);
      succeeded += 1;
      results.push({
        skillName: item.skillName,
        agentId: item.agentId,
        agentName: item.agentId,
        state: 'installed',
        mountType: 'symlink',
        targetDisplay,
        message: wasReplaced ? '已覆盖同名内容并建立安装' : '符号链接已建立并生效',
        replaced: wasReplaced,
      });
    }

    return {
      results,
      succeeded,
      skipped,
      failed,
      message:
        failed === 0
          ? replaced > 0
            ? `完成：成功 ${succeeded} 个（其中覆盖同名 ${replaced} 个），跳过 ${skipped} 个`
            : skipped > 0
              ? `完成：成功 ${succeeded} 个，跳过 ${skipped} 个（已安装）`
              : `已成功建立 ${succeeded} 个安装`
          : `完成：成功 ${succeeded} 个，跳过 ${skipped} 个，失败 ${failed} 个`,
      replaced,
    };
  },
  saveSkill: async (payload: SaveSkillPayload): Promise<SaveSkillOutcome> => ({
    skillName: payload.skillName,
    displayPath: `~/.myskills/store/${payload.skillName}/SKILL.md`,
    message: '演示模式：SKILL.md 已保存',
  }),
  createSkill: async (payload: CreateSkillPayload): Promise<CreateSkillOutcome> => {
    const name = payload.name.trim();
    if (!name) reject('INVALID_SKILL_NAME', '请输入技能名称');
    const dirName =
      name
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'my-new-skill';
    if (skillMeta[name]) reject('NAME_CONFLICT', '中央库中已存在同名技能，已阻止创建');
    skillMeta[name] = { source: 'builtin' };
    skillBodies[name] = payload.raw;
    return {
      skillName: name,
      dirName,
      displayPath: `~/.myskills/store/${dirName}/SKILL.md`,
      message: '演示模式：新技能已写入中央库',
    };
  },
  listBundles: async (): Promise<BundlesOutcome> => {
    const sorted = [...bundles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { bundles: sorted, message: `已加载 ${sorted.length} 个技能组合` };
  },
  createBundle: async (payload: CreateBundlePayload): Promise<BundleOutcome> => {
    const name = payload.name.trim();
    if (!name) reject('INVALID_BUNDLE_NAME', '请输入组合名称');
    const slug = payload.slug.trim();
    if (!slug) reject('INVALID_BUNDLE_SLUG', '请输入组合标识符');
    if (bundles.some((b) => b.name === name)) reject('BUNDLE_EXISTS', '组合名称已存在');
    if (bundles.some((b) => b.slug === slug)) reject('BUNDLE_EXISTS', '组合标识符已存在');
    const stamp = now();
    const bundle: Bundle = {
      id: `bundle-${Date.now()}`,
      name,
      slug,
      version: payload.version.trim(),
      description: payload.description.trim(),
      skillNames: [],
      createdAt: stamp,
      updatedAt: stamp,
    };
    bundles.push(bundle);
    return { bundle, message: '技能组合已创建' };
  },
  updateBundle: async (payload: UpdateBundlePayload): Promise<BundleOutcome> => {
    const bundle = bundles.find((b) => b.id === payload.id);
    if (!bundle) reject('UNKNOWN_BUNDLE', '组合不存在');
    if (payload.name !== undefined) bundle.name = payload.name.trim();
    if (payload.slug !== undefined) bundle.slug = payload.slug.trim();
    if (payload.version !== undefined) bundle.version = payload.version.trim();
    if (payload.description !== undefined) bundle.description = payload.description.trim();
    bundle.updatedAt = now();
    return { bundle, message: '技能组合已更新' };
  },
  deleteBundle: async (bundleId: string): Promise<void> => {
    const idx = bundles.findIndex((b) => b.id === bundleId);
    if (idx === -1) reject('UNKNOWN_BUNDLE', '组合不存在');
    bundles.splice(idx, 1);
  },
  addSkillToBundle: async (payload: {
    bundleId: string;
    skillName: string;
  }): Promise<BundleOutcome> => {
    const bundle = bundles.find((b) => b.id === payload.bundleId);
    if (!bundle) reject('UNKNOWN_BUNDLE', '组合不存在');
    if (bundle.skillNames.includes(payload.skillName)) reject('SKILL_IN_BUNDLE', '技能已在组合中');
    if (!skillMeta[payload.skillName]) reject('SKILL_NOT_FOUND', '技能不在中央库中');
    bundle.skillNames.push(payload.skillName);
    bundle.updatedAt = now();
    return { bundle, message: '技能已添加到组合' };
  },
  removeSkillFromBundle: async (payload: {
    bundleId: string;
    skillName: string;
  }): Promise<BundleOutcome> => {
    const bundle = bundles.find((b) => b.id === payload.bundleId);
    if (!bundle) reject('UNKNOWN_BUNDLE', '组合不存在');
    if (!bundle.skillNames.includes(payload.skillName))
      reject('SKILL_NOT_IN_BUNDLE', '技能不在组合中');
    bundle.skillNames = bundle.skillNames.filter((n) => n !== payload.skillName);
    bundle.updatedAt = now();
    return { bundle, message: '技能已从组合移除' };
  },
  distributeBundle: async (_payload?: unknown): Promise<DistributeBundleOutcome> => {
    void _payload;
    return { results: [], succeeded: 0, skipped: 0, failed: 0, message: '演示模式：分发未执行' };
  },
};
