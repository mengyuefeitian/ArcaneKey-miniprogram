const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { content, openid } = event;

  if (!content || content.trim().length === 0) {
    return { safe: true };
  }

  try {
    const result = await cloud.openapi.security.msgSecCheck({
      content: content.trim(),
      version: 2,
      scene: 2, // 评论/反馈场景
      openid: openid || '',
    });

    // result.result.suggest: 'pass' | 'review' | 'risky'
    const suggest = result.result && result.result.suggest;
    if (suggest === 'risky') {
      return { safe: false, reason: '内容包含违规信息，请修改后重新提交' };
    }
    // 'review' 归为通过（人工审核由平台处理）
    return { safe: true };
  } catch (err) {
    // API 调用失败时放行，避免因接口故障阻断正常反馈
    console.error('[secCheck] error:', err);
    return { safe: true };
  }
};
