/**
 * 许可证验证服务
 * 支持本地密钥验证 + 可选在线验证
 */

export interface LicenseInfo {
  key: string
  activatedAt: string
  expiresAt?: string
  type: 'trial' | 'standard' | 'pro' | 'enterprise'
  features: string[]
  machineId?: string
}

export class LicenseManager {
  private storageKey = 'img2easy_license'
  private apiEndpoint = 'https://api.img2easy.com/v1/license'

  /**
   * 生成机器ID (基于硬件指纹)
   */
  async getMachineId(): Promise<string> {
    // 使用 navigator 信息和简单的哈希
    const data = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset()
    ].join('|')
    
    const encoder = new TextEncoder()
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data))
    const array = new Uint8Array(buffer)
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
  }

  /**
   * 验证密钥格式
   */
  validateFormat(key: string): boolean {
    // 格式: XXXX-XXXX-XXXX-XXXX (16位，每4位一组)
    return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)
  }

  /**
   * 本地验证密钥
   */
  async verifyLocal(key: string): Promise<LicenseInfo | null> {
    if (!this.validateFormat(key)) return null

    // 简单的本地校验和验证
    const checksum = this.calculateChecksum(key)
    if (!checksum) return null

    const machineId = await this.getMachineId()
    
    return {
      key,
      activatedAt: new Date().toISOString(),
      type: 'standard',
      features: ['batch', 'export', 'autoCorrect', 'autoClean'],
      machineId
    }
  }

  /**
   * 在线验证密钥
   */
  async verifyOnline(key: string): Promise<LicenseInfo | null> {
    try {
      const machineId = await this.getMachineId()
      const response = await fetch(`${this.apiEndpoint}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, machineId })
      })

      if (!response.ok) return null
      const data = await response.json()
      
      if (data.valid) {
        const license: LicenseInfo = {
          key,
          activatedAt: data.activatedAt,
          expiresAt: data.expiresAt,
          type: data.type,
          features: data.features,
          machineId
        }
        this.saveLicense(license)
        return license
      }
      return null
    } catch {
      // 离线时回退到本地验证
      return this.verifyLocal(key)
    }
  }

  /**
   * 保存许可证到本地存储
   */
  saveLicense(license: LicenseInfo): void {
    localStorage.setItem(this.storageKey, JSON.stringify(license))
  }

  /**
   * 从本地存储加载许可证
   */
  loadLicense(): LicenseInfo | null {
    try {
      const data = localStorage.getItem(this.storageKey)
      if (!data) return null
      return JSON.parse(data) as LicenseInfo
    } catch {
      return null
    }
  }

  /**
   * 检查许可证是否有效
   */
  isValid(license?: LicenseInfo): boolean {
    const lic = license || this.loadLicense()
    if (!lic) return false

    if (lic.expiresAt) {
      const now = new Date()
      const expires = new Date(lic.expiresAt)
      if (now > expires) return false
    }

    return true
  }

  /**
   * 检查功能是否可用
   */
  hasFeature(feature: string, license?: LicenseInfo): boolean {
    const lic = license || this.loadLicense()
    if (!lic) return false
    return lic.features.includes(feature)
  }

  /**
   * 清除许可证
   */
  clearLicense(): void {
    localStorage.removeItem(this.storageKey)
  }

  /**
   * 生成试用许可证
   */
  generateTrial(): LicenseInfo {
    const trialKey = 'TRIAL-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-0000-0000'
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7天试用

    const license: LicenseInfo = {
      key: trialKey,
      activatedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      type: 'trial',
      features: ['autoCorrect', 'autoClean']
    }

    this.saveLicense(license)
    return license
  }

  private calculateChecksum(key: string): boolean {
    // 移除连字符
    const clean = key.replace(/-/g, '')
    if (clean.length !== 16) return false

    // 简单的校验：前12位之和模10等于后4位
    const prefix = clean.slice(0, 12)
    const suffix = clean.slice(12)
    
    let sum = 0
    for (const char of prefix) {
      const val = parseInt(char, 36)
      sum += isNaN(val) ? 0 : val
    }
    
    const expected = (sum % 10000).toString().padStart(4, '0')
    return suffix === expected
  }
}
