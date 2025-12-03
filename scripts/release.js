#!/usr/bin/env node
const { execSync } = require('node:child_process')
const process = require('node:process')
const readline = require('node:readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const versions = [
  { name: 'Patch (bug 修复)', value: 'patch', desc: '1.0.0 -> 1.0.1' },
  { name: 'Minor (新功能)', value: 'minor', desc: '1.0.0 -> 1.1.0' },
  { name: 'Major (重大变更)', value: 'major', desc: '1.0.0 -> 2.0.0' },
  { name: 'Prepatch (测试版)', value: 'prepatch', desc: '1.0.0 -> 1.0.1-beta.0' },
  { name: 'Prerelease (继续测试)', value: 'prerelease', desc: '1.0.1-beta.0 -> 1.0.1-beta.1' },
]

console.log('\n选择版本更新类型：\n')
versions.forEach((v, i) => {
  console.log(`  ${i + 1}. ${v.name} - ${v.desc}`)
})

rl.question('\n请输入选项 (1-5): ', (answer) => {
  const index = Number.parseInt(answer) - 1
  if (index >= 0 && index < versions.length) {
    const type = versions[index].value

    try {
      // 更新版本
      console.log(`\n正在更新版本 (${type})...`)

      // 对于 prepatch/preminor/premajor/prerelease，添加 --preid=beta
      if (type.startsWith('pre')) {
        execSync(`pnpm version ${type} --preid=beta -m "chore: release v%s"`, { stdio: 'inherit' })
      } else {
        execSync(`pnpm version ${type} -m "chore: release v%s"`, { stdio: 'inherit' })
      }

      // 推送到远程
      console.log('\n正在推送到远程仓库...')
      execSync('git push --follow-tags', { stdio: 'inherit' })

      console.log('\n✅ 版本发布成功！GitHub Actions 将自动开始构建。')
    }
    catch (error) {
      console.error('\n❌ 发布失败:', error.message)
      process.exit(1)
    }
  }
  else {
    console.error('❌ 无效的选项')
  }
  rl.close()
})
