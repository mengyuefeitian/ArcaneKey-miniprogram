const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  console.log('[CLEANUP] Starting for openid:', openid);

  try {
    // 1. 查询所有匹配 _openid 的记录
    const allDocs = await db.collection('user_backups')
      .where({ _openid: openid })
      .get();

    if (allDocs.data.length === 0) {
      return { success: true, message: 'No documents found', removed: 0 };
    }

    console.log('[CLEANUP] Found', allDocs.data.length, 'documents');

    // 测试数据过滤规则：id 1-6 或 account 包含 "alice"
    const isTestData = (token) => {
      const testIds = new Set(['1', '2', '3', '4', '5', '6']);
      return testIds.has(token.id) ||
             (token.account && token.account.toLowerCase().includes('alice'));
    };

    // 清理规则：
    // 1. 测试数据（alice账号）→ 物理删除
    // 2. 重复数据（有 dedup_reason）→ 物理删除
    // 3. 其他软删除数据（is_deleted = true）→ 物理删除
    const shouldRemove = (token) => {
      return isTestData(token) ||
             token.dedup_reason ||
             token.is_deleted === true;
    };

    // 2. 过滤出有效数据
    const allTokens = [];
    let removedCount = 0;

    for (const doc of allDocs.data) {
      for (const token of (doc.tokens || [])) {
        if (shouldRemove(token)) {
          removedCount++;
          console.log('[CLEANUP] Removing:', token.id, token.account, token.brand,
            token.dedup_reason ? 'duplicate' : token.is_deleted ? 'deleted' : 'test');
        } else {
          allTokens.push(token);
        }
      }
    }

    console.log('[CLEANUP] Cleaned tokens:', allTokens.length, 'Removed:', removedCount);

    // 3. 更新文档（只保留有效数据）
    if (allDocs.data.length > 0) {
      const mainDoc = allDocs.data[0];

      // 更新主记录
      await db.collection('user_backups').doc(mainDoc._id).update({
        data: {
          tokens: allTokens,
          timestamp: new Date().toISOString(),
          openid: openid,
        }
      });

      console.log('[CLEANUP] Updated main doc:', mainDoc._id);

      // 删除其他文档（如果有多条记录）
      for (const doc of allDocs.data.slice(1)) {
        await db.collection('user_backups').doc(doc._id).remove();
        console.log('[CLEANUP] Removed doc:', doc._id);
      }
    }

    return {
      success: true,
      message: 'Cleanup completed',
      removed: removedCount,
      remaining: allTokens.length,
    };

  } catch (err) {
    console.error('[CLEANUP] Error:', err);
    return { success: false, error: err.message };
  }
};