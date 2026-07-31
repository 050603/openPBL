import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const projectRoot = path.resolve(import.meta.dirname, '..')
const runDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(projectRoot, 'output', 'openpbl-sprite-maker', 'banxue-xiaoling-v2')
const outputDir = path.join(projectRoot, 'public', 'assets', 'openpbl-agent')
const frameWidth = 192
const frameHeight = 208

const manifestPath = path.join(runDir, 'manifests', 'run.json')
const runManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const actionNames = runManifest.actions
  .filter((action) => (
    action.status === 'complete'
    && action.qa?.ok === true
    && action.qa?.visual_verdict?.status === 'pass'
  ))
  .map((action) => action.id)

if (actionNames.length === 0) {
  throw new Error(`No independently approved actions found in ${manifestPath}`)
}

await fs.mkdir(outputDir, { recursive: true })

async function writeFileIfChanged(filePath, contents) {
  const next = Buffer.isBuffer(contents) ? contents : Buffer.from(contents)
  try {
    const current = await fs.readFile(filePath)
    if (current.equals(next)) {
      return false
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  await fs.writeFile(filePath, next)
  return true
}

for (const actionName of actionNames) {
  const action = runManifest.actions.find((candidate) => candidate.id === actionName)
  const framesDir = path.join(runDir, 'actions', actionName, 'normalized')
  const frameFiles = (await fs.readdir(framesDir))
    .filter((name) => /^\d{2}\.png$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (frameFiles.length !== action.frames) {
    throw new Error(
      `${actionName} has ${frameFiles.length} normalized frames; expected ${action.frames}`,
    )
  }

  const atlasWidth = frameWidth * frameFiles.length
  const composites = frameFiles.map((name, index) => ({
    input: path.join(framesDir, name),
    left: index * frameWidth,
    top: 0,
  }))
  const atlasImage = await sharp({
    create: { width: atlasWidth, height: frameHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .webp({ lossless: true, quality: 100, alphaQuality: 100 })
    .toBuffer()
  await writeFileIfChanged(path.join(outputDir, `${actionName}.webp`), atlasImage)

  const frames = Object.fromEntries(frameFiles.map((name, index) => [
    `${actionName}-${String(index).padStart(2, '0')}`,
    {
      frame: { x: index * frameWidth, y: 0, w: frameWidth, h: frameHeight },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: frameHeight },
      sourceSize: { w: frameWidth, h: frameHeight },
    },
  ]))
  const atlas = {
    frames,
    meta: {
      app: 'OpenPBL openpbl-sprite-maker packager',
      version: '1.0',
      image: `${actionName}.webp`,
      format: 'RGBA8888',
      size: { w: atlasWidth, h: frameHeight },
      scale: '1',
    },
  }
  await writeFileIfChanged(
    path.join(outputDir, `${actionName}.webp.json`),
    `${JSON.stringify(atlas, null, 2)}\n`,
  )
}

await writeFileIfChanged(
  path.join(outputDir, 'README.md'),
  `# OpenPBL companion character assets\n\nGenerated from the user-approved standard view and independently approved normalized action frames in \`${path.relative(projectRoot, runDir)}\`. The packager only publishes actions whose deterministic and visual QA both pass; it preserves unrelated existing atlases during partial runs. Rebuild with \`node scripts/package-openpbl-agent-assets.mjs ${path.relative(projectRoot, runDir)}\`. Set \`NEXT_PUBLIC_AGENT_ART=legacy\` to use the previous body assets.\n`,
)

console.log(`Packaged ${actionNames.length} actions in ${outputDir}`)
