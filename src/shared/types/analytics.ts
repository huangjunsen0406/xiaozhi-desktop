/**
 * 产品分析（OpenPanel）偏好与状态
 */

export interface AnalyticsStatus {
  /** 当前构建已配置并成功初始化统计客户端 */
  available: boolean
  /** 是否允许上报使用数据；统计可用时默认 true */
  enabled: boolean
  /** 匿名安装 id（用于用户去重；设置页可不展示全文） */
  installId: string
}
