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

const actionNames = [
  'standby', 'selected', 'working', 'thinking', 'waiting_user', 'completed', 'error',
  'talking_on_seat', 'talking_on_stand_a', 'talking_on_stand_b', 'listening',
  'agreeing', 'questioning', 'walking_horizontal', 'walking_up', 'off_chair',
  'sit_down', 'leaving', 'reading_book', 'searching_info', 'planning_board',
  'brainstorming', 'writing_notes', 'reviewing_work', 'presenting', 'organizing_files',
]

await fs.mkdir(outputDir, { recursive: true })

for (const actionName of actionNames) {
  const framesDir = path.join(runDir, 'actions', actionName, 'normalized')
  const frameFiles = (await fs.readdir(framesDir))
    .filter((name) => /^\d{2}\.png$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (frameFiles.length === 0) {
    throw new Error(`No normalized frames found for ${actionName}`)
  }

  const atlasWidth = frameWidth * frameFiles.length
  const composites = frameFiles.map((name, index) => ({
    input: path.join(framesDir, name),
    left: index * frameWidth,
    top: 0,
  }))
  await sharp({
    create: { width: atlasWidth, height: frameHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .webp({ lossless: true, quality: 100, alphaQuality: 100 })
    .toFile(path.join(outputDir, `${actionName}.webp`))

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
  await fs.writeFile(
    path.join(outputDir, `${actionName}.webp.json`),
    `${JSON.stringify(atlas, null, 2)}\n`,
    'utf8',
  )
}

await fs.writeFile(
  path.join(outputDir, 'README.md'),
  `# OpenPBL companion character assets\n\nGenerated from the user-approved standard view and normalized action frames in \`${path.relative(projectRoot, runDir)}\`. Rebuild with \`node scripts/package-openpbl-agent-assets.mjs\`. Set \`NEXT_PUBLIC_AGENT_ART=legacy\` to use the previous body assets.\n`,
  'utf8',
)

console.log(`Packaged ${actionNames.length} actions in ${outputDir}`)
