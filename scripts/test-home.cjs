// 临时脚本：测试首页响应并提取错误
const http = require('http');

const req = http.get('http://localhost:3000/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Length:', data.length);

    // 提取错误信息
    const errMatch = data.match(/"message":"([^"]+)"/);
    if (errMatch) {
      console.log('\n=== Error Message ===');
      console.log(errMatch[1].replace(/\\n/g, '\n').replace(/\\u003c/g, '<').replace(/\\u003e/g, '>'));
    }

    // 检查是否包含 async_hooks
    console.log('\n=== Checks ===');
    console.log('Has async_hooks:', data.includes('async_hooks'));
    console.log('Has request-id.ts:', data.includes('request-id.ts'));
    console.log('Has openmaic/logger:', data.includes('openmaic/logger'));
    console.log('Has Code generation:', data.includes('Code generation'));
  });
});
req.on('error', (e) => console.log('Error:', e.message));
req.setTimeout(15000, () => { console.log('Timeout'); req.destroy(); });
