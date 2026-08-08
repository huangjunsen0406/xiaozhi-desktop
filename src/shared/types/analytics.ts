/**
 * 产品分析（OpenPanel）偏好与状态
 */

export interface AnalyticsStatus {
  /** 是否允许上报使用数据，默认 true */
  enabled: boolean
  /** 匿名安装 id（用于用户去重；设置页可不展示全文） */
  installId: string
}
