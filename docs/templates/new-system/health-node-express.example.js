/**
 * Express health 示例（JavaScript）
 * 在 app.listen 之前添加即可。
 */
const startedAt = Date.now();

function registerHealth(app, serviceName, version = '0.0.0') {
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: serviceName,
      version,
      time: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      env: process.env.NODE_ENV || 'development',
    });
  });
}

module.exports = { registerHealth };

// 使用：
// const { registerHealth } = require('./health');
// registerHealth(app, '我的项目');
