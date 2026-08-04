/**
 * Live2D 模型包导入规范化
 *
 * 市面模型常为 1–3 层嵌套礼包（UI/稿图/模型文件混放），入口可能是
 * `Foo.model3.json` 而非 `model.json`。本模块负责：
 * - 从用户选择目录发现真正的模型根（含 model3 + moc3）
 * - 生成 ASCII stableId / 中文 displayName
 * - 仅复制模型根，并确保存在 model.json + model.meta.json
 */

import type { Dirent } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import fs from 'fs-extra'
import { pinyin } from 'pinyin'
import { isPathInside } from './paths'

/** 默认最大搜索深度（相对用户选择根） */
export const LIVE2D_DISCOVER_MAX_DEPTH = 5

/** 导入后写入的元数据文件名 */
export const LIVE2D_MODEL_META_FILE = 'model.meta.json'

/** 运行时统一入口 */
export const LIVE2D_MODEL_JSON = 'model.json'

const NO_MODEL_ERROR = '未找到有效的 Live2D 模型（需要 .model3.json 与 .moc3）'

export interface Live2dModelCandidate {
  /** 模型根目录绝对路径 */
  rootDir: string
  /** 相对选择根的深度（0 = 选择根本身） */
  depth: number
  /** 主配置文件名（model.json 或 *.model3.json） */
  model3FileName: string
  /** 解析到的 .moc3 文件名（相对 rootDir） */
  moc3FileName: string
  /** .moc3 字节大小，用于多候选择优 */
  moc3Size: number
}

export interface Live2dModelMeta {
  id: string
  displayName: string
  model3: string
  importedAt: string
}

export interface NormalizeImportResult {
  stableId: string
  displayName: string
  targetPath: string
  modelRoot: string
  model3FileName: string
}

export interface ValidateLive2dFolderResult {
  valid: boolean
  error?: string
  /** 发现的最佳模型根（valid 时有值） */
  candidate?: Live2dModelCandidate
}

interface Model3FileReferences {
  Moc?: unknown
  Textures?: unknown
  Physics?: unknown
}

interface Model3JsonShape {
  FileReferences?: Model3FileReferences
}

/**
 * 判断文件名是否为 Cubism 3+ 模型描述
 */
export function isModel3ConfigFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return lower === LIVE2D_MODEL_JSON || lower.endsWith('.model3.json')
}

/**
 * 从 model3 配置文件名提取 stem（去掉 .model3.json / .json）
 */
export function model3Stem(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.model3.json'))
    return fileName.slice(0, -'.model3.json'.length)
  if (lower === LIVE2D_MODEL_JSON || lower.endsWith('.json'))
    return path.basename(fileName, path.extname(fileName))
  return fileName
}

/**
 * 将任意名称转为 ASCII stableId：
 * - 已有 [a-zA-Z0-9_-] 片段保留并小写
 * - 中文等走拼音（无调），再 slug
 * - 仍为空则 `live2d-<hash8>`
 */
function isAsciiString(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0x7F)
      return false
  }
  return true
}

/**
 * 仅保留 ASCII slug 字符 a-z A-Z 0-9 _，其余（含 `-`、中文）压成单个分隔 `-`
 * （刻意不用 \w：JS \w 在 unicode 下会吞进非 ASCII 字母）
 */
function toAsciiSlugFragment(value: string): string {
  let out = ''
  let pendingDash = false
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    const code = value.charCodeAt(i)
    const isAlphaNum
      = (code >= 48 && code <= 57) // 0-9
        || (code >= 65 && code <= 90) // A-Z
        || (code >= 97 && code <= 122) // a-z
    const keep = isAlphaNum || ch === '_'
    if (keep) {
      if (pendingDash && out.length > 0)
        out += '-'
      pendingDash = false
      out += ch
    }
    else if (out.length > 0) {
      // 中文、空格、连字符等一律当作分隔，避免尾部残留 `-`
      pendingDash = true
    }
  }
  return out.toLowerCase()
}

export function slugifyLive2dStableId(rawName: string): string {
  const trimmed = rawName.trim()
  if (!trimmed)
    return hashStableId('empty')

  // 已是纯 ASCII 可 slug 的内容
  const asciiOnly = toAsciiSlugFragment(trimmed)
  if (asciiOnly.length > 0 && isAsciiString(trimmed))
    return clampId(asciiOnly)

  // 含非 ASCII：拼音转换后 slug
  let romanized = ''
  try {
    const parts = pinyin(trimmed, {
      style: pinyin.STYLE_NORMAL,
      heteronym: false,
    })
    romanized = parts.map(p => p[0] || '').join('')
  }
  catch {
    romanized = ''
  }

  // 拼音结果 + 原串中的 ASCII 片段
  const mixed = toAsciiSlugFragment(`${romanized}-${trimmed}`)
  if (mixed.length > 0)
    return clampId(mixed)

  return hashStableId(trimmed)
}

function clampId(id: string): string {
  // 避免过长目录名；保留可读前缀
  const max = 64
  if (id.length <= max)
    return id
  const hash = createHash('sha1').update(id).digest('hex').slice(0, 8)
  return `${id.slice(0, max - 9)}-${hash}`
}

function hashStableId(seed: string): string {
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 8)
  return `live2d-${hash}`
}

/**
 * 在已占用 id 集合中分配唯一 stableId（冲突追加 -2, -3, …）
 */
export function allocateUniqueStableId(
  baseId: string,
  existingIds: ReadonlySet<string> | Iterable<string>,
): string {
  const occupied = existingIds instanceof Set ? existingIds : new Set(existingIds)
  const base = baseId || hashStableId('model')
  if (!occupied.has(base))
    return base

  let n = 2
  while (occupied.has(`${base}-${n}`))
    n += 1
  return `${base}-${n}`
}

/**
 * 读取 model3 JSON 中的 Moc 引用（相对路径）
 */
export async function readReferencedMoc(
  modelRoot: string,
  model3FileName: string,
): Promise<string | null> {
  const fullPath = path.join(modelRoot, model3FileName)
  try {
    const json = await fs.readJson(fullPath) as Model3JsonShape
    const moc = json.FileReferences?.Moc
    if (typeof moc === 'string' && moc.trim())
      return moc.replace(/\\/g, '/')
  }
  catch {
    // 忽略损坏 JSON，退回同目录扫描
  }
  return null
}

/**
 * 在目录内选择主 model3 配置：优先 model.json，否则第一个 *.model3.json（字典序稳定）
 */
export function pickPrimaryModel3FileName(fileNames: readonly string[]): string | null {
  if (fileNames.includes(LIVE2D_MODEL_JSON))
    return LIVE2D_MODEL_JSON
  const model3 = fileNames
    .filter(f => f.toLowerCase().endsWith('.model3.json'))
    .sort((a, b) => a.localeCompare(b))
  return model3[0] ?? null
}

/**
 * 检查目录是否为有效模型根，并返回候选描述
 */
export async function inspectLive2dModelRoot(
  rootDir: string,
  depth: number,
): Promise<Live2dModelCandidate | null> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true })
  }
  catch {
    return null
  }

  const fileNames = entries.filter(e => e.isFile()).map(e => e.name)
  const model3FileName = pickPrimaryModel3FileName(fileNames)
  if (!model3FileName)
    return null

  const referencedMoc = await readReferencedMoc(rootDir, model3FileName)
  let moc3FileName: string | null = null

  if (referencedMoc) {
    const mocPath = path.join(rootDir, referencedMoc)
    // 仅接受模型根内相对路径，拒绝 .. 跳出
    const resolved = path.resolve(mocPath)
    if (isPathInside(rootDir, resolved) && await fs.pathExists(resolved))
      moc3FileName = referencedMoc
  }

  if (!moc3FileName) {
    // 回退：同目录任意 .moc3（优先与 stem 同名）
    const stem = model3Stem(model3FileName)
    const mocFiles = fileNames.filter(f => f.toLowerCase().endsWith('.moc3'))
    if (mocFiles.length === 0)
      return null
    const sameStem = mocFiles.find(f => path.basename(f, path.extname(f)) === stem)
    moc3FileName = sameStem ?? mocFiles.sort((a, b) => a.localeCompare(b))[0]
  }

  let moc3Size = 0
  try {
    const st = await fs.stat(path.join(rootDir, moc3FileName))
    moc3Size = st.size
  }
  catch {
    return null
  }

  return {
    rootDir,
    depth,
    model3FileName,
    moc3FileName,
    moc3Size,
  }
}

/**
 * 从选择目录向下搜索模型根（BFS，深度受限）
 */
export async function discoverLive2dModelRoots(
  selectionPath: string,
  maxDepth: number = LIVE2D_DISCOVER_MAX_DEPTH,
): Promise<Live2dModelCandidate[]> {
  const root = path.resolve(selectionPath)
  if (!(await fs.pathExists(root)))
    return []

  const stat = await fs.stat(root)
  if (!stat.isDirectory())
    return []

  const found: Live2dModelCandidate[] = []
  const queue: Array<{ dir: string, depth: number }> = [{ dir: root, depth: 0 }]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current)
      break

    const candidate = await inspectLive2dModelRoot(current.dir, current.depth)
    if (candidate)
      found.push(candidate)

    if (current.depth >= maxDepth)
      continue

    let entries: Dirent[]
    try {
      entries = await fs.readdir(current.dir, { withFileTypes: true })
    }
    catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory())
        continue
      // 跳过常见噪声目录
      const name = entry.name
      if (name === 'node_modules' || name === '.git' || name.startsWith('.'))
        continue
      queue.push({
        dir: path.join(current.dir, name),
        depth: current.depth + 1,
      })
    }
  }

  return found
}

/**
 * 多候选择优：
 * 1. moc3 更大优先（通常主模型更大）
 * 2. 深度更浅优先（更接近用户选择）
 * 3. 路径字典序稳定
 */
export function pickBestLive2dModelRoot(
  candidates: readonly Live2dModelCandidate[],
): Live2dModelCandidate | null {
  if (candidates.length === 0)
    return null
  if (candidates.length === 1)
    return candidates[0]

  const sorted = [...candidates].sort((a, b) => {
    if (b.moc3Size !== a.moc3Size)
      return b.moc3Size - a.moc3Size
    if (a.depth !== b.depth)
      return a.depth - b.depth
    return a.rootDir.localeCompare(b.rootDir)
  })
  return sorted[0]
}

/**
 * 验证用户选择的文件夹（支持嵌套礼包）
 */
export async function validateLive2dModelFolder(
  folderPath: string,
): Promise<ValidateLive2dFolderResult> {
  try {
    if (!(await fs.pathExists(folderPath)))
      return { valid: false, error: '文件夹不存在' }

    const stat = await fs.stat(folderPath)
    if (!stat.isDirectory())
      return { valid: false, error: '选择的不是文件夹' }

    const candidates = await discoverLive2dModelRoots(folderPath)
    const best = pickBestLive2dModelRoot(candidates)
    if (!best)
      return { valid: false, error: NO_MODEL_ERROR }

    return { valid: true, candidate: best }
  }
  catch (error) {
    return { valid: false, error: `验证失败: ${String(error)}` }
  }
}

/**
 * 判断错误是否为权限类（EACCES / EPERM）
 */
function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object')
    return false
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EACCES' || code === 'EPERM'
}

/**
 * 将目录树改为用户可写：
 * - 目录：至少 u+rwx（0o755）
 * - 文件：至少 u+rw（0o644）
 *
 * 市面模型包常为 dr-xr-xr-x (555)。fs.copy 会保留 mode，导致
 * 后续无法在目标目录创建 model.json / model.meta.json。
 */
export async function ensureWritableTree(rootDir: string): Promise<void> {
  const root = path.resolve(rootDir)
  if (!(await fs.pathExists(root)))
    return

  // 先确保根可进入/可写，再 walk
  try {
    await fs.chmod(root, 0o755)
  }
  catch {
    // 某些 FS 上 chmod 可能失败；后续写操作会暴露真实错误
  }

  const queue: string[] = [root]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current)
      break

    let entries: Dirent[]
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    }
    catch {
      continue
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name)
      // 跳过符号链接，避免越界改 mode
      if (entry.isSymbolicLink())
        continue

      if (entry.isDirectory()) {
        try {
          await fs.chmod(full, 0o755)
        }
        catch {
          // ignore single-node chmod failure
        }
        queue.push(full)
      }
      else if (entry.isFile()) {
        try {
          await fs.chmod(full, 0o644)
        }
        catch {
          // ignore
        }
      }
    }
  }
}

/**
 * 确保模型根内存在 model.json（缺失则从主 model3 生成）
 *
 * 使用 read + write 而非 fs.copy，避免源文件只读 mode 影响目标。
 * 若遇 EACCES，会尝试 ensureWritableTree 后重试一次。
 */
export async function ensureModelJson(modelRoot: string): Promise<string | null> {
  const modelJsonPath = path.join(modelRoot, LIVE2D_MODEL_JSON)
  if (await fs.pathExists(modelJsonPath))
    return LIVE2D_MODEL_JSON

  let files: string[]
  try {
    files = await fs.readdir(modelRoot)
  }
  catch {
    return null
  }

  const primary = pickPrimaryModel3FileName(files)
  if (!primary || primary === LIVE2D_MODEL_JSON)
    return null

  const sourcePath = path.join(modelRoot, primary)

  const writeOnce = async (): Promise<void> => {
    const content = await fs.readFile(sourcePath)
    await fs.writeFile(modelJsonPath, content)
  }

  try {
    await writeOnce()
    return primary
  }
  catch (error) {
    if (!isPermissionError(error))
      return null

    // 半导入/只读目录：chmod 后重试一次
    try {
      await ensureWritableTree(modelRoot)
      await writeOnce()
      return primary
    }
    catch {
      return null
    }
  }
}

/**
 * 轻量校验 FileReferences 中的 Moc / Textures / Physics 是否存在
 * 返回缺失路径列表（相对模型根）；不抛错
 */
export async function listMissingModelReferences(modelRoot: string): Promise<string[]> {
  const modelJsonPath = path.join(modelRoot, LIVE2D_MODEL_JSON)
  if (!(await fs.pathExists(modelJsonPath)))
    return [LIVE2D_MODEL_JSON]

  let json: Model3JsonShape
  try {
    json = await fs.readJson(modelJsonPath) as Model3JsonShape
  }
  catch {
    return [LIVE2D_MODEL_JSON]
  }

  const missing: string[] = []
  const refs = json.FileReferences || {}

  if (typeof refs.Moc === 'string' && refs.Moc) {
    if (!(await fs.pathExists(path.join(modelRoot, refs.Moc))))
      missing.push(refs.Moc)
  }

  if (Array.isArray(refs.Textures)) {
    for (const tex of refs.Textures) {
      if (typeof tex === 'string' && tex) {
        if (!(await fs.pathExists(path.join(modelRoot, tex))))
          missing.push(tex)
      }
    }
  }

  if (typeof refs.Physics === 'string' && refs.Physics) {
    if (!(await fs.pathExists(path.join(modelRoot, refs.Physics))))
      missing.push(refs.Physics)
  }

  return missing
}

/**
 * 解析 displayName：优先礼包外层文件夹名，其次模型根目录名，再次 model3 stem
 */
export function resolveDisplayName(options: {
  selectionPath: string
  modelRoot: string
  model3FileName: string
}): string {
  const outer = path.basename(path.resolve(options.selectionPath)).trim()
  if (outer)
    return outer
  const rootName = path.basename(path.resolve(options.modelRoot)).trim()
  if (rootName)
    return rootName
  const stem = model3Stem(options.model3FileName).trim()
  return stem || 'Live2D Model'
}

/**
 * 写入 model.meta.json
 */
export async function writeModelMeta(
  modelRoot: string,
  meta: Live2dModelMeta,
): Promise<void> {
  await fs.writeJson(path.join(modelRoot, LIVE2D_MODEL_META_FILE), meta, { spaces: 2 })
}

/**
 * 读取 model.meta.json（不存在或损坏返回 null）
 */
export async function readModelMeta(modelRoot: string): Promise<Live2dModelMeta | null> {
  const metaPath = path.join(modelRoot, LIVE2D_MODEL_META_FILE)
  if (!(await fs.pathExists(metaPath)))
    return null
  try {
    const raw = await fs.readJson(metaPath) as Partial<Live2dModelMeta>
    if (typeof raw.id !== 'string' || typeof raw.displayName !== 'string')
      return null
    return {
      id: raw.id,
      displayName: raw.displayName,
      model3: typeof raw.model3 === 'string' ? raw.model3 : '',
      importedAt: typeof raw.importedAt === 'string' ? raw.importedAt : '',
    }
  }
  catch {
    return null
  }
}

/**
 * 列出 models 目录下已有文件夹名（作为 occupied stableId）
 */
export async function listOccupiedModelIds(modelsDir: string): Promise<Set<string>> {
  const occupied = new Set<string>()
  if (!(await fs.pathExists(modelsDir)))
    return occupied
  try {
    const entries = await fs.readdir(modelsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory())
        occupied.add(entry.name)
    }
  }
  catch {
    // ignore
  }
  return occupied
}

/**
 * 完整导入流程：发现 → 分配 id → 仅复制模型根 → 可写化 → ensure model.json → meta
 *
 * 源包目录常为 555（只读）。copy 保留 mode 后，必须先 ensureWritableTree，
 * 否则 ensureModelJson / writeModelMeta 会 EACCES，并留下半导入目录。
 */
export async function importNormalizedLive2dModel(options: {
  sourcePath: string
  modelsDir: string
}): Promise<{ success: true, data: NormalizeImportResult } | { success: false, error: string }> {
  const sourcePath = path.resolve(options.sourcePath)
  const modelsDir = path.resolve(options.modelsDir)

  const validation = await validateLive2dModelFolder(sourcePath)
  if (!validation.valid || !validation.candidate)
    return { success: false, error: validation.error || NO_MODEL_ERROR }

  const candidate = validation.candidate
  const stem = model3Stem(candidate.model3FileName)
  // 优先 model3 stem（通常是英文资源名），否则模型根目录名
  const baseNameForId = stem && stem.toLowerCase() !== 'model'
    ? stem
    : path.basename(candidate.rootDir)
  const baseId = slugifyLive2dStableId(baseNameForId)
  const occupied = await listOccupiedModelIds(modelsDir)
  const stableId = allocateUniqueStableId(baseId, occupied)
  const displayName = resolveDisplayName({
    selectionPath: sourcePath,
    modelRoot: candidate.rootDir,
    model3FileName: candidate.model3FileName,
  })

  const targetPath = path.join(modelsDir, stableId)
  if (await fs.pathExists(targetPath)) {
    // 竞态兜底：allocate 后仍存在则失败
    return { success: false, error: `模型 "${stableId}" 已存在` }
  }

  // 任意 copy 后失败路径都必须清理半导入目录
  const cleanupTarget = async (): Promise<void> => {
    await fs.remove(targetPath).catch(() => {})
  }

  try {
    await fs.ensureDir(modelsDir)
    await fs.copy(candidate.rootDir, targetPath)
    // 关键：copy 后立刻让目标树可写，再写 model.json / meta
    await ensureWritableTree(targetPath)

    // 记录原始 model3 文件名（ensure 前）
    let model3FileName = candidate.model3FileName
    const ensuredFrom = await ensureModelJson(targetPath)
    if (ensuredFrom)
      model3FileName = model3FileName === LIVE2D_MODEL_JSON ? ensuredFrom : model3FileName

    // 若复制后仍无 model.json，失败并清理
    if (!(await fs.pathExists(path.join(targetPath, LIVE2D_MODEL_JSON)))) {
      await cleanupTarget()
      return { success: false, error: '导入失败：无法创建 model.json' }
    }

    // 主 model3 文件名：若源已是 model.json，尝试找 sibling *.model3.json 记入 meta
    if (model3FileName === LIVE2D_MODEL_JSON) {
      try {
        const files = await fs.readdir(targetPath)
        const sibling = files.find(f => f.toLowerCase().endsWith('.model3.json'))
        if (sibling)
          model3FileName = sibling
      }
      catch {
        // keep model.json
      }
    }

    await writeModelMeta(targetPath, {
      id: stableId,
      displayName,
      model3: model3FileName,
      importedAt: new Date().toISOString(),
    })

    // 缺失引用仅记结果，不阻断导入（贴图路径偶发大小写差异由运行时暴露）
    await listMissingModelReferences(targetPath)

    return {
      success: true,
      data: {
        stableId,
        displayName,
        targetPath,
        modelRoot: candidate.rootDir,
        model3FileName,
      },
    }
  }
  catch (error) {
    await cleanupTarget()
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: `导入失败: ${message}` }
  }
}
