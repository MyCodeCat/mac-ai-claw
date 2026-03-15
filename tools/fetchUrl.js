const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = {
  fetchUrl: {
    fun: async (url) => {
      return new Promise((resolve, reject) => {
        try {
          const parsedUrl = new URL(url);
          const client = parsedUrl.protocol === 'https:' ? https : http;
          
          client.get(url, (res) => {
            let data = [];
            
            res.on('data', (chunk) => {
              data.push(chunk);
            });
            
            res.on('end', () => {
              const buffer = Buffer.concat(data);
              
              // 尝试以文本形式返回，如果失败则返回二进制数据的base64编码
              try {
                const text = buffer.toString('utf-8');
                resolve(text);
              } catch (e) {
                // 如果不是有效的UTF-8文本，返回base64编码
                resolve(buffer.toString('base64'));
              }
            });
          }).on('error', (err) => {
            reject(err.message);
          });
        } catch (error) {
          reject(error.message);
        }
      });
    },
    description: "获取网页原始 HTML 或资源内容，参数：URL",
    params: ["url"]
  }
};