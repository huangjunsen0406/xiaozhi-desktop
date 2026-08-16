/**
 * 内置宠物是否从安装包拷到本地。
 *
 * 用户主动删除的内置宠物不复活；Codex 曾占坑、后来没了，则应补拷。
 */
export function shouldCopyBuiltinPet(input: {
  localExists: boolean
  codexExists: boolean
  userRemoved: boolean
}): boolean {
  return !input.localExists && !input.codexExists && !input.userRemoved
}
