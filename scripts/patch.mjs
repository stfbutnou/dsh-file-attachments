import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const PACKAGE_NAME = '@deepseek-ai/dsh'
const STATE_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'plugin-state', 'dsh-file-attachments')
const HERE = dirname(new URL(import.meta.url).pathname)
const PATCH_DIR = resolve(HERE, '..', 'patches')

const TARGETS = [
  {
    id: 'conversation-client',
    relative: 'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',
    patch: 'client.js.patch',
    marker: 'SUPPORTED_FILE_ACCEPT',
  },
  {
    id: 'host-apiproxy',
    relative: 'node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js',
    patch: 'index.js.patch',
    marker: 'MAX_DOCUMENT_BYTES',
  },
  {
    id: 'sessions-schema',
    relative: 'node_modules/@deepseek-ai/dsh-host-apiproxy/lib/types/api/sessions.schema.js',
    patch: 'sessions.schema.js.patch',
    marker: "z.literal('file')",
  },
  {
    id: 'sessions-types',
    relative: 'node_modules/@deepseek-ai/dsh-host-apiproxy/lib/types/api/sessions.d.ts',
    patch: 'sessions.d.ts.patch',
    marker: "type: 'file'",
  },
]

function commandPath(command) {
  try {
    return execFileSync('which', [command], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

function dshCandidates() {
  const candidates = []
  if (process.env.DSH_INSTALL_ROOT) candidates.push(process.env.DSH_INSTALL_ROOT)

  const dshBin = commandPath('dsh')
  if (dshBin) {
    try {
      const realBin = realpathSync(dshBin)
      candidates.push(resolve(dirname(realBin), '..'))
    } catch {}
  }

  const nodePrefix = resolve(dirname(dirname(process.execPath)))
  candidates.push(join(nodePrefix, 'lib', 'node_modules', '@deepseek-ai', 'dsh'))

  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    candidates.push(join(globalRoot, '@deepseek-ai', 'dsh'))
  } catch {}

  return [...new Set(candidates)]
}

async function findDshRoot() {
  for (const candidate of dshCandidates()) {
    try {
      const manifest = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'))
      if (manifest.name === PACKAGE_NAME) return candidate
    } catch {}
  }
  throw new Error(`Cannot locate ${PACKAGE_NAME}. Set DSH_INSTALL_ROOT to its installation directory.`)
}

function backupPath(target) {
  return join(STATE_DIR, `${target.id}.original`)
}

function runPatch(file, patchFile, reverse = false) {
  const args = ['--batch', '--forward']
  if (reverse) args.push('--reverse')
  args.push(file, patchFile)
  const result = spawnSync('patch', args, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`patch ${reverse ? 'reverse ' : ''}failed for ${file}${details ? `: ${details}` : ''}`)
  }
}

async function ensureOriginalBackup(target, file, patchFile) {
  const backup = backupPath(target)
  if (existsSync(backup)) return backup

  await mkdir(STATE_DIR, { recursive: true })
  const sourceIsPatched = (await readFile(file, 'utf8')).includes(target.marker)
  await copyFile(file, backup)
  if (sourceIsPatched) {
    try {
      runPatch(backup, patchFile, true)
    } catch (error) {
      await rm(backup, { force: true })
      throw new Error(`The installed file already has the attachment patch, but its original could not be reconstructed: ${error.message}`)
    }
  }
  return backup
}

async function install() {
  const dshRoot = await findDshRoot()
  const resolved = TARGETS.map((target) => ({
    ...target,
    file: join(dshRoot, target.relative),
    patchFile: join(PATCH_DIR, target.patch),
  }))

  for (const target of resolved) {
    if (!existsSync(target.file)) throw new Error(`Expected DSH file is missing: ${target.file}`)
    if (!existsSync(target.patchFile)) throw new Error(`Plugin patch is missing: ${target.patchFile}`)
  }

  const backups = []
  try {
    for (const target of resolved) backups.push(await ensureOriginalBackup(target, target.file, target.patchFile))
    for (const target of resolved) {
      const current = await readFile(target.file, 'utf8')
      if (current.includes(target.marker)) continue
      runPatch(target.file, target.patchFile)
      const patched = await readFile(target.file, 'utf8')
      if (!patched.includes(target.marker)) throw new Error(`Patch completed without its marker: ${target.file}`)
    }
  } catch (error) {
    for (let index = 0; index < resolved.length; index += 1) {
      if (backups[index] !== undefined && existsSync(backups[index])) await copyFile(backups[index], resolved[index].file).catch(() => {})
    }
    throw error
  }

  console.log(`dsh-file-attachments: installed against ${dshRoot}`)
}

async function uninstall() {
  const dshRoot = await findDshRoot()
  for (const target of TARGETS) {
    const file = join(dshRoot, target.relative)
    const backup = backupPath(target)
    if (!existsSync(backup)) continue
    await copyFile(backup, file)
    console.log(`dsh-file-attachments: restored ${target.relative}`)
  }
  console.log('dsh-file-attachments: core files restored; restart dsh to finish removal')
}

const action = process.argv[2]
try {
  if (action === 'install') await install()
  else if (action === 'uninstall') await uninstall()
  else throw new Error('Usage: node scripts/patch.mjs <install|uninstall>')
} catch (error) {
  console.error(`dsh-file-attachments: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
